"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, QrCode, X } from "lucide-react";
import { formatDateBR } from "@/lib/billing";
import { currency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import styles from "./charge-actions-drawer.module.css";

type PaymentRow = {
  id: string;
  metodo: string | null;
  status: string;
  pago_em: string | null;
  criado_em: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  pix_ticket_url: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  expira_em: string | null;
};

type ChargeDetail = {
  id: string;
  competencia: string;
  vencimento: string;
  status_pagamento: string;
  pago_em: string | null;
  creditos_utilizados: number | null;
  creditos_previstos: number | null;
  clientes: { nome: string; email: string | null; observacoes_operacionais: string | null } | { nome: string; email: string | null; observacoes_operacionais: string | null }[] | null;
  assinaturas: { planos: { nome: string } | { nome: string }[] | null } | { planos: { nome: string } | { nome: string }[] | null }[] | null;
  cobrancas_financeiras: { valor_original: number; valor_pago: number | null } | { valor_original: number; valor_pago: number | null }[] | null;
  pagamentos: PaymentRow[] | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function label(status: string, original: number, paid: number) {
  if (status === "pago") return "Pago";
  if (paid > 0 && paid < original) return "Parcial";
  if (status === "atrasado") return "Atrasado";
  return "Pendente";
}

function latestMercadoPagoPix(payments: PaymentRow[] | null | undefined) {
  return (payments ?? [])
    .filter((item) => item.provider_order_id && item.metodo === "pix")
    .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))[0] ?? null;
}

