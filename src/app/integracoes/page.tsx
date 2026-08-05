"use client";

import { useState } from "react";
import { CreditCard, MessageCircle, Webhook } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

type Tab = "Mercado Pago" | "WhatsApp" | "Webhooks";

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("Mercado Pago");
  return (
    <AppShell>
      <PageHeader title="Integrações" subtitle="Conecte os serviços usados pela operação" />
      <section className="card">
        <div className="integration-tabs">{(["Mercado Pago", "WhatsApp", "Webhooks"] as Tab[]).map((item) => <button className={`integration-tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
        {tab === "Mercado Pago" ? <div className="integration-grid">
          <div className="integration-card"><div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><CreditCard size={20} /></span><div><h3>Mercado Pago</h3><p style={{ margin: 0 }}>Receba pagamentos e confirme cobranças automaticamente.</p></div></div><StatusBadge status="Pendente" /></div><div className="integration-field"><label>Access Token</label><code>Configure por variável de ambiente — nunca salvo no navegador.</code></div><div className="integration-field"><label>Webhook</label><code>/api/webhooks/mercadopago</code></div><div style={{ display: "flex", gap: 8, marginTop: 16 }}><button className="button primary">Configurar conexão</button><button className="button secondary">Testar webhook</button></div></div>
          <div className="integration-card"><h3>Como será usado</h3><p>Cada cobrança deverá carregar uma referência única do cliente e da cobrança. O webhook confirma o pagamento e cria uma tarefa operacional, evitando identificar clientes apenas pelo valor pago.</p><p><b>Próxima etapa:</b> conectar a conta e implementar a criação real de PIX e cobranças.</p></div>
        </div> : null}
        {tab === "WhatsApp" ? <div className="integration-grid">
          <div className="integration-card"><div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><MessageCircle size={20} /></span><div><h3>WhatsApp / Evolution</h3><p style={{ margin: 0 }}>Mensagens operacionais e lembretes de vencimento.</p></div></div><StatusBadge status="Pendente" /></div><div className="integration-field"><label>URL da Evolution</label><code>EVOLUTION_API_URL</code></div><div className="integration-field"><label>Instância</label><code>EVOLUTION_INSTANCE</code></div><div style={{ marginTop: 16 }}><button className="button primary">Configurar conexão</button></div></div>
          <div className="integration-card"><h3>Integração desacoplada</h3><p>A UI não depende diretamente da Evolution. Um serviço de mensageria permitirá começar com Evolution e migrar futuramente para outra API sem alterar o cadastro de clientes ou o fluxo de cobranças.</p></div>
        </div> : null}
        {tab === "Webhooks" ? <div className="integration-grid">
          <div className="integration-card"><div className="integration-head"><div style={{ display: "flex", gap: 11, alignItems: "center" }}><span className="integration-icon"><Webhook size={20} /></span><div><h3>Eventos recebidos</h3><p style={{ margin: 0 }}>Saúde e histórico das integrações.</p></div></div><StatusBadge status="Pendente" /></div><p>Esta área receberá evento, origem, status, tentativas e horário de processamento quando o banco estiver conectado.</p></div>
          <div className="integration-card"><h3>Confiabilidade</h3><p>Os eventos serão processados de forma idempotente e registrados antes da atualização das cobranças para evitar duplicidade.</p></div>
        </div> : null}
      </section>
    </AppShell>
  );
}
