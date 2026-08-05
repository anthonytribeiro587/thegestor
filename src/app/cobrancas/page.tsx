"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { charges, operatorQueue } from "@/lib/mock-data";
import { currency } from "@/lib/format";

type Tab = "Todas" | "A vencer" | "Atrasado" | "Pago";

export default function ChargesPage() {
  const [tab, setTab] = useState<Tab>("Todas");
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => charges.filter((charge) => {
      const matchesTab = tab === "Todas" || charge.status === tab;
      const matchesQuery = `${charge.client} ${charge.description}`.toLowerCase().includes(query.toLowerCase());
      return matchesTab && matchesQuery;
    }),
    [tab, query]
  );

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Acompanhe vencimentos, pagamentos e ações" />
      <section className="stats-grid">
        <StatCard title="Vencem hoje" value="18" helper="Prioridade diária" icon={Clock3} />
        <StatCard title="Próximos 7 dias" value="64" helper="Cobranças previstas" icon={CalendarDays} tone="green" />
        <StatCard title="Em atraso" value="76" helper="Requer acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Pagas no mês" value="872" helper="+10,3% vs. mês anterior" icon={CheckCircle2} tone="green" />
      </section>
      <section className="grid-dashboard">
        <div className="card">
          <div className="toolbar">
            <label className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cobrança..." /></label>
            <div className="toolbar-filters">{(["Todas", "A vencer", "Atrasado", "Pago"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>)}</div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Cliente</th><th>Descrição</th><th>Vencimento</th><th>Status</th><th>Forma de pagamento</th><th>Valor</th><th>Ação</th></tr></thead>
              <tbody>{visible.map((charge) => <tr key={charge.id}><td>{charge.client}</td><td>{charge.description}</td><td>{charge.dueDate}</td><td><StatusBadge status={charge.status} /></td><td>{charge.paymentMethod}</td><td>{currency.format(charge.value)}</td><td><button className="button ghost small">Detalhes</button></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <aside className="card" style={{ alignSelf: "start" }}>
          <div className="card-header"><h2>Fila operacional</h2></div>
          <div className="queue">{operatorQueue.map((item, index) => <div className="queue-item" key={`${item.client}-${index}`}><div className={`queue-dot ${item.tone}`}>{index + 1}</div><div className="queue-copy"><b>{item.label}</b><small>{item.client}</small></div><button className="button ghost small">Abrir</button></div>)}</div>
        </aside>
      </section>
    </AppShell>
  );
}
