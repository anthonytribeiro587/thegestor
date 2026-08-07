import { NextRequest, NextResponse } from "next/server";
import { connectEvolutionInstance, evolutionConfigured, getEvolutionConnectionState, sendEvolutionText } from "@/lib/evolution";
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
    const empresaId = context.membership!.empresa_id;

    const { data: clients, error: clientError } = await context.supabase
      .from("clientes")
      .select("id,telefone")
      .eq("empresa_id", empresaId)
      .eq("status", "ativo");
    if (clientError) throw clientError;

    const total = clients?.length ?? 0;
    const withPhone = (clients ?? []).filter((item) => Boolean(item.telefone?.trim())).length;

    let connection: { instance: string; state: string } | null = null;
    let connectionError: string | null = null;
    if (evolutionConfigured()) {
      try {
        connection = await getEvolutionConnectionState();
      } catch (cause) {
        connectionError = cause instanceof Error ? cause.message : "Falha ao consultar Evolution API.";
      }
    }

    return NextResponse.json({
      ok: true,
      configured: evolutionConfigured(),
      urlConfigured: Boolean(process.env.EVOLUTION_API_URL),
      apiKeyConfigured: Boolean(process.env.EVOLUTION_API_KEY),
      instanceConfigured: Boolean(process.env.EVOLUTION_INSTANCE),
      instance: process.env.EVOLUTION_INSTANCE ?? null,
      connection,
      connectionError,
      phoneCoverage: { total, withPhone, withoutPhone: Math.max(total - withPhone, 0) },
    });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha ao consultar WhatsApp." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const body = await request.json().catch(() => ({})) as { action?: string; number?: string; message?: string };

    if (!evolutionConfigured()) {
      return NextResponse.json({ ok: false, error: "Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no Vercel." }, { status: 422 });
    }

    if (body.action === "connect") {
      const result = await connectEvolutionInstance();
      return NextResponse.json({ ok: true, action: "connect", qr: result.base64 ?? null, pairingCode: result.pairingCode ?? null });
    }

    if (body.action === "test") {
      if (!body.number || !body.message) {
        return NextResponse.json({ ok: false, error: "Informe número e mensagem para o teste." }, { status: 400 });
      }
      const result = await sendEvolutionText(body.number, body.message);
      return NextResponse.json({ ok: true, action: "test", messageId: result.key?.id ?? null, status: result.status ?? null });
    }

    const state = await getEvolutionConnectionState();
    return NextResponse.json({ ok: true, action: "status", connection: state });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha na integração WhatsApp." }, { status: 500 });
  }
}