export function ChargeActionsDrawer({ open, chargeId, empresaId, onClose, onSaved }: {
  open: boolean;
  chargeId: string | null;
  empresaId: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<ChargeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentValue, setPaymentValue] = useState("");
  const [method, setMethod] = useState("manual");

  const loadDetail = useCallback(async () => {
    if (!open || !chargeId || !empresaId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("cobrancas")
        .select("id,competencia,vencimento,status_pagamento,pago_em,creditos_utilizados,creditos_previstos,clientes(nome,email,observacoes_operacionais),assinaturas(planos(nome)),cobrancas_financeiras(valor_original,valor_pago),pagamentos(id,metodo,status,pago_em,criado_em,provider_order_id,provider_payment_id,pix_ticket_url,pix_qr_code,pix_qr_code_base64,expira_em)")
        .eq("empresa_id", empresaId)
        .eq("id", chargeId)
        .single();
      if (queryError) throw queryError;
      const next = data as unknown as ChargeDetail;
      setDetail(next);
      const financial = first(next.cobrancas_financeiras);
      setPaymentValue(String(Number(financial?.valor_pago ?? 0)));
    } catch (cause) {
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a cobrança.");
    } finally {
      setLoading(false);
    }
  }, [chargeId, empresaId, open]);

  useEffect(() => { if (open) void loadDetail(); }, [open, loadDetail]);

  const financial = first(detail?.cobrancas_financeiras);
  const original = Number(financial?.valor_original ?? 0);
  const paid = Number(financial?.valor_pago ?? 0);
  const balance = Math.max(original - paid, 0);
  const status = useMemo(() => detail ? label(detail.status_pagamento, original, paid) : "Pendente", [detail, original, paid]);
  const pix = latestMercadoPagoPix(detail?.pagamentos);
  const pixExpired = Boolean(pix?.expira_em && Date.parse(pix.expira_em) <= Date.now());

  async function generatePix() {
    if (!detail || generatingPix || balance <= 0) return;
    setGeneratingPix(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/mercadopago/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId: detail.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; reused?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Não foi possível gerar o Pix.");
      setNotice(payload.reused ? "Pix existente reutilizado." : "Pix criado no Mercado Pago.");
      await loadDetail();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o Pix.");
    } finally {
      setGeneratingPix(false);
    }
  }

  async function copyPix() {
    if (!pix?.pix_qr_code) return;
    await navigator.clipboard.writeText(pix.pix_qr_code);
    setNotice("Código Pix copiado.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !empresaId || saving) return;
    const value = Number(paymentValue.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > original) {
      setError(`Informe um valor entre R$ 0,00 e ${currency.format(original)}.`);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("registrar_pagamento_manual", {
        p_empresa_id: empresaId,
        p_cobranca_id: detail.id,
        p_valor_pago: value,
        p_metodo: method,
      });
      if (rpcError) throw rpcError;
      setNotice("Pagamento atualizado manualmente.");
      await onSaved();
      await loadDetail();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (saving || generatingPix) return;
    setDetail(null);
    setError(null);
    setNotice(null);
    onClose();
  }

  const client = first(detail?.clientes);
  const subscription = first(detail?.assinaturas);
  const plan = first(subscription?.planos)?.nome ?? "Mensal";

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={close} />
      <aside className={`drawer ${styles.drawer}`} role="dialog" aria-modal="true" aria-label="Detalhes da cobrança">
        <div className="drawer-header">
          <div><h2>{client?.nome ?? "Detalhes da cobrança"}</h2><p>Pagamento, vencimento e créditos desta competência</p></div>
          <button className="icon-button" onClick={close} disabled={saving || generatingPix} aria-label="Fechar"><X size={20} /></button>
        </div>

        {loading ? <div className="empty-note">Carregando cobrança...</div> : null}
        {error ? <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
        {notice ? <div className="form-success" role="status" style={{ marginBottom: 12 }}>{notice}</div> : null}

        {!loading && detail ? (
          <>
            <div className={styles.summary}>
              <div className={styles.summaryItem}><span>Status</span><strong>{status}</strong><small>{detail.pago_em ? `Quitado em ${formatDateBR(detail.pago_em.slice(0, 10))}` : "Competência em aberto"}</small></div>
              <div className={styles.summaryItem}><span>Plano</span><strong>{plan}</strong><small>Competência {formatDateBR(detail.competencia)}</small></div>
              <div className={styles.summaryItem}><span>Vencimento</span><strong>{formatDateBR(detail.vencimento)}</strong><small>Data da cobrança</small></div>
              <div className={styles.summaryItem}><span>Valor</span><strong>{currency.format(original)}</strong><small>Recebido {currency.format(paid)}</small></div>
              <div className={styles.summaryItem}><span>Saldo</span><strong>{currency.format(balance)}</strong><small>{balance === 0 ? "Quitado" : "Ainda a receber"}</small></div>
              <div className={styles.summaryItem}><span>Créditos</span><strong>{Number(detail.creditos_utilizados ?? 0)} / {Number(detail.creditos_previstos ?? 0)}</strong><small>utilizados / previstos</small></div>
            </div>

            {balance > 0 ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}><h3>Pix Mercado Pago</h3><span className="text-link">{pix ? (pixExpired ? "Expirado" : pix.status) : "Não gerado"}</span></div>
                <div className={styles.sectionBody}>
                  {!pix || pixExpired ? (
                    <div>
                      <div className={styles.balance}>Gere um Pix exclusivo desta cobrança. O webhook identifica a Order e dá baixa automaticamente após confirmação.</div>
                      <div className={styles.actions}><button className="button primary" type="button" onClick={() => void generatePix()} disabled={generatingPix}><QrCode size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{generatingPix ? "Gerando Pix..." : pixExpired ? "Gerar novo Pix" : "Gerar Pix"}</button></div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {pix.pix_qr_code_base64 ? <img src={`data:image/png;base64,${pix.pix_qr_code_base64}`} alt="QR Code Pix" style={{ width: 180, height: 180, objectFit: "contain", border: "1px solid #e3e9f2", borderRadius: 10, padding: 8, background: "white" }} /> : null}
                      <div className={styles.balance}><b>Order:</b> {pix.provider_order_id}<br />{pix.expira_em ? <><b>Validade:</b> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(pix.expira_em))}</> : null}</div>
                      <div className={styles.actions}>
                        <button className="button primary" type="button" onClick={() => void copyPix()} disabled={!pix.pix_qr_code}><Copy size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Copiar Pix</button>
                        {pix.pix_ticket_url ? <a className="button ghost" href={pix.pix_ticket_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center" }}><ExternalLink size={14} style={{ marginRight: 6 }} />Abrir pagamento</a> : null}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            <section className={styles.section}>
              <div className={styles.sectionHead}><h3>Registrar/corrigir pagamento</h3></div>
              <div className={styles.sectionBody}>
                <form onSubmit={submit}>
                  <div className={styles.paymentGrid}>
                    <label>Valor total recebido nesta cobrança<input value={paymentValue} onChange={(event) => setPaymentValue(event.target.value)} inputMode="decimal" placeholder="0,00" /></label>
                    <label>Forma de pagamento<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="manual">Manual</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="cartao">Cartão</option></select></label>
                  </div>
                  <div className={styles.actions}>
                    <button className="button primary" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar pagamento"}</button>
                    {balance > 0 ? <button className="button ghost" type="button" disabled={saving} onClick={() => setPaymentValue(String(original))}><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />Preencher valor total</button> : null}
                  </div>
                </form>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><h3>Observação do cliente</h3></div>
              <div className={styles.sectionBody}><div className={styles.balance}>{client?.observacoes_operacionais || "Nenhuma observação cadastrada."}</div></div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><h3>Registros de pagamento</h3><span className="text-link">{detail.pagamentos?.length ?? 0} registro(s)</span></div>
              {detail.pagamentos?.length ? <div style={{ overflowX: "auto" }}><table className={styles.history}><thead><tr><th>Data</th><th>Método</th><th>Status</th></tr></thead><tbody>{detail.pagamentos.map((item) => <tr key={item.id}><td>{formatDateBR((item.pago_em ?? item.criado_em).slice(0, 10))}</td><td>{item.provider_order_id ? "Mercado Pago / Pix" : item.metodo ?? "Manual"}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <div className={styles.sectionBody}><span className={styles.balance}>Nenhum pagamento registrado.</span></div>}
            </section>
          </>
        ) : null}
      </aside>
    </div>
  );
}
