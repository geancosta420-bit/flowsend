import { Queue } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const contactSyncRequestSchema = z.object({
  provider: z.enum(["EVOLUTION", "WAHA"]),
  instanceName: z.string().trim().min(2).max(80).regex(/^[\w-]+$/),
  organizationId: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["CONNECTED", "CONNECTING", "DISCONNECTED", "ERROR"]).optional(),
  phone: z.string().max(40).optional(),
});

let redis: IORedis | undefined;
let queue: Queue | undefined;

function contactQueue() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL não está configurada.");
  redis ??= new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
  queue ??= new Queue("flowsend-contact-sync", { connection: redis, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: true, removeOnFail: 100 } });
  return queue;
}
export function organizationIdFromEnv() {
  return process.env.FLOWSEND_ORGANIZATION_ID?.trim() || "local";
}

export async function registerWhatsAppInstance(input: z.infer<typeof contactSyncRequestSchema>) {
  if (!process.env.DATABASE_URL) return null;
  const organizationId = input.organizationId || organizationIdFromEnv();
  const plan = process.env.FLOWSEND_DEFAULT_PLAN;
  const limits = plan === "PRO" ? { plan: "PRO" as const, maxWhatsapp: 3, maxMessages: 15_000, maxProspects: 500 } : plan === "SCALE" ? { plan: "SCALE" as const, maxWhatsapp: 10, maxMessages: 50_000, maxProspects: 999_999 } : { plan: "STARTER" as const, maxWhatsapp: 1, maxMessages: 2_000, maxProspects: 50 };

  await prisma.organization.upsert({
    where: { id: organizationId },
    create: { id: organizationId, name: process.env.FLOWSEND_ORGANIZATION_NAME || "FlowSend", ...limits },
    update: {},
  });

  return prisma.whatsAppInstance.upsert({
    where: { organizationId_instanceName: { organizationId, instanceName: input.instanceName } },
    create: { organizationId, instanceName: input.instanceName, provider: input.provider, status: input.status || "DISCONNECTED", phone: input.phone || "" },
    update: { provider: input.provider, ...(input.status ? { status: input.status } : {}), ...(input.phone ? { phone: input.phone } : {}) },
  });
}

export async function enqueueContactSync(input: z.infer<typeof contactSyncRequestSchema>) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não está configurada.");
  const instance = await registerWhatsAppInstance(input);
  if (!instance) throw new Error("Não foi possível registrar a instância.");
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL não está configurada.");

  const jobs = contactQueue();
  const jobId = `contacts-${instance.id}`;
  const current = await jobs.getJob(jobId);
  if (current) {
    const state = await current.getState();
    if (["waiting", "active", "delayed", "waiting-children"].includes(state)) return { jobId, queued: false, deduplicated: true };
    await current.remove();
  }
  await jobs.add("sync-instance-contacts", { instanceId: instance.id, organizationId: instance.organizationId, instanceName: instance.instanceName, provider: instance.provider }, { jobId });
  return { jobId, queued: true, deduplicated: false };
}

export async function closeContactSyncQueue() {
  await queue?.close();
  await redis?.quit();
  queue = undefined;
  redis = undefined;
}
