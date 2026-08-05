"use client";

import { X } from "lucide-react";

export function ClientDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Novo cliente">
        <div className="drawer-header">
          <div><h2>Novo cliente</h2><p>Cadastre os dados principais</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onClose(); }}>
          <label>Nome completo<input required placeholder="Ex.: João da Silva" /></label>
          <label>Telefone/WhatsApp<input required placeholder="(51) 99999-9999" /></label>
          <label>E-mail<input type="email" placeholder="cliente@email.com" /></label>
          <label>Plano<select defaultValue=""><option value="" disabled>Selecione o plano</option><option>Mensal</option><option>Trimestral</option><option>Semestral</option></select></label>
          <div className="form-grid-2">
            <label>Valor da mensalidade<input inputMode="decimal" placeholder="R$ 0,00" /></label>
            <label>Dia de vencimento<select defaultValue="10">{[5, 10, 15, 20, 25, 30].map((day) => <option key={day}>{day}</option>)}</select></label>
          </div>
          <label>Observações<textarea rows={5} maxLength={300} placeholder="Informações adicionais sobre o cliente..." /></label>
          <div className="drawer-actions"><button className="button primary" type="submit">Salvar cliente</button><button className="button secondary" type="button" onClick={onClose}>Cancelar</button></div>
        </form>
      </aside>
    </div>
  );
}
