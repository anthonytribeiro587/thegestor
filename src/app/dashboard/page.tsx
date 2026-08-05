import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, UserRoundCheck, UserRoundX, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { charges, operatorQueue } from "@/lib/mock-data";
import { currency } from "@/lib/format";

export default function DashboardPage() {
  const upcoming = charges.filter((charge) => charge.status === "A vencer");
  const late = charges.filter((charge) => charge.status === "Atrasado");
  return (
    <AppShell>
      <PageHeader title="Visão Geral" subtitle="Resumo do negócio e prioridades do dia" />
      <section className="stats-grid">
        <StatCard title="Clientes ativos" value="1.248" helper="+8,5% vs. período anterior" icon={Users} />
        <StatCard title="Clientes cancelados" value="56" helper="12,2% vs. período anterior" icon={UserRoundX} tone="slate" />
        <StatCard title="Pagamentos em dia" value="872" helper="+10,3% no período" icon={UserRoundCheck} tone="green" />
        <StatCard title="Pagamentos em atraso" value="176" helper="7,6% do total" icon={AlertTriangle} tone="orange" />
      </section>
      <section className="grid-2">
        <div className="card"><div className="card-header"><h2>Cobranças próximas</h2><Link href="/cobrancas">Ver todas</Link></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{upcoming.map((charge) => <tr key={charge.id}><td>{charge.client}</td><td>{charge.dueDate}</td><td>{currency.format(charge.value)}</td><td><StatusBadge status={charge.status} /></td></tr>)}</tbody></table></div></div>
        <div className="card"><div className="card-header"><h2>Cobranças em atraso</h2><Link href="/cobrancas">Ver todas</Link></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{late.map((charge) => <tr key={charge.id}><td>{charge.client}</td><td>{charge.dueDate}</td><td>{currency.format(charge.value)}</td><td><StatusBadge status={charge.status} /></td></tr>)}</tbody></table></div></div>
      </section>
      <section className="grid-dashboard" style={{ marginTop: 16 }}>
        <div className="card"><div className="card-header"><h2>Fila operacional</h2><Link href="/operador">Abrir painel</Link></div><div className="queue">{operatorQueue.slice(0, 3).map((item, index) => <div className="queue-item" key={item.client}><div className={`queue-dot ${item.tone}`}>{index + 1}</div><div className="queue-copy"><b>{item.label}</b><small>{item.client}</small></div><button className="button ghost small">Abrir</button></div>)}</div></div>
        <div className="card"><div className="card-header"><h2>Indicadores financeiros</h2></div><div className="card-body"><div className="grid-2"><StatCard title="Recebimentos do mês" value="R$ 78.450" helper="+15,4% no período" icon={CheckCircle2} tone="green" /><StatCard title="Pendentes" value="R$ 16.234" helper="6,7% do período" icon={CalendarClock} tone="orange" /></div></div></div>
      </section>
    </AppShell>
  );
}
