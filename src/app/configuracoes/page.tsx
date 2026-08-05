import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader title="Configurações" subtitle="Preferências gerais do ambiente" />
      <section className="grid-2">
        <div className="card"><div className="card-header"><h2>Empresa</h2></div><div className="card-body"><form className="form-stack"><label>Nome exibido<input defaultValue="Minha empresa" /></label><label>E-mail administrativo<input defaultValue="admin@empresa.com" type="email" /></label><label>Fuso horário<select defaultValue="America/Sao_Paulo"><option value="America/Sao_Paulo">America/Sao_Paulo</option></select></label><button className="button primary" type="button">Salvar alterações</button></form></div></div>
        <div className="card"><div className="card-header"><h2>Regras de cobrança</h2></div><div className="card-body"><form className="form-stack"><label>Primeiro lembrete<select defaultValue="3"><option value="3">3 dias antes</option><option value="1">1 dia antes</option></select></label><label>Lembrete no vencimento<select defaultValue="yes"><option value="yes">Ativado</option><option value="no">Desativado</option></select></label><label>Após vencimento<select defaultValue="1"><option value="1">1 dia depois</option><option value="3">3 dias depois</option></select></label><button className="button primary" type="button">Salvar regras</button></form></div></div>
      </section>
    </AppShell>
  );
}
