import Link from "next/link";
import { BarChart3, Clock3, CreditCard, ShieldCheck } from "lucide-react";
import { registerAction } from "@/app/auth/actions";

type RegisterPageProps = {
  searchParams: Promise<{ erro?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-logo"><span className="brand-mark"><CreditCard /></span>thegestor</div>
        <h1>Organize as cobranças<br />sem complicar a operação.</h1>
        <p>Comece com uma estrutura simples e corporativa, pronta para evoluir com integrações e automações.</p>
        <div className="auth-benefits">
          <div className="auth-benefit"><span><BarChart3 size={19} /></span><div><b>Dashboard administrativo</b><small>Indicadores úteis sem excesso de informação.</small></div></div>
          <div className="auth-benefit"><span><ShieldCheck size={19} /></span><div><b>Controle de acesso</b><small>Perfis de administrador e operador separados.</small></div></div>
          <div className="auth-benefit"><span><Clock3 size={19} /></span><div><b>Automação progressiva</b><small>Mercado Pago e WhatsApp entram sem travar o restante do sistema.</small></div></div>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-tabs"><Link href="/login">Entrar</Link><Link className="active" href="/cadastro">Criar conta</Link></div>
          {params.erro ? <div role="alert" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#ffeded", color: "#b4232b", fontSize: 12 }}>{params.erro}</div> : null}
          <form className="form-stack" action={registerAction}>
            <label>Nome da empresa<input name="companyName" required placeholder="Digite o nome da sua empresa" /></label>
            <label>Seu nome<input name="fullName" autoComplete="name" required placeholder="Digite seu nome completo" /></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="seu@email.com.br" /></label>
            <label>Senha<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="Crie uma senha segura" /></label>
            <label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required placeholder="Confirme sua senha" /></label>
            <button className="button primary auth-submit" type="submit">Criar conta</button>
          </form>
          <p className="auth-note">Já tem conta? <Link href="/login">Entrar</Link></p>
        </div>
      </section>
    </div>
  );
}
