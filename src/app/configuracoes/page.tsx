"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [creditCost, setCreditCost] = useState("8.00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) throw new Error("Sessão inválida. Entre novamente.");

        const { data: membership, error: membershipError } = await supabase
          .from("usuarios_empresa")
          .select("empresa_id,papel")
          .eq("user_id", user.id)
          .eq("ativo", true)
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership?.empresa_id || membership.papel !== "admin") throw new Error("Apenas administradores podem alterar configurações.");

        const [companyResult, configResult] = await Promise.all([
          supabase.from("empresas").select("nome").eq("id", membership.empresa_id).maybeSingle(),
          supabase.from("configuracoes_empresa").select("custo_medio_credito,fuso_horario").eq("empresa_id", membership.empresa_id).maybeSingle(),
        ]);

        if (companyResult.error) throw companyResult.error;
        if (configResult.error) throw configResult.error;
        if (cancelled) return;

        setEmpresaId(membership.empresa_id);
        setCompanyName(companyResult.data?.nome ?? "Minha empresa");
        setEmail(user.email ?? "");
        setTimezone(configResult.data?.fuso_horario ?? "America/Sao_Paulo");
        setCreditCost(String(Number(configResult.data?.custo_medio_credito ?? 8).toFixed(2)));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId || saving) return;

    const normalizedCost = Number(creditCost.replace(",", "."));
    if (!companyName.trim()) {
      setError("Informe o nome da empresa.");
      return;
    }
    if (!Number.isFinite(normalizedCost) || normalizedCost < 0) {
      setError("Informe um custo médio por crédito válido.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      const [companyResult, configResult] = await Promise.all([
        supabase.from("empresas").update({ nome: companyName.trim() }).eq("id", empresaId),
        supabase.rpc("salvar_configuracoes_empresa", {
          p_empresa_id: empresaId,
          p_custo_medio_credito: normalizedCost,
          p_fuso_horario: timezone,
        }),
      ]);

      if (companyResult.error) throw companyResult.error;
      if (configResult.error) throw configResult.error;

      setCreditCost(normalizedCost.toFixed(2));
      setSuccess("Configurações salvas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Configurações" subtitle="Preferências gerais e custos operacionais" />
      {loading ? <section className="card"><div className="empty-note">Carregando configurações...</div></section> : null}
      {!loading ? (
        <section className="grid-2">
          <div className="card">
            <div className="card-header"><h2>Empresa</h2></div>
            <div className="card-body">
              <form className="form-stack" onSubmit={saveSettings}>
                <label>Nome exibido<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} /></label>
                <label>E-mail administrativo<input value={email} type="email" disabled /></label>
                <label>Fuso horário<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Sao_Paulo">America/Sao_Paulo</option></select></label>
                <label>Custo médio por crédito<input value={creditCost} onChange={(event) => setCreditCost(event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" /></label>
                <div className="form-hint">Hoje, com custo de {currency.format(Number(creditCost || 0))} por crédito, 80 créditos projetados representam {currency.format(Number(creditCost || 0) * 80)}.</div>
                {success ? <div className="form-success" role="status">{success}</div> : null}
                {error ? <div className="form-error" role="alert">{error}</div> : null}
                <button className="button primary" disabled={saving || !empresaId} type="submit">{saving ? "Salvando..." : "Salvar alterações"}</button>
              </form>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h2>Automação de cobranças</h2></div>
            <div className="card-body">
              <div className="form-hint">As regras de lembrete por WhatsApp serão liberadas quando conectarmos a Evolution API. Removi os botões fictícios para não parecer que uma configuração está ativa quando ainda não está.</div>
              <div style={{ marginTop: 16 }} className="queue">
                <div className="queue-item"><div className="queue-dot info">1</div><div className="queue-copy"><b>Antes do vencimento</b><small>Configuração será ativada com WhatsApp.</small></div></div>
                <div className="queue-item"><div className="queue-dot info">2</div><div className="queue-copy"><b>No vencimento</b><small>Mensagem automática associada à cobrança.</small></div></div>
                <div className="queue-item"><div className="queue-dot info">3</div><div className="queue-copy"><b>Após atraso</b><small>Parará automaticamente quando o pagamento for confirmado.</small></div></div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
