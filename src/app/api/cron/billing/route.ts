import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function saoPauloDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function competence(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = saoPauloDateParts();
    const admin = createAdminClient();
    const currentCompetence = competence(today.year, today.month);

    const { data: current, error: currentError } = await admin.rpc("gerar_cobrancas_mensais_sistema", {
      p_competencia: currentCompetence,
    });
    if (currentError) throw currentError;

    let upcoming: unknown = null;
    if (today.day >= 25) {
      const next = nextMonth(today.year, today.month);
      const { data, error } = await admin.rpc("gerar_cobrancas_mensais_sistema", {
        p_competencia: competence(next.year, next.month),
      });
      if (error) throw error;
      upcoming = data;
    }

    return NextResponse.json({
      ok: true,
      date: `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
      current,
      upcoming,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Falha no motor mensal de cobranças.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
