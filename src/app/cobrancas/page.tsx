"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChargeActionsDrawer } from "@/components/charge-actions-drawer";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, monthBounds, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import styles from "./cobrancas.module.css";

type Tab = "Precisa de ação" | "Atrasado" | "A vencer" | "Parcial" | "Pago" | "Para renovar" | "Todos";
type PlanOption = { id: string; nome: string };

type UiCharge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  dueRaw: string;
  paidAt: string | null;
  status: Exclude<Tab, "Todos" | "Precisa de ação" | "Para renovar">;
  paymentMethod: string;
  value: number;
  paidValue: number;
  balance: number;
  taskId: string | null;
  taskType: string | null;
  needsAction: boolean;
};

type ChargePageResult = {
  items: Array<{
    id: string; cliente: string; descricao: string; vencimento: string; statusPagamento: string;
    pagoEm: string | null; metodoPagamento: string | null; valor: number; valorPago: number;
    saldo: number; tarefaId: string | null; tipoTarefa: string | null; status: UiCharge["status"];
    precisaAcao: boolean;
  }>;
  total: number;
  stats: { vence_hoje: number; em_atraso: number; renovacoes_pendentes: number; quitadas_no_mes: number };
};

const PAGE_SIZE = 25;

function paymentMethod(methodValue: string | null, paymentStatus: string) {
  if (!methodValue) return paymentStatus === "pago" ? "Manual" : "Aguardando pagamento";
  const method = methodValue.toLowerCase();
  if (method === "importacao_planilha") return "Importado da planilha";
  if (method.includes("pix")) return "PIX";
  if (method.includes("credit") || method.includes("cart")) return "Cartão de crédito";
  if (method.includes("boleto")) return "Boleto bancário";
  if (method === "manual") return "Manual";
  return methodValue;
}

function taskActionLabel(type: string | null) {
  return type === "novo_cliente" ? "Ativar" : "Renovado";
}

