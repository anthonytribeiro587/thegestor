import { describe, expect, it } from "vitest";
import { currentMonthRangeLabel, monthBounds, operationalChargeStatus } from "./billing";

describe("billing rules", () => {
  it("prioritizes paid status", () => {
    expect(operationalChargeStatus("pago", "2026-01-01", "2026-08-06")).toBe("Pago");
  });

  it("treats overdue database status as late", () => {
    expect(operationalChargeStatus("atrasado", "2026-08-10", "2026-08-06")).toBe("Atrasado");
  });

  it("treats a pending past due date as late", () => {
    expect(operationalChargeStatus("pendente", "2026-08-05", "2026-08-06")).toBe("Atrasado");
  });

  it("keeps future pending charge as upcoming", () => {
    expect(operationalChargeStatus("pendente", "2026-08-07", "2026-08-06")).toBe("A vencer");
  });

  it("calculates month boundaries", () => {
    expect(monthBounds("2026-12-15")).toEqual({ firstDay: "2026-12-01", nextMonth: "2027-01-01" });
  });

  it("renders the current month range with the correct last day", () => {
    expect(currentMonthRangeLabel(new Date("2026-02-15T12:00:00Z"))).toBe("01/02/2026 - 28/02/2026");
  });
});
