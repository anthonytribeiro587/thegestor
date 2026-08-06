import { parseClientSpreadsheetRows } from "@/lib/client-import";
import { createClient } from "@/lib/supabase/server";
import { readFirstWorksheetFromXlsx } from "@/lib/xlsx-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return Response.json({ error: "Sessão inválida." }, { status: 401 });

  try {
    const formData = await request.formData();
    const value = formData.get("file");
    if (!(value instanceof File)) return Response.json({ error: "Envie um arquivo XLSX." }, { status: 400 });
    if (!value.name.toLowerCase().endsWith(".xlsx")) return Response.json({ error: "Selecione uma planilha .xlsx." }, { status: 400 });
    if (value.size > 5 * 1024 * 1024) return Response.json({ error: "A planilha deve ter no máximo 5 MB." }, { status: 413 });

    const buffer = Buffer.from(await value.arrayBuffer());
    const rows = readFirstWorksheetFromXlsx(buffer);
    const summary = parseClientSpreadsheetRows(rows);
    return Response.json(summary);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Não foi possível ler a planilha.";
    return Response.json({ error: message }, { status: 400 });
  }
}
