import Link from "next/link";
import { BarChart3, Clock3, CreditCard, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-logo"><span className="brand-mark"><CreditCard /></span>thegestor</div>
        <h1>Mais controle.<br />Menos inadimplência.<br />Melhores resultados.</h1>
        <p>Uma plataforma simples para organizar clientes, acompanhar cobranças recorrentes e entregar uma fila operacional clara para sua equipe.</p>
        <div className="auth-benefits">
          <div className="auth-benefit"><span><BarChart3 size={19} /></span><div><b>Visão objetiva da operação</b><small>Vencimentos, atrasos e pagamentos confirmados no mesmo lugar.</small></div></div>
          <div className="auth-benefit"><span><ShieldCheck size={19} /></span><div><b>Permissões por perfil</b><small>O operador trabalha sem visualizar valores financeiros.</small></div></div>
          <div className="auth-benefit"><span><Clock3 size={19} /></span><div><b>Menos trabalho manual</b><small>Estrutura preparada para automações de cobrança e confirmação.</small></div></div>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-tabs"><Link className="active" href="/login">Entrar</Link><Link href="/cadastro">Criar conta</Link></div>
          <form className="form-stack" action="/dashboard">
            <label>E-mail<input type="email" required placeholder="seu@email.com.br" /></label>
            <label>Senha<input type="password" required placeholder="Digite sua senha" /></label>
            <button className="button primary auth-submit" type="submit">Entrar</button>
          </form>
          <p className="auth-note">Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></p>
        </div>
      </section>
    </div>
  );
}
