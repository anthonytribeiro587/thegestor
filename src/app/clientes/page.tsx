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
import { todayInSaoPaulo } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";
import type { ClientStatus } from "@/lib/types";
import styles from "./clientes.module.css";

type Filter = "Todos" | "Vencidos" | "Revisar ciclos";
type ClientStatusFilter = "Todos" | "Ativos" | "Cancelados";
type CreditFilter = "Todos" | "Com créditos previstos" | "Sem créditos previstos";
type PlanOption = { id: string; nome: string };
type ActionMode = "view" | "edit";
type DayFilter = "all" | number;

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
  lastPayment: string | null;
  baseStatus: string;
  cycleNeedsReview: boolean;
};

type ClientPageResult = {
  items: Array<{
    id: string; nome: string; telefone: string | null; email: string | null; baseStatus: string;
    status: ClientStatus; plano: string; creditos: number; creditosUtilizados: number;
    creditosPrevistos: number; ciclo: string; diaVencimento: number | null;
    ultimoPagamento: string | null; cicloRevisao: boolean;
  }>;
  total: number;
  filteredTotal: number;
  stats: { ativos: number; vencidos: number; creditos_utilizados: number; creditos_previstos: number };
  dayCounts: Record<string, number>;
};

const PAGE_SIZE = 25;

