type EvolutionConnectionResponse = {
  instance?: {
    instanceName?: string;
    state?: string;
  };
  state?: string;
  connectionStatus?: string;
};

type EvolutionConnectResponse = {
  pairingCode?: string | null;
  code?: string | null;
  base64?: string | null;
  count?: number;
};

type EvolutionSendResponse = {
  key?: { id?: string; remoteJid?: string };
  message?: { key?: { id?: string; remoteJid?: string } };
  data?: {
    key?: { id?: string; remoteJid?: string };
    id?: string;
  };
  id?: string;
  messageId?: string;
  status?: string;
};

function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  return { url, apiKey, instance };
}

export function evolutionConfigured() {
  const { url, apiKey, instance } = evolutionConfig();
  return Boolean(url && apiKey && instance);
}

function stringifyEvolutionDetail(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const row = payload as Record<string, unknown>;
  const response = row.response && typeof row.response === "object"
    ? row.response as Record<string, unknown>
    : null;

  const candidates = [
    response?.message,
    row.message,
    row.error,
    row.details,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(String).join(" | ");
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") {
      try { return JSON.stringify(candidate).slice(0, 900); } catch { /* noop */ }
    }
  }

  try { return JSON.stringify(payload).slice(0, 900); } catch { return ""; }
}

async function evolutionFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, apiKey } = evolutionConfig();
  if (!url || !apiKey) throw new Error("Evolution API não configurada no servidor.");

  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const rawText = await response.text();
  let payload: unknown = null;
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { payload = rawText; }

  if (!response.ok) {
    const detail = stringifyEvolutionDetail(payload);
    throw new Error(`Evolution API HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  return payload as T;
}

export async function getEvolutionConnectionState() {
  const { instance } = evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada.");
  const payload = await evolutionFetch<EvolutionConnectionResponse>(`/instance/connectionState/${encodeURIComponent(instance)}`);
  return {
    instance: payload.instance?.instanceName ?? instance,
    state: payload.instance?.state ?? payload.state ?? payload.connectionStatus ?? "unknown",
  };
}

export async function connectEvolutionInstance() {
  const { instance } = evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada.");
  return evolutionFetch<EvolutionConnectResponse>(`/instance/connect/${encodeURIComponent(instance)}`);
}

export function normalizeWhatsAppNumber(value: string) {
  return value.replace(/\D/g, "");
}

export function extractEvolutionMessageId(payload: EvolutionSendResponse | null | undefined) {
  return payload?.key?.id
    ?? payload?.message?.key?.id
    ?? payload?.data?.key?.id
    ?? payload?.data?.id
    ?? payload?.id
    ?? payload?.messageId
    ?? null;
}

export async function sendEvolutionText(number: string, text: string) {
  const { instance } = evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada.");
  const normalized = normalizeWhatsAppNumber(number);
  if (normalized.length < 10) throw new Error("Telefone inválido para WhatsApp.");
  if (!text.trim()) throw new Error("Mensagem vazia.");

  // A instância compartilhada `nextlead` já opera com este payload no CRM NextLead.
  // Mantemos o thegestor compatível com a versão efetivamente instalada no servidor.
  return evolutionFetch<EvolutionSendResponse>(`/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number: normalized,
      text: text.trim(),
      options: {
        delay: 900,
        presence: "composing",
        linkPreview: false,
      },
    }),
  });
}
