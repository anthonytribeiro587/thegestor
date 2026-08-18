"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChargeActionsDrawer } from "@/components/charge-actions-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import styles from "./cobrancas.module.css";

type Tab = "Precisa de ação" | "Atrasado" | "A vencer" | "Parcial" | "Pago" | "Todas";

type ChargeRow = {
  id: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  origem: string;
  creditos_previstos: number | null;
  clientes: { nome: string } | { nome: string }[] | null;
  assinaturas: { planos: { nome: string } | { nome: string }[] | null } | { planos: { nome: string } | { nome: string }[] | null }[] | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
  pagamentos: { metodo: string | null; status: string }[] | null;
};

type QueueRow = {
  tarefa_id: string;
  cobranca_id: string | null;
  tipo: string;
  cliente_nome: string;
};

type UiCharge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  dueRaw: string;
  paidAt: string | null;
  status: Exclude<Tab, "Todas" | "Precisa de ação">;
  paymentMethod: string;
  value: number;
  paidValue: number;
  balance: number;
  taskId: string | null;
  taskType: string | null;
  needsAction: boolean;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function description(row: ChargeRow) {
  const subscription = first(row.assinaturas);
  const plan = first(subscription?.planos);
  return plan?.nome ? `Plano ${plan.nome}` : "Cobrança recorrente";
}

function paymentMethod(row: ChargeRow) {
  const payment = row.pagamentos?.find((item) => item.status === "approved" || item.status === "pago" || item.status === "parcial") ?? row.pagamentos?.[0];
  if (!payment?.metodo) return row.status_pagamento === "pago" ? "Manual" : "Aguardando pagamento";
  const method = payment.metodo.toLowerCase();
  if (method === "importacao_planilha") return "Importado da planilha";
  if (method.includes("pix")) return "PIX";
  if (method.includes("credit") || method.includes("cart")) return "Cartão de crédito";
  if (method.includes("boleto")) return "Boleto bancário";
  if (method === "manual") return "Manual";
  return payment.metodo;
}

function taskActionLabel(type: string | null) {
  return type === "novo_cliente" ? "Ativar cliente" : "Marcar renovado";
}

