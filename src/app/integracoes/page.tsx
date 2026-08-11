"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, CreditCard, MessageCircle, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

type Tab = "Mercado Pago" | "WhatsApp" | "Webhooks";

type IntegrationEvent = {
  event_id: string;
  recurso_id: string | null;
  tipo: string | null;
  acao: string | null;
  status_processamento: string;
  erro: string | null;
  recebido_em: string;
  processado_em: string | null;
};

type MercadoPagoStatus = {
  ok: boolean;
  environment: "test" | "production";
  tokenConfigured: boolean;
  webhookConfigured: boolean;
  webhookSecretConfigured: boolean;
  adminKeyConfigured: boolean;
  serviceRoleConfigured: boolean;
  testPayerConfigured: boolean;
  webhookUrl: string;
  integration: null | {
    status: string;
    config_publica: Record<string, unknown>;
    ultimo_sync_em: string | null;
    ultimo_erro: string | null;
  };
  events?: IntegrationEvent[];
  error?: string;
};

type WhatsAppAutomation = {
  whatsapp_ativo: boolean;
  lembrete_antes_dias: number;
  lembrete_no_vencimento: boolean;
  lembrete_atraso_dias: number;
  whatsapp_limite_diario: number;
  whatsapp_mensagem_antes: string;
  whatsapp_mensagem_vencimento: string;
  whatsapp_mensagem_atraso: string;
};

type BillingMessage = {
  id: string;
  tipo: string;
  status: string;
  telefone: string | null;
  erro: string | null;
  enviada_em: string | null;
  criado_em: string;
  clientes: { nome: string } | { nome: string }[] | null;
};

type WhatsAppStatus = {
  ok: boolean;
  configured: boolean;
  urlConfigured: boolean;
  apiKeyConfigured: boolean;
  instanceConfigured: boolean;
  instance: string | null;
  connection: { instance: string; state: string } | null;
  connectionError: string | null;
  phoneCoverage: { total: number; withPhone: number; withoutPhone: number };
  mercadoPagoEnvironment: "test" | "production";
  automation: WhatsAppAutomation;
  recentMessages: BillingMessage[];
  error?: string;
};

const DEFAULT_AUTOMATION: WhatsAppAutomation = {
  whatsapp_ativo: false,
  lembrete_antes_dias: 3,
  lembrete_no_vencimento: true,
  lembrete_atraso_dias: 2,
  whatsapp_limite_diario: 30,
  whatsapp_mensagem_antes: "Olá, {nome}. Passando para lembrar que sua mensalidade vence em {vencimento}.{pagamento}",
  whatsapp_mensagem_vencimento: "Olá, {nome}. Sua mensalidade vence hoje ({vencimento}).{pagamento}",
  whatsapp_mensagem_atraso: "Olá, {nome}. Identificamos que sua mensalidade com vencimento em {vencimento} ainda está pendente.{pagamento} Se você já realizou o pagamento, desconsidere esta mensagem.",
};

function eventStatus(status: string) {
  if (status === "processado") return "Pago";
  if (status === "erro") return "Atrasado";
  if (status === "ignorado") return "Pendente";
  return "A vencer";
}

