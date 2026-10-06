import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, CreditCard, LockKeyhole, Menu, MessageCircle, UsersRound, Wallet } from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "TheGestor | Clientes e cobranças organizados",
  description: "Centralize clientes, vencimentos, pagamentos, planos e renovações em uma operação simples.",
  openGraph: {
    title: "TheGestor | Clientes e cobranças organizados",
    description: "Centralize clientes, vencimentos, pagamentos, planos e renovações em uma operação simples.",
    locale: "pt_BR",
    type: "website",
  },
};

const features = [
  [UsersRound, "Gestão de clientes", "Cadastros, planos, ciclos e histórico reunidos em uma visão clara."],
  [CalendarClock, "Cobranças recorrentes", "Acompanhe vencimentos, pagamentos parciais, saldos e renovações."],
  [Wallet, "Créditos e pagamentos", "Consulte créditos usados e previstos junto à operação."],
  [MessageCircle, "Automações e WhatsApp", "Organize cobranças automatizadas com integração Evolution."],
  [CreditCard, "Mercado Pago e Pix", "Conecte pagamentos pelo Mercado Pago dentro do fluxo de cobranças."],
  [LockKeyhole, "Acesso por perfil", "Perfis ADMIN e OPERADOR com dados separados por empresa."],
] as const;

export default function Home() {
  return (
    <main className={styles.landing}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="TheGestor, início"><span className={styles.logoMark}><CreditCard size={21} /></span>thegestor</Link>
        <nav className={styles.desktopNav} aria-label="Navegação principal">
          <a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#seguranca">Segurança</a><a href="#faq">FAQ</a>
        </nav>
        <div className={styles.headerActions}><Link className={styles.loginLink} href="/login">Entrar</Link><Link className={styles.primaryButton} href="/cadastro">Começar agora</Link></div>
        <details className={styles.mobileMenu}>
          <summary aria-label="Abrir menu"><Menu size={21} /></summary>
          <nav aria-label="Navegação móvel"><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#seguranca">Segurança</a><a href="#faq">FAQ</a><Link href="/login">Entrar</Link><Link href="/cadastro">Começar agora</Link></nav>
        </details>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Gestão de cobranças recorrentes</span>
          <h1>Controle clientes, cobranças e renovações sem depender de planilhas.</h1>
          <p>Centralize vencimentos, pagamentos, planos, créditos e automações em uma operação simples.</p>
          <div className={styles.heroActions}><Link className={styles.primaryButton} href="/cadastro">Começar agora <ArrowRight size={16} /></Link><Link className={styles.secondaryButton} href="/login">Já tenho conta</Link></div>
          <div className={styles.heroNote}><Check size={15} /> Organize o que sua operação já precisa acompanhar</div>
        </div>
        <div className={styles.preview} aria-label="Representação ilustrativa da interface do TheGestor">
          <div className={styles.previewTop}><div><span className={styles.previewMark}><CreditCard size={14} /></span><b>thegestor</b></div><span className={styles.previewAdmin}>ADMIN</span></div>
          <div className={styles.previewTitle}><div><small>VISÃO OPERACIONAL</small><strong>Clientes e cobranças</strong></div><span>Todos os ciclos⌄</span></div>
          <div className={styles.previewStats}><div><small>Vencimentos</small><b>Acompanhar</b><i /></div><div><small>Pagamentos</small><b>Organizados</b><i /></div><div><small>Renovações</small><b>Em fluxo</b><i /></div></div>
          <div className={styles.previewTable}><div className={styles.previewTableHead}><span>OPERAÇÃO</span><span>PERÍODO</span><span>STATUS</span></div>
            {[ ["Cobrança recorrente", "Este ciclo", "A vencer"], ["Pagamento recebido", "Ciclo atual", "Pago"], ["Renovação de plano", "Próximo ciclo", "Pendente"] ].map(([name, due, status]) => <div className={styles.previewRow} key={name}><span><i><Check size={11} /></i>{name}</span><span>{due}</span><span className={status === "Pago" ? styles.paid : styles.pending}>{status}</span></div>)}
          </div>
          <div className={styles.previewCaption}>Representação ilustrativa do produto</div>
        </div>
      </section>

      <section className={styles.section} id="recursos"><div className={styles.sectionIntro}><span className={styles.eyebrow}>Recursos</span><h2>Uma operação organizada em um só lugar.</h2><p>Ferramentas para acompanhar a rotina de clientes e cobranças com mais clareza.</p></div>
        <div className={styles.featureGrid}>{features.map(([Icon, title, body]) => <article className={styles.feature} key={title}><span><Icon size={19} /></span><h3>{title}</h3><p>{body}</p></article>)}</div>
        <p className={styles.featureNote}>Também inclui planos e preços, vencimentos, renovação de ciclos e operação multiempresa com isolamento de dados.</p>
      </section>

      <section className={styles.stepsSection} id="como-funciona"><div className={styles.sectionIntro}><span className={styles.eyebrow}>Como funciona</span><h2>Comece simples. Evolua no seu ritmo.</h2></div><div className={styles.steps}>{[["01", "Cadastre ou importe seus clientes", "Organize clientes e associe cada um a um plano."], ["02", "Acompanhe cobranças e renovações", "Veja vencimentos, pagamentos e ciclos em andamento."], ["03", "Automatize gradualmente", "Conecte os recursos de cobrança conforme sua operação evolui."]] .map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>

      <section className={styles.security} id="seguranca"><span className={styles.securityIcon}><LockKeyhole size={22} /></span><div><span className={styles.eyebrow}>Segurança</span><h2>Informações acessíveis a quem precisa.</h2><p>Os dados são separados por empresa. O acesso segue o perfil de cada pessoa, valores financeiros permanecem protegidos para operadores e integrações sensíveis são executadas no backend.</p></div></section>

      <section className={styles.faq} id="faq"><div className={styles.sectionIntro}><span className={styles.eyebrow}>FAQ</span><h2>Dúvidas frequentes</h2></div><div className={styles.faqGrid}>{[
        ["Posso importar clientes?", "Sim. A área de clientes permite sincronizar uma planilha."], ["Posso controlar vencimentos?", "Sim. Clientes e cobranças podem ser acompanhados por vencimento."], ["Posso trabalhar com mensal e trimestral?", "Sim. A renovação permite escolher ciclos mensal ou trimestral quando aplicável."], ["O operador vê valores financeiros?", "Não. O perfil operador não tem acesso aos valores financeiros protegidos."], ["Posso conectar WhatsApp?", "Sim. A integração disponível usa Evolution API."], ["Posso usar Mercado Pago?", "Sim. O fluxo de cobranças oferece integração com Mercado Pago e Pix."], ["Funciona no celular?", "Sim. As telas do produto são adaptadas para dispositivos móveis."],
      ].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

      <section className={styles.finalCta}><span className={styles.eyebrow}>TheGestor</span><h2>Organize suas cobranças em um só lugar.</h2><p>Tenha clientes, vencimentos e renovações mais fáceis de acompanhar.</p><div><Link className={styles.lightButton} href="/cadastro">Começar agora <ArrowRight size={16} /></Link><Link className={styles.ctaLogin} href="/login">Entrar</Link></div></section>

      <footer className={styles.footer}><Link href="/" className={styles.logo}><span className={styles.logoMark}><CreditCard size={19} /></span>thegestor</Link><span>Gestão simples de clientes e cobranças.</span><Link href="#recursos">Produto</Link><small>© {new Date().getFullYear()} TheGestor</small></footer>
    </main>
  );
}
