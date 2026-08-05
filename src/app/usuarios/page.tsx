import { Plus, ShieldCheck, UserCog, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

const users = [
  { name: "Administrador", email: "admin@empresa.com", role: "Administrador", access: "Acesso total", status: "Ativo" },
  { name: "Operador 01", email: "operador@empresa.com", role: "Operador", access: "Sem valores financeiros", status: "Ativo" }
];

export default function UsersPage() {
  return (
    <AppShell>
      <PageHeader title="Usuários" subtitle="Controle quem acessa o painel e o que cada perfil pode visualizar" action={<button className="button primary"><Plus size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Convidar usuário</button>} />
      <section className="stats-grid">
        <StatCard title="Usuários ativos" value="2" helper="Dentro do plano atual" icon={UserRoundCheck} />
        <StatCard title="Administradores" value="1" helper="Acesso financeiro" icon={ShieldCheck} tone="slate" />
        <StatCard title="Operadores" value="1" helper="Sem acesso a valores" icon={UserCog} tone="green" />
        <StatCard title="Convites pendentes" value="0" helper="Nenhum convite" icon={Plus} tone="orange" />
      </section>
      <section className="card"><div className="table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Permissão</th><th>Status</th><th>Ações</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.access}</td><td><span className="status-badge status-ativo">{user.status}</span></td><td><button className="button ghost small">Editar acesso</button></td></tr>)}</tbody></table></div></section>
    </AppShell>
  );
}
