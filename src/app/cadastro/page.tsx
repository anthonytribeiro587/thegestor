import Link from "next/link";
import { BarChart3, Clock3, CreditCard, ShieldCheck } from "lucide-react";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
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
          <RegisterForm />
          <p className="auth-note">Já tem conta? <Link href="/login">Entrar</Link></p>
        </div>
      </section>
    </div>
  );
}