export default function ChargesPage() {
  const [tab, setTab] = useState<Tab>("Precisa de ação");
  const [query, setQuery] = useState("");
  const [charges, setCharges] = useState<UiCharge[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [quickPayingId, setQuickPayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Sessão inválida. Entre novamente.");

      const { data: membership, error: membershipError } = await supabase.from("usuarios_empresa").select("empresa_id").eq("user_id", userId).eq("ativo", true).limit(1).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
      setEmpresaId(membership.empresa_id);

      const [chargesResult, queueResult] = await Promise.all([
        supabase.from("cobrancas").select("id,vencimento,status_pagamento,pago_em,origem,creditos_previstos,clientes(nome),assinaturas(planos(nome)),cobrancas_financeiras(valor_original,valor_pago),pagamentos(metodo,status)").eq("empresa_id", membership.empresa_id).neq("status_pagamento", "cancelado").order("vencimento", { ascending: true }).limit(500),
        supabase.from("fila_operacional").select("tarefa_id,cobranca_id,tipo,cliente_nome").eq("empresa_id", membership.empresa_id).eq("status_tarefa", "pendente").order("criado_em", { ascending: true }).limit(500),
      ]);
      if (chargesResult.error) throw chargesResult.error;
      if (queueResult.error) throw queueResult.error;

      const queue = (queueResult.data ?? []) as QueueRow[];
      const taskByCharge = new Map<string, QueueRow>();
      for (const task of queue) {
        if (task.cobranca_id && !taskByCharge.has(task.cobranca_id)) taskByCharge.set(task.cobranca_id, task);
      }

      const today = todayInSaoPaulo();
      const mapped = ((chargesResult.data ?? []) as ChargeRow[]).map((row) => {
        const financial = first(row.cobrancas_financeiras);
        const original = Number(financial?.valor_original ?? 0);
        const paid = Number(financial?.valor_pago ?? 0);
        const balance = Math.max(original - paid, 0);
        const operational = operationalChargeStatus(row.status_pagamento, row.vencimento, today);
        const status: UiCharge["status"] = row.status_pagamento !== "pago" && paid > 0 && paid < original ? "Parcial" : operational;
        const task = taskByCharge.get(row.id) ?? null;
        const needsAction = Boolean(task) || status === "Atrasado" || status === "Parcial" || (balance > 0 && row.vencimento === today);
        return {
          id: row.id,
          client: first(row.clientes)?.nome ?? "Cliente",
          description: description(row),
          dueDate: formatDateBR(row.vencimento),
          dueRaw: row.vencimento,
          paidAt: row.pago_em,
          status,
          paymentMethod: paymentMethod(row),
          value: original,
          paidValue: paid,
          balance,
          taskId: task?.tarefa_id ?? null,
          taskType: task?.tipo ?? null,
          needsAction,
        };
      });
      setCharges(mapped);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as cobranças.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function quickPay(charge: UiCharge) {
    if (quickPayingId || charge.balance <= 0) return;
    setQuickPayingId(charge.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cobrancas/quick-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId: charge.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; renewed?: boolean; nextDue?: string; warning?: string | null };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível marcar como pago.");

      const nextDueText = payload.nextDue ? formatDateBR(payload.nextDue) : "o próximo mês";
      setNotice(payload.renewed
        ? `${charge.client}: pago e renovado. Próximo vencimento previsto em ${nextDueText}.`
        : `${charge.client}: pagamento registrado. ${payload.warning ?? "Confira a renovação."}`);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível marcar como pago.");
    } finally {
      setQuickPayingId(null);
    }
  }

  async function completeTask(charge: UiCharge) {
    if (!charge.taskId || savingTaskId) return;
    setSavingTaskId(charge.taskId);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("concluir_tarefa_operacional", {
        p_tarefa_id: charge.taskId,
        p_observacao: charge.taskType === "novo_cliente" ? "Cliente ativado pelo administrador na tela de cobranças" : "Renovação concluída pelo administrador na tela de cobranças",
      });
      if (rpcError) throw rpcError;
      setNotice(`${charge.client}: ${charge.taskType === "novo_cliente" ? "cliente ativado" : "renovação marcada como concluída"}.`);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a renovação.");
    } finally {
      setSavingTaskId(null);
    }
  }

  const visible = useMemo(() => charges.filter((charge) => {
    const matchesTab = tab === "Todas" || (tab === "Precisa de ação" ? charge.needsAction : charge.status === tab);
    const matchesQuery = `${charge.client} ${charge.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesTab && matchesQuery;
  }), [charges, tab, query]);

  const today = todayInSaoPaulo();
  const currentMonth = today.slice(0, 7);
  const dueToday = charges.filter((charge) => charge.balance > 0 && charge.dueRaw === today).length;
  const overdue = charges.filter((charge) => charge.status === "Atrasado" && charge.balance > 0).length;
  const pendingRenewals = charges.filter((charge) => Boolean(charge.taskId)).length;
  const paidThisMonth = charges.filter((charge) => charge.status === "Pago" && charge.value > 0 && charge.paidValue > 0 && charge.paidAt?.slice(0, 7) === currentMonth).length;

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Tudo o que precisa cobrar, conferir ou renovar em um só lugar" />

      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(dueToday)} helper="Resolver hoje" icon={Clock3} />
        <StatCard title="Em atraso" value={String(overdue)} helper="Precisam de cobrança" icon={AlertTriangle} tone="orange" />
        <StatCard title="Para renovar" value={String(pendingRenewals)} helper="Pagamento já confirmado" icon={CheckCircle2} tone="green" />
        <StatCard title="Quitadas no mês" value={String(paidThisMonth)} helper="Com valor recebido" icon={CheckCircle2} tone="green" />
      </section>

      <div className={styles.workspace}>
        <section className={styles.chargePanel}>
          <div className={styles.panelHead}><h2>Cobranças e pendências</h2><span>{visible.length} registro(s)</span></div>
          <div className={styles.toolbar}>
            <label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." /></label>
            <div className={styles.filters}>{(["Precisa de ação", "Atrasado", "A vencer", "Parcial", "Pago", "Todas"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>)}</div>
          </div>

          {notice ? <div className="form-success" role="status" style={{ margin: 14 }}>{notice}</div> : null}
          {error ? <div className={styles.empty}>{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div> : null}
          {loading ? <div className={styles.empty}>Carregando cobranças...</div> : null}

          {!loading && !error && visible.length ? (
            <>
              <div className={styles.chargeHeader}><span>Cliente</span><span>Vencimento</span><span>Status</span><span>Financeiro</span><span style={{ textAlign: "right" }}>Ação</span></div>
              {visible.map((charge) => (
                <div key={charge.id} className={`${styles.chargeRow} ${charge.status === "Atrasado" ? styles.chargeLate : ""} ${charge.status === "Parcial" ? styles.chargePartial : ""}`}>
                  <div className={styles.clientCell}><b>{charge.client}</b><small>{charge.description}</small></div>
                  <span>{charge.dueDate}</span>
                  <div className={styles.statusCell}>
                    {charge.status === "Parcial" ? <span className="status-badge status-pendente">Parcial</span> : <StatusBadge status={charge.status} />}
                    <small>{charge.taskId ? "Pagamento confirmado · falta renovar" : charge.paymentMethod}</small>
                  </div>
                  <div className={styles.financeCell}>
                    <div className={styles.financeItem}><span>Valor</span><strong>{currency.format(charge.value)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeReceived}`}><span>Recebido</span><strong>{currency.format(charge.paidValue)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeBalance}`}><span>Saldo</span><strong>{currency.format(charge.balance)}</strong></div>
                  </div>
                  <div className={styles.actionCell}>
                    {charge.balance > 0 ? <button className="button primary small" disabled={quickPayingId === charge.id} onClick={() => void quickPay(charge)}>{quickPayingId === charge.id ? "Salvando..." : charge.status === "Parcial" ? "Quitar" : "Pago"}</button> : null}
                    {charge.balance === 0 && charge.taskId ? <button className="button primary small" disabled={savingTaskId === charge.taskId} onClick={() => void completeTask(charge)}>{savingTaskId === charge.taskId ? "Salvando..." : taskActionLabel(charge.taskType)}</button> : null}
                    <button className="button ghost small" onClick={() => setSelectedChargeId(charge.id)}>{charge.balance > 0 || charge.taskId ? "Ver" : "Detalhes"}</button>
                  </div>
                </div>
              ))}
            </>
          ) : !loading && !error ? <div className={styles.empty}>{tab === "Precisa de ação" ? "Nenhuma pendência agora. Está tudo em dia." : "Nenhuma cobrança encontrada."}</div> : null}
        </section>
      </div>

      <ChargeActionsDrawer open={Boolean(selectedChargeId)} chargeId={selectedChargeId} empresaId={empresaId} onClose={() => setSelectedChargeId(null)} onSaved={loadData} />
    </AppShell>
  );
}
