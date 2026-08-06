import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, UserRoundCheck, UserRoundX, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, monthBounds, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type ChargeRow = {
  id: string;
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

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  const { data: membership } = userId
    ? await supabase
        .from("usuarios_empresa")
        .select("empresa_id")
        .eq("user_id", userId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const empresaId = membership?.empresa_id as string | undefined;
  const today = todayInSaoPaulo();
  const { firstDay, nextMonth } = monthBounds(today);

  let activeClients = 0;
  let cancelledClients = 0;
  let openCharges: ChargeRow[] = [];
  let paidThisMonth: ChargeRow[] = [];
  let queue: QueueRow[] = [];

  if (empresaId) {
    const [activeResult, cancelledResult, openResult, paidResult, queueResult] = await Promise.all([
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "ativo"),
      supabase.from("clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("status", "cancelado"),
      supabase
        .from("cobrancas")
        .select("id,vencimento,status_pagamento,pago_em,clientes(nome),cobrancas_financeiras(valor_original,valor_pago)")
        .eq("empresa_id", empresaId)
        .in("status_pagamento", ["pendente", "atrasado"])
        .order("vencimento", { ascending: true }),
      supabase
        .from("cobrancas")
        .select("id,vencimento,status_pagamento,pago_em,cobrancas_financeiras(valor_original,valor_pago)")
        .eq("empresa_id", empresaId)
        .eq("status_pagamento", "pago")
        .gte("pago_em", `${firstDay}T00:00:00`)
        .lt("pago_em", `${nextMonth}T00:00:00`),
      supabase
        .from("tarefas_operacionais")
        .select("id,tipo,prioridade,clientes(nome)")
        .eq("empresa_id", empresaId)
        .eq("status", "pendente")
        .order("criado_em", { ascending: true })
        .limit(5),
    ]);

    activeClients = activeResult.count ?? 0;
    cancelledClients = cancelledResult.count ?? 0;
    openCharges = (openResult.data ?? []) as ChargeRow[];
    paidThisMonth = (paidResult.data ?? []) as ChargeRow[];
    queue = (queueResult.data ?? []) as QueueRow[];
  }

  const overdue = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "Atrasado");
  const upcoming = openCharges.filter((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "A vencer").slice(0, 5);
  const late = overdue.slice(0, 5);

  const receivedThisMonth = paidThisMonth.reduce((sum, charge) => {
    const financial = first(charge.cobrancas_financeiras);
    return sum + Number(financial?.valor_pago ?? financial?.valor_original ?? 0);
  }, 0);
  const pendingAmount = openCharges.reduce((sum, charge) => sum + Number(first(charge.cobrancas_financeiras)?.valor_original ?? 0), 0);

  return (
    <AppShell>
      <PageHeader title="Visão Geral" subtitle="Resumo do negócio e prioridades do dia" />
      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(activeClients)} helper="Base atual" icon={Users} />
        <StatCard title="Clientes cancelados" value={String(cancelledClients)} helper="Base atual" icon={UserRoundX} tone="slate" />
        <StatCard title="Pagamentos no mês" value={String(paidThisMonth.length)} helper="Cobranças confirmadas" icon={UserRoundCheck} tone="green" />
        <StatCard title="Pagamentos em atraso" value={String(overdue.length)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
      </section>
      <section className="grid-2">
        <div className="card">
          <div className="card-header"><h2>Cobranças próximas</h2><Link href="/cobrancas">Ver todas</Link></div>
          {upcoming.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{upcoming.map((charge) => { const financial = first(charge.cobrancas_financeiras); return <tr key={charge.id}><td>{first(charge.clientes)?.nome ?? "Cliente"}</td><td>{formatDateBR(charge.vencimento)}</td><td>{currency.format(Number(financial?.valor_original ?? 0))}</td><td><StatusBadge status="A vencer" /></td></tr>; })}</tbody></table></div> : <div className="empty-note">Nenhuma cobrança próxima.</div>}
        </div>
        <div className="card">
          <div className="card-header"><h2>Cobranças em atraso</h2><Link href="/cobrancas">Ver todas</Link></div>
          {late.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{late.map((charge) => { const financial = first(charge.cobrancas_financeiras); return <tr key={charge.id}><td>{first(charge.clientes)?.nome ?? "Cliente"}</td><td>{formatDateBR(charge.vencimento)}</td><td>{currency.format(Number(financial?.valor_original ?? 0))}</td><td><StatusBadge status="Atrasado" /></td></tr>; })}</tbody></table></div> : <div className="empty-note">Nenhuma cobrança em atraso.</div>}
        </div>
      </section>
      <section className="grid-dashboard" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><h2>Fila operacional</h2><Link href="/operador">Abrir painel</Link></div>
          {queue.length ? <div className="queue">{queue.map((item, index) => <div className="queue-item" key={item.id}><div className={`queue-dot ${item.prioridade === "alta" ? "danger" : item.tipo === "novo_cliente" ? "warning" : "info"}`}>{index + 1}</div><div className="queue-copy"><b>{item.tipo === "novo_cliente" ? "Ativar novo cliente" : item.tipo === "renovar" ? "Renovar cliente" : "Acompanhar cliente"}</b><small>{first(item.clientes)?.nome ?? "Cliente"}</small></div><Link className="button ghost small" href="/operador">Abrir</Link></div>)}</div> : <div className="empty-note">Nenhuma tarefa operacional pendente.</div>}
        </div>
        <div className="card"><div className="card-header"><h2>Indicadores financeiros</h2></div><div className="card-body"><div className="grid-2"><StatCard title="Recebimentos do mês" value={currency.format(receivedThisMonth)} helper="Pagamentos confirmados" icon={CheckCircle2} tone="green" /><StatCard title="Total pendente" value={currency.format(pendingAmount)} helper="A vencer + atrasadas" icon={CalendarClock} tone="orange" /></div></div></div>
      </section>
    </AppShell>
  );
}
