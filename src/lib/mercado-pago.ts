import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.mercadopago.com";

export type MercadoPagoOrder = {
  id: string;
  status: string;
  status_detail: string;
  external_reference?: string | null;
  total_amount?: string | number | null;
  transactions?: {
    payments?: Array<{
      id?: string | null;
      reference_id?: string | null;
      status?: string | null;
      status_detail?: string | null;
      amount?: string | number | null;
      payment_method?: {
        id?: string | null;
        type?: string | null;
        ticket_url?: string | null;
        qr_code?: string | null;
        qr_code_base64?: string | null;
      } | null;
    }> | null;
  } | null;
};

type CreatePixInput = {
  amount: number;
  externalReference: string;
  payerEmail: string;
  payerFirstName?: string;
  idempotencyKey: string;
  expiration?: string;
  processingMode?: "automatic" | "manual";
};

type MercadoPagoErrorPayload = Record<string, unknown> & {
  message?: string;
  error?: string;
  status?: number;
  cause?: unknown;
  errors?: unknown;
};

function accessToken() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado.");
  return token;
}

export function mercadoPagoEnvironment() {
  return process.env.MERCADO_PAGO_ENV === "production" ? "production" : "test";
}

export function mercadoPagoConfigured() {
  return Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN);
}

export function mercadoPagoWebhookConfigured() {
  return Boolean(
    process.env.MERCADO_PAGO_WEBHOOK_SECRET
    && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
      .replace(/APP_USR-[A-Za-z0-9_-]+/g, "APP_USR-[redacted]")
      .replace(/TEST-[A-Za-z0-9_-]+/g, "TEST-[redacted]")
      .slice(0, 1200);
  } catch {
    return "";
  }
}

function describeMercadoPagoError(payload: MercadoPagoErrorPayload | null, status: number, rawText: string, requestId: string | null) {
  const parts: string[] = [];

  if (payload && typeof payload === "object") {
    if (payload.error) parts.push(String(payload.error));
    if (payload.message && payload.message !== payload.error) parts.push(String(payload.message));

    const collections = [payload.cause, payload.errors];
    for (const collection of collections) {
      if (Array.isArray(collection)) {
        for (const item of collection.slice(0, 4)) {
          if (!item || typeof item !== "object") {
            if (item != null) parts.push(String(item));
            continue;
          }
          const row = item as Record<string, unknown>;
          const code = row.code ?? row.error ?? row.type ?? row.name;
          const description = row.description ?? row.message ?? row.detail ?? row.reason;
          const joined = [code, description].filter(Boolean).map(String).join(": ");
          if (joined) parts.push(joined);
        }
      } else if (collection && typeof collection === "object") {
        const row = collection as Record<string, unknown>;
        const code = row.code ?? row.error ?? row.type ?? row.name;
        const description = row.description ?? row.message ?? row.detail ?? row.reason;
        const joined = [code, description].filter(Boolean).map(String).join(": ");
        if (joined) parts.push(joined);
      }
    }

    if (!parts.length) {
      const serialized = safeStringify(payload);
      if (serialized) parts.push(serialized);
    }
  } else if (rawText.trim()) {
    parts.push(rawText.trim().slice(0, 1200));
  }

  const requestSuffix = requestId ? ` | request_id=${requestId}` : "";
  return parts.length
    ? `Mercado Pago (${status}): ${parts.join(" | ")}${requestSuffix}`
    : `Mercado Pago respondeu HTTP ${status}.${requestSuffix}`;
}

async function mpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${accessToken()}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const rawText = await response.text();
  let payload: T | MercadoPagoErrorPayload | null = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as T | MercadoPagoErrorPayload;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(describeMercadoPagoError(
      payload as MercadoPagoErrorPayload | null,
      response.status,
      rawText,
      response.headers.get("x-request-id"),
    ));
  }

  return payload as T;
}

export async function getMercadoPagoAccount() {
  return mpFetch<{ id: number; nickname?: string; email?: string; site_id?: string }>("/users/me");
}

export async function createPixOrder(input: CreatePixInput) {
  const payment: Record<string, unknown> = {
    amount: input.amount.toFixed(2),
    payment_method: {
      id: "pix",
      type: "bank_transfer",
    },
  };

  if (input.expiration) payment.expiration_time = input.expiration;

  const body: Record<string, unknown> = {
    type: "online",
    external_reference: input.externalReference,
    total_amount: input.amount.toFixed(2),
    payer: {
      email: input.payerEmail,
      ...(input.payerFirstName ? { first_name: input.payerFirstName } : {}),
    },
    transactions: {
      payments: [payment],
    },
  };

  // O request predefinido do sandbox Pix não inclui processing_mode.
  // Em produção usamos explicitamente o modo automático.
  if (input.processingMode) body.processing_mode = input.processingMode;

  return mpFetch<MercadoPagoOrder>("/v1/orders", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export async function getMercadoPagoOrder(orderId: string) {
  return mpFetch<MercadoPagoOrder>(`/v1/orders/${encodeURIComponent(orderId)}`);
}

export function extractPix(order: MercadoPagoOrder) {
  const payment = order.transactions?.payments?.[0] ?? null;
  const method = payment?.payment_method ?? null;
  return {
    orderId: order.id,
    paymentId: payment?.id ?? "",
    orderStatus: order.status,
    statusDetail: order.status_detail,
    amount: Number(payment?.amount ?? order.total_amount ?? 0),
    ticketUrl: method?.ticket_url ?? null,
    qrCode: method?.qr_code ?? null,
    qrCodeBase64: method?.qr_code_base64 ?? null,
  };
}

export function isOrderPaid(order: Pick<MercadoPagoOrder, "status" | "status_detail">) {
  return order.status === "processed" && order.status_detail === "accredited";
}

function parseSignature(xSignature: string) {
  const parts = xSignature.split(",");
  let ts = "";
  let v1 = "";
  for (const part of parts) {
    const [key, value] = part.split("=", 2).map((item) => item?.trim());
    if (key === "ts") ts = value ?? "";
    if (key === "v1") v1 = value ?? "";
  }
  return { ts, v1 };
}

export function validateMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret?: string;
}) {
  const secret = input.secret ?? process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret || !input.xSignature || !input.xRequestId || !input.dataId) return false;

  const { ts, v1 } = parseSignature(input.xSignature);
  if (!ts || !v1) return false;

  const dataId = /[a-zA-Z]/.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  const manifest = `id:${dataId};request-id:${input.xRequestId};ts:${ts};`;
  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

export function safeMercadoPagoOrderSummary(order: MercadoPagoOrder) {
  const pix = extractPix(order);
  return {
    id: order.id,
    status: order.status,
    status_detail: order.status_detail,
    external_reference: order.external_reference ?? null,
    total_amount: order.total_amount ?? null,
    payment_id: pix.paymentId || null,
    payment_status: order.transactions?.payments?.[0]?.status ?? null,
    payment_status_detail: order.transactions?.payments?.[0]?.status_detail ?? null,
    payment_method: order.transactions?.payments?.[0]?.payment_method?.id ?? null,
  };
}
