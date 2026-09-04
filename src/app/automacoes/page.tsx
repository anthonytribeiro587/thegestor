"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Bot, MessageCircle, Pencil, Plus, Power, Trash2, X, Zap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import styles from "./automacoes.module.css";

type Trigger = "antes_vencimento" | "vencimento" | "atraso";

type Automation = {
  id: string;
  nome: string;
  canal: "whatsapp";
  gatilho: Trigger;
  dias_deslocamento: number;
  mensagem: string;
  incluir_pagamento: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

type RecentMessage = {
  id: string;
  tipo: string;
  status: string;
  telefone: string | null;
  mensagem: string | null;
  erro: string | null;
  enviada_em: string | null;
  criado_em: string;
  clientes: { nome: string } | { nome: string }[] | null;
  automacoes_mensagem: { nome: string } | { nome: string }[] | null;
};

type Payload = {
  ok: boolean;
  automations: Automation[];
  settings: { enabled: boolean; dailyLimit: number };
  whatsapp: {
    configured: boolean;
    connection: { instance: string; state: string } | null;
    error: string | null;
  };
  recentMessages: RecentMessage[];
  error?: string;
};

type FormState = {
  nome: string;
  gatilho: Trigger;
  dias_deslocamento: number;
  mensagem: string;
  incluir_pagamento: boolean;
  ativo: boolean;
};

const DEFAULT_FORM: FormState = {
  nome: "",
  gatilho: "antes_vencimento",
  dias_deslocamento: 3,
  mensagem: "Olá, {nome}. Passando para lembrar que sua mensalidade vence em {vencimento}.{pagamento}",
  incluir_pagamento: true,
  ativo: false,
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function triggerLabel(item: Pick<Automation, "gatilho" | "dias_deslocamento">) {
  if (item.gatilho === "vencimento") return "No dia do vencimento";
  if (item.gatilho === "antes_vencimento") return `${item.dias_deslocamento} dia(s) antes do vencimento`;
  return `${item.dias_deslocamento} dia(s) após o vencimento`;
}

function previewTemplate(template: string) {
  return template
    .replaceAll("{nome}", "Paula")
    .replaceAll("{cliente}", "Paula Andressa")
    .replaceAll("{vencimento}", "15/09/2026")
    .replaceAll("{valor}", "R$ 30,00")
    .replaceAll("{link_pagamento}", "https://pagamento.exemplo")
    .replaceAll("{pagamento}", "\n\nPagamento: https://pagamento.exemplo");
}

function messageStatus(status: string) {
  if (status === "enviada") return "Pago";
  if (status === "erro") return "Atrasado";
  if (status === "ignorada") return "Pendente";
  return "A vencer";
}

export default function AutomationsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automacoes", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível carregar as automações.");
      setData(payload);
      setDailyLimit(payload.settings.dailyLimit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as automações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = data?.automations.filter((item) => item.ativo).length ?? 0;
  const sentCount = data?.recentMessages.filter((item) => item.status === "enviada").length ?? 0;
  const whatsappOpen = data?.whatsapp.connection?.state === "open";

  const orderedAutomations = useMemo(() => [...(data?.automations ?? [])].sort((a, b) => {
    const order: Record<Trigger, number> = { antes_vencimento: 0, vencimento: 1, atraso: 2 };
    return order[a.gatilho] - order[b.gatilho] || a.dias_deslocamento - b.dias_deslocamento || a.nome.localeCompare(b.nome, "pt-BR");
  }), [data]);

  function openNew() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setError(null);
    setDrawerOpen(true);
  }

  function openEdit(item: Automation) {
    setEditing(item);
    setForm({
      nome: item.nome,
      gatilho: item.gatilho,
      dias_deslocamento: item.dias_deslocamento,
      mensagem: item.mensagem,
      incluir_pagamento: item.incluir_pagamento,
      ativo: item.ativo,
    });
    setError(null);
    setDrawerOpen(true);
  }

  async function saveAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automacoes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editing ? { id: editing.id } : {}), ...form }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível salvar a automação.");
      setDrawerOpen(false);
      setNotice(editing ? "Automação atualizada." : "Automação criada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a automação.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutomation(item: Automation) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          nome: item.nome,
          gatilho: item.gatilho,
          dias_deslocamento: item.dias_deslocamento,
          mensagem: item.mensagem,
          incluir_pagamento: item.incluir_pagamento,
          ativo: !item.ativo,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível alterar a automação.");
      setNotice(item.ativo ? "Automação pausada." : "Automação ativada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a automação.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAutomation(item: Automation) {
    if (busy || !window.confirm(`Excluir a automação "${item.nome}"? O histórico de mensagens será preservado.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automacoes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível excluir a automação.");
      setNotice("Automação excluída.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir a automação.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/automacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", enabled, dailyLimit }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível salvar as configurações.");
      setNotice(enabled ? "Envios automáticos liberados." : "Envios automáticos pausados.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as configurações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Automações"
        subtitle="Crie regras de mensagens automáticas para cobranças"
        action={<button className="button primary" onClick={openNew}><Plus size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />Nova automação</button>}
      />

      <section className="stats-grid">
        <StatCard title="Automações ativas" value={String(activeCount)} helper={`${data?.automations.length ?? 0} cadastrada(s)`} icon={Zap} tone="blue" />
        <StatCard title="WhatsApp" value={whatsappOpen ? "Online" : "Offline"} helper={whatsappOpen ? "Evolution conectada" : "Conecte em Integrações"} icon={MessageCircle} tone={whatsappOpen ? "green" : "orange"} />
        <StatCard title="Envio geral" value={data?.settings.enabled ? "Ligado" : "Pausado"} helper={`Limite ${dailyLimit}/dia`} icon={Power} tone={data?.settings.enabled ? "green" : "slate"} />
        <StatCard title="Últimos envios" value={String(sentCount)} helper="nas 20 mensagens recentes" icon={Bot} tone="slate" />
      </section>

      {error ? <div className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
      {notice ? <div className="form-success" style={{ marginBottom: 14 }}>{notice}</div> : null}

      <section className={`card ${styles.masterCard}`}>
        <div>
          <h2>Controle geral dos envios</h2>
          <p>As regras podem ficar ativas individualmente. Este controle funciona como a chave geral para permitir ou pausar todos os disparos automáticos.</p>
          {!whatsappOpen ? <small className={styles.warning}>O WhatsApp precisa estar conectado em Integrações para liberar os envios.</small> : null}
        </div>
        <div className={styles.masterActions}>
          <label>Limite diário<input type="number" min={1} max={100} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} /></label>
          <button className={`button ${data?.settings.enabled ? "secondary" : "primary"}`} disabled={busy || loading} onClick={() => void saveSettings(!data?.settings.enabled)}>
            {data?.settings.enabled ? "Pausar todos os envios" : "Ativar envios automáticos"}
          </button>
          <button className="button secondary" disabled={busy || loading} onClick={() => void saveSettings(Boolean(data?.settings.enabled))}>Salvar limite</button>
        </div>
      </section>

      <div className={styles.sectionHead}>
        <div><h2>Regras de mensagem</h2><p>Você pode ter várias regras para o mesmo momento, como 7 dias antes e 1 dia antes.</p></div>
      </div>

      {loading ? <div className="card"><div className="empty-note">Carregando automações...</div></div> : null}

      {!loading ? (
        <section className={styles.automationGrid}>
          {orderedAutomations.map((item) => (
            <article className={styles.automationCard} key={item.id}>
              <div className={styles.cardTop}>
                <span className={styles.icon}><MessageCircle size={18} /></span>
                <div><b>{item.nome}</b><small>{triggerLabel(item)}</small></div>
                <StatusBadge status={item.ativo ? "Conectado" : "Pendente"} />
              </div>
              <div className={styles.messagePreview}>{previewTemplate(item.mensagem)}</div>
              <div className={styles.tags}>
                <span>WhatsApp</span>
                <span>{item.incluir_pagamento ? "Com link de pagamento" : "Sem link de pagamento"}</span>
              </div>
              <div className={styles.cardActions}>
                <button className="button secondary small" disabled={busy} onClick={() => void toggleAutomation(item)}>{item.ativo ? "Pausar" : "Ativar"}</button>
                <button className="square-action" title="Editar" onClick={() => openEdit(item)}><Pencil size={14} /></button>
                <button className="square-action" title="Excluir" disabled={busy} onClick={() => void removeAutomation(item)}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
          {!orderedAutomations.length ? <div className={`card ${styles.emptyCard}`}>Nenhuma automação criada. Use <b>Nova automação</b> para começar.</div> : null}
        </section>
      ) : null}

      <div className={styles.sectionHead}>
        <div><h2>Histórico recente</h2><p>Últimas tentativas de mensagens automáticas.</p></div>
      </div>

      <section className="card">
        {data?.recentMessages.length ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Cliente</th><th>Automação</th><th>Telefone</th><th>Status</th><th>Data</th><th>Erro</th></tr></thead>
              <tbody>{data.recentMessages.map((item) => (
                <tr key={item.id}>
                  <td>{first(item.clientes)?.nome ?? "Cliente"}</td>
                  <td>{first(item.automacoes_mensagem)?.nome ?? item.tipo.replaceAll("_", " ")}</td>
                  <td>{item.telefone ?? "—"}</td>
                  <td><StatusBadge status={messageStatus(item.status)} /></td>
                  <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.enviada_em ?? item.criado_em))}</td>
                  <td>{item.erro ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-note">Nenhuma mensagem automática enviada ainda.</div>}
      </section>

      <div className={`drawer-wrap ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-backdrop" onClick={() => !busy && setDrawerOpen(false)} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={editing ? "Editar automação" : "Nova automação"}>
          <div className="drawer-header">
            <div><h2>{editing ? "Editar automação" : "Nova automação"}</h2><p>Defina quando e o que o TheGestor deve enviar.</p></div>
            <button className="icon-button" disabled={busy} onClick={() => setDrawerOpen(false)}><X size={20} /></button>
          </div>

          <form className="form-stack" onSubmit={saveAutomation}>
            <label>Nome<input required minLength={2} maxLength={80} value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} placeholder="Ex.: Lembrete 7 dias antes" /></label>
            <label>Quando enviar
              <select value={form.gatilho} onChange={(event) => {
                const gatilho = event.target.value as Trigger;
                setForm((current) => ({ ...current, gatilho, dias_deslocamento: gatilho === "vencimento" ? 0 : current.dias_deslocamento || 1 }));
              }}>
                <option value="antes_vencimento">Antes do vencimento</option>
                <option value="vencimento">No dia do vencimento</option>
                <option value="atraso">Após o vencimento</option>
              </select>
            </label>
            {form.gatilho !== "vencimento" ? <label>Quantidade de dias<input type="number" min={0} max={30} required value={form.dias_deslocamento} onChange={(event) => setForm((current) => ({ ...current, dias_deslocamento: Number(event.target.value) }))} /></label> : null}
            <label>Mensagem<textarea rows={7} maxLength={1500} required value={form.mensagem} onChange={(event) => setForm((current) => ({ ...current, mensagem: event.target.value }))} /></label>
            <div className={styles.variables}>Variáveis: <code>{"{nome}"}</code> <code>{"{cliente}"}</code> <code>{"{vencimento}"}</code> <code>{"{valor}"}</code> <code>{"{pagamento}"}</code></div>
            <div className={styles.drawerPreview}><b>Prévia</b><span>{previewTemplate(form.mensagem)}</span></div>
            <label className={styles.checkbox}><input type="checkbox" checked={form.incluir_pagamento} onChange={(event) => setForm((current) => ({ ...current, incluir_pagamento: event.target.checked }))} />Gerar/incluir link de pagamento quando disponível</label>
            <label className={styles.checkbox}><input type="checkbox" checked={form.ativo} onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))} />Deixar esta automação ativa</label>
            <div className="form-hint">A chave geral de envios precisa estar ligada e o WhatsApp conectado para as mensagens saírem.</div>
            <div className={styles.drawerFooter}>
              <button type="button" className="button secondary" disabled={busy} onClick={() => setDrawerOpen(false)}>Cancelar</button>
              <button type="submit" className="button primary" disabled={busy}>{busy ? "Salvando..." : editing ? "Salvar alterações" : "Criar automação"}</button>
            </div>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
