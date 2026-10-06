import { createHash } from "node:crypto";

function saoPauloDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function pixIdempotencyKey(chargeId: string, now = new Date()) {
  const digest = createHash("sha256").update(`thegestor:pix:${chargeId}:${saoPauloDate(now)}`).digest("hex");
  const hex = digest.slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
