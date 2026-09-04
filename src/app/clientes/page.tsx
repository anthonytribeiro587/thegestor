"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Pencil, Plus, Search, Upload, UserRoundCheck, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClientActionsDrawer } from "@/components/client-actions-drawer";
import { ClientDrawer } from "@/components/client-drawer";
import { ClientImportDrawer } from "@/components/client-import-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";
import type { ClientStatus } from "@/lib/types";
import styles from "./clientes.module.css";

type Filter = "Todos" | "Ativos" | "Vencidos" | "Cancelados" | "Revisar ciclos";
type ActionMode = "view" | "edit";
type DayFilter = "all" | number;

type DbSubscription = {
  dia_vencimento: number;
  status: string;
  creditos_por_ciclo: number;
  parcela_atual: number | null;
  parcelas_total: number | null;
  planos: { nome: string } | { nome: string }[] | null;
};

type DbCharge = {
  competencia: string;
  status_pagamento: string;
  vencimento: string;
  pago_em: string | null;
  creditos_utilizados: number | null;
  creditos_previstos: number | null;
  pagamentos: { pago_em: string | null; criado_em: string }[] | null;
};

type DbClient = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  status: string;
  criado_em: string;
  assinaturas: DbSubscription[] | null;
  cobrancas: DbCharge[] | null;
};

type UiClient = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  plan: string;
  credits: number;
  creditsUsed: number;
  creditsExpected: number;
  cycle: string;
  dueDay: number | null;
  status: ClientStatus;
  lastPayment: string;
  baseStatus: string;
  cycleNeedsReview: boolean;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function planName(subscription?: DbSubscription) {
  return first(subscription?.planos)?.nome ?? "Sem plano";
}

function cycleLabel(subscription?: DbSubscription) {
  if (!subscription?.parcela_atual || !subscription.parcelas_total) return "—";
  return `${subscription.parcela_atual}/${subscription.parcelas_total}`;
}

function mapClient(row: DbClient, today: string): UiClient {
  const activeSubscription = row.assinaturas?.find((item) => item.status === "ativa") ?? row.assinaturas?.[0];
  const overdue = row.cobrancas?.some((charge) => operationalChargeStatus(charge.status_pagamento, charge.vencimento, today) === "Atrasado") ?? false;
  const currentMonth = today.slice(0, 7);
  const currentMonthCharge = row.cobrancas?.find((charge) => charge.competencia.slice(0, 7) === currentMonth);
  const currentCharge = currentMonthCharge ?? row.cobrancas?.[0];
  const paymentDates = (row.cobrancas ?? []).flatMap((charge) => [
    ...(charge.pago_em ? [charge.pago_em] : []),
    ...((charge.pagamentos ?? []).map((payment) => payment.pago_em ?? payment.criado_em)),
  ]).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a));

  let status: ClientStatus = "Ativo";
  if (row.status === "cancelado") status = "Cancelado";
  else if (overdue) status = "Vencido";

  return {
    id: row.id,
    name: row.nome,
    phone: row.telefone ?? undefined,
    email: row.email ?? undefined,
    plan: planName(activeSubscription),
    credits: activeSubscription?.creditos_por_ciclo ?? 0,
    creditsUsed: Number(currentCharge?.creditos_utilizados ?? 0),
    creditsExpected: Number(currentCharge?.creditos_previstos ?? 0),
    cycle: cycleLabel(activeSubscription),
    dueDay: activeSubscription?.dia_vencimento ?? null,
    status,
    lastPayment: paymentDates[0] ? new Intl.DateTimeFormat("pt-BR").format(new Date(paymentDates[0])) : "—",
    baseStatus: row.status,
    cycleNeedsReview: row.status === "ativo" && activeSubscription?.status === "ativa" && activeSubscription.parcelas_total !== null && !currentMonthCharge,
  };
}

