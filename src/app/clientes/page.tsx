"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Pencil, Plus, Search, UserRoundCheck, UserRoundPlus, UserRoundX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClientDrawer } from "@/components/client-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { ClientStatus } from "@/lib/types";

type Filter = "Todos" | "Ativos" | "Vencidos" | "Cancelados";

type DbSubscription = {
  dia_vencimento: number;
  status: string;
  planos: { nome: string } | { nome: string }[] | null;
};

type DbCharge = {
  status_pagamento: string;
  pago_em: string | null;
};

type DbClient = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  status: string;
  criado_em: string;
  assinaturas: DbSubscription[] | null;
  cobrancas: DbCharge[] | null;
};

type UiClient = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  plan: string;
  dueDay: number | null;
  status: ClientStatus;
  lastPayment: string;
  createdAt: string;
  baseStatus: string;
};

function planName(subscription?: DbSubscription) {
  if (!subscription?.planos) return "Sem plano";
  return Array.isArray(subscription.planos) ? subscription.planos[0]?.nome ?? "Sem plano" : subscription.planos.nome;
}

function mapClient(row: DbClient): UiClient {
  const activeSubscription = row.assinaturas?.find((item) => item.status === "ativa") ?? row.assinaturas?.[0];
  const overdue = row.cobrancas?.some((charge) => charge.status_pagamento === "atrasado") ?? false;
  const paidDates = (row.cobrancas ?? [])
    .filter((charge) => charge.pago_em)
    .map((charge) => charge.pago_em as string)
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  let status: ClientStatus = "Ativo";
  if (row.status === "cancelado") status = "Cancelado";
  else if (overdue) status = "Vencido";

  return {
    id: row.id,
    name: row.nome,
    phone: row.telefone,
    email: row.email ?? undefined,
    plan: planName(activeSubscription),
    dueDay: activeSubscription?.dia_vencimento ?? null,
    status,
    lastPayment: paidDates[0] ? new Intl.DateTimeFormat("pt-BR").format(new Date(paidDates[0])) : "—",
    createdAt: row.criado_em,
    baseStatus: row.status,
  };
}

export default function ClientsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");
  const [clients, setClients] = useState<UiClient[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sessão inválida. Entre novamente.");

      const { data: membership, error: membershipError } = await supabase
        .from("usuarios_empresa")
        .select("empresa_id")
        .eq("user_id", userData.user.id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
      setEmpresaId(membership.empresa_id);

      const { data, error: clientsError } = await supabase
        .from("clientes")
        .select("id,nome,telefone,email,status,criado_em,assinaturas(dia_vencimento,status,planos(nome)),cobrancas(status_pagamento,pago_em)")
        .eq("empresa_id", membership.empresa_id)
        .order("criado_em", { ascending: false });

      if (clientsError) throw clientsError;
      setClients(((data ?? []) as DbClient[]).map(mapClient));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const filtered = useMemo(() => clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.phone} ${client.email ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "Todos" || (filter === "Ativos" && client.status === "Ativo") || (filter === "Vencidos" && client.status === "Vencido") || (filter === "Cancelados" && client.status === "Cancelado");
    return matchesQuery && matchesFilter;
  }), [clients, query, filter]);

  const activeCount = clients.filter((client) => client.baseStatus === "ativo").length;
  const cancelledCount = clients.filter((client) => client.status === "Cancelado").length;
  const overdueCount = clients.filter((client) => client.status === "Vencido").length;
  const now = new Date();
  const newThisMonth = clients.filter((client) => {
    const created = new Date(client.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  return (
    <AppShell>
      <PageHeader title="Clientes" subtitle="Cadastre e acompanhe seus clientes" action={<button className="button primary" onClick={() => setDrawerOpen(true)} disabled={!empresaId}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo cliente</button>} />
      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(activeCount)} helper="Base atual" icon={UserRoundCheck} />
        <StatCard title="Cancelados" value={String(cancelledCount)} helper="Base atual" icon={UserRoundX} tone="slate" />
        <StatCard title="Com pagamento vencido" value={String(overdueCount)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Novos este mês" value={String(newThisMonth)} helper="Cadastros do período" icon={UserRoundPlus} tone="green" />
      </section>
      <section className="card">
        <div className="toolbar"><label className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." /></label><div className="toolbar-filters">{(["Todos", "Ativos", "Vencidos", "Cancelados"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? "active" : ""}`}>{item}</button>)}</div></div>
        {error ? <div className="empty-note">{error} <button className="text-link" onClick={() => void loadClients()}>Tentar novamente</button></div> : null}
        <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Plano</th><th>Vencimento</th><th>Status</th><th>Último pagamento</th><th>Ações</th></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><div className="client-cell"><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{client.name}</div></td><td>{client.phone}</td><td>{client.plan}</td><td>{client.dueDay ? `Dia ${client.dueDay}` : "—"}</td><td><StatusBadge status={client.status} /></td><td>{client.lastPayment}</td><td><div className="action-set"><button className="square-action" aria-label="Visualizar"><Eye size={14} /></button><button className="square-action" aria-label="Editar"><Pencil size={14} /></button></div></td></tr>)}</tbody></table></div>
        {loading ? <div className="empty-note">Carregando clientes...</div> : null}
        {!loading && !error && filtered.length === 0 ? <div className="empty-note">Nenhum cliente encontrado.</div> : null}
      </section>
      <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} empresaId={empresaId} onSaved={loadClients} />
    </AppShell>
  );
}
