import { NextRequest, NextResponse } from "next/server";

/**
 * Estrutura inicial do webhook do Mercado Pago.
 * Antes de produção: validar assinatura, persistir o evento com idempotência,
 * consultar o pagamento no provedor e só então atualizar a cobrança.
 */
export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    received: true,
    implementation: "pending_credentials_and_database",
  });
}
