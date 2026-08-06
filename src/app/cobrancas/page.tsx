"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Tab = "Todas" | "A vencer" | "Atrasado" | "Pago";

type ChargeRow = {
  id: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  origem: string;
  clientes: { nome: string } | { nome: string }[] | null;
  assinaturas: { planos: { nome: string } | { nome: string }[] | null } | { planos: { nome: string } | { nome: string }[] | null }[] | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
  pagamentos: { metodo: string | null; status: string }[] | null;
};

type QueueRow = {
  tarefa_id: string;
  tipo: string;
  prioridade: string;
  cliente_nome: string;
  vencimento: string | null;
  status_pagamento: string | null;
};

type UiCharge = {
  id: string;
  client: string;
  description: string;
  dueDate: string;
  dueRaw: string;
  paidAt: string | null;
  status: Exclude<Tab, "Todas">;
  paymentMethod: string;
  value: number;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function description(row: ChargeRow) {
  const subscription = first(row.assinaturas);
  const plan = first(subscription?.planos);
  return plan?.nome ? `Plano ${plan.nome}` : "Cobrança recorrente";
}

function paymentMethod(row: ChargeRow) {
  const payment = row.pagamentos?.find((item) => item.status === "approved" || item.status === "pago") ?? row.pagamentos?.[0];
  if (!payment?.metodo) return row.status_pagamento === "pago" ? "Manual" : "Aguardando pagamento";
  const method = payment.metodo.toLowerCase();
  if (method.includes("pix")) return "PIX";
  if (method.includes("credit") || method.includes("cart")) return "Cartão de crédito";
  if (method.includes("boleto")) return "Boleto bancário";
  return payment.metodo;
}

export default function ChargesPage() {
  const [tab, setTab] = useState<Tab>("Todas");
  const [query, setQuery] = useState("");
  const [charges, setCharges] = useState<UiCharge[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

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

      const [chargesResult, queueResult] = await Promise.all([
        supabase
          .from("cobrancas")
          .select("id,vencimento,status_pagamento,pago_em,origem,clientes(nome),assinaturas(planos(nome)),cobrancas_financeiras(valor_original,valor_pago),pagamentos(metodo,status)")
          .eq("empresa_id", membership.empresa_id)
          .neq("status_pagamento", "cancelado")
          .order("vencimento", { ascending: false })
          .limit(500),
        supabase
          .from("fila_operacional")
          .select("tarefa_id,tipo,prioridade,cliente_nome,vencimento,status_pagamento")
          .eq("empresa_id", membership.empresa_id)
          .eq("status_tarefa", "pendente")
          .order("criado_em", { ascending: true })
          .limit(8),
      ]);

      if (chargesResult.error) throw chargesResult.error;
      if (queueResult.error) throw queueResult.error;

      const today = todayInSaoPaulo();
      const mapped = ((chargesResult.data ?? []) as ChargeRow[]).map((row) => ({
        id: row.id,
        client: first(row.clientes)?.nome ?? "Cliente",
        description: description(row),
        dueDate: formatDateBR(row.vencimento),
        dueRaw: row.vencimento,
        paidAt: row.pago_em,
        status: operationalChargeStatus(row.status_pagamento, row.vencimento, today),
        paymentMethod: paymentMethod(row),
        value: Number(first(row.cobrancas_financeiras)?.valor_pago ?? first(row.cobrancas_financeiras)?.valor_original ?? 0),
      }));

      setCharges(mapped);
      setQueue((queueResult.data ?? []) as QueueRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as cobranças.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visible = useMemo(
    () => charges.filter((charge) => {
      const matchesTab = tab === "Todas" || charge.status === tab;
      const matchesQuery = `${charge.client} ${charge.description}`.toLowerCase().includes(query.toLowerCase());
      return matchesTab && matchesQuery;
    }),
    [charges, tab, query]
  );

  const today = todayInSaoPaulo();
  const sevenDaysFromNow = new Date(`${today}T12:00:00Z`);
  sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);
  const sevenDaysLimit = sevenDaysFromNow.toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const dueToday = charges.filter((charge) => charge.status === "A vencer" && charge.dueRaw === today).length;
  const nextSevenDays = charges.filter((charge) => charge.status === "A vencer" && charge.dueRaw >= today && charge.dueRaw <= sevenDaysLimit).length;
  const overdue = charges.filter((charge) => charge.status === "Atrasado").length;
  const paidThisMonth = charges.filter((charge) => charge.status === "Pago" && charge.paidAt?.slice(0, 7) === currentMonth).length;

  return (
    <AppShell>
      <PageHeader title="Cobranças" subtitle="Acompanhe vencimentos, pagamentos e ações" />
      <section className="stats-grid">
        <StatCard title="Vencem hoje" value={String(dueToday)} helper="Prioridade diária" icon={Clock3} />
        <StatCard title="Próximos 7 dias" value={String(nextSevenDays)} helper="Cobranças previstas" icon={CalendarDays} tone="green" />
        <StatCard title="Em atraso" value={String(overdue)} helper="Requer acompanhamento" icon={AlertTriangle} tone="orange" />
        <StatCard title="Pagas no mês" value={String(paidThisMonth)} helper="Pagamentos confirmados" icon={CheckCircle2} tone="green" />
      </section>
      <section className="grid-dashboard">
        <div className="card">
          <div className="toolbar">
            <label className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cobrança..." /></label>
            <div className="toolbar-filters">{(["Todas", "A vencer", "Atrasado", "Pago"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`filter-chip ${tab === item ? "active" : ""}`}>{item}</button>)}</div>
          </div>
          {error ? <div className="empty-note">{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div> : null}
          {loading ? <div className="empty-note">Carregando cobranças...</div> : visible.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Descrição</th><th>Vencimento</th><th>Status</th><th>Forma de pagamento</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{visible.map((charge) => <tr key={charge.id}><td>{charge.client}</td><td>{charge.description}</td><td>{charge.dueDate}</td><td><StatusBadge status={charge.status} /></td><td>{charge.paymentMethod}</td><td>{currency.format(charge.value)}</td><td><button className="button ghost small">Detalhes</button></td></tr>)}</tbody></table></div> : !error ? <div className="empty-note">Nenhuma cobrança encontrada.</div> : null}
        </div>
        <aside className="card" style={{ alignSelf: "start" }}>
          <div className="card-header"><h2>Fila operacional</h2></div>
          {queue.length ? <div className="queue">{queue.map((item, index) => <div className="queue-item" key={item.tarefa_id}><div className={`queue-dot ${item.prioridade === "alta" ? "danger" : item.tipo === "novo_cliente" ? "warning" : "info"}`}>{index + 1}</div><div className="queue-copy"><b>{item.tipo === "novo_cliente" ? "Ativar novo cliente" : item.tipo === "renovar" ? "Renovar cliente" : "Acompanhar cliente"}</b><small>{item.cliente_nome}{item.vencimento ? ` · ${formatDateBR(item.vencimento)}` : ""}</small></div><Link className="button ghost small" href="/operador">Abrir</Link></div>)}</div> : !loading ? <div className="empty-note">Nenhuma tarefa pendente.</div> : null}
        </aside>
      </section>
    </AppShell>
  );
}
