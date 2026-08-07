import { NextRequest, NextResponse } from "next/server";
import { getMercadoPagoOrder, safeMercadoPagoOrderSummary } from "@/lib/mercado-pago";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { chargeId?: string } | null;
    if (!body?.chargeId) {
      return NextResponse.json({ ok: false, error: "Informe a cobrança." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("usuarios_empresa")
      .select("empresa_id,papel,ativo")
      .eq("user_id", userId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership?.empresa_id || membership.papel !== "admin") {
      return NextResponse.json({ ok: false, error: "Somente administradores podem sincronizar pagamentos." }, { status: 403 });
    }

    const { data: charge, error: chargeError } = await supabase
      .from("cobrancas")
      .select("id,empresa_id")
      .eq("id", body.chargeId)
      .eq("empresa_id", membership.empresa_id)
      .single();

    if (chargeError || !charge) {
      return NextResponse.json({ ok: false, error: "Cobrança não encontrada." }, { status: 404 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from("pagamentos")
      .select("provider_order_id")
      .eq("empresa_id", membership.empresa_id)
      .eq("cobranca_id", charge.id)
      .eq("provedor", "mercado_pago")
      .not("provider_order_id", "is", null)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (!payment?.provider_order_id) {
      return NextResponse.json({ ok: false, error: "Esta cobrança ainda não possui uma Order do Mercado Pago." }, { status: 409 });
    }

    const order = await getMercadoPagoOrder(payment.provider_order_id);
    const providerPayment = order.transactions?.payments?.[0];
    const providerAmount = Number(providerPayment?.amount ?? order.total_amount ?? 0);

    const admin = createAdminClient();
    const { data: applied, error: applyError } = await admin.rpc("aplicar_order_mercado_pago", {
      p_provider_order_id: order.id,
      p_provider_payment_id: providerPayment?.id ?? "",
      p_external_reference: order.external_reference ?? "",
      p_status: order.status,
      p_status_detail: order.status_detail,
      p_total_amount: providerAmount,
      p_payload_resumo: safeMercadoPagoOrderSummary(order),
    });

    if (applyError) throw applyError;

    const result = applied as {
      aplicado?: boolean;
      pago?: boolean;
      motivo?: string;
      cobranca_id?: string;
    } | null;

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      status: order.status,
      statusDetail: order.status_detail,
      applied: Boolean(result?.aplicado),
      paid: Boolean(result?.pago),
      reason: result?.motivo ?? null,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível sincronizar a Order.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
