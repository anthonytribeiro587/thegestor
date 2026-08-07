"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChargeActionsDrawer } from "@/components/charge-actions-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import styles from "./cobrancas.module.css";

type Tab = "Todas" | "A vencer" | "Atrasado" | "Parcial" | "Pago";

type ChargeRow = {
  id: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  origem: string;
  clientes: { nome: string } | { nome: string }[] | null;
  assinaturas: { planos: { nome: string } | { nome: string }[] | null } | { planos: { nome: string } | { nome: string }[] | null }[] | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
  pagamentos: { metodo: string | null; status: string }[] | null;
};

type QueueRow = { tarefa_id: string; tipo: string; prioridade: string; cliente_nome: string; vencimento: string | null; status_pagamento: string | null };

type UiCharge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  dueRaw: string;
  paidAt: string | null;
  status: Exclude<Tab, "Todas">;
  paymentMethod: string;
  value: number;
  paidValue: number;
  balance: number;
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

export default function ChargesPage() {
  const [tab, setTab] = useState<Tab>("Todas");
  const [query, setQuery] = useState("");
  const [charges, setCharges] = useState<UiCharge[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        supabase.from("cobrancas").select("id,vencimento,status_pagamento,pago_em,origem,clientes(nome),assinaturas(planos(nome)),cobrancas_financeiras(valor_original,valor_pago),pagamentos(metodo,status)").eq("empresa_id", membership.empresa_id).neq("status_pagamento", "cancelado").order("vencimento", { ascending: true }).limit(500),
        supabase.from("fila_operacional").select("tarefa_id,tipo,prioridade,cliente_nome,vencimento,status_pagamento").eq("empresa_id", membership.empresa_id).eq("status_tarefa", "pendente").order("criado_em", { ascending: true }).limit(8),
      ]);
      if (chargesResult.error) throw chargesResult.error;
      if (queueResult.error) throw queueResult.error;

      const today = todayInSaoPaulo();
      const mapped = ((chargesResult.data ?? []) as ChargeRow[]).map((row) => {
        const financial = first(row.cobrancas_financeiras);
        const original = Number(financial?.valor_original ?? 0);
        const paid = Number(financial?.valor_pago ?? 0);
        const operational = operationalChargeStatus(row.status_pagamento, row.vencimento, today);
        const status: UiCharge["status"] = row.status_pagamento !== "pago" && paid > 0 && paid < original ? "Parcial" : operational;
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
          balance: Math.max(original - paid, 0),
        };
      });
      setCharges(mapped);
      setQueue((queueResult.data ?? []) as QueueRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as cobranças.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const visible = useMemo(() => charges.filter((charge) => {
    const matchesTab = tab === "Todas" || charge.status === tab;
    const matchesQuery = `${charge.client} ${charge.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesTab && matchesQuery;
  }), [charges, tab, query]);

  const today = todayInSaoPaulo();
  const sevenDaysFromNow = new Date(`${today}T12:00:00Z`);
  sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);
  const sevenDaysLimit = sevenDaysFromNow.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const dueToday = charges.filter((charge) => charge.balance > 0 && charge.dueRaw === today).length;
  const nextSevenDays = charges.filter((charge) => charge.balance > 0 && charge.status !== "Atrasado" && charge.dueRaw >= today && charge.dueRaw <= sevenDaysLimit).length;
  const overdue = charges.filter((charge) => charge.status === "Atrasado" && charge.balance > 0).length;
  const paidThisMonth = charges.filter((charge) => charge.status === "Pago" && charge.value > 0 && charge.paidValue > 0 && charge.paidAt?.slice(0, 7) === currentMonth).length;

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Veja o que vence, o que já entrou e o que ainda precisa de ação" />

      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(dueToday)} helper="Prioridade diária" icon={Clock3} />
        <StatCard title="Próximos 7 dias" value={String(nextSevenDays)} helper="Cobranças previstas" icon={CalendarDays} tone="green" />
        <StatCard title="Em atraso" value={String(overdue)} helper="Precisam de cobrança" icon={AlertTriangle} tone="orange" />
        <StatCard title="Quitadas no mês" value={String(paidThisMonth)} helper="Com valor recebido" icon={CheckCircle2} tone="green" />
      </section>

      <div className={styles.workspace}>
        <section className={styles.chargePanel}>
          <div className={styles.panelHead}><h2>Cobranças do mês</h2><span>{visible.length} registro(s) no filtro atual</span></div>
          <div className={styles.toolbar}>
            <label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." /></label>
            <div className={styles.filters}>{(["Todas", "A vencer", "Atrasado", "Parcial", "Pago"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>)}</div>
          </div>

          {error ? <div className={styles.empty}>{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div> : null}
          {loading ? <div className={styles.empty}>Carregando cobranças...</div> : null}

          {!loading && !error && visible.length ? (
            <>
              <div className={styles.chargeHeader}><span>Cliente</span><span>Vencimento</span><span>Status</span><span>Financeiro</span><span style={{ textAlign: "right" }}>Ação</span></div>
              {visible.map((charge) => (
                <div key={charge.id} className={`${styles.chargeRow} ${charge.status === "Atrasado" ? styles.chargeLate : ""} ${charge.status === "Parcial" ? styles.chargePartial : ""}`}>
                  <div className={styles.clientCell}><b>{charge.client}</b><small>{charge.description}</small></div>
                  <span>{charge.dueDate}</span>
                  <div className={styles.statusCell}>{charge.status === "Parcial" ? <span className="status-badge status-pendente">Parcial</span> : <StatusBadge status={charge.status} />}<small>{charge.paymentMethod}</small></div>
                  <div className={styles.financeCell}>
                    <div className={styles.financeItem}><span>Valor</span><strong>{currency.format(charge.value)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeReceived}`}><span>Recebido</span><strong>{currency.format(charge.paidValue)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeBalance}`}><span>Saldo</span><strong>{currency.format(charge.balance)}</strong></div>
                  </div>
                  <div className={styles.actionCell}><button className="button ghost small" onClick={() => setSelectedChargeId(charge.id)}>Detalhes</button></div>
                </div>
              ))}
            </>
          ) : !loading && !error ? <div className={styles.empty}>Nenhuma cobrança encontrada.</div> : null}
        </section>

        <section className={styles.queuePanel}>
          <div className={styles.panelHead}><h2>Fila operacional</h2><Link href="/operador">Abrir painel completo</Link></div>
          {queue.length ? (
            <div className={styles.queueGrid}>
              {queue.map((item, index) => (
                <article className={styles.queueCard} key={item.tarefa_id}>
                  <div className={styles.queueTop}><span className={styles.queueNumber}>{index + 1}</span><div className={styles.queueCopy}><b>{item.tipo === "novo_cliente" ? "Ativar novo cliente" : item.tipo === "renovar" ? "Renovar cliente" : "Acompanhar cliente"}</b><small>{item.cliente_nome}{item.vencimento ? ` · vence ${formatDateBR(item.vencimento)}` : ""}</small></div></div>
                  <div className={styles.queueAction}><Link className="button ghost small" href="/operador">Ir para fila</Link></div>
                </article>
              ))}
            </div>
          ) : !loading ? <div className={styles.empty}>Nenhuma tarefa operacional pendente.</div> : null}
        </section>
      </div>

      <ChargeActionsDrawer open={Boolean(selectedChargeId)} chargeId={selectedChargeId} empresaId={empresaId} onClose={() => setSelectedChargeId(null)} onSaved={loadData} />
    </AppShell>
  );
}
