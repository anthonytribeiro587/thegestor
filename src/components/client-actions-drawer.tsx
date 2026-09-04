"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RotateCcw, UserX, X } from "lucide-react";
import { formatDateBR } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import styles from "./client-actions-drawer.module.css";

type Mode = "view" | "edit";

type ClientRow = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  status: string;
  observacoes_operacionais: string | null;
  criado_em: string;
};

type SubscriptionRow = {
  id: string;
  status: string;
  dia_vencimento: number;
  creditos_por_ciclo: number;
  parcela_atual: number | null;
  parcelas_total: number | null;
  criado_em: string;
  planos: { nome: string } | { nome: string }[] | null;
  assinaturas_financeiras: { valor_acordado: number } | { valor_acordado: number }[] | null;
};

type ChargeRow = {
  id: string;
  competencia: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  creditos_utilizados: number | null;
  creditos_previstos: number | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
};

type Detail = {
  client: ClientRow;
  subscription: SubscriptionRow;
  charges: ChargeRow[];
};

type FormState = {
  nome: string;
  telefone: string;
  email: string;
  plano: string;
  valor: string;
  diaVencimento: string;
  creditos: string;
  parcelaAtual: string;
  parcelasTotal: string;
  observacoes: string;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function planName(subscription: SubscriptionRow) {
  return first(subscription.planos)?.nome ?? "Mensal";
}

function agreedValue(subscription: SubscriptionRow) {
  return Number(first(subscription.assinaturas_financeiras)?.valor_acordado ?? 0);
}

function statusLabel(status: string) {
  if (status === "pago") return "Pago";
  if (status === "atrasado") return "Atrasado";
  if (status === "cancelado") return "Cancelado";
  return "Pendente";
}

function statusClass(status: string) {
  if (status === "pago") return "status-pago";
  if (status === "atrasado" || status === "cancelado") return "status-atrasado";
  return "status-pendente";
}

function initialForm(detail: Detail): FormState {
  const subscription = detail.subscription;
  return {
    nome: detail.client.nome,
    telefone: detail.client.telefone ?? "",
    email: detail.client.email ?? "",
    plano: planName(subscription),
    valor: String(agreedValue(subscription)),
    diaVencimento: String(subscription.dia_vencimento),
    creditos: String(subscription.creditos_por_ciclo),
    parcelaAtual: subscription.parcela_atual ? String(subscription.parcela_atual) : "",
    parcelasTotal: subscription.parcelas_total ? String(subscription.parcelas_total) : "",
    observacoes: detail.client.observacoes_operacionais ?? "",
  };
}

export function ClientActionsDrawer({
  open,
  mode: requestedMode,
  clientId,
  empresaId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  clientId: string | null;
  empresaId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!open || !clientId || !empresaId) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const [clientResult, subscriptionResult, chargesResult] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,nome,telefone,email,status,observacoes_operacionais,criado_em")
          .eq("empresa_id", empresaId)
          .eq("id", clientId)
          .single(),
        supabase
          .from("assinaturas")
          .select("id,status,dia_vencimento,creditos_por_ciclo,parcela_atual,parcelas_total,criado_em,planos(nome),assinaturas_financeiras(valor_acordado)")
          .eq("empresa_id", empresaId)
          .eq("cliente_id", clientId)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("cobrancas")
          .select("id,competencia,vencimento,status_pagamento,pago_em,creditos_utilizados,creditos_previstos,cobrancas_financeiras(valor_original,valor_pago)")
          .eq("empresa_id", empresaId)
          .eq("cliente_id", clientId)
          .order("competencia", { ascending: false })
          .limit(12),
      ]);

      if (clientResult.error) throw clientResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (chargesResult.error) throw chargesResult.error;
      if (!subscriptionResult.data) throw new Error("Este cliente não possui assinatura cadastrada.");

      const nextDetail: Detail = {
        client: clientResult.data as ClientRow,
        subscription: subscriptionResult.data as SubscriptionRow,
        charges: (chargesResult.data ?? []) as ChargeRow[],
      };
      setDetail(nextDetail);
      setForm(initialForm(nextDetail));
    } catch (cause) {
      setDetail(null);
      setForm(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a ficha do cliente.");
    } finally {
      setLoading(false);
    }
  }, [clientId, empresaId, open]);

  useEffect(() => {
    if (!open) return;
    setMode(requestedMode);
    void loadDetail();
  }, [open, requestedMode, loadDetail]);

  const cycle = useMemo(() => {
    if (!detail?.subscription.parcela_atual || !detail.subscription.parcelas_total) return "—";
    return `${detail.subscription.parcela_atual}/${detail.subscription.parcelas_total}`;
  }, [detail]);

  const latestCharge = detail?.charges[0] ?? null;
  const cycleCompleted = Boolean(
    detail?.subscription.parcela_atual
    && detail.subscription.parcelas_total
    && detail.subscription.parcela_atual >= detail.subscription.parcelas_total,
  );
  const canChooseRenewal = Boolean(
    cycleCompleted
    && detail?.client.status === "ativo"
    && detail.subscription.status === "ativa"
    && latestCharge?.status_pagamento === "pago",
  );

  function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !form || !empresaId || saving) return;

    const value = Number(form.valor.replace(",", "."));
    const dueDay = Number(form.diaVencimento);
    const credits = Number(form.creditos);
    const currentInstallment = form.parcelaAtual.trim() ? Number(form.parcelaAtual) : null;
    const totalInstallments = form.parcelasTotal.trim() ? Number(form.parcelasTotal) : null;

    if (!Number.isFinite(value) || value < 0) return setError("Informe um valor válido.");
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return setError("Dia de vencimento inválido.");
    if (!Number.isInteger(credits) || credits < 0) return setError("Quantidade de créditos inválida.");
    if ((currentInstallment === null) !== (totalInstallments === null)) return setError("Preencha parcela atual e total juntas.");

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("atualizar_cliente_assinatura", {
        p_empresa_id: empresaId,
        p_cliente_id: detail.client.id,
        p_assinatura_id: detail.subscription.id,
        p_nome: form.nome.trim(),
        p_telefone: form.telefone.trim(),
        p_email: form.email.trim(),
        p_plano_nome: form.plano.trim(),
        p_valor: value,
        p_dia_vencimento: dueDay,
        p_creditos: credits,
        p_parcela_atual: currentInstallment,
        p_parcelas_total: totalInstallments,
        p_observacoes: form.observacoes.trim(),
      });
      if (rpcError) throw rpcError;

      await onSaved();
      await loadDetail();
      setMode("view");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function defineRenewal(modality: "mensal" | "trimestral") {
    if (!detail || !empresaId || saving || !canChooseRenewal) return;
    const label = modality === "trimestral" ? "trimestral (novo ciclo 1/3)" : "mensal";
    if (!window.confirm(`Confirmar renovação ${label}? A próxima cobrança será criada com o valor e vencimento atuais.`)) return;

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("definir_renovacao_assinatura", {
        p_empresa_id: empresaId,
        p_assinatura_id: detail.subscription.id,
        p_modalidade: modality,
      });
      if (rpcError) throw rpcError;
      await onSaved();
      await loadDetail();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível definir a renovação.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(nextStatus: "ativo" | "cancelado") {
    if (!detail || !empresaId || saving) return;
    const confirmation = nextStatus === "cancelado"
      ? "Cancelar este cliente? Cobranças abertas e tarefas pendentes serão canceladas."
      : "Reativar este cliente? A assinatura voltará a ficar ativa.";
    if (!window.confirm(confirmation)) return;

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("alterar_status_cliente", {
        p_empresa_id: empresaId,
        p_cliente_id: detail.client.id,
        p_assinatura_id: detail.subscription.id,
        p_status: nextStatus,
      });
      if (rpcError) throw rpcError;
      await onSaved();
      await loadDetail();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o status do cliente.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (saving) return;
    setDetail(null);
    setForm(null);
    setError(null);
    onClose();
  }

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={close} />
      <aside className={`drawer ${styles.drawer}`} role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Editar cliente" : "Ficha do cliente"}>
        <div className="drawer-header">
          <div>
            <h2>{mode === "edit" ? "Editar cliente" : detail?.client.nome ?? "Ficha do cliente"}</h2>
            <p>{mode === "edit" ? "Atualize cadastro, assinatura e cobrança aberta" : "Cadastro, assinatura e histórico recente"}</p>
          </div>
          <button className="icon-button" onClick={close} disabled={saving} aria-label="Fechar"><X size={20} /></button>
        </div>

        {loading ? <div className="empty-note">Carregando ficha...</div> : null}
        {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

        {!loading && detail && form && mode === "view" ? (
          <>
            <div className={styles.summary}>
              <div className={styles.summaryItem}><span>Status</span><strong>{detail.client.status === "cancelado" ? "Cancelado" : "Ativo"}</strong><small>{detail.subscription.status === "cancelada" ? "Assinatura cancelada" : "Assinatura ativa"}</small></div>
              <div className={styles.summaryItem}><span>Plano</span><strong>{planName(detail.subscription)}</strong><small>{currency.format(agreedValue(detail.subscription))}</small></div>
              <div className={styles.summaryItem}><span>Vencimento</span><strong>Dia {detail.subscription.dia_vencimento}</strong><small>Mensal</small></div>
              <div className={styles.summaryItem}><span>Créditos</span><strong>{detail.subscription.creditos_por_ciclo}</strong><small>por ciclo</small></div>
              <div className={styles.summaryItem}><span>Ciclo</span><strong>{cycle}</strong><small>mensalidades</small></div>
              <div className={styles.summaryItem}><span>Cadastro</span><strong>{formatDateBR(detail.client.criado_em.slice(0, 10))}</strong><small>no thegestor</small></div>
            </div>

            {cycleCompleted ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}><h3>Renovação do ciclo</h3></div>
                <div className={styles.sectionBody}>
                  {canChooseRenewal ? (
                    <>
                      <div className={styles.note}>
                        O ciclo {cycle} foi concluído e a última mensalidade está paga. Confirme com o cliente como ele quer continuar. A nova cobrança usará o valor de {currency.format(agreedValue(detail.subscription))} e vencimento no dia {detail.subscription.dia_vencimento}.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        <button className="button primary" type="button" disabled={saving} onClick={() => void defineRenewal("mensal")}>Renovar mensal</button>
                        <button className="button secondary" type="button" disabled={saving} onClick={() => void defineRenewal("trimestral")}>Renovar trimestral · 1/3</button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.note}>O ciclo {cycle} terminou, mas a última mensalidade ainda não está quitada. Primeiro finalize o pagamento; depois o sistema liberará a escolha entre mensal e trimestral.</div>
                  )}
                </div>
              </section>
            ) : null}

            <section className={styles.section}>
              <div className={styles.sectionHead}><h3>Contato e observações</h3></div>
              <div className={styles.sectionBody}>
                <div className={styles.note}>
                  <b>Telefone:</b> {detail.client.telefone || "Não informado"}<br />
                  <b>E-mail:</b> {detail.client.email || "Não informado"}<br /><br />
                  <b>Observações:</b><br />{detail.client.observacoes_operacionais || "Nenhuma observação cadastrada."}
                </div>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><h3>Histórico de cobranças</h3><span className="text-link">Últimas {detail.charges.length}</span></div>
              <div style={{ overflowX: "auto" }}>
                {detail.charges.length ? (
                  <table className={styles.history}>
                    <thead><tr><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Créditos</th><th>Status</th></tr></thead>
                    <tbody>{detail.charges.map((charge) => {
                      const financial = first(charge.cobrancas_financeiras);
                      return <tr key={charge.id}>
                        <td>{formatDateBR(charge.competencia)}</td>
                        <td>{formatDateBR(charge.vencimento)}</td>
                        <td>{currency.format(Number(financial?.valor_pago ?? financial?.valor_original ?? 0))}</td>
                        <td>{Number(charge.creditos_utilizados ?? 0)} usados / {Number(charge.creditos_previstos ?? 0)} previstos</td>
                        <td><span className={`status-badge ${statusClass(charge.status_pagamento)}`}>{statusLabel(charge.status_pagamento)}</span></td>
                      </tr>;
                    })}</tbody>
                  </table>
                ) : <div className={styles.sectionBody}><span className={styles.empty}>Nenhuma cobrança registrada.</span></div>}
              </div>
            </section>

            <div className={styles.actions}>
              <button className="button primary" type="button" onClick={() => setMode("edit")}><Pencil size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Editar cliente</button>
              {detail.client.status === "cancelado" ? (
                <button className={`button ${styles.success}`} type="button" disabled={saving} onClick={() => void changeStatus("ativo")}><RotateCcw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Reativar cliente</button>
              ) : (
                <button className={`button ${styles.danger}`} type="button" disabled={saving} onClick={() => void changeStatus("cancelado")}><UserX size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Cancelar cliente</button>
              )}
            </div>
          </>
        ) : null}

        {!loading && detail && form && mode === "edit" ? (
          <form className="form-stack" onSubmit={save}>
            <label>Nome<input value={form.nome} minLength={2} required onChange={(event) => updateForm("nome", event.target.value)} /></label>
            <div className="form-grid-2">
              <label>Telefone/WhatsApp<input value={form.telefone} placeholder="Opcional" onChange={(event) => updateForm("telefone", event.target.value)} /></label>
              <label>E-mail<input value={form.email} type="email" placeholder="Opcional" onChange={(event) => updateForm("email", event.target.value)} /></label>
            </div>
            <div className="form-grid-2">
              <label>Plano<input value={form.plano} required minLength={2} onChange={(event) => updateForm("plano", event.target.value)} /></label>
              <label>Valor mensal<input value={form.valor} type="number" min="0" step="0.01" inputMode="decimal" required onChange={(event) => updateForm("valor", event.target.value)} /></label>
            </div>
            <div className="form-grid-2">
              <label>Dia de vencimento<input value={form.diaVencimento} type="number" min="1" max="31" required onChange={(event) => updateForm("diaVencimento", event.target.value)} /></label>
              <label>Créditos por ciclo<input value={form.creditos} type="number" min="0" step="1" required onChange={(event) => updateForm("creditos", event.target.value)} /></label>
            </div>
            <div className="form-grid-2">
              <label>Mensalidade atual<input value={form.parcelaAtual} type="number" min="1" placeholder="Ex.: 2" onChange={(event) => updateForm("parcelaAtual", event.target.value)} /></label>
              <label>Total de mensalidades<input value={form.parcelasTotal} type="number" min="1" placeholder="Ex.: 3" onChange={(event) => updateForm("parcelasTotal", event.target.value)} /></label>
            </div>
            <label>Observações<textarea value={form.observacoes} rows={5} maxLength={500} onChange={(event) => updateForm("observacoes", event.target.value)} /></label>
            <div className="form-hint">Alterações de valor, vencimento e créditos atualizam somente cobranças ainda abertas. Histórico pago permanece preservado.</div>
            <div className={styles.formFooter}>
              <button className="button secondary" type="button" disabled={saving} onClick={() => { setForm(initialForm(detail)); setMode("view"); }}>Cancelar</button>
              <button className="button primary" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </div>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
