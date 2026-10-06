"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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
      {!loading && error && !empresaId ? <section className="card"><div className="empty-note" role="alert">{error} <button className="text-link" onClick={() => window.location.reload()}>Tentar novamente</button></div></section> : null}
      {!loading && !error ? (
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
            <div className="card-header"><h2>Atalhos</h2></div>
            <div className="card-body">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="button secondary" href="/automacoes">Automações</Link>
                <Link className="button secondary" href="/integracoes">Integrações</Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
