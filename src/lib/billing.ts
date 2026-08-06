export type OperationalChargeStatus = "Pago" | "Atrasado" | "A vencer";

export function todayInSaoPaulo(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function operationalChargeStatus(
  paymentStatus: string,
  dueDate: string,
  today = todayInSaoPaulo(),
): OperationalChargeStatus {
  if (paymentStatus === "pago") return "Pago";
  if (paymentStatus === "atrasado" || (paymentStatus === "pendente" && dueDate < today)) {
    return "Atrasado";
  }
  return "A vencer";
}

export function monthBounds(today: string) {
  const [year, month] = today.split("-").map(Number);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { firstDay, nextMonth };
}

export function currentMonthRangeLabel(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).split("-").map(Number);
  const [year, month] = parts;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `01/${String(month).padStart(2, "0")}/${year} - ${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatDateBR(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
