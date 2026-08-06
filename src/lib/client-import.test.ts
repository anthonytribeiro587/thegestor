import { describe, expect, it } from "vitest";
import { parseClientName, parseClientSpreadsheetRows } from "./client-import";

describe("parseClientName", () => {
  it("separa progresso de mensalidades do nome", () => {
    expect(parseClientName("Wagner 2/3", "Lazer Uniplay")).toEqual({
      name: "Wagner",
      notes: "Lazer Uniplay",
      currentInstallment: 2,
      totalInstallments: 3,
    });
  });

  it("move observacoes do nome para o campo de observacao", () => {
    expect(parseClientName("Lucas Campos 3/3 (Acabou trimestral)", "Lazer Play")).toEqual({
      name: "Lucas Campos",
      notes: "Lazer Play · Acabou trimestral",
      currentInstallment: 3,
      totalInstallments: 3,
    });
  });

  it("move data anotada no nome para observacoes", () => {
    expect(parseClientName("Aldonei Rohers Até 10/08", "UNITV")).toEqual({
      name: "Aldonei Rohers",
      notes: "UNITV · Até 10/08",
      currentInstallment: null,
      totalInstallments: null,
    });
  });
});

describe("parseClientSpreadsheetRows", () => {
  it("calcula os totais da planilha sem importar a linha de total", () => {
    const summary = parseClientSpreadsheetRows([
      ["Cliente", "Dia de Pagamento", "Obs.", "Créditos", "Creditos Previstos", "Valor Negociado", "Valor Pago", "Valor a Receber"],
      ["Cliente A", 1, "Player", 1, 0, 30, 30, 0],
      ["Cliente B 2/3", 10, "Player 2", 0, 2, 50, 0, 50],
      ["Total p/ mês", null, null, 1, 2, 80, 30, 50],
    ]);

    expect(summary.totalClients).toBe(2);
    expect(summary.creditsUsed).toBe(1);
    expect(summary.creditsExpected).toBe(2);
    expect(summary.negotiated).toBe(80);
    expect(summary.paid).toBe(30);
    expect(summary.receivable).toBe(50);
    expect(summary.clients[1].nome).toBe("Cliente B");
    expect(summary.clients[1].parcela_atual).toBe(2);
  });
});
