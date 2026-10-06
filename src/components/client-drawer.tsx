"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PlanPriceOption = { valor: number; vigente_ate: string | null; vigente_desde_em: string; criado_em: string };
type PlanQueryRow = { id: string; nome: string; periodicidade: string; planos_precos: PlanPriceOption[] | null };

export function ClientDrawer({
  open,
  onClose,
  empresaId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  empresaId: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const [plans, setPlans] = useState<Array<{ id: string; nome: string; periodicidade: string; valor: number | null }>>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !empresaId) return;
    let cancelled = false;
    setPlansLoading(true);
    setPlanError(null);
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error: plansError } = await supabase.from("planos")
          .select("id,nome,periodicidade,planos_precos(valor,vigente_ate,vigente_desde_em,criado_em)")
          .is("planos_precos.vigente_ate", null)
          .eq("empresa_id", empresaId).eq("ativo", true).order("nome");
        if (plansError) throw plansError;
        const mapped = ((data ?? []) as PlanQueryRow[]).map((plan) => {
          const prices = (plan.planos_precos ?? []).filter((price: PlanPriceOption) => price.vigente_ate === null)
            .sort((a, b) => b.vigente_desde_em.localeCompare(a.vigente_desde_em) || b.criado_em.localeCompare(a.criado_em));
          return { id: plan.id, nome: plan.nome, periodicidade: plan.periodicidade, valor: prices[0] ? Number(prices[0].valor) : null };
        });
        if (!cancelled) {
          setPlans(mapped);
          const firstPricedPlan = mapped.find((plan) => plan.valor !== null);
          setSelectedPlanId(firstPricedPlan?.id ?? "");
          setPriceValue(firstPricedPlan?.valor?.toFixed(2) ?? "");
        }
      } catch (cause) {
        if (!cancelled) setPlanError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos.");
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, empresaId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId || saving) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const value = Number(priceValue.replace(",", "."));
    const dueDay = Number(data.get("diaVencimento"));
    const credits = Number(data.get("creditos"));

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("cadastrar_cliente_com_plano", {
        p_empresa_id: empresaId,
        p_nome: String(data.get("nome") ?? "").trim(),
        p_telefone: String(data.get("telefone") ?? "").trim() || null,
        p_email: String(data.get("email") ?? "").trim() || null,
        p_plano_id: selectedPlanId,
        p_valor_acordado: Number.isFinite(value) ? value : 0,
        p_dia_vencimento: dueDay,
        p_observacoes: String(data.get("observacoes") ?? "").trim() || null,
        p_creditos: Number.isFinite(credits) ? credits : 1,
      });

      if (rpcError) throw rpcError;

      form.reset();
      await onSaved();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar o cliente.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={saving ? undefined : onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Novo cliente">
        <div className="drawer-header">
          <div><h2>Novo cliente</h2><p>Cadastre os dados principais da cobrança</p></div>
          <button className="icon-button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>Nome completo<input name="nome" required minLength={2} placeholder="Ex.: João da Silva" /></label>
          <label>Telefone/WhatsApp <small style={{ color: "#8290a5", fontWeight: 500 }}>Opcional</small><input name="telefone" placeholder="(51) 99999-9999" /></label>
          <label>E-mail <small style={{ color: "#8290a5", fontWeight: 500 }}>Opcional</small><input name="email" type="email" placeholder="cliente@email.com" /></label>
          {plansLoading ? <div className="empty-note">Carregando planos ativos...</div> : (
            <label>Plano<select value={selectedPlanId} onChange={(event) => {
              const nextId = event.target.value;
              setSelectedPlanId(nextId);
              const selected = plans.find((plan) => plan.id === nextId);
              setPriceValue(selected?.valor?.toFixed(2) ?? "");
            }} required disabled={!plans.some((plan) => plan.valor !== null)}>
              <option value="">Selecione um plano</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id} disabled={plan.valor === null}>{plan.nome} · {plan.periodicidade}{plan.valor === null ? " · sem preço atual" : ` · R$ ${plan.valor.toFixed(2)}`}</option>)}
            </select></label>
          )}
          {!plansLoading && plans.length === 0 ? <div className="form-hint">Cadastre um plano ativo em <a href="/planos">Planos</a> antes de criar o cliente.</div> : null}
          {planError ? <div className="form-error" role="alert">{planError}</div> : null}
          <div className="form-grid-2">
            <label>Valor acordado<input name="valor" type="number" min="0" step="0.01" inputMode="decimal" required value={priceValue} onChange={(event) => setPriceValue(event.target.value)} placeholder="0,00" /></label>
            <label>Créditos por mês<input name="creditos" type="number" min="0" step="1" defaultValue="1" required /></label>
          </div>
          <label>Dia de vencimento<select name="diaVencimento" defaultValue="10">{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
          <label>Observações<textarea name="observacoes" rows={5} maxLength={300} placeholder="Player, aparelho ou alguma observação operacional..." /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <div className="drawer-actions"><button className="button primary" disabled={saving || !empresaId || plansLoading || !selectedPlanId} type="submit">{saving ? "Salvando..." : "Salvar cliente"}</button><button className="button secondary" disabled={saving} type="button" onClick={onClose}>Cancelar</button></div>
        </form>
      </aside>
    </div>
  );
}
