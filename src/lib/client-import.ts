export type ImportClient = {
  nome: string;
  dia_vencimento: number;
  observacoes: string | null;
  creditos_utilizados: number;
  creditos_previstos: number;
  valor_negociado: number;
  valor_pago: number;
  valor_a_receber: number;
  parcela_atual: number | null;
  parcelas_total: number | null;
};

export type ImportSummary = {
  clients: ImportClient[];
  totalClients: number;
  creditsUsed: number;
  creditsExpected: number;
  negotiated: number;
  paid: number;
  receivable: number;
};

type Cell = string | number | boolean | Date | null | undefined;

function cleanText(value: Cell) {
  return String(value ?? "").trim();
}

function numberValue(value: Cell) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = cleanText(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: Cell) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function appendNote(base: string, extra: string) {
  const cleanBase = base.trim();
  const cleanExtra = extra.trim();
  if (!cleanBase) return cleanExtra;
  if (!cleanExtra) return cleanBase;
  return `${cleanBase} · ${cleanExtra}`;
}

export function parseClientName(rawName: string, rawNotes = "") {
  let name = rawName.trim();
  let notes = rawNotes.trim();
  let parcelaAtual: number | null = null;
  let parcelasTotal: number | null = null;

  const parenthetical = name.match(/\s*\(([^)]+)\)\s*$/);
  if (parenthetical) {
    notes = appendNote(notes, parenthetical[1]);
    name = name.slice(0, parenthetical.index).trim();
  }

  const untilDate = name.match(/\s+(Até|Ate)\s+(\d{1,2}\/\d{1,2})\s*$/i);
  if (untilDate) {
    notes = appendNote(notes, `Até ${untilDate[2]}`);
    name = name.slice(0, untilDate.index).trim();
  }

  const installment = name.match(/\s+(\d+)\s*\/\s*(\d+)\s*$/);
  if (installment) {
    parcelaAtual = Number(installment[1]);
    parcelasTotal = Number(installment[2]);
    name = name.slice(0, installment.index).trim();
  }

  return {
    name,
    notes: notes || null,
    currentInstallment: parcelaAtual,
    totalInstallments: parcelasTotal,
  };
}

export function parseClientSpreadsheetRows(rows: Cell[][]): ImportSummary {
  if (!rows.length) throw new Error("A planilha está vazia.");

  const header = rows[0].map(normalizeHeader);
  const required = {
    client: "cliente",
    dueDay: "diadepagamento",
    notes: "obs",
    creditsUsed: "creditos",
    creditsExpected: "creditosprevistos",
    negotiated: "valornegociado",
    paid: "valorpago",
    receivable: "valorareceber",
  } as const;

  const indexes = Object.fromEntries(
    Object.entries(required).map(([key, normalized]) => [key, header.indexOf(normalized)]),
  ) as Record<keyof typeof required, number>;

  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => required[key as keyof typeof required]);

  if (missing.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missing.join(", ")}.`);
  }

  const clients: ImportClient[] = [];

  for (const row of rows.slice(1)) {
    const rawName = cleanText(row[indexes.client]);
    if (!rawName || normalizeHeader(rawName) === "totalpmes") continue;

    const dueDay = Math.trunc(numberValue(row[indexes.dueDay]));
    if (dueDay < 1 || dueDay > 31) {
      throw new Error(`Dia de pagamento inválido para ${rawName}.`);
    }

    const parsedName = parseClientName(rawName, cleanText(row[indexes.notes]));
    const creditsUsed = Math.max(0, Math.trunc(numberValue(row[indexes.creditsUsed])));
    const creditsExpected = Math.max(0, Math.trunc(numberValue(row[indexes.creditsExpected])));
    const negotiated = Math.max(0, numberValue(row[indexes.negotiated]));
    const paid = Math.max(0, numberValue(row[indexes.paid]));
    const receivable = Math.max(0, numberValue(row[indexes.receivable]));

    clients.push({
      nome: parsedName.name,
      dia_vencimento: dueDay,
      observacoes: parsedName.notes,
      creditos_utilizados: creditsUsed,
      creditos_previstos: creditsExpected,
      valor_negociado: negotiated,
      valor_pago: paid,
      valor_a_receber: receivable,
      parcela_atual: parsedName.currentInstallment,
      parcelas_total: parsedName.totalInstallments,
    });
  }

  if (!clients.length) throw new Error("Nenhum cliente válido foi encontrado na planilha.");

  return {
    clients,
    totalClients: clients.length,
    creditsUsed: clients.reduce((sum, item) => sum + item.creditos_utilizados, 0),
    creditsExpected: clients.reduce((sum, item) => sum + item.creditos_previstos, 0),
    negotiated: clients.reduce((sum, item) => sum + item.valor_negociado, 0),
    paid: clients.reduce((sum, item) => sum + item.valor_pago, 0),
    receivable: clients.reduce((sum, item) => sum + item.valor_a_receber, 0),
  };
}
