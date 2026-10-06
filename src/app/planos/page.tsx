"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Clock3, Pencil, Plus, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/client";
import { currency } from "@/lib/format";
import styles from "./planos.module.css";

type Periodicity = "mensal" | "trimestral" | "semestral" | "anual" | "personalizada";
type PlanPrice = { id: string; valor: number; moeda: string; vigente_desde: string; vigente_ate: string | null; vigente_desde_em: string; vigente_ate_em: string | null; criado_em: string };
type Plan = {
  id: string;
  nome: string;
  descricao: string | null;
  periodicidade: Periodicity;
  intervalo_dias: number | null;
  ativo: boolean;
  criado_em: string;
  planos_precos: PlanPrice[];
};
type PlanForm = { nome: string; descricao: string; periodicidade: Periodicity; intervaloDias: string; valor: string; ativo: boolean };

const blankForm: PlanForm = { nome: "", descricao: "", periodicidade: "mensal", intervaloDias: "", valor: "", ativo: true };
const periodicityLabel: Record<Periodicity, string> = {
  mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual", personalizada: "Personalizada",
};

function currentPrice(plan: Plan) {
  return [...plan.planos_precos]
    .filter((item) => item.vigente_ate === null)
    .sort((a, b) => b.vigente_desde_em.localeCompare(a.vigente_desde_em) || b.criado_em.localeCompare(a.criado_em))[0] ?? null;
}

