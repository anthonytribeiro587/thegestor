import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?erro=Link+de+confirmação+inválido", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    return NextResponse.redirect(new URL("/login?erro=Não+foi+possível+confirmar+o+e-mail", request.url));
  }

  return NextResponse.redirect(new URL("/login?sucesso=E-mail+confirmado.+Entre+para+continuar", request.url));
}
