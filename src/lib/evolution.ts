type EvolutionConnectionResponse = {
  instance?: {
    instanceName?: string;
    state?: string;
  };
};

type EvolutionConnectResponse = {
  pairingCode?: string | null;
  code?: string | null;
  base64?: string | null;
  count?: number;
};

type EvolutionSendResponse = {
  key?: { id?: string; remoteJid?: string };
  status?: string;
};

function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  return { url, apiKey, instance };
}

export function evolutionConfigured() {
  const { url, apiKey, instance } = evolutionConfig();
  return Boolean(url && apiKey && instance);
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

  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!response.ok) {
    const detail = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "")
      : typeof payload === "string" ? payload : "";
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
    state: payload.instance?.state ?? "unknown",
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

export async function sendEvolutionText(number: string, text: string) {
  const { instance } = evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada.");
  const normalized = normalizeWhatsAppNumber(number);
  if (normalized.length < 10) throw new Error("Telefone inválido para WhatsApp.");
  if (!text.trim()) throw new Error("Mensagem vazia.");

  return evolutionFetch<EvolutionSendResponse>(`/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number: normalized,
      textMessage: { text: text.trim() },
      linkPreview: true,
    }),
  });
}