function formatPriceMoment(timestamp: string | null, date: string) {
  if (!timestamp) return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export default function PlansPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<Record<string, PlanPrice[]>>({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(blankForm);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("Sessão inválida. Entre novamente.");
      const { data: membership, error: membershipError } = await supabase
        .from("usuarios_empresa").select("empresa_id,papel").eq("user_id", userId).eq("ativo", true).limit(1).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
      if (membership.papel !== "admin") {
        setRoleError("A gestão de planos e preços está disponível somente para administradores.");
        return;
      }
      setRoleError(null);
      setEmpresaId(membership.empresa_id);
      const { data, error: plansError } = await supabase
        .from("planos")
        .select("id,nome,descricao,periodicidade,intervalo_dias,ativo,criado_em,planos_precos(id,valor,moeda,vigente_desde,vigente_ate,vigente_desde_em,vigente_ate_em,criado_em)")
        .is("planos_precos.vigente_ate", null)
        .eq("empresa_id", membership.empresa_id)
        .order("nome", { ascending: true });
      if (plansError) throw plansError;
      setPlans((data ?? []) as Plan[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os planos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  function openCreate() {
    setEditing(null);
    setForm(blankForm);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      nome: plan.nome,
      descricao: plan.descricao ?? "",
      periodicidade: plan.periodicidade,
      intervaloDias: plan.intervalo_dias ? String(plan.intervalo_dias) : "",
      valor: String(currentPrice(plan)?.valor ?? ""),
      ativo: plan.ativo,
    });
    setError(null);
    setFormOpen(true);
  }

  async function toggleHistory(plan: Plan) {
    if (historyOpen === plan.id) {
      setHistoryOpen(null);
      return;
    }
    setHistoryOpen(plan.id);
    if (history[plan.id]) return;
    try {
      const { data, error: historyError } = await createClient()
        .from("planos_precos")
        .select("id,valor,moeda,vigente_desde,vigente_ate,vigente_desde_em,vigente_ate_em,criado_em")
        .eq("empresa_id", empresaId)
        .eq("plano_id", plan.id)
        .order("vigente_desde_em", { ascending: false })
        .order("criado_em", { ascending: false })
        .limit(100);
      if (historyError) throw historyError;
      setHistory((current) => ({ ...current, [plan.id]: (data ?? []) as PlanPrice[] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o histórico de preços.");
      setHistoryOpen(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId || saving) return;
    const price = Number(form.valor.replace(",", "."));
    const interval = form.periodicidade === "personalizada" ? Number(form.intervaloDias) : null;
    if (!form.nome.trim()) return setError("Informe o nome do plano.");
    if (!Number.isFinite(price) || price < 0) return setError("Informe um preço válido.");
    if (form.periodicidade === "personalizada" && (!Number.isInteger(interval) || Number(interval) < 1)) {
      return setError("Informe a quantidade de dias da periodicidade personalizada.");
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    try {
      if (!editing) {
        const { error: createError } = await supabase.rpc("criar_plano_com_preco", {
          p_empresa_id: empresaId,
          p_nome: form.nome.trim(),
          p_descricao: form.descricao.trim() || null,
          p_periodicidade: form.periodicidade,
          p_intervalo_dias: interval,
          p_valor: price,
        });
        if (createError) throw createError;
      } else {
        const { error: updateError } = await supabase.from("planos").update({
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          periodicidade: form.periodicidade,
          intervalo_dias: interval,
          ativo: form.ativo,
        }).eq("id", editing.id).eq("empresa_id", empresaId);
        if (updateError) throw updateError;

        const oldPrice = currentPrice(editing)?.valor ?? null;
        if (oldPrice === null || oldPrice !== price) {
          const { error: priceError } = await supabase.rpc("alterar_preco_plano", {
            p_empresa_id: empresaId,
            p_plano_id: editing.id,
            p_valor: price,
          });
          if (priceError) throw priceError;
        }
      }
      setFormOpen(false);
      setNotice(editing ? "Plano atualizado." : "Plano criado.");
      setHistory({});
      await loadPlans();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Planos"
        subtitle="Gerencie os planos ativos e acompanhe o histórico de preços da empresa"
        action={<button className="button primary" onClick={openCreate}><Plus size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo plano</button>}
      />
      {roleError ? <section className="card"><div className="empty-note" role="alert">{roleError}</div></section> : null}
      {error && !formOpen ? <section className="card"><div className="empty-note" role="alert">{error} <button className="text-link" onClick={() => void loadPlans()}>Tentar novamente</button></div></section> : null}
      {notice ? <div className="form-success" role="status" style={{ marginBottom: 14 }}>{notice}</div> : null}
      {loading ? <section className="card"><div className="empty-note">Carregando planos...</div></section> : null}
      {!loading && !roleError && !error && plans.length === 0 ? (
        <section className="card"><div className="empty-note">Nenhum plano cadastrado. Crie o primeiro para selecionar planos no cadastro de clientes.</div></section>
      ) : null}

      {!loading && !roleError && plans.length > 0 ? (
        <section className={styles.planList}>
          {plans.map((plan) => {
            const price = currentPrice(plan);
            const planHistory = history[plan.id];
            return (
              <article className={`card ${styles.planCard}`} key={plan.id}>
                <div className={styles.planMain}>
                  <div className={styles.planInfo}>
                    <div className={styles.planTitle}><h2>{plan.nome}</h2><span className={`status-badge ${plan.ativo ? "status-ativo" : "status-pendente"}`}>{plan.ativo ? "Ativo" : "Inativo"}</span></div>
                    <p>{plan.descricao || "Sem descrição"}</p>
                    <small>{plan.periodicidade === "personalizada" ? `A cada ${plan.intervalo_dias} dias` : periodicityLabel[plan.periodicidade]}</small>
                  </div>
                  <div className={styles.priceBlock}>
                    <span>Preço atual</span>
                    <strong>{price ? currency.format(Number(price.valor)) : "Sem preço"}</strong>
                    {price ? <small>Desde {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${price.vigente_desde}T00:00:00Z`))}</small> : <small>Adicione um preço para oferecer este plano</small>}
                  </div>
                  <div className={styles.actions}>
                    <button className="button secondary small" onClick={() => void toggleHistory(plan)}><Clock3 size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{historyOpen === plan.id ? "Ocultar histórico" : "Histórico"}</button>
                    <button className="button secondary small" onClick={() => openEdit(plan)}><Pencil size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Editar</button>
                  </div>
                </div>
                {historyOpen === plan.id ? (
                  <div className={styles.history}>
                    <b>Histórico de preços</b>
                    {!planHistory ? <div className={styles.historyEmpty}>Carregando histórico...</div> : null}
                    {planHistory?.length === 0 ? <div className={styles.historyEmpty}>Nenhum preço registrado.</div> : null}
                    {planHistory?.map((item) => (
                      <div className={styles.historyRow} key={item.id}>
                        <span>{currency.format(Number(item.valor))}</span>
                        <small>{formatPriceMoment(item.vigente_desde_em, item.vigente_desde)} – {item.vigente_ate ? formatPriceMoment(item.vigente_ate_em, item.vigente_ate) : "Atual"}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <div className={`drawer-wrap ${formOpen ? "open" : ""}`} aria-hidden={!formOpen}>
        <div className="drawer-backdrop" onClick={saving ? undefined : () => setFormOpen(false)} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={editing ? "Editar plano" : "Novo plano"}>
          <div className="drawer-header"><div><h2>{editing ? "Editar plano" : "Novo plano"}</h2><p>O preço novo entra no histórico sem substituir os anteriores.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} disabled={saving} aria-label="Fechar"><X size={20} /></button></div>
          <form className="form-stack" onSubmit={save}>
            <label>Nome do plano<input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} maxLength={100} required /></label>
            <label>Descrição<textarea value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} rows={3} maxLength={500} /></label>
            <label>Periodicidade<select value={form.periodicidade} onChange={(event) => setForm({ ...form, periodicidade: event.target.value as Periodicity })}>{Object.entries(periodicityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {form.periodicidade === "personalizada" ? <label>Intervalo em dias<input type="number" min="1" step="1" value={form.intervaloDias} onChange={(event) => setForm({ ...form, intervaloDias: event.target.value })} required /></label> : null}
            <label>Preço atual (R$)<input type="number" min="0" step="0.01" inputMode="decimal" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required /></label>
            {editing ? <label className={styles.toggle}><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />Plano disponível para novos clientes</label> : null}
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <div className="drawer-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar plano"}</button><button className="button secondary" type="button" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</button></div>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
