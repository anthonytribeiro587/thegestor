"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function ensureCompanyForCurrentUser() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  const { data: existing } = await supabase
    .from("usuarios_empresa")
    .select("empresa_id, papel")
    .eq("user_id", userData.user.id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const metadata = userData.user.user_metadata ?? {};
  const companyName = typeof metadata.company_name === "string" && metadata.company_name.trim()
    ? metadata.company_name.trim()
    : "Minha empresa";
  const displayName = typeof metadata.full_name === "string" && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : userData.user.email?.split("@")[0] ?? "Administrador";

  const { error: companyError } = await supabase.rpc("criar_empresa", {
    p_nome: companyName,
    p_slug: null,
    p_nome_exibicao: displayName,
  });

  if (companyError) {
    console.error("Falha ao criar empresa inicial:", companyError.message);
    return null;
  }

  const { data: created } = await supabase
    .from("usuarios_empresa")
    .select("empresa_id, papel")
    .eq("user_id", userData.user.id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  return created;
}

export async function loginAction(formData: FormData) {
  const email = safeText(formData.get("email")).toLowerCase();
  const password = safeText(formData.get("password"));

  if (!email || !password) {
    redirect("/login?erro=Preencha+e-mail+e+senha");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?erro=E-mail+ou+senha+inválidos");
  }

  const membership = await ensureCompanyForCurrentUser();
  redirect(membership?.papel === "operador" ? "/operador" : "/dashboard");
}

export async function registerAction(formData: FormData) {
  const companyName = safeText(formData.get("companyName"));
  const fullName = safeText(formData.get("fullName"));
  const email = safeText(formData.get("email")).toLowerCase();
  const password = safeText(formData.get("password"));
  const confirmPassword = safeText(formData.get("confirmPassword"));

  if (!companyName || !fullName || !email || !password) {
    redirect("/cadastro?erro=Preencha+todos+os+campos+obrigatórios");
  }

  if (password.length < 8) {
    redirect("/cadastro?erro=A+senha+deve+ter+ao+menos+8+caracteres");
  }

  if (password !== confirmPassword) {
    redirect("/cadastro?erro=As+senhas+não+coincidem");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
      },
    },
  });

  if (error) {
    redirect(`/cadastro?erro=${encodeURIComponent(error.message)}`);
  }

  if (data.session) {
    const membership = await ensureCompanyForCurrentUser();
    redirect(membership?.papel === "operador" ? "/operador" : "/dashboard");
  }

  redirect("/login?sucesso=Conta+criada.+Confirme+seu+e-mail+e+depois+entre");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
