import { NextResponse } from "next/server";
import { getMercadoPagoAccount, mercadoPagoConfigured, mercadoPagoEnvironment, mercadoPagoWebhookConfigured } from "@/lib/mercado-pago";
import { supabaseAdminKeyConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function adminContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { supabase, error: NextResponse.json({ ok: false, error: "Sessão inválida." }, { status: 401 }) };

  const { data: membership, error } = await supabase
    .from("usuarios_empresa")
    .select("empresa_id,papel,ativo")
    .eq("user_id", userId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!membership?.empresa_id || membership.papel !== "admin") {
    return { supabase, error: NextResponse.json({ ok: false, error: "Acesso restrito ao administrador." }, { status: 403 }) };
  }
  return { supabase, membership, error: null };
}

export async function GET() {
  try {
    const context = await adminContext();
    if (context.error) return context.error;

    const { data: integration } = await context.supabase
      .from("integracoes")
      .select("status,config_publica,ultimo_sync_em,ultimo_erro")
      .eq("empresa_id", context.membership!.empresa_id)
      .eq("provedor", "mercado_pago")
      .eq("nome", "principal")
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      environment: mercadoPagoEnvironment(),
      tokenConfigured: mercadoPagoConfigured(),
      webhookConfigured: mercadoPagoWebhookConfigured(),
      serviceRoleConfigured: supabaseAdminKeyConfigured(),
      testPayerConfigured: Boolean(process.env.MERCADO_PAGO_TEST_PAYER_EMAIL),
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://thegestor.vercel.app"}/api/webhooks/mercadopago`,
      integration: integration ?? null,
    });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha ao consultar integração." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    if (!mercadoPagoConfigured()) {
      return NextResponse.json({ ok: false, error: "MERCADO_PAGO_ACCESS_TOKEN não configurado no Vercel." }, { status: 422 });
    }

    const account = await getMercadoPagoAccount();
    const publicConfig = {
      api: "orders",
      payment_method: "pix",
      environment: mercadoPagoEnvironment(),
      account_id: account.id,
      nickname: account.nickname ?? null,
      site_id: account.site_id ?? null,
    };

    const { error } = await context.supabase
      .from("integracoes")
      .upsert({
        empresa_id: context.membership!.empresa_id,
        provedor: "mercado_pago",
        nome: "principal",
        status: "conectada",
        config_publica: publicConfig,
        ultimo_sync_em: new Date().toISOString(),
        ultimo_erro: null,
      }, { onConflict: "empresa_id,provedor,nome" });
    if (error) throw error;

    return NextResponse.json({ ok: true, account: { id: account.id, nickname: account.nickname ?? null, siteId: account.site_id ?? null } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível validar a conexão.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