function messageStatus(status: string) {
  if (status === "enviada") return "Pago";
  if (status === "erro") return "Atrasado";
  if (status === "ignorada") return "Pendente";
  return "A vencer";
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function previewTemplate(template: string) {
  return template
    .replaceAll("{nome}", "Paula")
    .replaceAll("{cliente}", "Paula Andressa Pamela")
    .replaceAll("{vencimento}", "15/08/2026")
    .replaceAll("{valor}", "R$ 30,00")
    .replaceAll("{link_pagamento}", "https://pagamento.exemplo")
    .replaceAll("{pagamento}", "\n\nPagamento: https://pagamento.exemplo");
}

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("Mercado Pago");
  const [mp, setMp] = useState<MercadoPagoStatus | null>(null);
  const [wa, setWa] = useState<WhatsAppStatus | null>(null);
  const [automation, setAutomation] = useState<WhatsAppAutomation>(DEFAULT_AUTOMATION);
  const [loading, setLoading] = useState(true);
  const [waLoading, setWaLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [waAction, setWaAction] = useState(false);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Teste de conexão do thegestor. Se você recebeu esta mensagem, a integração está funcionando.");

  async function loadStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/integracoes/mercadopago", { cache: "no-store" });
      const payload = await response.json() as MercadoPagoStatus;
      setMp(payload);
    } catch {
      setMp(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadWhatsApp() {
    setWaLoading(true);
    try {
      const response = await fetch("/api/integracoes/whatsapp", { cache: "no-store" });
      const payload = await response.json() as WhatsAppStatus;
      setWa(payload);
      if (payload.automation) setAutomation(payload.automation);
    } catch {
      setWa(null);
    } finally {
      setWaLoading(false);
    }
  }

  useEffect(() => { void loadStatus(); void loadWhatsApp(); }, []);

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/integracoes/mercadopago", { method: "POST" });
      const payload = await response.json() as { ok?: boolean; error?: string; account?: { id: number; nickname?: string | null } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível validar a conexão.");
      setMessage(`Conexão validada${payload.account?.nickname ? `: ${payload.account.nickname}` : ""}.`);
      await loadStatus();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao testar Mercado Pago.");
    } finally {
      setTesting(false);
    }
  }

  async function connectWhatsApp() {
    setWaAction(true);
    setWaMessage(null);
    try {
      const response = await fetch("/api/integracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; qr?: string | null; pairingCode?: string | null };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível iniciar a conexão.");
      setQr(payload.qr ?? null);
      setWaMessage(payload.qr ? "QR Code gerado. Escaneie com o WhatsApp." : payload.pairingCode ? `Código de pareamento: ${payload.pairingCode}` : "Conexão iniciada. Atualize o status em alguns segundos.");
      await loadWhatsApp();
    } catch (cause) {
      setWaMessage(cause instanceof Error ? cause.message : "Falha ao conectar WhatsApp.");
    } finally {
      setWaAction(false);
    }
  }

  async function sendWhatsAppTest() {
    setWaAction(true);
    setWaMessage(null);
    try {
      const response = await fetch("/api/integracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", number: testNumber, message: testMessage }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; messageId?: string | null };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível enviar a mensagem.");
      setWaMessage(`Mensagem de teste enviada${payload.messageId ? ` (${payload.messageId})` : ""}.`);
      await loadWhatsApp();
    } catch (cause) {
      setWaMessage(cause instanceof Error ? cause.message : "Falha ao enviar teste.");
    } finally {
      setWaAction(false);
    }
  }

  async function saveAutomation() {
    setAutomationSaving(true);
    setAutomationMessage(null);
    try {
      const response = await fetch("/api/integracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveAutomation",
          enabled: automation.whatsapp_ativo,
          beforeDays: automation.lembrete_antes_dias,
          dueDay: automation.lembrete_no_vencimento,
          overdueDays: automation.lembrete_atraso_dias,
          dailyLimit: automation.whatsapp_limite_diario,
          beforeTemplate: automation.whatsapp_mensagem_antes,
          dueTemplate: automation.whatsapp_mensagem_vencimento,
          overdueTemplate: automation.whatsapp_mensagem_atraso,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; enabled?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível salvar a automação.");
      setAutomationMessage(payload.enabled ? "Automação salva e ativada." : "Regras salvas. Automação permanece desligada.");
      await loadWhatsApp();
    } catch (cause) {
      setAutomationMessage(cause instanceof Error ? cause.message : "Falha ao salvar automação.");
    } finally {
      setAutomationSaving(false);
    }
  }

  async function copyWebhook() {
    if (!mp?.webhookUrl) return;
    await navigator.clipboard.writeText(mp.webhookUrl);
    setMessage("URL do webhook copiada.");
  }

  const connected = mp?.integration?.status === "conectada" && mp.tokenConfigured;
  const ready = Boolean(mp?.tokenConfigured && mp?.webhookSecretConfigured && mp?.adminKeyConfigured);
  const events = mp?.events ?? [];
  const waConnected = wa?.connection?.state === "open";
  const automationReady = Boolean(waConnected && wa?.mercadoPagoEnvironment === "production" && (wa?.phoneCoverage.withPhone ?? 0) > 0);
  const recentMessages = wa?.recentMessages ?? [];

  return (
    <AppShell>
      <PageHeader title="Integrações" subtitle="Conecte os serviços usados pela operação" />
      <section className="card">
        <div className="integration-tabs">
          {(["Mercado Pago", "WhatsApp", "Webhooks"] as Tab[]).map((item) => (
            <button className={`integration-tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)} key={item}>{item}</button>
          ))}
        </div>

        {tab === "Mercado Pago" ? (
          <div className="integration-grid">
            <div className="integration-card">
              <div className="integration-head">
                <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                  <span className="integration-icon"><CreditCard size={20} /></span>
                  <div><h3>Mercado Pago <small style={{ color: "#6b7a91", fontWeight: 600 }}>MP v2</small></h3><p style={{ margin: 0 }}>Orders API + Pix + baixa automática por webhook.</p></div>
                </div>
                <StatusBadge status={connected && ready ? "Conectado" : "Pendente"} />
              </div>

              {loading ? <div className="empty-note">Verificando configuração...</div> : (
                <>
                  <div className="integration-field"><label>Ambiente</label><code>{mp?.environment === "production" ? "Produção" : "Teste"}</code></div>
                  <div className="integration-field"><label>Access Token</label><code>{mp?.tokenConfigured ? "Configurado no servidor ✓" : "Falta MERCADO_PAGO_ACCESS_TOKEN"}</code></div>
                  <div className="integration-field"><label>Assinatura secreta do webhook</label><code>{mp?.webhookSecretConfigured ? "Configurada ✓" : "Falta MERCADO_PAGO_WEBHOOK_SECRET"}</code></div>
                  <div className="integration-field"><label>Chave privada do Supabase</label><code>{mp?.adminKeyConfigured ? "Configurada ✓" : "Falta SUPABASE_SECRET_KEY (ou service_role legado)"}</code></div>
                  {mp?.environment === "test" ? <div className="integration-field"><label>Pagador de teste</label><code>Sandbox oficial APRO ✓</code></div> : null}
                  <div className="integration-field"><label>Webhook do thegestor</label><code>{mp?.webhookUrl ?? "—"}</code></div>
                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    <button className="button primary" disabled={!mp?.tokenConfigured || testing} onClick={() => void testConnection()}>{testing ? "Testando..." : "Testar conexão"}</button>
                    <button className="button secondary" disabled={!mp?.webhookUrl} onClick={() => void copyWebhook()}><Copy size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Copiar webhook</button>
                    <button className="button secondary" onClick={() => void loadStatus()}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Atualizar</button>
                  </div>
                  {message ? <div className={message.toLowerCase().includes("falha") || message.toLowerCase().includes("não") || message.toLowerCase().includes("pendente") ? "form-error" : "form-success"} style={{ marginTop: 12 }}>{message}</div> : null}
                </>
              )}
            </div>

            <div className="integration-card">
              <h3>Checklist para liberar o Pix</h3>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                <div style={{ display: "flex", gap: 9 }}><CheckCircle2 size={17} color={mp?.tokenConfigured ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Access Token privado do Mercado Pago no Vercel.</p></div>
                <div style={{ display: "flex", gap: 9 }}><ShieldCheck size={17} color={mp?.webhookSecretConfigured ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Assinatura secreta copiada da configuração de Webhooks do Mercado Pago.</p></div>
                <div style={{ display: "flex", gap: 9 }}><ShieldCheck size={17} color={mp?.adminKeyConfigured ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Supabase Secret key disponível somente no backend.</p></div>
                <div style={{ display: "flex", gap: 9 }}><Webhook size={17} color={ready ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Evento <b>Order (Mercado Pago)</b> apontando para a URL do webhook acima.</p></div>
              </div>
              <p style={{ marginTop: 16 }}><b>Status técnico:</b> {ready ? "backend pronto para teste" : "veja exatamente o item pendente ao lado"}.</p>
              <p>Um teste do Mercado Pago retorna <b>401</b> quando a assinatura recebida não pode ser validada. Depois de configurar a assinatura secreta correta e redeployar, o endpoint passa a aceitar somente notificações autenticadas pelo Mercado Pago.</p>
            </div>
          </div>
        ) : null}

        {tab === "WhatsApp" ? (
          <div className="integration-grid">
            <div className="integration-card">
              <div className="integration-head">
                <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                  <span className="integration-icon"><MessageCircle size={20} /></span>
                  <div><h3>WhatsApp / Evolution</h3><p style={{ margin: 0 }}>Conexão do número e testes antes de liberar automações.</p></div>
                </div>
                <StatusBadge status={waConnected ? "Conectado" : "Pendente"} />
              </div>

              {waLoading ? <div className="empty-note">Verificando Evolution API...</div> : (
                <>
                  <div className="integration-field"><label>URL da Evolution</label><code>{wa?.urlConfigured ? "Configurada ✓" : "Falta EVOLUTION_API_URL"}</code></div>
                  <div className="integration-field"><label>API Key</label><code>{wa?.apiKeyConfigured ? "Configurada no servidor ✓" : "Falta EVOLUTION_API_KEY"}</code></div>
                  <div className="integration-field"><label>Instância</label><code>{wa?.instanceConfigured ? wa.instance : "Falta EVOLUTION_INSTANCE"}</code></div>
                  <div className="integration-field"><label>Estado</label><code>{wa?.connection?.state ?? (wa?.configured ? "não foi possível consultar" : "aguardando configuração")}</code></div>
                  {wa?.connectionError ? <div className="form-error" style={{ marginTop: 10 }}>{wa.connectionError}</div> : null}
                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    <button className="button primary" disabled={!wa?.configured || waAction || waConnected} onClick={() => void connectWhatsApp()}>{waAction ? "Aguarde..." : waConnected ? "WhatsApp conectado" : "Gerar QR / conectar"}</button>
                    <button className="button secondary" disabled={waAction} onClick={() => void loadWhatsApp()}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Atualizar status</button>
                  </div>
                  {qr ? <div style={{ marginTop: 16, padding: 14, border: "1px solid #dbe3ef", borderRadius: 12, background: "#fff", width: "fit-content" }}><img src={qr} alt="QR Code para conectar WhatsApp" style={{ display: "block", width: 220, height: 220, objectFit: "contain" }} /></div> : null}
                  {waMessage ? <div className={waMessage.toLowerCase().includes("falha") || waMessage.toLowerCase().includes("não") || waMessage.toLowerCase().includes("invál") ? "form-error" : "form-success"} style={{ marginTop: 12 }}>{waMessage}</div> : null}
                </>
              )}
            </div>

            <div className="integration-card">
              <h3>Preparação da base</h3>
              <p>Clientes ativos: <b>{wa?.phoneCoverage.total ?? 0}</b></p>
              <p>Com telefone para WhatsApp: <b>{wa?.phoneCoverage.withPhone ?? 0}</b></p>
              <p>Sem telefone: <b>{wa?.phoneCoverage.withoutPhone ?? 0}</b></p>
              <p>Cliente sem telefone continua funcionando normalmente no financeiro; ele apenas fica fora das mensagens automáticas.</p>

              <div style={{ borderTop: "1px solid #e5eaf2", marginTop: 16, paddingTop: 16 }}>
                <h3>Enviar mensagem de teste</h3>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label className="full"><span>Número com DDD e país</span><input value={testNumber} onChange={(event) => setTestNumber(event.target.value)} placeholder="5551999999999" /></label>
                  <label className="full"><span>Mensagem</span><textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} rows={4} /></label>
                </div>
                <button className="button primary" style={{ marginTop: 12 }} disabled={!waConnected || waAction || !testNumber.trim() || !testMessage.trim()} onClick={() => void sendWhatsAppTest()}>{waAction ? "Enviando..." : "Enviar teste"}</button>
              </div>
            </div>

            <div className="integration-card" style={{ gridColumn: "1 / -1" }}>
              <div className="integration-head">
                <div>
                  <h3>Automação de cobranças</h3>
                  <p style={{ margin: 0 }}>Executa diariamente às 10:10 (Brasília), sem duplicar mensagens da mesma cobrança.</p>
                </div>
                <StatusBadge status={automation.whatsapp_ativo ? "Conectado" : "Pendente"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
                <div className="integration-field"><label>Evolution</label><code>{waConnected ? "open ✓" : "não conectada"}</code></div>
                <div className="integration-field"><label>Mercado Pago</label><code>{wa?.mercadoPagoEnvironment === "production" ? "Produção ✓" : "Teste — bloqueado"}</code></div>
                <div className="integration-field"><label>Telefones disponíveis</label><code>{wa?.phoneCoverage.withPhone ?? 0} de {wa?.phoneCoverage.total ?? 0}</code></div>
              </div>

              {!automationReady ? (
                <div className="empty-note" style={{ marginTop: 14, textAlign: "left" }}>
                  A ativação está protegida. Falta: {!waConnected ? "WhatsApp conectado; " : ""}{wa?.mercadoPagoEnvironment !== "production" ? "Mercado Pago em Produção; " : ""}{(wa?.phoneCoverage.withPhone ?? 0) <= 0 ? "telefones nos clientes." : ""}
                </div>
              ) : null}

              <div className="form-grid" style={{ marginTop: 18 }}>
                <label><span>Dias antes do vencimento</span><input type="number" min={0} max={30} value={automation.lembrete_antes_dias} onChange={(event) => setAutomation((current) => ({ ...current, lembrete_antes_dias: Number(event.target.value) }))} /></label>
                <label><span>Dias após o vencimento</span><input type="number" min={0} max={30} value={automation.lembrete_atraso_dias} onChange={(event) => setAutomation((current) => ({ ...current, lembrete_atraso_dias: Number(event.target.value) }))} /></label>
                <label><span>Limite máximo por dia</span><input type="number" min={1} max={100} value={automation.whatsapp_limite_diario} onChange={(event) => setAutomation((current) => ({ ...current, whatsapp_limite_diario: Number(event.target.value) }))} /></label>
                <label style={{ alignSelf: "end", paddingBottom: 12 }}><span><input type="checkbox" checked={automation.lembrete_no_vencimento} onChange={(event) => setAutomation((current) => ({ ...current, lembrete_no_vencimento: event.target.checked }))} style={{ width: "auto", marginRight: 8 }} />Enviar também no dia do vencimento</span></label>

                <label className="full"><span>Mensagem antes do vencimento</span><textarea rows={3} value={automation.whatsapp_mensagem_antes} onChange={(event) => setAutomation((current) => ({ ...current, whatsapp_mensagem_antes: event.target.value }))} /></label>
                <div className="full" style={{ padding: "10px 12px", borderRadius: 10, background: "#f7f9fc", whiteSpace: "pre-wrap", fontSize: 13 }}><b>Prévia:</b><br />{previewTemplate(automation.whatsapp_mensagem_antes)}</div>

                <label className="full"><span>Mensagem no vencimento</span><textarea rows={3} value={automation.whatsapp_mensagem_vencimento} onChange={(event) => setAutomation((current) => ({ ...current, whatsapp_mensagem_vencimento: event.target.value }))} /></label>
                <label className="full"><span>Mensagem em atraso</span><textarea rows={3} value={automation.whatsapp_mensagem_atraso} onChange={(event) => setAutomation((current) => ({ ...current, whatsapp_mensagem_atraso: event.target.value }))} /></label>
              </div>

              <p style={{ marginTop: 10, color: "#6b7a91", fontSize: 13 }}>Variáveis disponíveis: <code>{"{nome}"}</code>, <code>{"{cliente}"}</code>, <code>{"{vencimento}"}</code>, <code>{"{valor}"}</code>, <code>{"{link_pagamento}"}</code> e <code>{"{pagamento}"}</code>. O último inclui automaticamente uma linha com o link quando houver Pix.</p>

              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={automation.whatsapp_ativo}
                    disabled={!automationReady && !automation.whatsapp_ativo}
                    onChange={(event) => setAutomation((current) => ({ ...current, whatsapp_ativo: event.target.checked }))}
                  />
                  Ativar mensagens automáticas
                </label>
                <button className="button primary" disabled={automationSaving} onClick={() => void saveAutomation()}>{automationSaving ? "Salvando..." : "Salvar regras"}</button>
              </div>
              {automationMessage ? <div className={automationMessage.toLowerCase().includes("não") || automationMessage.toLowerCase().includes("falta") || automationMessage.toLowerCase().includes("primeiro") ? "form-error" : "form-success"} style={{ marginTop: 12 }}>{automationMessage}</div> : null}
            </div>

            <div className="integration-card" style={{ gridColumn: "1 / -1" }}>
              <h3>Últimas mensagens de cobrança</h3>
              {recentMessages.length ? (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="admin-table"><thead><tr><th>Cliente</th><th>Tipo</th><th>Status</th><th>Data</th><th>Erro</th></tr></thead><tbody>{recentMessages.map((item) => <tr key={item.id}><td>{first(item.clientes)?.nome ?? "Cliente"}</td><td>{item.tipo.replaceAll("_", " ")}</td><td><StatusBadge status={messageStatus(item.status)} /></td><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.enviada_em ?? item.criado_em))}</td><td>{item.erro ?? "—"}</td></tr>)}</tbody></table>
                </div>
              ) : <div className="empty-note">Nenhuma mensagem automática enviada ainda.</div>}
            </div>
          </div>
        ) : null}

        {tab === "Webhooks" ? (
          <div style={{ padding: 18 }}>
            <div className="integration-card">
              <div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><Webhook size={20} /></span><div><h3>Eventos Mercado Pago</h3><p style={{ margin: 0 }}>Histórico técnico sem expor credenciais ou payloads sensíveis.</p></div></div><StatusBadge status={mp?.webhookConfigured ? "Conectado" : "Pendente"} /></div>
              {events.length ? (
                <div className="table-wrap" style={{ marginTop: 16 }}><table className="admin-table"><thead><tr><th>Recebido</th><th>Ação</th><th>Order</th><th>Status</th><th>Erro</th></tr></thead><tbody>{events.map((event) => <tr key={event.event_id}><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.recebido_em))}</td><td>{event.acao ?? event.tipo ?? "—"}</td><td><code>{event.recurso_id ?? "—"}</code></td><td><StatusBadge status={eventStatus(event.status_processamento)} /></td><td>{event.erro ?? "—"}</td></tr>)}</tbody></table></div>
              ) : <div className="empty-note">Nenhum webhook recebido ainda.</div>}
            </div>
            <div className="integration-card" style={{ marginTop: 16 }}><h3>Confiabilidade</h3><p>Eventos repetidos são ignorados pelo ID da notificação. Antes de dar baixa, o backend consulta a Order diretamente no Mercado Pago e só considera pago quando o status é <b>processed / accredited</b>.</p></div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
