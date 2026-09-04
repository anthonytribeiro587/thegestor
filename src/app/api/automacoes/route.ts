import { NextRequest, NextResponse } from "next/server";
import { evolutionConfigured, getEvolutionConfigurationStatus, getEvolutionConnectionState } from "@/lib/evolution";
import { createClient } from "@/lib/supabase/server";

type Trigger = "antes_vencimento" | "vencimento" | "atraso";

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

function normalizeAutomation(body: Record<string, unknown>) {
  const nome = String(body.nome ?? "").trim();
  const gatilho = String(body.gatilho ?? "") as Trigger;
  const dias = gatilho === "vencimento" ? 0 : Number(body.dias_deslocamento ?? 0);
  const mensagem = String(body.mensagem ?? "").trim();
  const incluirPagamento = body.incluir_pagamento !== false;
  const ativo = Boolean(body.ativo);

  if (nome.length < 2 || nome.length > 80) throw new Error("O nome precisa ter entre 2 e 80 caracteres.");
  if (!["antes_vencimento", "vencimento", "atraso"].includes(gatilho)) throw new Error("Gatilho inválido.");
  if (!Number.isInteger(dias) || dias < 0 || dias > 30) throw new Error("Os dias precisam estar entre 0 e 30.");
  if (!mensagem || mensagem.length > 1500) throw new Error("A mensagem precisa ter entre 1 e 1.500 caracteres.");

  return { nome, gatilho, dias_deslocamento: dias, mensagem, incluir_pagamento: incluirPagamento, ativo };
}

export async function GET() {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;

    const [{ data: automations, error: automationsError }, { data: config, error: configError }, { data: messages, error: messagesError }] = await Promise.all([
      context.supabase
        .from("automacoes_mensagem")
        .select("id,nome,canal,gatilho,dias_deslocamento,mensagem,incluir_pagamento,ativo,criado_em,atualizado_em")
        .eq("empresa_id", empresaId)
        .order("criado_em", { ascending: true }),
      context.supabase
        .from("configuracoes_empresa")
        .select("whatsapp_ativo,whatsapp_limite_diario")
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      context.supabase
        .from("mensagens_cobranca")
        .select("id,tipo,status,telefone,mensagem,erro,enviada_em,criado_em,clientes(nome),automacoes_mensagem(nome)")
        .eq("empresa_id", empresaId)
        .order("criado_em", { ascending: false })
        .limit(20),
    ]);

    if (automationsError) throw automationsError;
    if (configError) throw configError;
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
      automations: automations ?? [],
      settings: {
        enabled: Boolean(config?.whatsapp_ativo),
        dailyLimit: Number(config?.whatsapp_limite_diario ?? 30),
      },
      whatsapp: {
        configured: evolutionStatus.configured,
        credentialSource: evolutionStatus.source,
        connection,
        error: connectionError,
      },
      recentMessages: messages ?? [],
    });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha ao carregar automações." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    if (body.action === "settings") {
      const enabled = Boolean(body.enabled);
      const dailyLimit = Number(body.dailyLimit ?? 30);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
        return NextResponse.json({ ok: false, error: "O limite diário precisa estar entre 1 e 100." }, { status: 400 });
      }
      if (enabled) {
        if (!(await evolutionConfigured())) {
          return NextResponse.json({ ok: false, error: "Conecte a Evolution API antes de ativar as automações." }, { status: 409 });
        }
        const state = await getEvolutionConnectionState();
        if (state.state !== "open") {
          return NextResponse.json({ ok: false, error: "O WhatsApp ainda não está conectado (estado open)." }, { status: 409 });
        }
      }

      const { error } = await context.supabase
        .from("configuracoes_empresa")
        .upsert({
          empresa_id: empresaId,
          whatsapp_ativo: enabled,
          whatsapp_limite_diario: dailyLimit,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "empresa_id" });
      if (error) throw error;
      return NextResponse.json({ ok: true, settings: { enabled, dailyLimit } });
    }

    const automation = normalizeAutomation(body);
    const { data, error } = await context.supabase
      .from("automacoes_mensagem")
      .insert({ empresa_id: empresaId, canal: "whatsapp", ...automation })
      .select("id,nome,canal,gatilho,dias_deslocamento,mensagem,incluir_pagamento,ativo,criado_em,atualizado_em")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, automation: data });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha ao criar automação.";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("precisa") || message.includes("invál") ? 400 : 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ ok: false, error: "Automação não informada." }, { status: 400 });

    const automation = normalizeAutomation(body);
    const { data, error } = await context.supabase
      .from("automacoes_mensagem")
      .update({ ...automation, atualizado_em: new Date().toISOString() })
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .select("id,nome,canal,gatilho,dias_deslocamento,mensagem,incluir_pagamento,ativo,criado_em,atualizado_em")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, automation: data });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha ao atualizar automação.";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("precisa") || message.includes("invál") ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await adminContext();
    if (context.error) return context.error;
    const empresaId = context.membership!.empresa_id;
    const body = await request.json().catch(() => ({})) as { id?: string };
    if (!body.id) return NextResponse.json({ ok: false, error: "Automação não informada." }, { status: 400 });

    const { error } = await context.supabase
      .from("automacoes_mensagem")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Falha ao excluir automação." }, { status: 500 });
  }
}
