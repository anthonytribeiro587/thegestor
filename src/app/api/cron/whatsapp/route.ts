import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWhatsAppBillingAutomation } from "@/lib/whatsapp-billing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await runWhatsAppBillingAutomation(admin);

    await admin.from("execucoes_automacao").insert({
      tipo: "whatsapp_cobranca",
      status: summary.errors > 0 ? "processado_com_erros" : "processado",
      resumo: summary,
      finalizado_em: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, summary });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha na automação de WhatsApp.";
    try {
      const admin = createAdminClient();
      await admin.from("execucoes_automacao").insert({
        tipo: "whatsapp_cobranca",
        status: "erro",
        erro: message.slice(0, 1000),
        finalizado_em: new Date().toISOString(),
      });
    } catch {
      // Não mascara o erro principal se o log também falhar.
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
