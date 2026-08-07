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

function eventStatus(status: string) {
  if (status === "processado") return "Pago";
  if (status === "erro") return "Atrasado";
  if (status === "ignorado") return "Pendente";
  return "A vencer";
}

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("Mercado Pago");
  const [mp, setMp] = useState<MercadoPagoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => { void loadStatus(); }, []);

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

  async function copyWebhook() {
    if (!mp?.webhookUrl) return;
    await navigator.clipboard.writeText(mp.webhookUrl);
    setMessage("URL do webhook copiada.");
  }

  const connected = mp?.integration?.status === "conectada" && mp.tokenConfigured;
  const ready = Boolean(mp?.tokenConfigured && mp?.webhookSecretConfigured && mp?.adminKeyConfigured);
  const events = mp?.events ?? [];

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
              <div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><MessageCircle size={20} /></span><div><h3>WhatsApp / Evolution</h3><p style={{ margin: 0 }}>Lembretes, Pix e confirmações automáticas.</p></div></div><StatusBadge status="Pendente" /></div>
              <p>Entrará depois que o fluxo Mercado Pago → baixa → fila operacional estiver validado. Assim o WhatsApp só envia mensagens com estados financeiros confiáveis.</p>
            </div>
            <div className="integration-card"><h3>Arquitetura planejada</h3><p>Evolution será implementada atrás de uma camada de provedor. Isso permite trocar depois para WhatsApp Cloud API sem alterar Clientes, Cobranças ou o motor de automações.</p></div>
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
