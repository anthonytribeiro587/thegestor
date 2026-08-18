import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ ok: false, error: "Ação restrita ao administrador." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { chargeId?: string };
    if (!body.chargeId) return NextResponse.json({ ok: false, error: "Cobrança não informada." }, { status: 400 });

    const { data: charge, error: chargeError } = await supabase
      .from("cobrancas")
      .select("id,status_pagamento,cobrancas_financeiras(valor_original,valor_pago)")
      .eq("empresa_id", membership.empresa_id)
      .eq("id", body.chargeId)
      .single();

    if (chargeError) throw chargeError;

    const financialRaw = charge.cobrancas_financeiras as { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
    const financial = Array.isArray(financialRaw) ? financialRaw[0] : financialRaw;
    const total = Number(financial?.valor_original ?? 0);
    if (total <= 0) return NextResponse.json({ ok: false, error: "Cobrança sem valor financeiro válido." }, { status: 422 });

    if (charge.status_pagamento !== "pago" || Number(financial?.valor_pago ?? 0) < total) {
      const { error: paymentError } = await supabase.rpc("registrar_pagamento_manual", {
        p_empresa_id: membership.empresa_id,
        p_cobranca_id: charge.id,
        p_valor_pago: total,
        p_metodo: "manual",
      });
      if (paymentError) throw paymentError;
    }

    return NextResponse.json({
      ok: true,
      paid: true,
      renewed: false,
      warning: "Pagamento registrado. Agora marque como renovado quando concluir a renovação.",
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : (cause && typeof cause === "object" && "message" in cause ? String((cause as { message?: unknown }).message) : "Não foi possível marcar como pago.");
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
