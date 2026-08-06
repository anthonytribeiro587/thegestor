"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, UserRoundPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateBR, operationalChargeStatus, todayInSaoPaulo } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";

type QueueRow = {
  tarefa_id: string;
  empresa_id: string;
  tipo: string;
  status_tarefa: string;
  prioridade: string;
  cliente_id: string;
  cliente_nome: string;
  telefone: string;
  cliente_status: string;
  cobranca_id: string | null;
  vencimento: string | null;
  status_pagamento: string | null;
  pago_em: string | null;
  criado_em: string;
};

type ActivityRow = {
  id: string;
  tipo: string;
  status: string;
  atualizado_em: string;
  clientes: { nome: string } | { nome: string }[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function paymentStatus(item: QueueRow, today: string) {
  if (!item.vencimento) return item.status_pagamento === "pago" ? "Pago" : "Pendente";
  const status = operationalChargeStatus(item.status_pagamento ?? "pendente", item.vencimento, today);
  return status === "A vencer" ? "Pendente" : status;
}

function actionLabel(tipo: string) {
  if (tipo === "novo_cliente") return "Ativar cliente";
  if (tipo === "renovar") return "Marcar renovado";
  return "Concluir tarefa";
}

function taskLabel(tipo: string) {
  if (tipo === "novo_cliente") return "Novo cliente pago";
  if (tipo === "renovar") return "Renovação pendente";
  return "Acompanhamento";
}

export default function OperatorPage() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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

      const [queueResult, activitiesResult] = await Promise.all([
        supabase
          .from("fila_operacional")
          .select("tarefa_id,empresa_id,tipo,status_tarefa,prioridade,cliente_id,cliente_nome,telefone,cliente_status,cobranca_id,vencimento,status_pagamento,pago_em,criado_em")
          .eq("empresa_id", membership.empresa_id)
          .eq("status_tarefa", "pendente")
          .order("criado_em", { ascending: true })
          .limit(200),
        supabase
          .from("tarefas_operacionais")
          .select("id,tipo,status,atualizado_em,clientes(nome)")
          .eq("empresa_id", membership.empresa_id)
          .order("atualizado_em", { ascending: false })
          .limit(8),
      ]);

      if (queueResult.error) throw queueResult.error;
      if (activitiesResult.error) throw activitiesResult.error;

      setQueue((queueResult.data ?? []) as QueueRow[]);
      setActivities((activitiesResult.data ?? []) as ActivityRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a fila operacional.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const completeTask = useCallback(async (taskId: string, tipo: string) => {
    setSavingId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("tarefas_operacionais")
        .update({
          status: "concluida",
          observacao_operador: tipo === "novo_cliente" ? "Cliente ativado pelo operador" : "Renovação concluída pelo operador",
        })
        .eq("id", taskId);

      if (updateError) throw updateError;
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a tarefa.");
    } finally {
      setSavingId(null);
    }
  }, [loadData]);

  const today = todayInSaoPaulo();
  const stats = useMemo(() => ({
    renewals: queue.filter((item) => item.tipo === "renovar").length,
    confirmed: queue.filter((item) => item.status_pagamento === "pago").length,
    overdue: queue.filter((item) => paymentStatus(item, today) === "Atrasado").length,
    newClients: queue.filter((item) => item.tipo === "novo_cliente").length,
  }), [queue, today]);

  return (
    <AppShell role="Operador">
      <PageHeader title="Painel do Operador" subtitle="Pagamentos e renovações sem acesso aos valores" />
      <section className="stats-grid">
        <StatCard title="Clientes para renovar" value={String(stats.renewals)} helper="Fila operacional" icon={Clock3} />
        <StatCard title="Pagamentos confirmados" value={String(stats.confirmed)} helper="Prontos para ação" icon={CheckCircle2} tone="green" />
        <StatCard title="Vencidos" value={String(stats.overdue)} helper="Exigem acompanhamento" icon={AlertTriangle} tone="red" />
        <StatCard title="Novos clientes pagos" value={String(stats.newClients)} helper="Aguardando ativação" icon={UserRoundPlus} tone="orange" />
      </section>
      {error ? <div className="card" style={{ marginBottom: 16 }}><div className="empty-note">{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div></div> : null}
      <section className="grid-dashboard">
        <div className="card">
          <div className="card-header"><h2>Cobranças e renovações</h2><span className="text-link">Sem valores financeiros</span></div>
          {loading ? <div className="empty-note">Carregando fila...</div> : queue.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Vencimento</th><th>Status do pagamento</th><th>Tarefa</th><th>Ação</th></tr></thead><tbody>{queue.map((item) => <tr key={item.tarefa_id}><td><div className="client-cell"><span className="mini-avatar">{item.cliente_nome.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{item.cliente_nome}</div></td><td>{item.telefone}</td><td>{item.vencimento ? formatDateBR(item.vencimento) : "—"}</td><td><StatusBadge status={paymentStatus(item, today)} /></td><td>{taskLabel(item.tipo)}</td><td><button className="button ghost small" disabled={savingId === item.tarefa_id} onClick={() => void completeTask(item.tarefa_id, item.tipo)}>{savingId === item.tarefa_id ? "Salvando..." : actionLabel(item.tipo)}</button></td></tr>)}</tbody></table></div> : <div className="empty-note">Nenhuma tarefa operacional pendente.</div>}
        </div>
        <aside className="card" style={{ alignSelf: "start" }}>
          <div className="card-header"><h2>Últimas atividades</h2></div>
          {activities.length ? <div className="queue">{activities.map((item, index) => <div className="queue-item" key={item.id}><div className={`queue-dot ${item.status === "concluida" ? "success" : item.tipo === "novo_cliente" ? "warning" : "info"}`}>{index + 1}</div><div className="queue-copy"><b>{item.status === "concluida" ? "Tarefa concluída" : taskLabel(item.tipo)}</b><small>{first(item.clientes)?.nome ?? "Cliente"}</small></div></div>)}</div> : !loading ? <div className="empty-note">Nenhuma atividade registrada.</div> : null}
        </aside>
      </section>
    </AppShell>
  );
}
