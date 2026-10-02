import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("Configure REDIS_URL antes de iniciar o worker de contatos.");
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL antes de iniciar o worker de contatos.");

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
const prisma = new PrismaClient();
const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

async function fetchEvolutionContacts(instanceName) {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  if (!base || !key) throw new Error("Configure EVOLUTION_API_URL e EVOLUTION_API_KEY para sincronizar a instância Evolution.");
  const response = await fetch(`${base}/chat/findContacts/${encodeURIComponent(instanceName)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key }, body: JSON.stringify({}), signal: AbortSignal.timeout(60_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Evolution API respondeu HTTP ${response.status} ao buscar contatos.`);
  const rows = Array.isArray(data) ? data : Array.isArray(data?.contacts) ? data.contacts : Array.isArray(data?.data) ? data.data : null;
  if (!rows) throw new Error("A Evolution API retornou um formato de lista de contatos desconhecido.");
  return rows;
}

async function fetchWahaContacts(instanceName) {
  const base = process.env.WAHA_API_URL?.replace(/\/$/, "");
  const key = process.env.WAHA_API_KEY;
  if (!base || !key) throw new Error("Configure WAHA_API_URL e WAHA_API_KEY para sincronizar a sessão WAHA.");
  const rows = []; const limit = 100;
  for (let offset = 0; offset < 100_000; offset += limit) {
    const url = new URL(`${base}/api/contacts/all`);
    url.searchParams.set("session", instanceName); url.searchParams.set("limit", String(limit)); url.searchParams.set("offset", String(offset)); url.searchParams.set("sortBy", "id"); url.searchParams.set("sortOrder", "asc");
    const response = await fetch(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(60_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`WAHA respondeu HTTP ${response.status} ao buscar contatos.`);
    const batch = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : null;
    if (!batch) throw new Error("WAHA retornou um formato de lista de contatos desconhecido.");
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

function normalizeContact(raw, provider) {
  if (!raw || typeof raw !== "object") return null;
  const remoteJid = String(raw.remoteJid || raw.id || raw.chatId || raw.wid || "").trim();
  const group = raw.isGroup === true || raw.is_group === true || raw.type === "group" || /@g\.us$/i.test(remoteJid);
  if (group || raw.isMe === true || raw.is_me === true) return null;
  const rawNumber = raw.number || raw.phone || raw.phoneNumber || raw.pn || remoteJid.split("@")[0];
  const phoneNormalized = normalizePhone(rawNumber);
  if (!remoteJid && !phoneNormalized) return null;
  const phone = phoneNormalized ? `+${phoneNormalized}` : remoteJid;
  const suppliedName = raw.pushName || raw.pushname || raw.name || raw.shortName || raw.verifiedName || raw.notify || "";
  const name = String(suppliedName).trim() || phone;
  return { remoteJid: remoteJid || null, phone, phoneNormalized: phoneNormalized || null, name, source: provider === "WAHA" ? "waha" : "evolution" };
}

async function syncContacts(job) {
  const { instanceId, organizationId, instanceName, provider } = job.data;
  const instance = await prisma.whatsAppInstance.findFirst({ where: { id: instanceId, organizationId } });
  if (!instance) throw new Error("Instância não pertence à organização informada.");
  await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { lastSyncError: null } });

  const rawContacts = provider === "WAHA" ? await fetchWahaContacts(instanceName) : await fetchEvolutionContacts(instanceName);
  const contacts = rawContacts.map((row) => normalizeContact(row, provider)).filter(Boolean);
  let synced = 0;
  for (let offset = 0; offset < contacts.length; offset += 25) {
    const chunk = contacts.slice(offset, offset + 25);
    const results = await Promise.allSettled(chunk.map((contact) => {
      const where = contact.phoneNormalized
        ? { instanceId_phoneNormalized: { instanceId: instance.id, phoneNormalized: contact.phoneNormalized } }
        : { instanceId_remoteJid: { instanceId: instance.id, remoteJid: contact.remoteJid } };
      return prisma.contact.upsert({
        where,
        create: { organizationId, instanceId: instance.id, ...contact, status: "NOVO", optedIn: false, optedOut: false, syncedAt: new Date() },
        update: { remoteJid: contact.remoteJid, phone: contact.phone, name: contact.name, source: contact.source, syncedAt: new Date() },
      });
    }));
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    synced += results.length;
  }

  await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status: "CONNECTED", lastSyncAt: new Date(), lastSyncError: null } });
  job.log(`Sincronizados ${synced} contatos da instância ${instanceName}.`);
  return { synced, received: rawContacts.length };
}

const worker = new Worker("flowsend-contact-sync", syncContacts, { connection: redis, concurrency: Number(process.env.CONTACT_SYNC_CONCURRENCY || 2), limiter: { max: 3, duration: 1_000 } });
worker.on("completed", (job, result) => console.info("[contacts:sync] concluído", { jobId: job.id, instanceName: job.data.instanceName, ...result }));
worker.on("failed", async (job, error) => {
  console.error("[contacts:sync] falhou", { jobId: job?.id, instanceName: job?.data.instanceName, attemptsMade: job?.attemptsMade, error: error.message });
  if (job?.data.instanceId) await prisma.whatsAppInstance.updateMany({ where: { id: job.data.instanceId }, data: { lastSyncError: error.message.slice(0, 500) } }).catch((dbError) => console.error("[contacts:sync] não foi possível registrar erro", dbError));
});
worker.on("error", (error) => console.error("[contacts:sync] worker error", error));

console.info("FlowSend contact sync worker iniciado.");
async function shutdown() { await worker.close(); await redis.quit(); await prisma.$disconnect(); process.exit(0); }
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
