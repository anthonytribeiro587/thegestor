import { NextRequest, NextResponse } from "next/server";
import { createPixOrder, extractPix, mercadoPagoEnvironment, safeMercadoPagoOrderSummary } from "@/lib/mercado-pago";
import { createClient } from "@/lib/supabase/server";

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

    const { data: attemptData, error: attemptError } = await supabase.rpc("iniciar_pix_mercado_pago", {
      p_empresa_id: membership.empresa_id,
      p_cobranca_id: body.chargeId,
    });
    if (attemptError) throw attemptError;
    const attempt = attemptData as {
      reused?: boolean;
      reason?: string;
      attemptId?: string;
      idempotencyKey?: string;
      amount?: number;
      payerEmail?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      status?: string | null;
      ticketUrl?: string | null;
      qrCode?: string | null;
      qrCodeBase64?: string | null;
      expiresAt?: string | null;
    } | null;

    if (!attempt) return NextResponse.json({ ok: false, error: "Não foi possível reservar a geração do Pix." }, { status: 500 });
    if (attempt.reason === "not_found") return NextResponse.json({ ok: false, error: "Cobrança não encontrada." }, { status: 404 });
    if (attempt.reason === "charge_closed") return NextResponse.json({ ok: false, error: "Esta cobrança já está paga ou cancelada." }, { status: 409 });
    if (attempt.reason === "missing_financial") return NextResponse.json({ ok: false, error: "Dados financeiros não encontrados." }, { status: 422 });
    if (attempt.reason === "no_balance") return NextResponse.json({ ok: false, error: "Esta cobrança não possui saldo para gerar Pix." }, { status: 409 });
    if (attempt.reason === "existing_order_amount_mismatch") {
      return NextResponse.json({ ok: false, error: "Há um Pix ativo para outro valor. Aguarde a expiração desse Pix antes de gerar outro." }, { status: 409 });
    }
    if (attempt.reused) {
      return NextResponse.json({
        ok: true,
        reused: true,
        orderId: attempt.orderId,
        paymentId: attempt.paymentId,
        status: attempt.status,
        ticketUrl: attempt.ticketUrl,
        qrCode: attempt.qrCode,
        qrCodeBase64: attempt.qrCodeBase64,
        expiresAt: attempt.expiresAt,
      });
    }
    if (!attempt.attemptId || !attempt.idempotencyKey) {
      return NextResponse.json({ ok: false, error: "Não foi possível iniciar a geração do Pix." }, { status: 500 });
    }

    const amount = Number(attempt.amount ?? 0);
    if (amount <= 0) return NextResponse.json({ ok: false, error: "Esta cobrança não possui saldo para gerar Pix." }, { status: 409 });

    const environment = mercadoPagoEnvironment();
    const clientEmail = attempt.payerEmail?.trim() || "";
    const payerEmail = environment === "test" ? "test_user_br@testuser.com" : clientEmail;

    if (!payerEmail) {
      return NextResponse.json({ ok: false, error: "Cliente sem e-mail. O Mercado Pago exige e-mail do pagador para gerar o Pix em produção." }, { status: 422 });
    }

    const idempotencyKey = attempt.idempotencyKey;
    const localExternalReference = `thegestor:${body.chargeId}`;

    // O sandbox da Orders API para Pix exige os valores predefinidos da documentação.
    // Em produção usamos a referência real da cobrança para reconciliação.
    const providerAmount = environment === "test" ? 50 : amount;
    const providerExternalReference = environment === "test" ? "ext_ref_1234" : localExternalReference;

    const order = await createPixOrder({
      amount: providerAmount,
      externalReference: providerExternalReference,
      payerEmail,
      payerFirstName: environment === "test" ? "APRO" : undefined,
      idempotencyKey,
      expiration: environment === "production" ? "P1D" : undefined,
      processingMode: environment === "production" ? "automatic" : undefined,
    });
    const pix = extractPix(order);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (!pix.orderId || !pix.qrCode) return NextResponse.json({ ok: false, error: "Mercado Pago não retornou os dados do Pix." }, { status: 502 });

    const { error: rpcError } = await supabase.rpc("registrar_pix_mercado_pago", {
      p_empresa_id: membership.empresa_id,
      p_cobranca_id: body.chargeId,
      p_provider_order_id: pix.orderId,
      p_provider_payment_id: pix.paymentId,
      p_status: pix.orderStatus,
      p_ticket_url: pix.ticketUrl,
      p_qr_code: pix.qrCode,
      p_qr_code_base64: pix.qrCodeBase64,
      p_expira_em: expiresAt,
      p_idempotency_key: idempotencyKey,
      p_payload_resumo: {
        ...safeMercadoPagoOrderSummary(order),
        sandbox_provider_amount: environment === "test" ? providerAmount : null,
        sandbox_external_reference: environment === "test" ? providerExternalReference : null,
        thegestor_balance: amount,
        thegestor_external_reference: localExternalReference,
      },
    });
    if (rpcError) throw rpcError;

    await supabase
      .from("cobrancas")
      .update({ external_reference: localExternalReference })
      .eq("id", body.chargeId)
      .eq("empresa_id", membership.empresa_id);

    return NextResponse.json({
      ok: true,
      reused: false,
      sandbox: environment === "test",
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
