"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Pencil, Plus, Search, UserRoundCheck, UserRoundPlus, UserRoundX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClientDrawer } from "@/components/client-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { clients } from "@/lib/mock-data";

type Filter = "Todos" | "Ativos" | "Vencidos" | "Cancelados";

export default function ClientsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");
  const filtered = useMemo(() => clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.phone} ${client.email ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "Todos" || (filter === "Ativos" && client.status === "Ativo") || (filter === "Vencidos" && client.status === "Vencido") || (filter === "Cancelados" && client.status === "Cancelado");
    return matchesQuery && matchesFilter;
  }), [query, filter]);

  return (
    <AppShell>
      <PageHeader title="Clientes" subtitle="Cadastre e acompanhe seus clientes" action={<button className="button primary" onClick={() => setDrawerOpen(true)}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo cliente</button>} />
      <section className="stats-grid">
        <StatCard title="Clientes ativos" value="1.248" helper="84% da base" icon={UserRoundCheck} />
        <StatCard title="Cancelados" value="56" helper="4% da base" icon={UserRoundX} tone="slate" />
        <StatCard title="Com pagamento vencido" value="176" helper="12% da base" icon={AlertTriangle} tone="orange" />
        <StatCard title="Novos este mês" value="89" helper="+22,1% no período" icon={UserRoundPlus} tone="green" />
      </section>
      <section className="card">
        <div className="toolbar"><label className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." /></label><div className="toolbar-filters">{(["Todos", "Ativos", "Vencidos", "Cancelados"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? "active" : ""}`}>{item}</button>)}</div></div>
        <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Plano</th><th>Vencimento</th><th>Status</th><th>Último pagamento</th><th>Ações</th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><div className="client-cell"><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{client.name}</div></td><td>{client.phone}</td><td>{client.plan}</td><td>Dia {client.dueDay}</td><td><StatusBadge status={client.status} /></td><td>{client.lastPayment}</td><td><div className="action-set"><button className="square-action" aria-label="Visualizar"><Eye size={14} /></button><button className="square-action" aria-label="Editar"><Pencil size={14} /></button></div></td></tr>)}</tbody></table></div>
        {filtered.length === 0 ? <div className="empty-note">Nenhum cliente encontrado com esses filtros.</div> : null}
      </section>
      <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </AppShell>
  );
}
