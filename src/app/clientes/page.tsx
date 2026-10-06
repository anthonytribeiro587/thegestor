"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Search, Upload, UserRoundCheck, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClientActionsDrawer } from "@/components/client-actions-drawer";
import { ClientDrawer } from "@/components/client-drawer";
import { ClientImportDrawer } from "@/components/client-import-drawer";
import { FilterPopover } from "@/components/filter-popover";
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
type ClientSort = "cliente" | "plano" | "vencimento" | "creditos" | "ciclo" | "status";

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
  const [stats, setStats] = useState<ClientPageResult["stats"]>({ ativos: 0, vencidos: 0, creditos_utilizados: 0, creditos_previstos: 0 });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ClientSort>("vencimento");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
    const sortParam = params.get("sort");
    if (["cliente", "plano", "vencimento", "creditos", "ciclo", "status"].includes(sortParam ?? "")) setSort(sortParam as ClientSort);
    setDirection(params.get("dir") === "desc" ? "desc" : "asc");
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
    if (sort !== "vencimento") params.set("sort", sort);
    if (direction !== "asc") params.set("dir", direction);
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filtersReady, filter, statusFilter, query, planId, dayFilter, overdueFilter, creditFilter, page, sort, direction]);

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
      const { data, error: clientsError } = await supabase.rpc("buscar_clientes_paginados_ordenados", {
        p_empresa_id: membership.empresa_id,
        p_hoje: today,
        p_busca: query.trim(),
        p_filtro: filter,
        p_status: statusFilter,
        p_plano_id: planId || null,
        p_com_atraso: overdueFilter === "Todos" ? null : overdueFilter === "Sim",
        p_creditos_previstos: creditFilter,
        p_dia: dayFilter === "all" ? null : dayFilter,
        p_ordenar_por: sort,
        p_ordem: direction,
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
      setStats(result.stats ?? { ativos: 0, vencidos: 0, creditos_utilizados: 0, creditos_previstos: 0 });
      setPage(targetPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os clientes.");
    } finally {
      setLoading(false);
    }
  }, [query, filter, statusFilter, dayFilter, planId, overdueFilter, creditFilter, sort, direction]);

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

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleClientDeleted() {
    const targetPage = clients.length === 1 && page > 1 ? page - 1 : page;
    await loadClients(targetPage);
    setToast("Cliente excluído com sucesso.");
  }

  function openClient(clientId: string, mode: ActionMode) {
    setSelectedClientId(clientId);
    setActionMode(mode);
    setActionOpen(true);
  }

  const visibleClients = clients;

  const hasExtraFilters = Boolean(planId || overdueFilter !== "Todos" || creditFilter !== "Todos");
  const hasActiveFilters = Boolean(query.trim() || filter !== "Todos" || statusFilter !== "Todos" || hasExtraFilters || dayFilter !== "all");
  const clearFilters = () => {
    setPage(1); setQuery(""); setFilter("Todos"); setStatusFilter("Todos"); setPlanId(""); setDayFilter("all"); setOverdueFilter("Todos"); setCreditFilter("Todos");
  };
  const sortBy = (column: ClientSort) => {
    setPage(1);
    if (sort === column) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(column); setDirection("asc"); }
  };
  const sortIcon = (column: ClientSort) => sort !== column ? <ArrowUpDown size={12} /> : direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        subtitle="Clientes, ciclos e créditos"
        action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><button className="button secondary" onClick={() => setImportOpen(true)} disabled={!empresaId}><Upload size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Sincronizar planilha</button><button className="button primary" onClick={() => setDrawerOpen(true)} disabled={!empresaId}><Plus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Novo cliente</button></div>}
      />
      {toast ? <div role="status" aria-live="polite" className={styles.toast}>{toast}</div> : null}

      <section className="stats-grid">
        <StatCard title="Clientes ativos" value={String(stats.ativos)} helper="Base atual" icon={UserRoundCheck} />
        <StatCard title="Com pagamento vencido" value={String(stats.vencidos)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Créditos utilizados" value={String(stats.creditos_utilizados)} helper="Já consumidos no mês" icon={WalletCards} tone="green" />
        <StatCard title="Créditos previstos" value={String(stats.creditos_previstos)} helper="Ainda devem ser consumidos" icon={WalletCards} tone="slate" />
      </section>

      <section className={styles.toolbar} aria-label="Filtros de clientes">
        <label className={styles.search}><Search size={15} /><input aria-label="Buscar por nome, telefone ou e-mail" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar cliente..." /></label>
        <details className={styles.filterSheet} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; } }}>
          <summary>Filtros ({Number(statusFilter !== "Todos" || filter !== "Todos") + Number(Boolean(planId)) + Number(dayFilter !== "all") + Number(creditFilter !== "Todos")})</summary>
          <button className={styles.filterBackdrop} aria-label="Fechar filtros" type="button" onClick={(event) => { const sheet = event.currentTarget.closest("details"); if (sheet) sheet.open = false; }} />
          <div className={styles.filterSheetBody}>
        <label className={styles.inlineFilter}><span className={styles.srOnly}>Status</span><select value={filter === "Vencidos" ? "Vencidos" : filter === "Revisar ciclos" ? "Revisar ciclos" : statusFilter} onChange={(event) => { setPage(1); if (event.target.value === "Vencidos" || event.target.value === "Revisar ciclos") { setStatusFilter("Todos"); setFilter(event.target.value); } else { setFilter("Todos"); setStatusFilter(event.target.value as ClientStatusFilter); } }}><option value="Todos">Status: Todos</option><option value="Ativos">Ativos</option><option value="Cancelados">Cancelados</option><option value="Vencidos">Vencidos</option><option value="Revisar ciclos">Revisar ciclo</option></select></label>
        <label className={styles.inlineFilter}><span className={styles.srOnly}>Plano</span><select value={planId} onChange={(event) => { setPage(1); setPlanId(event.target.value); }}><option value="">Plano: Todos</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome}</option>)}</select></label>
        <FilterPopover label={dayFilter === "all" ? "Vencimento: Todos" : `Vencimento: dia ${dayFilter}`} active={dayFilter !== "all"}>
          <div className={styles.dayOptions}><button className={dayFilter === "all" ? styles.daySelected : ""} onClick={() => { setPage(1); setDayFilter("all"); }}>Todos</button>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <button key={day} className={dayFilter === day ? styles.daySelected : ""} onClick={() => { setPage(1); setDayFilter(day); }}>{day}</button>)}</div>
        </FilterPopover>
        <label className={styles.inlineFilter}><span className={styles.srOnly}>Créditos</span><select value={creditFilter} onChange={(event) => { setPage(1); setCreditFilter(event.target.value as CreditFilter); }}><option>Todos</option><option>Com créditos previstos</option><option>Sem créditos previstos</option></select></label>
        <button className="button secondary small" onClick={clearFilters} disabled={statusFilter === "Todos" && filter === "Todos" && !query && !hasExtraFilters && dayFilter === "all"}>Limpar</button>
        <button className={`button primary ${styles.mobileApply}`} type="button" onClick={(event) => { const sheet = event.currentTarget.closest("details"); if (sheet) sheet.open = false; }}>Aplicar filtros</button>
        <span className={styles.resultMeta}>{total} cliente(s) · página {page} de {totalPages}</span>
        {planError ? <span className={styles.filterError} role="status">{planError}</span> : null}
          </div>
        </details>
        <details className={styles.sortSheet} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; } }}>
          <summary>Ordenar</summary>
          <button className={styles.filterBackdrop} aria-label="Fechar ordenação" type="button" onClick={(event) => { const sheet = event.currentTarget.closest("details"); if (sheet) sheet.open = false; }} />
          <div className={styles.sortSheetBody}>
            <label className={styles.inlineFilter}><span>Ordenar por</span><select aria-label="Ordenar clientes por" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value as ClientSort); }}><option value="cliente">Nome</option><option value="plano">Plano</option><option value="vencimento">Vencimento</option><option value="creditos">Créditos</option><option value="ciclo">Ciclo</option><option value="status">Status</option></select></label>
            <label className={styles.inlineFilter}><span>Direção</span><select aria-label="Direção da ordenação" value={direction} onChange={(event) => { setPage(1); setDirection(event.target.value as "asc" | "desc"); }}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
            <button className="button primary" type="button" onClick={(event) => { const sheet = event.currentTarget.closest("details"); if (sheet) sheet.open = false; }}>Aplicar ordenação</button>
          </div>
        </details>
      </section>

      {error ? <div className="card"><div className="empty-note">{error} <button className="text-link" onClick={() => void loadClients()}>Tentar novamente</button></div></div> : null}
      {loading ? <div className="card"><div className={styles.loadingRows} aria-label="Carregando clientes" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div></div> : null}

      {!loading && !error ? (
        <div className={styles.listPanel}>
          {visibleClients.length ? <section className={styles.dayGroup}>
            <div className={styles.tableScroll} role="table" aria-label="Tabela de clientes" aria-rowcount={visibleClients.length + 1} tabIndex={0}>
            <div className={styles.tableHint} aria-hidden="true">Deslize para ver mais <span>›</span></div>
            <div className={styles.clientHeader} role="row"><span role="columnheader"><button onClick={() => sortBy("cliente")}>Cliente {sortIcon("cliente")}</button></span><span role="columnheader"><button onClick={() => sortBy("plano")}>Plano {sortIcon("plano")}</button></span><span role="columnheader"><button onClick={() => sortBy("vencimento")}><span className={styles.desktopHeading}>Vencimento</span><span className={styles.mobileHeading}>Venc.</span> {sortIcon("vencimento")}</button></span><span role="columnheader"><button onClick={() => sortBy("creditos")}>Créditos {sortIcon("creditos")}</button></span><span role="columnheader"><button onClick={() => sortBy("ciclo")}>Ciclo {sortIcon("ciclo")}</button></span><span role="columnheader"><button onClick={() => sortBy("status")}>Status {sortIcon("status")}</button></span><span role="columnheader">Ações</span></div>
            {visibleClients.map((client) => <div className={styles.clientRow} role="row" key={client.id}>
              <div className={styles.clientMain} role="cell" data-label="Cliente"><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className={styles.clientText}><b>{client.name}</b><small className={styles.clientContact}>{client.phone ?? client.email ?? ""}</small><small className={styles.mobilePlan}>{client.plan}</small></div></div>
              <span role="cell" data-label="Plano">{client.plan}</span>
              <span role="cell" data-label="Vencimento">{client.dueDay ? `Dia ${client.dueDay}` : "—"}</span>
              <div className={styles.credits} role="cell" data-label="Créditos"><span className={styles.creditCycle}>{client.credits} por ciclo</span><span className={styles.creditUsed}>{client.creditsUsed} usados</span><span className={styles.creditExpected}>{client.creditsExpected} previstos</span><small className={styles.mobileCycle}>{client.cycle}</small></div>
              <span role="cell" data-label="Ciclo" title={client.cycleNeedsReview ? "Ciclo concluído e pago. Confirme se o cliente quer renovar mensal ou trimestral." : undefined}>{client.cycleNeedsReview ? <><span className={styles.renewalPending}>Renovação pendente</span> </> : null}{client.cycle}</span>
              <span role="cell" data-label="Status"><StatusBadge status={client.status} /></span>
              <div className={styles.actions} role="cell" data-label="Ações"><button className="square-action" aria-label={`Visualizar ${client.name}`} title="Visualizar ficha" onClick={() => openClient(client.id, "view")}><Eye size={14} /></button><button className="square-action" aria-label={`Editar ${client.name}`} title="Editar cliente" onClick={() => openClient(client.id, "edit")}><Pencil size={14} /></button></div>
            </div>)}
            </div>
          </section> : <div className={styles.dayGroup}><div className={styles.empty}>{hasActiveFilters ? "Nenhum cliente encontrado para estes filtros." : "Nenhum cliente cadastrado ainda."}</div></div>}
          {total > 0 ? <div className={styles.pagination}>
            <button className="button secondary small" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="button secondary small" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima</button>
          </div> : null}
        </div>
      ) : null}

      <ClientDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} empresaId={empresaId} onSaved={loadClients} />
      <ClientImportDrawer open={importOpen} onClose={() => setImportOpen(false)} empresaId={empresaId} onImported={loadClients} />
      <ClientActionsDrawer open={actionOpen} mode={actionMode} clientId={selectedClientId} empresaId={empresaId} onClose={() => { setActionOpen(false); setSelectedClientId(null); }} onSaved={loadClients} onDeleted={() => void handleClientDeleted()} />
    </AppShell>
  );
}
