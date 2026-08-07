"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, CreditCard, MessageCircle, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

type Tab = "Mercado Pago" | "WhatsApp" | "Webhooks";

type MercadoPagoStatus = {
  ok: boolean;
  environment: "test" | "production";
  tokenConfigured: boolean;
  webhookConfigured: boolean;
  serviceRoleConfigured: boolean;
  testPayerConfigured: boolean;
  webhookUrl: string;
  integration: null | {
    status: string;
    config_publica: Record<string, unknown>;
    ultimo_sync_em: string | null;
    ultimo_erro: string | null;
  };
  error?: string;
};

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
  const ready = Boolean(mp?.tokenConfigured && mp?.webhookConfigured && mp?.serviceRoleConfigured);

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
                  <div><h3>Mercado Pago</h3><p style={{ margin: 0 }}>Orders API + Pix + baixa automática por webhook.</p></div>
                </div>
                <StatusBadge status={connected ? "Conectado" : "Pendente"} />
              </div>

              {loading ? <div className="empty-note">Verificando configuração...</div> : (
                <>
                  <div className="integration-field"><label>Ambiente</label><code>{mp?.environment === "production" ? "Produção" : "Teste"}</code></div>
                  <div className="integration-field"><label>Access Token</label><code>{mp?.tokenConfigured ? "Configurado no servidor ✓" : "Pendente no Vercel"}</code></div>
                  <div className="integration-field"><label>Webhook + service role</label><code>{mp?.webhookConfigured ? "Pronto para validar notificações ✓" : "Configuração incompleta"}</code></div>
                  {mp?.environment === "test" ? <div className="integration-field"><label>E-mail do pagador de teste</label><code>{mp?.testPayerConfigured ? "Configurado ✓" : "MERCADO_PAGO_TEST_PAYER_EMAIL pendente"}</code></div> : null}
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
                <div style={{ display: "flex", gap: 9 }}><CheckCircle2 size={17} color={mp?.tokenConfigured ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Credencial privada do Mercado Pago no Vercel.</p></div>
                <div style={{ display: "flex", gap: 9 }}><ShieldCheck size={17} color={mp?.webhookConfigured ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>Assinatura secreta do webhook + Supabase service role no servidor.</p></div>
                <div style={{ display: "flex", gap: 9 }}><Webhook size={17} color={connected ? "#079669" : "#6b7a91"} /><p style={{ margin: 0 }}>No Mercado Pago, habilitar o evento <b>Order (Mercado Pago)</b> apontando para a URL acima.</p></div>
              </div>
              <p style={{ marginTop: 16 }}><b>Status técnico:</b> {ready ? "backend pronto para teste" : "aguardando variáveis de ambiente"}.</p>
              <p>Depois disso, o botão <b>Gerar Pix</b> fica disponível nos detalhes de cada cobrança. O webhook consulta a order no Mercado Pago antes de marcar como paga.</p>
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
          <div className="integration-grid">
            <div className="integration-card"><div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><Webhook size={20} /></span><div><h3>Eventos recebidos</h3><p style={{ margin: 0 }}>Os eventos Mercado Pago já possuem persistência idempotente no backend.</p></div></div><StatusBadge status={mp?.webhookConfigured ? "Conectado" : "Pendente"} /></div><p>Na próxima etapa desta tela exibiremos evento, recurso, ação, status de processamento e erro técnico sem expor tokens.</p></div>
            <div className="integration-card"><h3>Confiabilidade</h3><p>Uma notificação repetida usa o ID do evento para não dar baixa duas vezes. Antes de atualizar a cobrança, o backend consulta novamente a Order diretamente na API do Mercado Pago.</p></div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
