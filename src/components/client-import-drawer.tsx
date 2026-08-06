"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { currency } from "@/lib/format";
import { parseClientSpreadsheetRows, type ImportSummary } from "@/lib/client-import";
import { createClient } from "@/lib/supabase/client";

function currentCompetence() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  return `${year}-${month}-01`;
}

function competenceLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

type ImportResult = {
  importados: number;
  ignorados: number;
  creditos_utilizados: number;
  creditos_previstos: number;
  valor_negociado: number;
  valor_pago: number;
  valor_a_receber: number;
};

export function ClientImportDrawer({
  open,
  onClose,
  empresaId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  empresaId: string | null;
  onImported: () => void | Promise<void>;
}) {
  const competence = useMemo(currentCompetence, []);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCost, setCreditCost] = useState(8);

  useEffect(() => {
    if (!open || !empresaId) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("configuracoes_empresa")
        .select("custo_medio_credito")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!cancelled && data?.custo_medio_credito != null) {
        setCreditCost(Number(data.custo_medio_credito));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, empresaId]);

  function reset() {
    setFileName(null);
    setSummary(null);
    setResult(null);
    setError(null);
  }

  function close() {
    if (reading || saving) return;
    reset();
    onClose();
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Selecione uma planilha .xlsx.");
      return;
    }

    setReading(true);
    setError(null);
    setResult(null);

    try {
      // A versão universal evita Web Worker no bundle do Next. Para uma base pequena,
      // como a planilha atual, é mais simples e previsível.
      const { readSheet } = await import("read-excel-file/universal");
      const rows = await readSheet(file);
      const parsed = parseClientSpreadsheetRows(rows as unknown as Array<Array<string | number | boolean | Date | null>>);
      setFileName(file.name);
      setSummary(parsed);
    } catch (cause) {
      setSummary(null);
      setFileName(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível ler a planilha.");
    } finally {
      setReading(false);
    }
  }

  async function importClients() {
    if (!empresaId || !summary || saving) return;
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("importar_clientes_planilha", {
        p_empresa_id: empresaId,
        p_competencia: competence,
        p_clientes: summary.clients,
      });

      if (rpcError) throw rpcError;
      setResult(data as ImportResult);
      await onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar os clientes.");
    } finally {
      setSaving(false);
    }
  }

  const projectedCredits = summary ? summary.creditsUsed + summary.creditsExpected : 0;

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Importar clientes">
        <div className="drawer-header">
          <div><h2>Importar clientes</h2><p>Importe sua planilha atual sem colocar dados de clientes no GitHub</p></div>
          <button className="icon-button" onClick={close} disabled={reading || saving} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="form-stack">
          <div className="import-box">
            <FileSpreadsheet size={28} />
            <div><b>{fileName ?? "Clientes.xlsx"}</b><small>Competência: {competenceLabel(competence)}</small></div>
            <label className="button secondary import-file-button">
              <Upload size={15} />{reading ? "Lendo..." : "Selecionar .xlsx"}
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} disabled={reading || saving} />
            </label>
          </div>

          {summary ? (
            <div className="import-summary">
              <div><span>Clientes</span><strong>{summary.totalClients}</strong></div>
              <div><span>Créditos utilizados</span><strong>{summary.creditsUsed}</strong></div>
              <div><span>Créditos previstos</span><strong>{summary.creditsExpected}</strong></div>
              <div><span>Créditos no mês</span><strong>{projectedCredits}</strong></div>
              <div><span>Custo/crédito</span><strong>{currency.format(creditCost)}</strong></div>
              <div><span>Custo projetado</span><strong>{currency.format(projectedCredits * creditCost)}</strong></div>
              <div><span>Valor negociado</span><strong>{currency.format(summary.negotiated)}</strong></div>
              <div><span>Pago</span><strong>{currency.format(summary.paid)}</strong></div>
              <div><span>A receber</span><strong>{currency.format(summary.receivable)}</strong></div>
            </div>
          ) : null}

          {summary ? <div className="form-hint">Nomes como <b>2/3</b> serão limpos e o ciclo ficará salvo na assinatura. “Até 10/08” e “Acabou trimestral” serão movidos para observações.</div> : null}

          {result ? (
            <div className="form-success" role="status">
              Importação concluída: {result.importados} clientes incluídos{result.ignorados ? ` e ${result.ignorados} ignorados por já existirem` : ""}.
            </div>
          ) : null}
          {error ? <div className="form-error" role="alert">{error}</div> : null}

          <div className="drawer-actions">
            <button className="button primary" type="button" onClick={importClients} disabled={!empresaId || !summary || saving || Boolean(result)}>
              {saving ? "Importando..." : summary ? `Importar ${summary.totalClients} clientes` : "Selecione a planilha"}
            </button>
            <button className="button secondary" type="button" onClick={close} disabled={reading || saving}>{result ? "Concluir" : "Cancelar"}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
