import Link from "next/link";
import { AlertTriangle, UserRoundCheck, UserRoundX, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { formatDateBR, monthBounds, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import styles from "./dashboard.module.css";

type ChargeRow = {
  id: string;
  competencia: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  clientes: { nome: string } | { nome: string }[] | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
};
type QueueRow = {
  id: string;
  tipo: string;
  prioridade: string;
  clientes: { nome: string } | { nome: string }[] | null;
};
type CreditRow = { creditos_utilizados: number | null; creditos_previstos: number | null };

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function chargeValue(charge: ChargeRow) {
  return Number(first(charge.cobrancas_financeiras)?.valor_original ?? 0);
}

function chargePaid(charge: ChargeRow) {
  return Number(first(charge.cobrancas_financeiras)?.valor_pago ?? 0);
}

function chargeBalance(charge: ChargeRow) {
  return Math.max(chargeValue(charge) - chargePaid(charge), 0);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const { data: membership } = userId
    ? await supabase.from("usuarios_empresa").select("empresa_id").eq("user_id", userId).eq("ativo", true).limit(1).maybeSingle()
    : { data: null };

  const empresaId = membership?.empresa_id as string | undefined;
  const today = todayInSaoPaulo();
  const { firstDay, nextMonth } = monthBounds(today);

  let activeClients = 0;
  let cancelledClients = 0;
  let openCharges: ChargeRow[] = [];
  let paidThisMonth: ChargeRow[] = [];
  let queue: QueueRow[] = [];
  let creditRows: CreditRow[] = [];
  let creditCost = 8;

  if (empresaId) {
    const [activeResult, cancelledResult, openResult, paidResult, queueResult, creditsResult, configResult] = await Promise.all([
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "ativo"),
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "cancelado"),
      supabase.from("cobrancas").select("id,competencia,vencimento,status_pagamento,pago_em,clientes(nome),cobrancas_financeiras(valor_original,valor_pago)").eq("empresa_id", empresaId).in("status_pagamento", ["pendente", "atrasado"]).order("vencimento", { ascending: true }),
      supabase.from("cobrancas").select("id,competencia,vencimento,status_pagamento,pago_em,cobrancas_financeiras(valor_original,valor_pago)").eq("empresa_id", empresaId).eq("status_pagamento", "pago").gte("pago_em", `${firstDay}T00:00:00`).lt("pago_em", `${nextMonth}T00:00:00`),
      supabase.from("tarefas_operacionais").select("id,tipo,prioridade,clientes(nome)").eq("empresa_id", empresaId).eq("status", "pendente").order("criado_em", { ascending: true }).limit(5),
      supabase.from("cobrancas").select("creditos_utilizados,creditos_previstos").eq("empresa_id", empresaId).gte("competencia", firstDay).lt("competencia", nextMonth).neq("status_pagamento", "cancelado"),
      supabase.from("configuracoes_empresa").select("custo_medio_credito").eq("empresa_id", empresaId).maybeSingle(),
    ]);

    activeClients = activeResult.count ?? 0;
    cancelledClients = cancelledResult.count ?? 0;
    openCharges = (openResult.data ?? []) as ChargeRow[];
    paidThisMonth = ((paidResult.data ?? []) as ChargeRow[]).filter((charge) => chargeValue(charge) > 0 && chargePaid(charge) > 0);
    queue = (queueResult.data ?? []) as QueueRow[];
    creditRows = (creditsResult.data ?? []) as CreditRow[];
    creditCost = Number(configResult.data?.custo_medio_credito ?? 8);
  }

  const overdue = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "Atrasado" && chargeBalance(charge) > 0);
  const upcoming = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "A vencer" && chargeBalance(charge) > 0).slice(0, 5);
  const late = overdue.slice(0, 5);
  const partialReceivedThisMonth = openCharges
    .filter((charge) => charge.competencia >= firstDay && charge.competencia < nextMonth && chargePaid(charge) > 0)
    .reduce((sum, charge) => sum + chargePaid(charge), 0);
  const receivedThisMonth = paidThisMonth.reduce((sum, charge) => sum + chargePaid(charge), 0) + partialReceivedThisMonth;
  const pendingAmount = openCharges.reduce((sum, charge) => sum + chargeBalance(charge), 0);
  const overdueAmount = overdue.reduce((sum, charge) => sum + chargeBalance(charge), 0);

  const creditsUsed = creditRows.reduce((sum, row) => sum + Number(row.creditos_utilizados ?? 0), 0);
  const creditsExpected = creditRows.reduce((sum, row) => sum + Number(row.creditos_previstos ?? 0), 0);
  const projectedCredits = creditsUsed + creditsExpected;

  return (
    <AppShell>
      <PageHeader title="Visão Geral" subtitle="Resumo do negócio e prioridades do dia" />

      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(activeClients)} helper="Base atual" icon={Users} />
        <StatCard title="Clientes cancelados" value={String(cancelledClients)} helper="Base atual" icon={UserRoundX} tone="slate" />
        <StatCard title="Cobranças quitadas" value={String(paidThisMonth.length)} helper="Com valor recebido no mês" icon={UserRoundCheck} tone="green" />
        <StatCard title="Pagamentos em atraso" value={String(overdue.length)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
      </section>

      <section className={styles.summaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Resumo financeiro</h2><Link href="/cobrancas">Ver cobranças</Link></div>
          <div className={styles.metricGrid}>
            <div className={`${styles.metric} ${styles.metricAccent}`}><span>Recebido no mês</span><strong>{currency.format(receivedThisMonth)}</strong><small>inclui pagamentos parciais</small></div>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>A receber</span><strong>{currency.format(pendingAmount)}</strong><small>saldo real das cobranças abertas</small></div>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>Em atraso</span><strong>{currency.format(overdueAmount)}</strong><small>{overdue.length} cobrança(s)</small></div>
            <div className={styles.metric}><span>Próximas cobranças</span><strong>{upcoming.length}</strong><small>exibidas abaixo</small></div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Créditos do mês</h2><Link href="/configuracoes">Custo: {currency.format(creditCost)}</Link></div>
          <div className={styles.metricGrid}>
            <div className={`${styles.metric} ${styles.metricAccent}`}><span>Utilizados</span><strong>{creditsUsed}</strong><small>{currency.format(creditsUsed * creditCost)}</small></div>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>Previstos</span><strong>{creditsExpected}</strong><small>{currency.format(creditsExpected * creditCost)}</small></div>
            <div className={styles.metric}><span>Projeção total</span><strong>{projectedCredits}</strong><small>{currency.format(projectedCredits * creditCost)}</small></div>
            <div className={styles.metric}><span>Custo médio</span><strong>{currency.format(creditCost)}</strong><small>por crédito</small></div>
          </div>
          <div className={styles.creditNote}>Ao concluir uma renovação, os créditos previstos passam automaticamente para utilizados.</div>
        </article>
      </section>

      <section className={styles.billingGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Cobranças próximas</h2><Link href="/cobrancas">Ver todas</Link></div>
          {upcoming.length ? <div className={styles.chargeList}>{upcoming.map((charge) => <div className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{first(charge.clientes)?.nome ?? "Cliente"}</b><small>A vencer</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(chargeBalance(charge))}</span></div>)}</div> : <div className={styles.empty}>Nenhuma cobrança próxima.</div>}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Cobranças em atraso</h2><Link href="/cobrancas">Ver todas</Link></div>
          {late.length ? <div className={styles.chargeList}>{late.map((charge) => <div className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{first(charge.clientes)?.nome ?? "Cliente"}</b><small>Em atraso</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(chargeBalance(charge))}</span></div>)}</div> : <div className={styles.empty}>Nenhuma cobrança em atraso.</div>}
        </article>
      </section>

      <section className={`${styles.panel} ${styles.queuePanel}`}>
        <div className={styles.panelHead}><h2>Fila operacional</h2><Link href="/operador">Abrir painel</Link></div>
        {queue.length ? <div className="queue">{queue.map((item, index) => <div className="queue-item" key={item.id}><div className={`queue-dot ${item.prioridade === "alta" ? "danger" : item.tipo === "novo_cliente" ? "warning" : "info"}`}>{index + 1}</div><div className="queue-copy"><b>{item.tipo === "novo_cliente" ? "Ativar novo cliente" : item.tipo === "renovar" ? "Renovar cliente" : "Acompanhar cliente"}</b><small>{first(item.clientes)?.nome ?? "Cliente"}</small></div><Link className="button ghost small" href="/operador">Abrir</Link></div>)}</div> : <div className={styles.empty}>Nenhuma tarefa operacional pendente.</div>}
      </section>
    </AppShell>
  );
}
