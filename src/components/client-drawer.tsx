"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ClientDrawer({
  open,
  onClose,
  empresaId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  empresaId: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresaId || saving) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const value = Number(String(data.get("valor") ?? "0").replace(",", "."));
    const dueDay = Number(data.get("diaVencimento"));
    const credits = Number(data.get("creditos"));

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("cadastrar_cliente_com_assinatura", {
        p_empresa_id: empresaId,
        p_nome: String(data.get("nome") ?? "").trim(),
        p_telefone: String(data.get("telefone") ?? "").trim() || null,
        p_email: String(data.get("email") ?? "").trim() || null,
        p_plano_nome: String(data.get("plano") ?? "Mensal").trim(),
        p_valor: Number.isFinite(value) ? value : 0,
        p_dia_vencimento: dueDay,
        p_observacoes: String(data.get("observacoes") ?? "").trim() || null,
        p_creditos: Number.isFinite(credits) ? credits : 1,
        p_parcela_atual: null,
        p_parcelas_total: null,
      });

      if (rpcError) throw rpcError;

      form.reset();
      await onSaved();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar o cliente.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={saving ? undefined : onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Novo cliente">
        <div className="drawer-header">
          <div><h2>Novo cliente</h2><p>Cadastre os dados principais da cobrança</p></div>
          <button className="icon-button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={20} /></button>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>Nome completo<input name="nome" required minLength={2} placeholder="Ex.: João da Silva" /></label>
          <label>Telefone/WhatsApp <small style={{ color: "#8290a5", fontWeight: 500 }}>Opcional</small><input name="telefone" placeholder="(51) 99999-9999" /></label>
          <label>E-mail <small style={{ color: "#8290a5", fontWeight: 500 }}>Opcional</small><input name="email" type="email" placeholder="cliente@email.com" /></label>
          <label>Plano<input name="plano" required defaultValue="Mensal" placeholder="Ex.: Mensal" /></label>
          <div className="form-grid-2">
            <label>Valor negociado<input name="valor" type="number" min="0" step="0.01" inputMode="decimal" required placeholder="0,00" /></label>
            <label>Créditos por mês<input name="creditos" type="number" min="0" step="1" defaultValue="1" required /></label>
          </div>
          <label>Dia de vencimento<select name="diaVencimento" defaultValue="10">{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
          <label>Observações<textarea name="observacoes" rows={5} maxLength={300} placeholder="Player, aparelho ou alguma observação operacional..." /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <div className="drawer-actions"><button className="button primary" disabled={saving || !empresaId} type="submit">{saving ? "Salvando..." : "Salvar cliente"}</button><button className="button secondary" disabled={saving} type="button" onClick={onClose}>Cancelar</button></div>
        </form>
      </aside>
    </div>
  );
}
