import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createPixOrder, extractPix, mercadoPagoEnvironment, safeMercadoPagoOrderSummary } from "@/lib/mercado-pago";
import { createClient } from "@/lib/supabase/server";

type ChargeQuery = {
  id: string;
  empresa_id: string;
  status_pagamento: string;
  clientes: { email: string | null } | { email: string | null }[] | null;
  cobrancas_financeiras: {
    valor_original: number;
    desconto: number;
    acrescimo: number;
    valor_pago: number | null;
  } | {
    valor_original: number;
    desconto: number;
    acrescimo: number;
    valor_pago: number | null;
  }[] | null;
  pagamentos: Array<{
    id: string;
    provider_order_id: string | null;
    provider_payment_id: string | null;
    status: string;
    pix_ticket_url: string | null;
    pix_qr_code: string | null;
    pix_qr_code_base64: string | null;
    expira_em: string | null;
  }> | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function existingPix(row: ChargeQuery) {
  const now = Date.now();
  return (row.pagamentos ?? [])
    .filter((item) => item.provider_order_id && item.pix_qr_code)
    .find((item) => !item.expira_em || Date.parse(item.expira_em) > now);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { chargeId?: string } | null;
    if (!body?.chargeId) return NextResponse.json({ ok: false, error: "Informe a cobrança." }, { status: 400 });

    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) return NextResponse.json({ ok: false, error: "Sessão inválida." }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase
      .from("usuarios_empresa")
      .select("empresa_id,papel,ativo")
      .eq("user_id", userId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership?.empresa_id || membership.papel !== "admin") {
      return NextResponse.json({ ok: false, error: "Somente administradores podem gerar Pix." }, { status: 403 });
    }

    const { data, error: chargeError } = await supabase
      .from("cobrancas")
      .select("id,empresa_id,status_pagamento,clientes(email),cobrancas_financeiras(valor_original,desconto,acrescimo,valor_pago),pagamentos(id,provider_order_id,provider_payment_id,status,pix_ticket_url,pix_qr_code,pix_qr_code_base64,expira_em)")
      .eq("id", body.chargeId)
      .eq("empresa_id", membership.empresa_id)
      .single();

    if (chargeError) throw chargeError;
    const charge = data as unknown as ChargeQuery;
    if (charge.status_pagamento === "pago") return NextResponse.json({ ok: false, error: "Esta cobrança já está paga." }, { status: 409 });

    const reusable = existingPix(charge);
    if (reusable) {
      return NextResponse.json({
        ok: true,
        reused: true,
        orderId: reusable.provider_order_id,
        paymentId: reusable.provider_payment_id,
        ticketUrl: reusable.pix_ticket_url,
        qrCode: reusable.pix_qr_code,
        qrCodeBase64: reusable.pix_qr_code_base64,
        expiresAt: reusable.expira_em,
      });
    }

    const financial = first(charge.cobrancas_financeiras);
    if (!financial) return NextResponse.json({ ok: false, error: "Dados financeiros não encontrados." }, { status: 422 });

    const amount = Math.max(
      Number(financial.valor_original ?? 0) + Number(financial.acrescimo ?? 0) - Number(financial.desconto ?? 0) - Number(financial.valor_pago ?? 0),
      0,
    );
    if (amount <= 0) return NextResponse.json({ ok: false, error: "Esta cobrança não possui saldo para gerar Pix." }, { status: 409 });

    const environment = mercadoPagoEnvironment();
    const clientEmail = first(charge.clientes)?.email?.trim() || "";
    const payerEmail = environment === "test"
      ? process.env.MERCADO_PAGO_TEST_PAYER_EMAIL?.trim() || "test_user_br@testuser.com"
      : clientEmail;

    if (!payerEmail) {
      return NextResponse.json({ ok: false, error: "Cliente sem e-mail. O Mercado Pago exige e-mail do pagador para gerar o Pix em produção." }, { status: 422 });
    }

    const idempotencyKey = randomUUID();
    const externalReference = `thegestor:${charge.id}`;
    const order = await createPixOrder({
      amount,
      externalReference,
      payerEmail,
      payerFirstName: environment === "test" ? "APRO" : undefined,
      idempotencyKey,
      expiration: "P1D",
    });
    const pix = extractPix(order);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (!pix.orderId || !pix.qrCode) return NextResponse.json({ ok: false, error: "Mercado Pago não retornou os dados do Pix." }, { status: 502 });

    const { error: rpcError } = await supabase.rpc("registrar_pix_mercado_pago", {
      p_empresa_id: membership.empresa_id,
      p_cobranca_id: charge.id,
      p_provider_order_id: pix.orderId,
      p_provider_payment_id: pix.paymentId,
      p_status: pix.orderStatus,
      p_ticket_url: pix.ticketUrl,
      p_qr_code: pix.qrCode,
      p_qr_code_base64: pix.qrCodeBase64,
      p_expira_em: expiresAt,
      p_idempotency_key: idempotencyKey,
      p_payload_resumo: safeMercadoPagoOrderSummary(order),
    });
    if (rpcError) throw rpcError;

    await supabase.from("cobrancas").update({ external_reference: externalReference }).eq("id", charge.id).eq("empresa_id", membership.empresa_id);

    return NextResponse.json({
      ok: true,
      reused: false,
      orderId: pix.orderId,
      paymentId: pix.paymentId,
      status: pix.orderStatus,
      statusDetail: pix.statusDetail,
      ticketUrl: pix.ticketUrl,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      expiresAt,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível gerar o Pix.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
