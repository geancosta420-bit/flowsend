import { z } from "zod";

const instancePayload = z.object({ provider: z.enum(["EVOLUTION", "WAHA"]), instanceName: z.string().min(2).max(80), status: z.enum(["CONNECTED", "CONNECTING", "DISCONNECTED", "ERROR"]).optional(), phone: z.string().max(40).optional() });

function apiBase() {
  return (process.env.FASTIFY_API_URL || `http://127.0.0.1:${process.env.FASTIFY_PORT || "3001"}`).replace(/\/$/, "");
}

export async function registerInstanceInFastify(input: z.infer<typeof instancePayload>) {
  if (!process.env.DATABASE_URL || !process.env.FASTIFY_INTERNAL_TOKEN) return null;
  const body = instancePayload.parse(input);
  try {
    const response = await fetch(`${apiBase()}/instances/register`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-api-key": process.env.FASTIFY_INTERNAL_TOKEN }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Fastify respondeu HTTP ${response.status}.`);
    return data;
  } catch (error) {
    console.error("[contacts:sync] não foi possível registrar instância no Fastify", error);
    return null;
  }
}

export async function forwardEvolutionSyncWebhook(payload: unknown, event: string) {
  const normalized = event.toLowerCase().replace(/[.\-/\s]+/g, "_");
  if (!normalized.startsWith("contacts_") && !["connection_update", "session_status", "state_change"].includes(normalized)) return null;
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) return null;
  const secret = process.env.CONTACTS_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return null;
  try {
    const response = await fetch(`${apiBase()}/webhooks/evolution`, { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": secret }, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Fastify respondeu HTTP ${response.status}.`);
    return data;
  } catch (error) {
    console.error("[contacts:sync] webhook de sincronização não chegou ao Fastify", error);
    throw error;
  }
}