export default function ClientsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>("view");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [clients, setClients] = useState<UiClient[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
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

      const { data, error: clientsError } = await supabase
        .from("clientes")
        .select("id,nome,telefone,email,status,criado_em,assinaturas(dia_vencimento,status,creditos_por_ciclo,parcela_atual,parcelas_total,planos(nome)),cobrancas(competencia,status_pagamento,vencimento,pago_em,creditos_utilizados,creditos_previstos,pagamentos(pago_em,criado_em))")
        .eq("empresa_id", membership.empresa_id)
        .order("criado_em", { ascending: false })
        .limit(500);

      if (clientsError) throw clientsError;
      const today = todayInSaoPaulo();
      setClients(((data ?? []) as DbClient[]).map((row) => mapClient(row, today)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);

  useEffect(() => {
    if (window.location.hash === "#revisao-ciclos") setFilter("Revisar ciclos");
  }, []);

  function openClient(clientId: string, mode: ActionMode) {
    setSelectedClientId(clientId);
    setActionMode(mode);
    setActionOpen(true);
  }

  const baseFiltered = useMemo(() => clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.phone ?? ""} ${client.email ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "Todos"
      || (filter === "Ativos" && client.status === "Ativo")
      || (filter === "Vencidos" && client.status === "Vencido")
      || (filter === "Cancelados" && client.status === "Cancelado")
      || (filter === "Revisar ciclos" && client.cycleNeedsReview);
    return matchesQuery && matchesFilter;
  }), [clients, query, filter]);

  const visibleClients = useMemo(() => baseFiltered
    .filter((client) => dayFilter === "all" || client.dueDay === dayFilter)
    .sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99) || a.name.localeCompare(b.name, "pt-BR")), [baseFiltered, dayFilter]);

  const groups = useMemo(() => {
    const grouped = new Map<number, UiClient[]>();
    visibleClients.forEach((client) => {
      const day = client.dueDay ?? 0;
      grouped.set(day, [...(grouped.get(day) ?? []), client]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [visibleClients]);

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    baseFiltered.forEach((client) => {
      if (client.dueDay) counts.set(client.dueDay, (counts.get(client.dueDay) ?? 0) + 1);
    });
    return counts;
  }, [baseFiltered]);

  const activeCount = clients.filter((client) => client.baseStatus === "ativo").length;
  const overdueCount = clients.filter((client) => client.status === "Vencido").length;
  const creditsUsed = clients.reduce((sum, client) => sum + client.creditsUsed, 0);
  const creditsExpected = clients.reduce((sum, client) => sum + client.creditsExpected, 0);

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        subtitle="Organize a base pelo dia de vencimento e acompanhe renovações"
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><button className="button secondary" onClick={() => setImportOpen(true)} disabled={!empresaId}><Upload size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Sincronizar planilha</button><button className="button primary" onClick={() => setDrawerOpen(true)} disabled={!empresaId}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo cliente</button></div>}
      />

      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(activeCount)} helper="Base atual" icon={UserRoundCheck} />
        <StatCard title="Com pagamento vencido" value={String(overdueCount)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Créditos utilizados" value={String(creditsUsed)} helper="Já consumidos no mês" icon={WalletCards} tone="green" />
        <StatCard title="Créditos previstos" value={String(creditsExpected)} helper="Ainda devem ser consumidos" icon={WalletCards} tone="slate" />
      </section>

      <section className={styles.dayPanel}>
        <div className={styles.dayPanelHead}>
          <div><h2>Vencimentos por dia</h2><p>Mesma lógica da sua planilha: escolha um dia para focar somente nos clientes daquele vencimento.</p></div>
          <div className="toolbar-filters">{(["Todos", "Ativos", "Vencidos", "Cancelados", "Revisar ciclos"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? "active" : ""}`}>{item}</button>)}</div>
        </div>
        <div className={styles.dayNav}>
          <button className={`${styles.dayButton} ${styles.allButton} ${dayFilter === "all" ? styles.dayButtonActive : ""}`} onClick={() => setDayFilter("all")}><b>Todos</b><small>{baseFiltered.length}</small></button>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
            const count = dayCounts.get(day) ?? 0;
            return <button key={day} disabled={!count} className={`${styles.dayButton} ${dayFilter === day ? styles.dayButtonActive : ""} ${!count ? styles.dayButtonEmpty : ""}`} onClick={() => setDayFilter(day)}><b>{day}</b><small>{count ? `${count} cli.` : "—"}</small></button>;
          })}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar">
          <label className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." /></label>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>{visibleClients.length} cliente(s) exibido(s)</span>
        </div>
      </section>

      {error ? <div className="card"><div className="empty-note">{error} <button className="text-link" onClick={() => void loadClients()}>Tentar novamente</button></div></div> : null}
      {loading ? <div className="card"><div className="empty-note">Carregando clientes...</div></div> : null}

      {!loading && !error ? (
        <div className={styles.listPanel}>
          {groups.length ? groups.map(([day, group]) => {
            const groupUsed = group.reduce((sum, client) => sum + client.creditsUsed, 0);
            const groupExpected = group.reduce((sum, client) => sum + client.creditsExpected, 0);
            return (
              <section key={day} className={styles.dayGroup}>
                <div className={styles.dayGroupHead}>
                  <div className={styles.dayNumber}>{day || "—"}</div>
                  <div className={styles.dayTitle}><b>{day ? `Vencimento dia ${day}` : "Sem vencimento definido"}</b><small>{group.length} cliente(s) neste dia</small></div>
                  <div className={styles.dayCreditSummary}><span className={styles.summaryPill}>Usados <strong>{groupUsed}</strong></span><span className={styles.summaryPill}>Previstos <strong>{groupExpected}</strong></span></div>
                </div>
                <div className={styles.clientHeader}><span>Cliente</span><span>Plano</span><span>Créditos no mês</span><span>Ciclo</span><span>Status</span><span style={{ textAlign: "right" }}>Ações</span></div>
                {group.map((client) => (
                  <div className={styles.clientRow} key={client.id}>
                    <div className={styles.clientMain}><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className={styles.clientText}><b>{client.name}</b><small>Último pagamento: {client.lastPayment}</small></div></div>
                    <span>{client.plan}</span>
                    <div className={styles.credits}><span className={styles.creditUsed}>{client.creditsUsed} usado(s)</span><span className={styles.creditExpected}>{client.creditsExpected} previsto(s)</span></div>
                    <span title={client.cycleNeedsReview ? "Este ciclo precisa de revisão antes da próxima cobrança automática." : undefined} style={client.cycleNeedsReview ? { color: "var(--orange)", fontWeight: 700 } : undefined}>{client.cycleNeedsReview ? "Revisar · " : ""}{client.cycle}</span>
                    <StatusBadge status={client.status} />
                    <div className={styles.actions}><button className="square-action" aria-label={`Visualizar ${client.name}`} title="Visualizar ficha" onClick={() => openClient(client.id, "view")}><Eye size={14} /></button><button className="square-action" aria-label={`Editar ${client.name}`} title="Editar cliente" onClick={() => openClient(client.id, "edit")}><Pencil size={14} /></button></div>
                  </div>
                ))}
              </section>
            );
          }) : <div className={styles.dayGroup}><div className={styles.empty}>Nenhum cliente encontrado para este filtro.</div></div>}
        </div>
      ) : null}

      <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} empresaId={empresaId} onSaved={loadClients} />
      <ClientImportDrawer open={importOpen} onClose={() => setImportOpen(false)} empresaId={empresaId} onImported={loadClients} />
      <ClientActionsDrawer open={actionOpen} mode={actionMode} clientId={selectedClientId} empresaId={empresaId} onClose={() => { setActionOpen(false); setSelectedClientId(null); }} onSaved={loadClients} />
    </AppShell>
  );
}