export default function ClientsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>("view");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("Todos");
  const [planId, setPlanId] = useState("");
  const [overdueFilter, setOverdueFilter] = useState("Todos");
  const [creditFilter, setCreditFilter] = useState<CreditFilter>("Todos");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [clients, setClients] = useState<UiClient[]>([]);
  const [total, setTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [stats, setStats] = useState<ClientPageResult["stats"]>({ ativos: 0, vencidos: 0, creditos_utilizados: 0, creditos_previstos: 0 });
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "ativo" || status === "Ativos") setStatusFilter("Ativos");
    else if (status === "cancelado" || status === "Cancelados") setStatusFilter("Cancelados");
    else if (status === "atrasado" || status === "Vencidos") setFilter("Vencidos");
    else if (status === "revisar-ciclo" || status === "Revisar ciclos") setFilter("Revisar ciclos");
    setQuery(params.get("busca") ?? "");
    setPlanId(params.get("plano") ?? "");
    const parsedDay = Number(params.get("dia"));
    setDayFilter(Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : "all");
    setOverdueFilter(["Sim", "Não"].includes(params.get("atraso") ?? "") ? params.get("atraso")! : "Todos");
    const credits = params.get("creditos");
    setCreditFilter(credits === "Com créditos previstos" || credits === "Sem créditos previstos" ? credits : "Todos");
    const parsedPage = Number(params.get("page"));
    setPage(Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams();
    const status = filter === "Vencidos" ? "atrasado" : filter === "Revisar ciclos" ? "revisar-ciclo" : statusFilter === "Ativos" ? "ativo" : statusFilter === "Cancelados" ? "cancelado" : "";
    if (status) params.set("status", status);
    if (query.trim()) params.set("busca", query.trim());
    if (planId) params.set("plano", planId);
    if (dayFilter !== "all") params.set("dia", String(dayFilter));
    if (overdueFilter !== "Todos") params.set("atraso", overdueFilter);
    if (creditFilter !== "Todos") params.set("creditos", creditFilter);
    if (page > 1) params.set("page", String(page));
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filtersReady, filter, statusFilter, query, planId, dayFilter, overdueFilter, creditFilter, page]);

  useEffect(() => {
    if (!empresaId) return;
    let active = true;
    const loadPlans = async () => {
      const { data, error: plansError } = await createClient().from("planos").select("id,nome").eq("empresa_id", empresaId).order("nome");
      if (!active) return;
      if (plansError) setPlanError("Não foi possível carregar a lista de planos.");
      else { setPlans((data ?? []) as PlanOption[]); setPlanError(null); }
    };
    void loadPlans();
    return () => { active = false; };
  }, [empresaId]);

  const loadClients = useCallback(async (targetPage = 1) => {
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

      const today = todayInSaoPaulo();
      const { data, error: clientsError } = await supabase.rpc("buscar_clientes_paginados_com_filtros", {
        p_empresa_id: membership.empresa_id,
        p_hoje: today,
        p_busca: query.trim(),
        p_filtro: filter,
        p_status: statusFilter,
        p_plano_id: planId || null,
        p_com_atraso: overdueFilter === "Todos" ? null : overdueFilter === "Sim",
        p_creditos_previstos: creditFilter,
        p_dia: dayFilter === "all" ? null : dayFilter,
        p_offset: (targetPage - 1) * PAGE_SIZE,
        p_limite: PAGE_SIZE,
      });
      if (clientsError) throw clientsError;
      const result = data as unknown as ClientPageResult;
      setClients((result.items ?? []).map((item) => ({
        id: item.id,
        name: item.nome,
        phone: item.telefone ?? undefined,
        email: item.email ?? undefined,
        plan: item.plano,
        credits: Number(item.creditos ?? 0),
        creditsUsed: Number(item.creditosUtilizados ?? 0),
        creditsExpected: Number(item.creditosPrevistos ?? 0),
        cycle: item.ciclo,
        dueDay: item.diaVencimento,
        status: item.status,
        lastPayment: item.ultimoPagamento ? new Intl.DateTimeFormat("pt-BR").format(new Date(item.ultimoPagamento)) : "—",
        baseStatus: item.baseStatus,
        cycleNeedsReview: item.cicloRevisao,
      })));
      setTotal(Number(result.total ?? 0));
      setFilteredTotal(Number(result.filteredTotal ?? 0));
      setStats(result.stats ?? { ativos: 0, vencidos: 0, creditos_utilizados: 0, creditos_previstos: 0 });
      setDayCounts(result.dayCounts ?? {});
      setPage(targetPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, [query, filter, statusFilter, dayFilter, planId, overdueFilter, creditFilter]);

  useEffect(() => {
    if (!filtersReady) return;
    const timeout = window.setTimeout(() => { void loadClients(page); }, query ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadClients, page, query, filtersReady]);

  useEffect(() => {
    if (window.location.hash === "#revisao-ciclos") setFilter("Revisar ciclos");
  }, []);

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  function openClient(clientId: string, mode: ActionMode) {
    setSelectedClientId(clientId);
    setActionMode(mode);
    setActionOpen(true);
  }

  const visibleClients = clients;

  const groups = useMemo(() => {
    const grouped = new Map<number, UiClient[]>();
    visibleClients.forEach((client) => {
      const day = client.dueDay ?? 0;
      grouped.set(day, [...(grouped.get(day) ?? []), client]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [visibleClients]);

  const hasExtraFilters = Boolean(planId || overdueFilter !== "Todos" || creditFilter !== "Todos");
  const hasActiveFilters = Boolean(query.trim() || filter !== "Todos" || statusFilter !== "Todos" || hasExtraFilters || dayFilter !== "all");
  const clearFilters = () => {
    setPage(1); setQuery(""); setFilter("Todos"); setStatusFilter("Todos"); setPlanId(""); setDayFilter("all"); setOverdueFilter("Todos"); setCreditFilter("Todos");
  };

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        subtitle="Clientes, ciclos e créditos"
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><button className="button secondary" onClick={() => setImportOpen(true)} disabled={!empresaId}><Upload size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Sincronizar planilha</button><button className="button primary" onClick={() => setDrawerOpen(true)} disabled={!empresaId}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo cliente</button></div>}
      />

      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(stats.ativos)} helper="Base atual" icon={UserRoundCheck} />
        <StatCard title="Com pagamento vencido" value={String(stats.vencidos)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Créditos utilizados" value={String(stats.creditos_utilizados)} helper="Já consumidos no mês" icon={WalletCards} tone="green" />
        <StatCard title="Créditos previstos" value={String(stats.creditos_previstos)} helper="Ainda devem ser consumidos" icon={WalletCards} tone="slate" />
      </section>

      <section className={styles.dayPanel}>
        <div className={styles.dayPanelHead}>
          <div><h2>Vencimentos por dia</h2></div>
          <div className={styles.clientFilters}>
            <label className={styles.filterField}><span>Status</span><select value={statusFilter} onChange={(event) => { setPage(1); setFilter("Todos"); setStatusFilter(event.target.value as ClientStatusFilter); }}><option>Todos</option><option>Ativos</option><option>Cancelados</option></select></label>
            <button className={`filter-chip ${filter === "Vencidos" ? "active" : ""}`} onClick={() => { setPage(1); setFilter(filter === "Vencidos" ? "Todos" : "Vencidos"); }}>Com pagamento vencido</button>
            <button className={`filter-chip ${filter === "Revisar ciclos" ? "active" : ""}`} onClick={() => { setPage(1); setFilter(filter === "Revisar ciclos" ? "Todos" : "Revisar ciclos"); }}>Revisar ciclo</button>
            <details className={styles.moreFilters}><summary>Mais filtros{hasExtraFilters ? <span className={styles.activeDot} aria-label="filtros ativos" /> : null}</summary><div className={styles.extraFilters}>
              <label className={styles.filterField}><span>Plano</span><select value={planId} onChange={(event) => { setPage(1); setPlanId(event.target.value); }}><option value="">Todos os planos</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome}</option>)}</select></label>
              <label className={styles.filterField}><span>Pagamento vencido</span><select value={overdueFilter} onChange={(event) => { setPage(1); setOverdueFilter(event.target.value); }}><option>Todos</option><option>Sim</option><option>Não</option></select></label>
              <label className={styles.filterField}><span>Créditos previstos</span><select value={creditFilter} onChange={(event) => { setPage(1); setCreditFilter(event.target.value as CreditFilter); }}><option>Todos</option><option>Com créditos previstos</option><option>Sem créditos previstos</option></select></label>
            </div></details>
            <button className="button secondary small" onClick={clearFilters} disabled={statusFilter === "Todos" && filter === "Todos" && !query && !hasExtraFilters && dayFilter === "all"}>Limpar filtros</button>
            {planError ? <span className={styles.filterError} role="status">{planError}</span> : null}
          </div>
        </div>
        <div className={styles.dayNav} aria-label="Filtrar por dia de vencimento">
          <button className={`${styles.dayButton} ${styles.allButton} ${dayFilter === "all" ? styles.dayButtonActive : ""}`} onClick={() => { setPage(1); setDayFilter("all"); }}><b>Todos</b><small>{filteredTotal}</small></button>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
            const count = Number(dayCounts[String(day)] ?? 0);
            return <button key={day} disabled={!count} className={`${styles.dayButton} ${dayFilter === day ? styles.dayButtonActive : ""} ${!count ? styles.dayButtonEmpty : ""}`} onClick={() => { setPage(1); setDayFilter(day); }}><b>{day}</b><small>{count ? `${count} cli.` : "—"}</small></button>;
          })}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar">
          <label className="toolbar-search"><Search size={16} /><input aria-label="Buscar por nome, telefone ou e-mail" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar cliente..." /></label>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>{total} cliente(s) · página {page} de {totalPages}</span>
        </div>
      </section>

      {error ? <div className="card"><div className="empty-note">{error} <button className="text-link" onClick={() => void loadClients()}>Tentar novamente</button></div></div> : null}
      {loading ? <div className="card"><div className={styles.loadingRows} aria-label="Carregando clientes" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div></div> : null}

      {!loading && !error ? (
        <div className={styles.listPanel}>
          {groups.length ? groups.map(([day, group]) => {
            const groupUsed = group.reduce((sum, client) => sum + client.creditsUsed, 0);
            const groupExpected = group.reduce((sum, client) => sum + client.creditsExpected, 0);
            return (
              <section key={day} className={styles.dayGroup}>
                <div className={styles.dayGroupHead}>
                  <div className={styles.dayNumber}>{day || "—"}</div>
                  <div className={styles.dayTitle}><b>{day ? `Vencimento dia ${day}` : "Sem vencimento definido"}</b><small>{day ? Number(dayCounts[String(day)] ?? group.length) : group.length} cliente(s) neste dia</small></div>
                  <div className={styles.dayCreditSummary}><span className={styles.summaryPill}>Usados <strong>{groupUsed}</strong></span><span className={styles.summaryPill}>Previstos <strong>{groupExpected}</strong></span></div>
                </div>
                <div className={styles.clientHeader}><span>Cliente</span><span>Plano</span><span>Créditos no mês</span><span>Ciclo</span><span>Status</span><span style={{ textAlign: "right" }}>Ações</span></div>
                {group.map((client) => (
                  <div className={styles.clientRow} key={client.id}>
                    <div className={styles.clientMain}><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className={styles.clientText}><b>{client.name}</b><small>{client.plan} · Pagamento: {client.lastPayment}</small></div></div>
                    <span>{client.plan}</span>
                    <div className={styles.credits}><span className={styles.creditUsed}>{client.creditsUsed} usado(s)</span><span className={styles.creditExpected}>{client.creditsExpected} previsto(s)</span></div>
                    <span title={client.cycleNeedsReview ? "Ciclo concluído e pago. Confirme se o cliente quer renovar mensal ou trimestral." : undefined} style={client.cycleNeedsReview ? { color: "var(--orange)", fontWeight: 700 } : undefined}>{client.cycleNeedsReview ? "Renovar · " : ""}{client.cycle}</span>
                    <StatusBadge status={client.status} />
                    <div className={styles.actions}><button className="square-action" aria-label={`Visualizar ${client.name}`} title="Visualizar ficha" onClick={() => openClient(client.id, "view")}><Eye size={14} /></button><button className="square-action" aria-label={`Editar ${client.name}`} title="Editar cliente" onClick={() => openClient(client.id, "edit")}><Pencil size={14} /></button></div>
                  </div>
                ))}
              </section>
            );
          }) : <div className={styles.dayGroup}><div className={styles.empty}>{hasActiveFilters ? "Nenhum cliente encontrado para estes filtros." : "Nenhum cliente cadastrado ainda."}</div></div>}
          {total > 0 ? <div className={styles.pagination}>
            <button className="button secondary small" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="button secondary small" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima</button>
          </div> : null}
        </div>
      ) : null}

      <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} empresaId={empresaId} onSaved={loadClients} />
      <ClientImportDrawer open={importOpen} onClose={() => setImportOpen(false)} empresaId={empresaId} onImported={loadClients} />
      <ClientActionsDrawer open={actionOpen} mode={actionMode} clientId={selectedClientId} empresaId={empresaId} onClose={() => { setActionOpen(false); setSelectedClientId(null); }} onSaved={loadClients} />
    </AppShell>
  );
}
