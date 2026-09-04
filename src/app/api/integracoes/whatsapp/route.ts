import { NextRequest, NextResponse } from "next/server";
import { connectEvolutionInstance, evolutionConfigured, getEvolutionConfigurationStatus, getEvolutionConnectionState, sendEvolutionText } from "@/lib/evolution";
import { mercadoPagoEnvironment } from "@/lib/mercado-pago";
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

async function phoneCoverage(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: string) {
  const { data: clients, error } = await supabase
    .from("clientes")
    .select("id,telefone")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");
  if (error) throw error;
  const total = clients?.length ?? 0;
  const withPhone = (clients ?? []).filter((item) => Boolean(item.telefone?.trim())).length;
  return { total, withPhone, withoutPhone: Math.max(total - withPhone, 0) };
}

export async function GET() {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;

    const coverage = await phoneCoverage(context.supabase, empresaId);

    const [{ data: automation, error: automationError }, { data: recentMessages, error: messagesError }] = await Promise.all([
      context.supabase
        .from("configuracoes_empresa")
        .select("whatsapp_ativo,lembrete_antes_dias,lembrete_no_vencimento,lembrete_atraso_dias,whatsapp_limite_diario,whatsapp_mensagem_antes,whatsapp_mensagem_vencimento,whatsapp_mensagem_atraso")
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      context.supabase
        .from("mensagens_cobranca")
        .select("id,tipo,status,telefone,erro,enviada_em,criado_em,clientes(nome)")
        .eq("empresa_id", empresaId)
        .order("criado_em", { ascending: false })
        .limit(10),
    ]);
    if (automationError) throw automationError;
    if (messagesError) throw messagesError;

    const evolutionStatus = await getEvolutionConfigurationStatus();
    let connection: { instance: string; state: string } | null = null;
    let connectionError: string | null = evolutionStatus.error;
    if (evolutionStatus.configured) {
      try {
        connection = await getEvolutionConnectionState();
      } catch (cause) {
        connectionError = cause instanceof Error ? cause.message : "Falha ao consultar Evolution API.";
      }
    }

    return NextResponse.json({
      ok: true,
      configured: evolutionStatus.configured,
      credentialSource: evolutionStatus.source,
      urlConfigured: evolutionStatus.urlConfigured,
      apiKeyConfigured: evolutionStatus.apiKeyConfigured,
      instanceConfigured: evolutionStatus.instanceConfigured,
      instance: evolutionStatus.instance,
      connection,
      connectionError,
      phoneCoverage: coverage,
      mercadoPagoEnvironment: mercadoPagoEnvironment(),
      automation: automation ?? {
        whatsapp_ativo: false,
        lembrete_antes_dias: 3,
        lembrete_no_vencimento: true,
        lembrete_atraso_dias: 2,
        whatsapp_limite_diario: 30,
        whatsapp_mensagem_antes: "Olá, {nome}. Passando para lembrar que sua mensalidade vence em {vencimento}.{pagamento}",
        whatsapp_mensagem_vencimento: "Olá, {nome}. Sua mensalidade vence hoje ({vencimento}).{pagamento}",
        whatsapp_mensagem_atraso: "Olá, {nome}. Identificamos que sua mensalidade com vencimento em {vencimento} ainda está pendente.{pagamento} Se você já realizou o pagamento, desconsidere esta mensagem.",
      },
      recentMessages: recentMessages ?? [],
    });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha ao consultar WhatsApp." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      number?: string;
      message?: string;
      enabled?: boolean;
      beforeDays?: number;
      dueDay?: boolean;
      overdueDays?: number;
      dailyLimit?: number;
      beforeTemplate?: string;
      dueTemplate?: string;
      overdueTemplate?: string;
    };

    if (body.action === "saveAutomation") {
      const beforeDays = Math.max(0, Math.min(30, Number(body.beforeDays ?? 3)));
      const overdueDays = Math.max(0, Math.min(30, Number(body.overdueDays ?? 2)));
      const dailyLimit = Math.max(1, Math.min(100, Number(body.dailyLimit ?? 30)));
      const beforeTemplate = String(body.beforeTemplate ?? "").trim();
      const dueTemplate = String(body.dueTemplate ?? "").trim();
      const overdueTemplate = String(body.overdueTemplate ?? "").trim();

      if (!beforeTemplate || !dueTemplate || !overdueTemplate) {
        return NextResponse.json({ ok: false, error: "Os três textos da automação precisam estar preenchidos." }, { status: 400 });
      }
      if (beforeTemplate.length > 1500 || dueTemplate.length > 1500 || overdueTemplate.length > 1500) {
        return NextResponse.json({ ok: false, error: "Cada mensagem pode ter no máximo 1.500 caracteres." }, { status: 400 });
      }

      if (body.enabled) {
        if (mercadoPagoEnvironment() !== "production") {
          return NextResponse.json({ ok: false, error: "Para ativar mensagens automáticas, primeiro coloque o Mercado Pago em Produção." }, { status: 409 });
        }
        if (!(await evolutionConfigured())) {
          return NextResponse.json({ ok: false, error: "Evolution API não está configurada." }, { status: 409 });
        }
        const state = await getEvolutionConnectionState();
        if (state.state !== "open") {
          return NextResponse.json({ ok: false, error: "WhatsApp não está conectado (estado open)." }, { status: 409 });
        }
        const coverage = await phoneCoverage(context.supabase, empresaId);
        if (coverage.withPhone <= 0) {
          return NextResponse.json({ ok: false, error: "Nenhum cliente ativo possui telefone para WhatsApp." }, { status: 409 });
        }
      }

      const { error: saveError } = await context.supabase
        .from("configuracoes_empresa")
        .upsert({
          empresa_id: empresaId,
          whatsapp_ativo: Boolean(body.enabled),
          lembrete_antes_dias: beforeDays,
          lembrete_no_vencimento: body.dueDay !== false,
          lembrete_atraso_dias: overdueDays,
          whatsapp_limite_diario: dailyLimit,
          whatsapp_mensagem_antes: beforeTemplate,
          whatsapp_mensagem_vencimento: dueTemplate,
          whatsapp_mensagem_atraso: overdueTemplate,
        }, { onConflict: "empresa_id" });
      if (saveError) throw saveError;

      return NextResponse.json({ ok: true, action: "saveAutomation", enabled: Boolean(body.enabled) });
    }

    if (!(await evolutionConfigured())) {
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
