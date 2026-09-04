import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEvolutionText } from "@/lib/evolution";
import { createPixOrder, extractPix, mercadoPagoEnvironment, safeMercadoPagoOrderSummary } from "@/lib/mercado-pago";
import { addDays, automationMatchesDate, renderBillingMessage, type MessageAutomationTrigger } from "@/lib/whatsapp-automation-rules";

export type BillingAutomationConfig = {
  empresa_id: string;
  whatsapp_ativo: boolean;
  whatsapp_limite_diario: number;
};

export type MessageAutomation = {
  id: string;
  empresa_id: string;
  nome: string;
  gatilho: MessageAutomationTrigger;
  dias_deslocamento: number;
  mensagem: string;
  incluir_pagamento: boolean;
  ativo: boolean;
};

type ClientJoin = {
  nome: string;
  telefone: string | null;
  email: string | null;
  status: string;
};

type FinancialJoin = {
  valor_original: number;
  desconto: number;
  acrescimo: number;
  valor_pago: number | null;
};

type ChargeRow = {
  id: string;
  empresa_id: string;
  cliente_id: string;
  competencia: string;
  vencimento: string;
  status_pagamento: string;
  clientes: ClientJoin | ClientJoin[] | null;
  cobrancas_financeiras: FinancialJoin | FinancialJoin[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function existingPaymentLink(admin: SupabaseClient, chargeId: string) {
  const { data, error } = await admin
    .from("pagamentos")
    .select("pix_ticket_url,expira_em,status,criado_em")
    .eq("cobranca_id", chargeId)
    .eq("provedor", "mercado_pago")
    .not("pix_ticket_url", "is", null)
    .order("criado_em", { ascending: false })
    .limit(5);
  if (error) throw error;
  const now = Date.now();
  const valid = (data ?? []).find((item) => !item.expira_em || Date.parse(item.expira_em) > now);
  return valid?.pix_ticket_url ?? null;
}

async function ensureProductionPix(admin: SupabaseClient, charge: ChargeRow, amount: number) {
  const reusable = await existingPaymentLink(admin, charge.id);
  if (reusable) return reusable;
  if (mercadoPagoEnvironment() !== "production" || amount <= 0) return null;

  const client = first(charge.clientes);
  const payerEmail = client?.email?.trim();
  if (!payerEmail) return null;

  const externalReference = `thegestor:${charge.id}`;
  const idempotencyKey = randomUUID();
  const order = await createPixOrder({
    amount,
    externalReference,
    payerEmail,
    idempotencyKey,
    expiration: "P1D",
    processingMode: "automatic",
  });
  const pix = extractPix(order);
  if (!pix.orderId || !pix.qrCode) throw new Error("Mercado Pago não retornou dados válidos do Pix automático.");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: paymentError } = await admin.from("pagamentos").insert({
    empresa_id: charge.empresa_id,
    cobranca_id: charge.id,
    provedor: "mercado_pago",
    provider_payment_id: pix.paymentId || null,
    provider_order_id: pix.orderId,
    status: pix.orderStatus,
    metodo: "pix",
    pix_ticket_url: pix.ticketUrl,
    pix_qr_code: pix.qrCode,
    pix_qr_code_base64: pix.qrCodeBase64,
    expira_em: expiresAt,
    idempotency_key: idempotencyKey,
    payload_resumo: {
      ...safeMercadoPagoOrderSummary(order),
      source: "whatsapp_automation",
      thegestor_balance: amount,
      thegestor_external_reference: externalReference,
    },
  });
  if (paymentError) {
    if (paymentError.code !== "23505") throw paymentError;
    return existingPaymentLink(admin, charge.id);
  }

  await admin
    .from("cobrancas")
    .update({ external_reference: externalReference })
    .eq("id", charge.id)
    .eq("empresa_id", charge.empresa_id);

  return pix.ticketUrl ?? null;
}

function saoPauloToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function sentToday(admin: SupabaseClient, empresaId: string, today: string) {
  const start = `${today}T00:00:00-03:00`;
  const end = `${today}T23:59:59.999-03:00`;
  const { count, error } = await admin
    .from("mensagens_cobranca")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("status", "enviada")
    .gte("enviada_em", start)
    .lte("enviada_em", end);
  if (error) throw error;
  return count ?? 0;
}

async function loadAutomations(admin: SupabaseClient, empresaId: string) {
  const { data, error } = await admin
    .from("automacoes_mensagem")
    .select("id,empresa_id,nome,gatilho,dias_deslocamento,mensagem,incluir_pagamento,ativo")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessageAutomation[];
}

async function loadCharges(admin: SupabaseClient, empresaId: string, automations: MessageAutomation[], today: string) {
  const maxBefore = automations
    .filter((item) => item.gatilho === "antes_vencimento")
    .reduce((max, item) => Math.max(max, item.dias_deslocamento), 0);
  const maxAfter = automations
    .filter((item) => item.gatilho === "atraso")
    .reduce((max, item) => Math.max(max, item.dias_deslocamento), 0);
  const minDate = addDays(today, -maxAfter);
  const maxDate = addDays(today, maxBefore);

  const { data, error } = await admin
    .from("cobrancas")
    .select("id,empresa_id,cliente_id,competencia,vencimento,status_pagamento,clientes(nome,telefone,email,status),cobrancas_financeiras(valor_original,desconto,acrescimo,valor_pago)")
    .eq("empresa_id", empresaId)
    .in("status_pagamento", ["pendente", "atrasado"])
    .gte("vencimento", minDate)
    .lte("vencimento", maxDate)
    .order("vencimento", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChargeRow[];
}

export async function runWhatsAppBillingAutomation(admin: SupabaseClient, now = new Date()) {
  const today = saoPauloToday(now);
  const { data: configs, error: configError } = await admin
    .from("configuracoes_empresa")
    .select("empresa_id,whatsapp_ativo,whatsapp_limite_diario")
    .eq("whatsapp_ativo", true);
  if (configError) throw configError;

  const summary = { date: today, companies: 0, automations: 0, candidates: 0, sent: 0, ignored: 0, errors: 0, limitReached: 0 };

  for (const rawConfig of configs ?? []) {
    const config = rawConfig as BillingAutomationConfig;
    const automations = await loadAutomations(admin, config.empresa_id);
    if (!automations.length) continue;

    summary.companies += 1;
    summary.automations += automations.length;
    const alreadySent = await sentToday(admin, config.empresa_id, today);
    let remaining = Math.max(Number(config.whatsapp_limite_diario ?? 30) - alreadySent, 0);
    if (remaining <= 0) {
      summary.limitReached += 1;
      continue;
    }

    const charges = await loadCharges(admin, config.empresa_id, automations, today);
    for (const charge of charges) {
      const matches = automations.filter((automation) => automationMatchesDate(today, charge.vencimento, automation));
      if (!matches.length) continue;

      for (const automation of matches) {
        if (remaining <= 0) {
          summary.limitReached += 1;
          break;
        }
        summary.candidates += 1;

        const client = first(charge.clientes);
        const financial = first(charge.cobrancas_financeiras);
        const phone = client?.telefone?.trim() ?? "";
        const amount = financialBalance(financial);
        if (!client || client.status !== "ativo" || !phone || amount <= 0) {
          summary.ignored += 1;
          continue;
        }

        const { data: reserved, error: reserveError } = await admin
          .from("mensagens_cobranca")
          .insert({
            empresa_id: charge.empresa_id,
            cobranca_id: charge.id,
            cliente_id: charge.cliente_id,
            automacao_id: automation.id,
            tipo: automation.gatilho,
            provedor: "evolution",
            status: "pendente",
            telefone: phone,
          })
          .select("id")
          .single();

        if (reserveError) {
          if (reserveError.code === "23505") {
            summary.ignored += 1;
            continue;
          }
          summary.errors += 1;
          continue;
        }

        try {
          const paymentLink = automation.incluir_pagamento ? await ensureProductionPix(admin, charge, amount) : null;
          const message = renderBillingMessage({
            template: automation.mensagem,
            name: client.nome,
            dueDate: charge.vencimento,
            amount,
            paymentLink,
          });
          const result = await sendEvolutionText(phone, message);
          await admin
            .from("mensagens_cobranca")
            .update({
              status: "enviada",
              mensagem: message,
              provider_message_id: result.key?.id ?? null,
              enviada_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", reserved.id);
          summary.sent += 1;
          remaining -= 1;
        } catch (cause) {
          await admin
            .from("mensagens_cobranca")
            .update({
              status: "erro",
              erro: cause instanceof Error ? cause.message.slice(0, 800) : "Falha no envio automático.",
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", reserved.id);
          summary.errors += 1;
        }
      }

      if (remaining <= 0) break;
    }
  }

  return summary;
}
