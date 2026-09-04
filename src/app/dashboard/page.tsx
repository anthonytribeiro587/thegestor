import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, CircleDollarSign } from "lucide-react";
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
type CreditRow = { creditos_utilizados: number | null; creditos_previstos: number | null };
type ParcelChargeRow = { competencia: string; status_pagamento: string };
type ParcelSubscriptionRow = {
  id: string;
  parcela_atual: number | null;
  parcelas_total: number | null;
  clientes: { status: string } | { status: string }[] | null;
  cobrancas: ParcelChargeRow[] | null;
};

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

  let openCharges: ChargeRow[] = [];
  let paidThisMonth: ChargeRow[] = [];
  let creditRows: CreditRow[] = [];
  let pendingRenewals = 0;
  let cycleReviewCount = 0;
  let creditCost = 8;

  if (empresaId) {
    const [openResult, paidResult, renewalsResult, creditsResult, configResult, parcelSubscriptionsResult] = await Promise.all([
      supabase.from("cobrancas").select("id,competencia,vencimento,status_pagamento,pago_em,clientes(nome),cobrancas_financeiras(valor_original,valor_pago)").eq("empresa_id", empresaId).in("status_pagamento", ["pendente", "atrasado"]).order("vencimento", { ascending: true }),
      supabase.from("cobrancas").select("id,competencia,vencimento,status_pagamento,pago_em,cobrancas_financeiras(valor_original,valor_pago)").eq("empresa_id", empresaId).eq("status_pagamento", "pago").gte("pago_em", `${firstDay}T00:00:00`).lt("pago_em", `${nextMonth}T00:00:00`),
      supabase.from("tarefas_operacionais").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "pendente").in("tipo", ["renovar", "novo_cliente"]),
      supabase.from("cobrancas").select("creditos_utilizados,creditos_previstos").eq("empresa_id", empresaId).gte("competencia", firstDay).lt("competencia", nextMonth).neq("status_pagamento", "cancelado"),
      supabase.from("configuracoes_empresa").select("custo_medio_credito").eq("empresa_id", empresaId).maybeSingle(),
      supabase.from("assinaturas").select("id,parcela_atual,parcelas_total,clientes(status),cobrancas(competencia,status_pagamento)").eq("empresa_id", empresaId).eq("status", "ativa").not("parcelas_total", "is", null),
    ]);

    openCharges = (openResult.data ?? []) as ChargeRow[];
    paidThisMonth = ((paidResult.data ?? []) as ChargeRow[]).filter((charge) => chargeValue(charge) > 0 && chargePaid(charge) > 0);
    pendingRenewals = renewalsResult.count ?? 0;
    creditRows = (creditsResult.data ?? []) as CreditRow[];
    creditCost = Number(configResult.data?.custo_medio_credito ?? 8);

    cycleReviewCount = ((parcelSubscriptionsResult.data ?? []) as ParcelSubscriptionRow[])
      .filter((subscription) => {
        if (first(subscription.clientes)?.status !== "ativo") return false;
        if (subscription.parcela_atual === null || subscription.parcelas_total === null) return false;
        if (subscription.parcela_atual < subscription.parcelas_total) return false;
        const latestCharge = [...(subscription.cobrancas ?? [])].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
        return latestCharge?.status_pagamento === "pago";
      })
      .length;
  }

  const overdue = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "Atrasado" && chargeBalance(charge) > 0);
  const dueToday = openCharges.filter((charge) => charge.vencimento === today && chargeBalance(charge) > 0);
  const upcoming = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "A vencer" && chargeBalance(charge) > 0).slice(0, 6);
  const late = overdue.slice(0, 6);
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
      <PageHeader title="Início" subtitle="O que precisa da sua atenção agora" />

      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(dueToday.length)} helper="Cobranças para conferir" icon={Clock3} />
        <StatCard title="Em atraso" value={String(overdue.length)} helper="Precisam de cobrança" icon={AlertTriangle} tone="orange" />
        <StatCard title="Para renovar" value={String(pendingRenewals)} helper="Pagamento já confirmado" icon={CheckCircle2} tone="green" />
        <StatCard title="Recebido no mês" value={currency.format(receivedThisMonth)} helper={`${paidThisMonth.length} cobrança(s) quitada(s)`} icon={CircleDollarSign} tone="green" />
      </section>

      {cycleReviewCount > 0 ? (
        <section className="card" style={{ marginBottom: 16, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span className="stat-icon tone-orange" style={{ width: 38, height: 38 }}><AlertTriangle size={18} /></span>
            <div>
              <b style={{ display: "block", fontSize: 12 }}>{cycleReviewCount} cliente(s) aguardam decisão de renovação</b>
              <small style={{ color: "var(--muted)", fontSize: 10 }}>O ciclo terminou e a última mensalidade já foi paga. Confirme se o cliente quer seguir no mensal ou iniciar um novo trimestral.</small>
            </div>
          </div>
          <Link className="button secondary" href="/clientes#revisao-ciclos">Definir renovação</Link>
        </section>
      ) : null}

      <section className={styles.summaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Resumo das cobranças</h2><Link href="/cobrancas">Resolver pendências</Link></div>
          <div className={styles.metricGrid}>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>A receber</span><strong>{currency.format(pendingAmount)}</strong><small>saldo das cobranças abertas</small></div>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>Em atraso</span><strong>{currency.format(overdueAmount)}</strong><small>{overdue.length} cobrança(s)</small></div>
            <div className={`${styles.metric} ${styles.metricAccent}`}><span>Recebido</span><strong>{currency.format(receivedThisMonth)}</strong><small>neste mês</small></div>
            <div className={styles.metric}><span>Para renovar</span><strong>{pendingRenewals}</strong><small>ações pendentes</small></div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Créditos do mês</h2><Link href="/configuracoes">Custo: {currency.format(creditCost)}</Link></div>
          <div className={styles.metricGrid}>
            <div className={`${styles.metric} ${styles.metricAccent}`}><span>Utilizados</span><strong>{creditsUsed}</strong><small>{currency.format(creditsUsed * creditCost)}</small></div>
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>Previstos</span><strong>{creditsExpected}</strong><small>{currency.format(creditsExpected * creditCost)}</small></div>
            <div className={styles.metric}><span>Projeção</span><strong>{projectedCredits}</strong><small>{currency.format(projectedCredits * creditCost)}</small></div>
            <div className={styles.metric}><span>Custo médio</span><strong>{currency.format(creditCost)}</strong><small>por crédito</small></div>
          </div>
        </article>
      </section>

      <section className={styles.billingGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Próximos vencimentos</h2><Link href="/cobrancas">Ver cobranças</Link></div>
          {upcoming.length ? <div className={styles.chargeList}>{upcoming.map((charge) => <Link href="/cobrancas" className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{first(charge.clientes)?.nome ?? "Cliente"}</b><small>{charge.vencimento === today ? "Vence hoje" : "A vencer"}</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(chargeBalance(charge))}</span></Link>)}</div> : <div className={styles.empty}>Nenhuma cobrança próxima.</div>}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Em atraso</h2><Link href="/cobrancas">Cobrar agora</Link></div>
          {late.length ? <div className={styles.chargeList}>{late.map((charge) => <Link href="/cobrancas" className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{first(charge.clientes)?.nome ?? "Cliente"}</b><small>Em atraso</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(chargeBalance(charge))}</span></Link>)}</div> : <div className={styles.empty}>Nenhuma cobrança em atraso.</div>}
        </article>
      </section>
    </AppShell>
  );
}