export default function ChargesPage() {
  const [tab, setTab] = useState<Tab>("Precisa de ação");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [planId, setPlanId] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [financialStatus, setFinancialStatus] = useState("Todas");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [filtersReady, setFiltersReady] = useState(false);
  const [charges, setCharges] = useState<UiCharge[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ChargePageResult["stats"]>({ vence_hoje: 0, em_atraso: 0, renovacoes_pendentes: 0, quitadas_no_mes: 0 });
  const [page, setPage] = useState(1);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [quickPayingId, setQuickPayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusFromUrl: Record<string, Tab> = {
      "precisa-de-acao": "Precisa de ação", "Precisa de ação": "Precisa de ação",
      atrasado: "Atrasado", Atrasado: "Atrasado", "a-vencer": "A vencer", "A vencer": "A vencer",
      parcial: "Parcial", Parcial: "Parcial", pago: "Pago", Pago: "Pago",
      "para-renovar": "Para renovar", "Para renovar": "Para renovar", todos: "Todos", Todos: "Todos",
    };
    const urlStatus = params.get("status");
    if (urlStatus && statusFromUrl[urlStatus]) setTab(statusFromUrl[urlStatus]);
    setQuery(params.get("busca") ?? "");
    setPlanId(params.get("plano") ?? "");
    const parsedDay = Number(params.get("dia"));
    setDueDay(Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? String(parsedDay) : "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const dueFromParam = params.get("de") ?? "";
    const dueToParam = params.get("ate") ?? "";
    setDueFrom(datePattern.test(dueFromParam) ? dueFromParam : "");
    setDueTo(datePattern.test(dueToParam) ? dueToParam : "");
    const financial = params.get("financeiro");
    setFinancialStatus(["Com saldo", "Parcial", "Quitada", "Sem recebimento"].includes(financial ?? "") ? financial! : "Todas");
    const parsedPage = Number(params.get("page"));
    setPage(Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams();
    if (tab !== "Precisa de ação") {
      const statusToUrl: Partial<Record<Tab, string>> = { "Atrasado": "atrasado", "A vencer": "a-vencer", "Parcial": "parcial", "Pago": "pago", "Para renovar": "para-renovar", "Todos": "todos" };
      params.set("status", statusToUrl[tab] ?? "precisa-de-acao");
    }
    if (query.trim()) params.set("busca", query.trim());
    if (planId) params.set("plano", planId);
    if (dueDay) params.set("dia", dueDay);
    if (dueFrom) params.set("de", dueFrom);
    if (dueTo) params.set("ate", dueTo);
    if (financialStatus !== "Todas") params.set("financeiro", financialStatus);
    if (page > 1) params.set("page", String(page));
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filtersReady, tab, query, planId, dueDay, dueFrom, dueTo, financialStatus, page]);

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

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Sessão inválida. Entre novamente.");

      const { data: membership, error: membershipError } = await supabase
        .from("usuarios_empresa")
        .select("empresa_id")
        .eq("user_id", userId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.empresa_id) throw new Error("Usuário sem empresa vinculada.");
      setEmpresaId(membership.empresa_id);

      const today = todayInSaoPaulo();
      const { firstDay } = monthBounds(today);
      const { data, error: chargesError } = await supabase.rpc("buscar_cobrancas_paginadas_com_filtros", {
        p_empresa_id: membership.empresa_id,
        p_hoje: today,
        p_mes: firstDay,
        p_busca: debouncedQuery.trim(),
        p_status: tab,
        p_plano_id: planId || null,
        p_dia: dueDay ? Number(dueDay) : null,
        p_vencimento_de: dueFrom || null,
        p_vencimento_ate: dueTo || null,
        p_situacao_financeira: financialStatus,
        p_offset: (page - 1) * PAGE_SIZE,
        p_limite: PAGE_SIZE,
      });
      if (chargesError) throw chargesError;
      const result = data as unknown as ChargePageResult;
      setCharges((result.items ?? []).map((item) => ({
        id: item.id,
        client: item.cliente,
        description: item.descricao,
        dueDate: formatDateBR(item.vencimento),
        dueRaw: item.vencimento,
        paidAt: item.pagoEm,
        status: item.status,
        paymentMethod: paymentMethod(item.metodoPagamento, item.statusPagamento),
        value: Number(item.valor ?? 0),
        paidValue: Number(item.valorPago ?? 0),
        balance: Number(item.saldo ?? 0),
        taskId: item.tarefaId,
        taskType: item.tipoTarefa,
        needsAction: item.precisaAcao,
      })));
      setTotal(Number(result.total ?? 0));
      setStats(result.stats ?? { vence_hoje: 0, em_atraso: 0, renovacoes_pendentes: 0, quitadas_no_mes: 0 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível carregar as cobranças.";
      if (!silent) setError(message);
      else console.warn("Falha ao sincronizar cobranças em segundo plano:", message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, debouncedQuery, tab, planId, dueDay, dueFrom, dueTo, financialStatus]);

  useEffect(() => {
    if (!filtersReady) return;
    void loadData();
  }, [loadData, filtersReady]);

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  async function quickPay(charge: UiCharge) {
    if (quickPayingId || charge.balance <= 0) return;
    setQuickPayingId(charge.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/cobrancas/quick-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId: charge.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível marcar como pago.");

      const paidAt = new Date().toISOString();
      setCharges((current) => current.map((item) => item.id === charge.id ? {
        ...item,
        status: "Pago",
        paidAt,
        paymentMethod: "Manual",
        paidValue: item.value,
        balance: 0,
        needsAction: true,
      } : item));
      setNotice(`${charge.client}: pagamento registrado. Agora confirme a renovação quando ela for feita.`);

      // A confirmação financeira já terminou. O restante é apenas reconciliação de tela,
      // então não deve manter o usuário preso em "Salvando...".
      setQuickPayingId(null);
      void loadData({ silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível marcar como pago.");
      setQuickPayingId(null);
    }
  }

  async function completeTask(charge: UiCharge) {
    if (!charge.taskId || savingTaskId) return;
    setSavingTaskId(charge.taskId);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("concluir_tarefa_operacional", {
        p_tarefa_id: charge.taskId,
        p_observacao: charge.taskType === "novo_cliente"
          ? "Cliente ativado pelo administrador na tela de cobranças"
          : "Renovação concluída pelo administrador na tela de cobranças",
      });
      if (rpcError) throw rpcError;

      setCharges((current) => current.map((item) => item.id === charge.id ? {
        ...item,
        taskId: null,
        taskType: null,
        needsAction: false,
      } : item));
      setNotice(`${charge.client}: ${charge.taskType === "novo_cliente" ? "cliente ativado" : "renovação concluída"}.`);

      setSavingTaskId(null);
      void loadData({ silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a renovação.");
      setSavingTaskId(null);
    }
  }

  const visible = charges;
  const hasExtraFilters = Boolean(planId || dueDay || dueFrom || dueTo || financialStatus !== "Todas");
  const hasActiveFilters = Boolean(tab !== "Precisa de ação" || query.trim() || hasExtraFilters);
  const pageStatus: Tab[] = ["Precisa de ação", "Atrasado", "A vencer", "Parcial", "Pago", "Para renovar", "Todos"];
  const clearFilters = () => {
    setPage(1); setQuery(""); setTab("Todos"); setPlanId(""); setDueDay(""); setDueFrom(""); setDueTo(""); setFinancialStatus("Todas");
  };
  const updateQuery = (value: string) => { setPage(1); setQuery(value); };

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Cobranças, pagamentos e renovações" />

      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(stats.vence_hoje)} helper="Resolver hoje" icon={Clock3} />
        <StatCard title="Em atraso" value={String(stats.em_atraso)} helper="Precisam de cobrança" icon={AlertTriangle} tone="orange" />
        <StatCard title="Para renovar" value={String(stats.renovacoes_pendentes)} helper="Pagamento já confirmado" icon={CheckCircle2} tone="green" />
        <StatCard title="Quitadas no mês" value={String(stats.quitadas_no_mes)} helper="Com valor recebido" icon={CheckCircle2} tone="green" />
      </section>

      <div className={styles.workspace}>
        <section className={styles.chargePanel}>
          <div className={styles.panelHead}>
            <h2>Cobranças e pendências</h2>
            <span>{total} registro(s) · página {page} de {totalPages}</span>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.search}>
              <Search size={16} />
              <input aria-label="Buscar por cliente" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Buscar cliente..." />
            </label>
            <label className={styles.filterField}><span>Status</span><select value={tab} onChange={(event) => { setPage(1); setTab(event.target.value as Tab); }}>{pageStatus.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <button className={`${styles.clearButton} button secondary small`} onClick={clearFilters} disabled={tab === "Todos" && !query && !hasExtraFilters}>Limpar filtros</button>
          </div>

          <div className={styles.quickFilters} aria-label="Filtros rápidos">
            {["Precisa de ação", "Atrasado", "A vencer", "Pago"].map((item) => <button key={item} onClick={() => { setPage(1); setTab(item as Tab); }} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>)}
            <details className={styles.moreFilters}>
              <summary>Mais filtros{hasExtraFilters ? <span className={styles.activeDot} aria-label="filtros ativos" /> : null}</summary>
              <div className={styles.extraFilters}>
                <label className={styles.filterField}><span>Plano</span><select value={planId} onChange={(event) => { setPage(1); setPlanId(event.target.value); }}><option value="">Todos os planos</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.nome}</option>)}</select></label>
                <label className={styles.filterField}><span>Dia de vencimento</span><select value={dueDay} onChange={(event) => { setPage(1); setDueDay(event.target.value); }}><option value="">Todos os dias</option>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></label>
                <label className={styles.filterField}><span>Vence a partir de</span><input type="date" value={dueFrom} onChange={(event) => { setPage(1); setDueFrom(event.target.value); }} /></label>
                <label className={styles.filterField}><span>Vence até</span><input type="date" value={dueTo} onChange={(event) => { setPage(1); setDueTo(event.target.value); }} /></label>
                <label className={styles.filterField}><span>Situação financeira</span><select value={financialStatus} onChange={(event) => { setPage(1); setFinancialStatus(event.target.value); }}><option>Todas</option><option value="Com saldo">Com saldo</option><option value="Parcial">Parcial</option><option value="Quitada">Quitada</option><option value="Sem recebimento">Sem recebimento</option></select></label>
              </div>
            </details>
          </div>

          <div className={styles.resultMeta}><span>{total} cobrança(s)</span><span>Página {page} de {totalPages}</span></div>

          {notice ? <div className="form-success" role="status" style={{ margin: 14 }}>{notice}</div> : null}
          {planError ? <div className={styles.filterError} role="status">{planError}</div> : null}
          {error ? <div className={styles.empty}>{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div> : null}
          {loading ? <div className={styles.loadingList} aria-label="Carregando cobranças" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className={styles.loadingRow} key={index}><span /><span /><span /></div>)}</div> : null}

          {!loading && !error && visible.length ? (
            <>
              <div className={styles.chargeHeader}>
                <span>Cliente</span><span>Vencimento</span><span>Status</span><span>Financeiro</span><span style={{ textAlign: "right" }}>Ação</span>
              </div>
              {visible.map((charge) => (
                <div key={charge.id} className={`${styles.chargeRow} ${charge.status === "Atrasado" ? styles.chargeLate : ""} ${charge.status === "Parcial" ? styles.chargePartial : ""}`}>
                  <div className={styles.clientCell}><b>{charge.client}</b><small>{charge.description}</small></div>
                  <span>{charge.dueDate}</span>
                  <div className={styles.statusCell}>
                    {charge.status === "Parcial" ? <span className="status-badge status-pendente">Parcial</span> : <StatusBadge status={charge.status} />}
                    <small>{charge.taskId ? "Pagamento confirmado · falta renovar" : charge.paymentMethod}</small>
                  </div>
                  <div className={styles.financeCell}>
                    <div className={styles.financeItem}><span>Valor</span><strong>{currency.format(charge.value)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeReceived}`}><span>Recebido</span><strong>{currency.format(charge.paidValue)}</strong></div>
                    <div className={`${styles.financeItem} ${styles.financeBalance}`}><span>Saldo</span><strong>{currency.format(charge.balance)}</strong></div>
                  </div>
                  <div className={styles.actionCell}>
                    {charge.balance > 0 ? (
                      <button className="button primary small" disabled={quickPayingId === charge.id} onClick={() => void quickPay(charge)}>
                        {quickPayingId === charge.id ? "Salvando..." : "Pago"}
                      </button>
                    ) : null}
                    {charge.balance === 0 && charge.taskId ? (
                      <button className="button primary small" disabled={savingTaskId === charge.taskId} onClick={() => void completeTask(charge)}>
                        {savingTaskId === charge.taskId ? "Salvando..." : taskActionLabel(charge.taskType)}
                      </button>
                    ) : null}
                    <button className="button ghost small" onClick={() => setSelectedChargeId(charge.id)}>{charge.balance > 0 || charge.taskId ? "Ver" : "Detalhes"}</button>
                  </div>
                </div>
              ))}
            </>
          ) : !loading && !error ? (
            <div className={styles.empty}>{hasActiveFilters ? "Nenhuma cobrança encontrada para estes filtros." : "Nenhuma pendência agora. Está tudo em dia."}</div>
          ) : null}
          {!loading && !error && total > 0 ? <div className={styles.pagination}>
            <button className="button secondary small" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button className="button secondary small" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Próxima</button>
          </div> : null}
        </section>
      </div>

      <ChargeActionsDrawer
        open={Boolean(selectedChargeId)}
        chargeId={selectedChargeId}
        empresaId={empresaId}
        onClose={() => setSelectedChargeId(null)}
        onSaved={() => void loadData({ silent: true })}
      />
    </AppShell>
  );
}
