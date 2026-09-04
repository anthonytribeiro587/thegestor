export type MessageAutomationTrigger = "antes_vencimento" | "vencimento" | "atraso";

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

export function addDays(value: string, days: number) {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateBR(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function renderBillingMessage(input: {
  template: string;
  name: string;
  dueDate: string;
  amount: number;
  paymentLink?: string | null;
}) {
  const firstName = input.name.trim().split(/\s+/)[0] || input.name.trim();
  const payment = input.paymentLink ? `\n\nPagamento: ${input.paymentLink}` : "";
  return input.template
    .replaceAll("{nome}", firstName)
    .replaceAll("{cliente}", input.name.trim())
    .replaceAll("{vencimento}", formatDateBR(input.dueDate))
    .replaceAll("{valor}", formatMoney(input.amount))
    .replaceAll("{link_pagamento}", input.paymentLink ?? "")
    .replaceAll("{pagamento}", payment)
    .trim();
}

export function automationMatchesDate(
  today: string,
  dueDate: string,
  automation: { gatilho: MessageAutomationTrigger; dias_deslocamento: number },
) {
  if (automation.gatilho === "antes_vencimento") return today === addDays(dueDate, -Math.max(automation.dias_deslocamento, 0));
  if (automation.gatilho === "vencimento") return today === dueDate;
  return today === addDays(dueDate, Math.max(automation.dias_deslocamento, 0));
}
