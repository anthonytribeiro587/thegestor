"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/auth/actions";
import { initialAuthState } from "@/lib/auth-validation";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialAuthState);

  return (
    <form className="form-stack" action={formAction}>
      {state.message ? (
        <div className={`auth-feedback ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}
      <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="seu@email.com.br" /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required placeholder="Digite sua senha" /></label>
      <button className="button primary auth-submit" type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
