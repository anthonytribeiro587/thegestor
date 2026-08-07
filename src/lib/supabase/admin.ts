import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function supabaseAdminKeyConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !adminKey) {
    throw new Error("Supabase secret key não configurada no servidor.");
  }

  return createSupabaseClient(url, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
