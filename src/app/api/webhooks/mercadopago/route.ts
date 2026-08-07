import { NextRequest, NextResponse } from "next/server";
import { getMercadoPagoOrder, safeMercadoPagoOrderSummary, validateMercadoPagoWebhookSignature } from "@/lib/mercado-pago";
import { createAdminClient } from "@/lib/supabase/admin";

type WebhookPayload = {
  id?: string | number;
  live_mode?: boolean;
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null) as WebhookPayload | null;
  if (!payload) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });

  const queryDataId = request.nextUrl.searchParams.get("data.id");
  const bodyDataId = payload.data?.id != null ? String(payload.data.id) : null;
  const dataId = queryDataId || bodyDataId;
  const eventId = payload.id != null ? String(payload.id) : `${payload.type ?? "unknown"}:${dataId ?? "unknown"}:${payload.action ?? "unknown"}`;
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (!validateMercadoPagoWebhookSignature({ xSignature, xRequestId, dataId })) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const admin = createAdminClient();
  const eventSummary = {
    type: payload.type ?? null,
    action: payload.action ?? null,
    resource_id: dataId,
  };

  const { data: insertedEvent, error: eventError } = await admin
    .from("eventos_integracao")
    .insert({
      provedor: "mercado_pago",
      event_id: eventId,
      recurso_id: dataId,
      tipo: payload.type ?? null,
      acao: payload.action ?? null,
      request_id: xRequestId,
      live_mode: payload.live_mode ?? null,
      status_processamento: "recebido",
      payload_resumo: eventSummary,
    })
    .select("id")
    .single();

  if (eventError?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (eventError || !insertedEvent?.id) {
    return NextResponse.json({ ok: false, error: "event_persistence_failed" }, { status: 500 });
  }

  try {
    if (payload.type !== "order" || !dataId) {
      await admin
        .from("eventos_integracao")
        .update({ status_processamento: "ignorado", processado_em: new Date().toISOString() })
        .eq("id", insertedEvent.id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const order = await getMercadoPagoOrder(dataId);
    const payment = order.transactions?.payments?.[0];
    const totalAmount = Number(payment?.amount ?? order.total_amount ?? 0);

    const { data: applied, error: applyError } = await admin.rpc("aplicar_order_mercado_pago", {
      p_provider_order_id: order.id,
      p_provider_payment_id: payment?.id ?? "",
      p_external_reference: order.external_reference ?? "",
      p_status: order.status,
      p_status_detail: order.status_detail,
      p_total_amount: totalAmount,
      p_payload_resumo: safeMercadoPagoOrderSummary(order),
    });
    if (applyError) throw applyError;

    const result = applied as { aplicado?: boolean; empresa_id?: string; cobranca_id?: string; pago?: boolean; motivo?: string } | null;
    await admin
      .from("eventos_integracao")
      .update({
        empresa_id: result?.empresa_id ?? null,
        status_processamento: result?.aplicado ? "processado" : "ignorado",
        payload_resumo: { ...eventSummary, order: safeMercadoPagoOrderSummary(order), result },
        processado_em: new Date().toISOString(),
        erro: result?.aplicado ? null : result?.motivo ?? null,
      })
      .eq("id", insertedEvent.id);

    return NextResponse.json({ ok: true, processed: Boolean(result?.aplicado), paid: Boolean(result?.pago) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "webhook_processing_failed";
    await admin
      .from("eventos_integracao")
      .update({
        status_processamento: "erro",
        erro: message.slice(0, 1000),
        processado_em: new Date().toISOString(),
      })
      .eq("id", insertedEvent.id);

    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
