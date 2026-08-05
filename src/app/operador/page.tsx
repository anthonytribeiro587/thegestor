import { AlertTriangle, CheckCircle2, Clock3, UserRoundPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { clients, operatorQueue } from "@/lib/mock-data";

export default function OperatorPage() {
  return (
    <AppShell role="Operador">
      <PageHeader title="Painel do Operador" subtitle="Pagamentos e renovações sem acesso aos valores" />
      <section className="stats-grid">
        <StatCard title="Clientes para renovar hoje" value="28" helper="Fila operacional" icon={Clock3} />
        <StatCard title="Pagamentos confirmados" value="63" helper="Prontos para renovação" icon={CheckCircle2} tone="green" />
        <StatCard title="Vencidos" value="19" helper="Exigem acompanhamento" icon={AlertTriangle} tone="red" />
        <StatCard title="Novos clientes pagos" value="14" helper="Aguardando ativação" icon={UserRoundPlus} tone="orange" />
      </section>
      <section className="grid-dashboard">
        <div className="card"><div className="card-header"><h2>Cobranças e renovações</h2><span className="text-link">Sem valores financeiros</span></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Vencimento</th><th>Status do pagamento</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{clients.map((client, index) => <tr key={client.id}><td><div className="client-cell"><span className="mini-avatar">{client.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{client.name}</div></td><td>{client.phone}</td><td>Dia {client.dueDay}</td><td><StatusBadge status={client.status === "Ativo" ? "Pago" : "Vencido"} /></td><td>{["Site", "WhatsApp", "Indicação"][index % 3]}</td><td><button className="button ghost small">{client.status === "Ativo" ? "Marcar renovado" : "Abrir detalhes"}</button></td></tr>)}</tbody></table></div></div>
        <aside className="card" style={{ alignSelf: "start" }}><div className="card-header"><h2>Últimas atividades</h2></div><div className="queue">{operatorQueue.map((item, index) => <div className="queue-item" key={`${item.client}-${index}`}><div className={`queue-dot ${item.tone}`}>{index + 1}</div><div className="queue-copy"><b>{item.label}</b><small>{item.client} · há {5 + index * 8} min</small></div></div>)}</div></aside>
      </section>
    </AppShell>
  );
}
