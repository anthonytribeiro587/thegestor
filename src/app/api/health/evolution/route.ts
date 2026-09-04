import { NextResponse } from "next/server";
import { getEvolutionConfigurationStatus, getEvolutionConnectionState } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getEvolutionConfigurationStatus();
  let connection: { instance: string; state: string } | null = null;
  let error = status.error;

  if (status.configured) {
    try {
      connection = await getEvolutionConnectionState();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Falha ao consultar Evolution.";
    }
  }

  return NextResponse.json({
    ok: status.configured && connection?.state === "open",
    configured: status.configured,
    credentialSource: status.source,
    connection,
    error,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
