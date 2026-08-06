export type AuthActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialAuthState: AuthActionState = { status: "idle" };

export function validateLoginInput(email: string, password: string): string | null {
  if (!email || !password) return "Preencha e-mail e senha.";
  if (!email.includes("@")) return "Informe um e-mail válido.";
  return null;
}

export function validateRegistrationInput(input: {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  if (!input.companyName || !input.fullName || !input.email || !input.password) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (!input.email.includes("@")) return "Informe um e-mail válido.";
  if (input.password.length < 8) return "A senha deve ter ao menos 8 caracteres.";
  if (input.password !== input.confirmPassword) return "As senhas não coincidem.";
  return null;
}

export function looksLikeExistingSupabaseUser(user: { identities?: unknown[] | null } | null): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
