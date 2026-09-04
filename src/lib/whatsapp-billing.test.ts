import { describe, expect, it } from "vitest";
import { automationMatchesDate, renderBillingMessage } from "./whatsapp-billing";

describe("automationMatchesDate", () => {
  it("matches rules before due date", () => {
    expect(automationMatchesDate("2026-09-12", "2026-09-15", { gatilho: "antes_vencimento", dias_deslocamento: 3 })).toBe(true);
    expect(automationMatchesDate("2026-09-13", "2026-09-15", { gatilho: "antes_vencimento", dias_deslocamento: 3 })).toBe(false);
  });

  it("matches due date rules", () => {
    expect(automationMatchesDate("2026-09-15", "2026-09-15", { gatilho: "vencimento", dias_deslocamento: 0 })).toBe(true);
  });

  it("matches overdue rules", () => {
    expect(automationMatchesDate("2026-09-20", "2026-09-15", { gatilho: "atraso", dias_deslocamento: 5 })).toBe(true);
    expect(automationMatchesDate("2026-09-19", "2026-09-15", { gatilho: "atraso", dias_deslocamento: 5 })).toBe(false);
  });
});

describe("renderBillingMessage", () => {
  it("renders customer, due date, value and payment link", () => {
    const text = renderBillingMessage({
      template: "Olá, {nome}. {valor} vence em {vencimento}.{pagamento}",
      name: "Paula Andressa",
      dueDate: "2026-09-15",
      amount: 30,
      paymentLink: "https://pay.example/123",
    });

    expect(text).toContain("Olá, Paula.");
    expect(text).toContain("15/09/2026");
    expect(text).toContain("30,00");
    expect(text).toContain("https://pay.example/123");
  });
});
