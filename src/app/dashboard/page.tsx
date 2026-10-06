import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, CircleDollarSign } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { formatDateBR, monthBounds, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

type DashboardMetrics = {
  dueToday: number;
  overdueCount: number;
  pendingAmount: number;
  overdueAmount: number;
  receivedThisMonth: number;
  paidCountThisMonth: number;
  pendingRenewals: number;
  cycleReviewCount: number;
  creditsUsed: number;
  creditsExpected: number;
  creditCost: number;
  upcoming: { id: string; nome: string; vencimento: string; saldo: number }[];
  late: { id: string; nome: string; vencimento: string; saldo: number }[];
};

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
  const { data } = empresaId
    ? await supabase.rpc("buscar_metricas_dashboard", {
        p_empresa_id: empresaId, p_hoje: today, p_inicio_mes: firstDay, p_proximo_mes: nextMonth,
      })
    : { data: null };
  const metrics = (data ?? {}) as Partial<DashboardMetrics>;
  const dueToday = Number(metrics.dueToday ?? 0);
  const overdueCount = Number(metrics.overdueCount ?? 0);
  const pendingRenewals = Number(metrics.pendingRenewals ?? 0);
  const receivedThisMonth = Number(metrics.receivedThisMonth ?? 0);
  const pendingAmount = Number(metrics.pendingAmount ?? 0);
  const overdueAmount = Number(metrics.overdueAmount ?? 0);
  const creditsUsed = Number(metrics.creditsUsed ?? 0);
  const creditsExpected = Number(metrics.creditsExpected ?? 0);
  const creditCost = Number(metrics.creditCost ?? 8);
  const projectedCredits = creditsUsed + creditsExpected;
  const upcoming = metrics.upcoming ?? [];
  const late = metrics.late ?? [];
  const cycleReviewCount = Number(metrics.cycleReviewCount ?? 0);

  return (
    <AppShell>
      <PageHeader title="Início" subtitle="O que precisa da sua atenção agora" />

      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(dueToday)} helper="Cobranças para conferir" icon={Clock3} />
        <StatCard title="Em atraso" value={String(overdueCount)} helper="Precisam de cobrança" icon={AlertTriangle} tone="orange" />
        <StatCard title="Para renovar" value={String(pendingRenewals)} helper="Pagamento já confirmado" icon={CheckCircle2} tone="green" />
        <StatCard title="Recebido no mês" value={currency.format(receivedThisMonth)} helper={`${Number(metrics.paidCountThisMonth ?? 0)} cobrança(s) quitada(s)`} icon={CircleDollarSign} tone="green" />
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
            <div className={`${styles.metric} ${styles.metricWarn}`}><span>Em atraso</span><strong>{currency.format(overdueAmount)}</strong><small>{overdueCount} cobrança(s)</small></div>
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
          {upcoming.length ? <div className={styles.chargeList}>{upcoming.map((charge) => <Link href="/cobrancas" className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{charge.nome || "Cliente"}</b><small>{charge.vencimento === today ? "Vence hoje" : "A vencer"}</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(charge.saldo)}</span></Link>)}</div> : <div className={styles.empty}>Nenhuma cobrança próxima.</div>}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><h2>Em atraso</h2><Link href="/cobrancas">Cobrar agora</Link></div>
          {late.length ? <div className={styles.chargeList}>{late.map((charge) => <Link href="/cobrancas" className={styles.chargeRow} key={charge.id}><div className={styles.chargeMain}><b>{charge.nome || "Cliente"}</b><small>Em atraso</small></div><span className={styles.chargeDate}>{formatDateBR(charge.vencimento)}</span><span className={styles.chargeValue}>{currency.format(charge.saldo)}</span></Link>)}</div> : <div className={styles.empty}>Nenhuma cobrança em atraso.</div>}
        </article>
      </section>
    </AppShell>
  );
}
