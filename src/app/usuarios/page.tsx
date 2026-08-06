"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, UserCog, UserRoundCheck, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "operador";

type Member = {
  vinculo_id: string;
  user_id: string;
  nome_exibicao: string;
  email: string;
  papel: Role;
  ativo: boolean;
  criado_em: string;
  ultimo_login_em: string | null;
  e_usuario_atual: boolean;
};

type Invite = {
  id: string;
  email: string;
  nome_exibicao: string | null;
  papel: Role;
  status: string;
  criado_em: string;
  expira_em: string;
};

type DrawerMode = "invite" | "edit" | null;

function roleLabel(role: Role) {
  return role === "admin" ? "Administrador" : "Operador";
}

function accessLabel(role: Role) {
  return role === "admin" ? "Acesso total e financeiro" : "Operação sem valores financeiros";
}

function formatDateTime(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UsersPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selected, setSelected] = useState<Member | null>(null);

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
        .select("empresa_id,papel")
        .eq("user_id", userId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership?.empresa_id || membership.papel !== "admin") {
        throw new Error("Somente administradores podem gerenciar usuários.");
      }

      setEmpresaId(membership.empresa_id);

      const [membersResult, invitesResult] = await Promise.all([
        supabase.rpc("listar_usuarios_empresa", { p_empresa_id: membership.empresa_id }),
        supabase
          .from("convites_empresa")
          .select("id,email,nome_exibicao,papel,status,criado_em,expira_em")
          .eq("empresa_id", membership.empresa_id)
          .eq("status", "pendente")
          .gt("expira_em", new Date().toISOString())
          .order("criado_em", { ascending: false }),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (invitesResult.error) throw invitesResult.error;

      setMembers((membersResult.data ?? []) as Member[]);
      setInvites((invitesResult.data ?? []) as Invite[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeMembers = useMemo(() => members.filter((member) => member.ativo), [members]);
  const admins = useMemo(() => activeMembers.filter((member) => member.papel === "admin"), [activeMembers]);
  const operators = useMemo(() => activeMembers.filter((member) => member.papel === "operador"), [activeMembers]);

  function openInvite() {
    setSelected(null);
    setError(null);
    setSuccess(null);
    setDrawerMode("invite");
  }

  function openEdit(member: Member) {
    setSelected(member);
    setError(null);
    setSuccess(null);
    setDrawerMode("edit");
  }

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    const role = String(form.get("role") ?? "operador") as Role;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: inviteError } = await supabase.rpc("convidar_usuario_empresa", {
      p_empresa_id: empresaId,
      p_email: email,
      p_papel: role,
      p_nome_exibicao: name || null,
    });

    if (inviteError) {
      setError(inviteError.message.includes("ja pertence") ? "Este usuário já pertence à empresa." : inviteError.message);
      setSaving(false);
      return;
    }

    setSuccess(`Convite criado para ${email}. A pessoa deve criar ou entrar na conta com esse mesmo e-mail.`);
    setSaving(false);
    setDrawerMode(null);
    await loadData();
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId || !selected) return;

    const form = new FormData(event.currentTarget);
    const role = String(form.get("role") ?? selected.papel) as Role;
    const active = form.get("active") === "on";

    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("atualizar_acesso_usuario", {
      p_empresa_id: empresaId,
      p_vinculo_id: selected.vinculo_id,
      p_papel: role,
      p_ativo: active,
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Acesso atualizado com sucesso.");
    setSaving(false);
    setDrawerMode(null);
    setSelected(null);
    await loadData();
  }

  return (
    <AppShell>
      <PageHeader
        title="Usuários"
        subtitle="Controle quem acessa o painel e o que cada perfil pode visualizar"
        action={<button className="button primary" onClick={openInvite} disabled={!empresaId}><Plus size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Convidar usuário</button>}
      />

      {error ? <div className="card" style={{ marginBottom: 16 }}><div className="empty-note">{error} <button className="text-link" onClick={() => void loadData()}>Tentar novamente</button></div></div> : null}
      {success ? <div className="card" style={{ marginBottom: 16 }}><div className="empty-note" style={{ color: "#067451" }}>{success}</div></div> : null}

      <section className="stats-grid">
        <StatCard title="Usuários ativos" value={String(activeMembers.length)} helper="Com acesso ao sistema" icon={UserRoundCheck} />
        <StatCard title="Administradores" value={String(admins.length)} helper="Acesso financeiro" icon={ShieldCheck} tone="slate" />
        <StatCard title="Operadores" value={String(operators.length)} helper="Sem acesso a valores" icon={UserCog} tone="green" />
        <StatCard title="Convites pendentes" value={String(invites.length)} helper={invites.length ? "Aguardando cadastro/login" : "Nenhum convite"} icon={Plus} tone="orange" />
      </section>

      <section className="card">
        <div className="card-header"><h2>Membros da empresa</h2><span className="text-link">Dados reais do Supabase Auth</span></div>
        {loading ? <div className="empty-note">Carregando usuários...</div> : null}
        {!loading && members.length === 0 ? <div className="empty-note">Nenhum usuário encontrado.</div> : null}
        {!loading && members.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Permissão</th><th>Último acesso</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.vinculo_id}>
                    <td>{member.nome_exibicao}{member.e_usuario_atual ? " (você)" : ""}</td>
                    <td>{member.email}</td>
                    <td>{roleLabel(member.papel)}</td>
                    <td>{accessLabel(member.papel)}</td>
                    <td>{formatDateTime(member.ultimo_login_em)}</td>
                    <td><span className={`status-badge ${member.ativo ? "status-ativo" : "status-desconectado"}`}>{member.ativo ? "Ativo" : "Inativo"}</span></td>
                    <td>
                      <button
                        className="button ghost small"
                        disabled={member.e_usuario_atual}
                        title={member.e_usuario_atual ? "Seu próprio acesso não pode ser alterado por esta tela" : "Editar acesso"}
                        onClick={() => openEdit(member)}
                      >
                        {member.e_usuario_atual ? "Seu acesso" : "Editar acesso"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {invites.length > 0 ? (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Convites pendentes</h2><span className="text-link">Expiram em 14 dias</span></div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Criado em</th><th>Expira em</th></tr></thead>
              <tbody>{invites.map((invite) => <tr key={invite.id}><td>{invite.nome_exibicao || "—"}</td><td>{invite.email}</td><td>{roleLabel(invite.papel)}</td><td>{formatDateTime(invite.criado_em)}</td><td>{formatDateTime(invite.expira_em)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className={`drawer-wrap ${drawerMode ? "open" : ""}`} aria-hidden={!drawerMode}>
        <div className="drawer-backdrop" onClick={() => !saving && setDrawerMode(null)} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={drawerMode === "invite" ? "Convidar usuário" : "Editar acesso"}>
          <div className="drawer-header">
            <div>
              <h2>{drawerMode === "invite" ? "Convidar usuário" : "Editar acesso"}</h2>
              <p>{drawerMode === "invite" ? "Defina quem poderá entrar nesta empresa" : selected?.email}</p>
            </div>
            <button className="icon-button" type="button" onClick={() => setDrawerMode(null)} disabled={saving} aria-label="Fechar"><X size={20} /></button>
          </div>

          {drawerMode === "invite" ? (
            <form className="form-stack" onSubmit={submitInvite}>
              <label>Nome<input name="name" placeholder="Ex.: João da Silva" /></label>
              <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="usuario@email.com" /></label>
              <label>Perfil
                <select name="role" defaultValue="operador">
                  <option value="operador">Operador — sem valores financeiros</option>
                  <option value="admin">Administrador — acesso total</option>
                </select>
              </label>
              <div className="empty-note" style={{ textAlign: "left", padding: 0 }}>
                O convite fica pendente. Quando essa pessoa criar ou entrar no thegestor usando este mesmo e-mail, o acesso será vinculado automaticamente à sua empresa.
              </div>
              <div className="drawer-actions">
                <button className="button primary" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar convite"}</button>
                <button className="button secondary" type="button" disabled={saving} onClick={() => setDrawerMode(null)}>Cancelar</button>
              </div>
            </form>
          ) : selected ? (
            <form className="form-stack" onSubmit={submitEdit}>
              <label>Perfil
                <select name="role" defaultValue={selected.papel}>
                  <option value="operador">Operador — sem valores financeiros</option>
                  <option value="admin">Administrador — acesso total</option>
                </select>
              </label>
              <label style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
                <input name="active" type="checkbox" defaultChecked={selected.ativo} style={{ width: 18, height: 18 }} />
                Usuário ativo
              </label>
              <div className="empty-note" style={{ textAlign: "left", padding: 0 }}>
                Operadores acessam apenas o fluxo operacional e não recebem dados financeiros pela API. Administradores têm acesso ao painel financeiro e às configurações.
              </div>
              <div className="drawer-actions">
                <button className="button primary" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar acesso"}</button>
                <button className="button secondary" type="button" disabled={saving} onClick={() => setDrawerMode(null)}>Cancelar</button>
              </div>
            </form>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
