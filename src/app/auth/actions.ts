"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type AuthActionState,
  looksLikeExistingSupabaseUser,
  validateLoginInput,
  validateRegistrationInput,
} from "@/lib/auth-validation";

function safeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

type AuthUserInput = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

async function ensureCompanyForUser(user: AuthUserInput) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("usuarios_empresa")
    .select("empresa_id, papel")
    .eq("user_id", user.id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const metadata = user.user_metadata ?? {};
  const companyName = typeof metadata.company_name === "string" && metadata.company_name.trim()
    ? metadata.company_name.trim()
    : "Minha empresa";
  const displayName = typeof metadata.full_name === "string" && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : user.email?.split("@")[0] ?? "Administrador";

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
    .eq("user_id", user.id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  return created;
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = safeText(formData.get("email")).toLowerCase();
  const password = safeText(formData.get("password"));
  const validationError = validateLoginInput(email, password);

  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return {
      status: "error",
      message: "E-mail ou senha inválidos. Se acabou de criar a conta, confirme o e-mail primeiro.",
    };
  }

  const membership = await ensureCompanyForUser(data.user);
  if (!membership) {
    await supabase.auth.signOut();
    return { status: "error", message: "Não foi possível preparar sua empresa. Tente novamente." };
  }

  redirect(membership.papel === "operador" ? "/operador" : "/dashboard");
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = {
    companyName: safeText(formData.get("companyName")),
    fullName: safeText(formData.get("fullName")),
    email: safeText(formData.get("email")).toLowerCase(),
    password: safeText(formData.get("password")),
    confirmPassword: safeText(formData.get("confirmPassword")),
  };

  const validationError = validateRegistrationInput(input);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        company_name: input.companyName,
      },
    },
  });

  if (error) {
    return { status: "error", message: "Não foi possível criar a conta agora. Tente novamente." };
  }

  if (looksLikeExistingSupabaseUser(data.user)) {
    return {
      status: "error",
      message: "Este e-mail já está cadastrado. Confirme o e-mail recebido ou entre na sua conta.",
    };
  }

  if (!data.user) {
    return { status: "error", message: "Não foi possível criar a conta. Tente novamente." };
  }

  if (data.session) {
    const membership = await ensureCompanyForUser(data.user);
    if (!membership) {
      await supabase.auth.signOut();
      return { status: "error", message: "Conta criada, mas a empresa não pôde ser preparada." };
    }
    redirect(membership.papel === "operador" ? "/operador" : "/dashboard");
  }

  return {
    status: "success",
    message: "Conta criada. Enviamos um e-mail de confirmação. Confirme o endereço e depois entre.",
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
