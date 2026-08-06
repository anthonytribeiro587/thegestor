"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/app/auth/actions";
import { initialAuthState } from "@/lib/auth-validation";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialAuthState);

  if (state.status === "success") {
    return (
      <div className="auth-success-panel" role="status">
        <div className="auth-feedback success">{state.message}</div>
        <p>Depois de confirmar seu e-mail, você pode entrar normalmente.</p>
        <Link className="button primary auth-submit auth-link-button" href="/login">Ir para entrar</Link>
      </div>
    );
  }

  return (
    <form className="form-stack" action={formAction}>
      {state.message ? <div className="auth-feedback error" role="alert">{state.message}</div> : null}
      <label>Nome da empresa<input name="companyName" required placeholder="Digite o nome da sua empresa" /></label>
      <label>Seu nome<input name="fullName" autoComplete="name" required placeholder="Digite seu nome completo" /></label>
      <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="seu@email.com.br" /></label>
      <label>Senha<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="Crie uma senha segura" /></label>
      <label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required placeholder="Confirme sua senha" /></label>
      <button className="button primary auth-submit" type="submit" disabled={pending}>
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
    </form>
  );
}
