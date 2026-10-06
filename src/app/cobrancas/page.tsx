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

type Tab = "Precisa de ação" | "Atrasado" | "A vencer" | "Parcial" | "Pago" | "Todas";

type UiCharge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  dueRaw: string;
  paidAt: string | null;
  status: Exclude<Tab, "Todas" | "Precisa de ação">;
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
      const { data, error: chargesError } = await supabase.rpc("buscar_cobrancas_paginadas", {
        p_empresa_id: membership.empresa_id,
        p_hoje: today,
        p_mes: firstDay,
        p_busca: query.trim(),
        p_filtro: tab,
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
  }, [page, query, tab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Tudo o que precisa cobrar, conferir ou renovar em um só lugar" />

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
              <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar cliente..." />
            </label>
            <div className={styles.filters}>
              {(["Precisa de ação", "Atrasado", "A vencer", "Parcial", "Pago", "Todas"] as Tab[]).map((item) => (
                <button key={item} onClick={() => { setPage(1); setTab(item); }} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>
              ))}
            </div>
          </div>

          {notice ? <div className="form-success" role="status" style={{ margin: 14 }}>{notice}</div> : null}
          {error ? <div className={styles.empty}>{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div> : null}
          {loading ? <div className={styles.empty}>Carregando cobranças...</div> : null}

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
            <div className={styles.empty}>{query || tab !== "Precisa de ação" ? "Nenhuma cobrança encontrada para este filtro." : "Nenhuma pendência agora. Está tudo em dia."}</div>
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
