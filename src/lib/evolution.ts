import { createAdminClient, supabaseAdminKeyConfigured } from "@/lib/supabase/admin";

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

type EvolutionConfig = {
  url?: string;
  apiKey?: string;
  instance?: string;
  source: "environment" | "vault" | "none";
};

const VAULT_RPC = "get_server_evolution_credentials";
let vaultCache: { value: EvolutionConfig; expiresAt: number } | null = null;

function cleanUrl(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") || undefined;
}

function envEvolutionConfig(): EvolutionConfig {
  const url = cleanUrl(process.env.EVOLUTION_API_URL);
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || undefined;
  const instance = process.env.EVOLUTION_INSTANCE?.trim() || undefined;
  return { url, apiKey, instance, source: url && apiKey && instance ? "environment" : "none" };
}

function parseVaultConfig(value: unknown): EvolutionConfig {
  if (!value || typeof value !== "object") return { source: "none" };
  const row = value as Record<string, unknown>;
  const url = cleanUrl(typeof row.url === "string" ? row.url : undefined);
  const apiKey = typeof row.apiKey === "string" ? row.apiKey.trim() || undefined : undefined;
  const instance = typeof row.instance === "string" ? row.instance.trim() || undefined : undefined;
  return { url, apiKey, instance, source: url && apiKey && instance ? "vault" : "none" };
}

async function vaultEvolutionConfig(): Promise<EvolutionConfig> {
  if (!supabaseAdminKeyConfigured()) return { source: "none" };
  if (vaultCache && vaultCache.expiresAt > Date.now()) return vaultCache.value;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(VAULT_RPC);
  if (error) throw new Error(`Não foi possível ler a credencial Evolution do Vault: ${error.message}`);

  const value = parseVaultConfig(data);
  vaultCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

async function evolutionConfig(): Promise<EvolutionConfig> {
  const env = envEvolutionConfig();
  if (env.source === "environment") return env;

  try {
    const vault = await vaultEvolutionConfig();
    if (vault.source === "vault") return vault;
  } catch {
    // A chamada que realmente precisa da Evolution dará um erro específico abaixo.
  }

  return env;
}

export async function getEvolutionConfigurationStatus() {
  const env = envEvolutionConfig();
  let config = env;
  let error: string | null = null;

  if (env.source !== "environment") {
    try {
      const vault = await vaultEvolutionConfig();
      if (vault.source === "vault") config = vault;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Falha ao consultar credencial Evolution no Vault.";
    }
  }

  return {
    configured: Boolean(config.url && config.apiKey && config.instance),
    source: config.source,
    urlConfigured: Boolean(config.url),
    apiKeyConfigured: Boolean(config.apiKey),
    instanceConfigured: Boolean(config.instance),
    instance: config.instance ?? null,
    error,
  };
}

export async function evolutionConfigured() {
  const { configured } = await getEvolutionConfigurationStatus();
  return configured;
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
  const { url, apiKey } = await evolutionConfig();
  if (!url || !apiKey) throw new Error("Evolution API não configurada no servidor nem no Supabase Vault.");

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
  const { instance } = await evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada no servidor nem no Supabase Vault.");
  const payload = await evolutionFetch<EvolutionConnectionResponse>(`/instance/connectionState/${encodeURIComponent(instance)}`);
  return {
    instance: payload.instance?.instanceName ?? instance,
    state: payload.instance?.state ?? payload.state ?? payload.connectionStatus ?? "unknown",
  };
}

export async function connectEvolutionInstance() {
  const { instance } = await evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada no servidor nem no Supabase Vault.");
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
  const { instance } = await evolutionConfig();
  if (!instance) throw new Error("EVOLUTION_INSTANCE não configurada no servidor nem no Supabase Vault.");
  const normalized = normalizeWhatsAppNumber(number);
  if (normalized.length < 10) throw new Error("Telefone inválido para WhatsApp.");
  if (!text.trim()) throw new Error("Mensagem vazia.");

  // A instância compartilhada `nextlead` já opera com este payload no CRM NextLead.
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
