import { describe, expect, it } from "vitest";
import { parseSharedStringsXml, parseWorksheetXml } from "./xlsx-server";

describe("xlsx server parser", () => {
  it("le shared strings simples e rich text", () => {
    const xml = `<?xml version="1.0"?><sst><si><t>Cliente</t></si><si><r><t>Até </t></r><r><t>10/08</t></r></si></sst>`;
    expect(parseSharedStringsXml(xml)).toEqual(["Cliente", "Até 10/08"]);
  });

  it("preserva colunas ausentes usando a referencia da celula", () => {
    const xml = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>30</v></c></row></sheetData></worksheet>`;
    expect(parseWorksheetXml(xml, ["Cliente"])).toEqual([["Cliente", null, 30]]);
  });

  it("preserva celulas vazias auto-fechadas sem deslocar formulas", () => {
    const xml = `<worksheet><sheetData><row r="82"><c r="A82" t="s"><v>0</v></c><c r="B82"/><c r="C82"/><c r="D82"><f>SUM(D2:D81)</f><v>21</v></c><c r="E82"><v>59</v></c></row></sheetData></worksheet>`;
    expect(parseWorksheetXml(xml, ["Total p/ mês"])).toEqual([["Total p/ mês", null, null, 21, 59]]);
  });

  it("le booleanos e texto inline", () => {
    const xml = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Teste</t></is></c><c r="B1" t="b"><v>1</v></c></row></sheetData></worksheet>`;
    expect(parseWorksheetXml(xml)).toEqual([["Teste", true]]);
  });
});
