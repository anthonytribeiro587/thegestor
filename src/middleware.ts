import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/clientes/:path*",
    "/cobrancas/:path*",
    "/integracoes/:path*",
    "/usuarios/:path*",
    "/configuracoes/:path*",
    "/operador/:path*",
  ],
};
