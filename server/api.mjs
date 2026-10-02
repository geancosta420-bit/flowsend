import { createHmac, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const required = ["DATABASE_URL", "REDIS_URL", "FASTIFY_INTERNAL_TOKEN"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Configure as variáveis necessárias para iniciar a API: ${missing.join(", ")}`);
if (!process.env.CONTACTS_WEBHOOK_SECRET && !process.env.EVOLUTION_WEBHOOK_SECRET && !process.env.WAHA_HMAC_SECRET) throw new Error("Configure CONTACTS_WEBHOOK_SECRET, EVOLUTION_WEBHOOK_SECRET ou WAHA_HMAC_SECRET para proteger o webhook.");

const prisma = new PrismaClient();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, bodyLimit: 1_048_576 });
const redis = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { maxRetriesPerRequest: null, enableReadyCheck: true });
const contactQueue = new Queue("flowsend-contact-sync", { connection: redis, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: true, removeOnFail: 100 } });
const orgId = () => process.env.FLOWSEND_ORGANIZATION_ID?.trim() || "local";
const instanceInput = z.object({ provider: z.enum(["EVOLUTION", "WAHA"]).default("EVOLUTION"), instanceName: z.string().trim().min(2).max(80).regex(/^[\w-]+$/), organizationId: z.string().trim().min(1).max(120).optional(), status: z.enum(["CONNECTED", "CONNECTING", "DISCONNECTED", "ERROR"]).optional(), phone: z.string().max(40).optional() });
const contactInput = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), phone: z.string().trim().min(1).max(40), company: z.string().max(160).default(""), email: z.string().email().or(z.literal("")).default(""), city: z.string().max(120).default(""), segment: z.string().max(100).default(""), notes: z.string().max(2000).default(""), leadValue: z.coerce.number().min(0).max(100_000_000).default(0), tags: z.array(z.string().max(40)).default([]), status: z.enum(["NOVO", "CONTATADO", "RESPONDEU", "INTERESSADO", "PROPOSTA", "NEGOCIACAO", "CLIENTE", "SEM_INTERESSE", "Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"]).default("NOVO"), optedIn: z.boolean().default(false), optedOut: z.boolean().default(false) });
const statusMap = { NOVO: "Novo", CONTATADO: "Contatado", RESPONDEU: "Respondeu", INTERESSADO: "Interessado", PROPOSTA: "Proposta", NEGOCIACAO: "Negociação", CLIENTE: "Cliente", SEM_INTERESSE: "Sem interesse" };
const prismaStatus = (value) => ({ Novo: "NOVO", Contatado: "CONTATADO", Respondeu: "RESPONDEU", Interessado: "INTERESSADO", Proposta: "PROPOSTA", Negociação: "NEGOCIACAO", Cliente: "CLIENTE", "Sem interesse": "SEM_INTERESSE" })[value] || value;
const normalizePhone = (value) => value.replace(/\D/g, "");

async function ensureOrganization(id = orgId()) {
  const plan = process.env.FLOWSEND_DEFAULT_PLAN;
  const limits = plan === "PRO" ? { plan: "PRO", maxWhatsapp: 3, maxMessages: 15_000, maxProspects: 500 } : plan === "SCALE" ? { plan: "SCALE", maxWhatsapp: 10, maxMessages: 50_000, maxProspects: 999_999 } : { plan: "STARTER", maxWhatsapp: 1, maxMessages: 2_000, maxProspects: 50 };
  return prisma.organization.upsert({ where: { id }, create: { id, name: process.env.FLOWSEND_ORGANIZATION_NAME || "FlowSend", ...limits }, update: {} });
}

async function registerInstance(input) {
  const organizationId = input.organizationId || orgId();
  await ensureOrganization(organizationId);
  return prisma.whatsAppInstance.upsert({
    where: { organizationId_instanceName: { organizationId, instanceName: input.instanceName } },
    create: { organizationId, instanceName: input.instanceName, provider: input.provider, status: input.status || "DISCONNECTED", phone: input.phone || "" },
    update: { provider: input.provider, ...(input.status ? { status: input.status } : {}), ...(input.phone ? { phone: input.phone } : {}) },
  });
}

function authorized(request, reply) {
  const expected = process.env.FASTIFY_INTERNAL_TOKEN;
  if (!expected) { reply.code(503).send({ error: "FASTIFY_INTERNAL_TOKEN não configurado." }); return false; }
  const supplied = request.headers["x-internal-api-key"] || "";
  const a = Buffer.from(expected); const b = Buffer.from(String(supplied));
  if (a.length !== b.length || !timingSafeEqual(a, b)) { reply.code(401).send({ error: "Não autorizado." }); return false; }
  return true;
}

function authorizedWebhook(request, reply, rawBody) {
  const secret = process.env.CONTACTS_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET;
  if (secret) {
    const supplied = String(request.headers["x-webhook-secret"] || request.headers.authorization?.replace(/^Bearer\s+/i, "") || "");
    const a = Buffer.from(secret); const b = Buffer.from(supplied);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const waSecret = process.env.WAHA_HMAC_SECRET;
  const digest = request.headers["x-webhook-hmac"];
  if (waSecret && typeof digest === "string") {
    const expected = createHmac("sha512", waSecret).update(rawBody).digest("hex");
    const c = Buffer.from(expected.toLowerCase()); const d = Buffer.from(digest.toLowerCase());
    if (c.length === d.length && timingSafeEqual(c, d)) return true;
  }
  reply.code(401).send({ error: "Assinatura de webhook inválida." });
  return false;
}

async function queueSync(input) {
  const instance = await registerInstance(input);
  const jobId = `contacts-${instance.id}`;
  const old = await contactQueue.getJob(jobId);
  if (old && ["waiting", "active", "delayed", "waiting-children"].includes(await old.getState())) return { queued: false, deduplicated: true, jobId };
  if (old) await old.remove();
  await contactQueue.add("sync-instance-contacts", { instanceId: instance.id, organizationId: instance.organizationId, instanceName: instance.instanceName, provider: instance.provider }, { jobId });
  return { queued: true, deduplicated: false, jobId };
}

async function handleWebhook(request, reply, provider, rawBody) {
  if (!authorizedWebhook(request, reply, rawBody)) return;
  const parsed = z.record(z.string(), z.unknown()).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Payload deve ser um objeto JSON." });
  const body = parsed.data;
  const event = String(body.event || body.type || "").toUpperCase().replace(/[.\-/\s]+/g, "_");
  const instanceName = String(body.instance || body.instanceName || body.session || "").trim();
  if (!instanceName || !/^[\w-]{2,80}$/.test(instanceName)) return reply.code(400).send({ error: "Instância ausente ou inválida." });
  const data = (body.data && typeof body.data === "object" ? body.data : body.payload && typeof body.payload === "object" ? body.payload : {}) ;
  const rawStatus = String(data.state || data.status || body.status || "").toUpperCase();
  const connected = ["OPEN", "CONNECTED", "WORKING", "AUTHENTICATED"].includes(rawStatus);
  const connectionEvent = ["CONNECTION_UPDATE", "SESSION_STATUS", "STATE_CHANGE"].includes(event);
  const contactsEvent = event.startsWith("CONTACTS_") || event === "CONTACT" || event === "CONTACTS";
  if (connectionEvent || contactsEvent) {
    const input = instanceInput.parse({ provider, instanceName, status: connectionEvent ? connected ? "CONNECTED" : ["CLOSE", "CLOSED", "STOPPED", "DISCONNECTED", "FAILED"].includes(rawStatus) ? "DISCONNECTED" : "CONNECTING" : undefined, phone: String(body.me?.id || "").split("@")[0].replace(/\D/g, "") || undefined });
    const result = connectionEvent ? await registerInstance(input).then(async (instance) => connected ? queueSync({ ...input, organizationId: instance.organizationId }) : { queued: false, deduplicated: false, jobId: null }) : await queueSync(input);
    request.log.info({ event, provider, instanceName, status: rawStatus, ...result }, "contact sync queued from webhook");
    return reply.code(202).send({ received: true, event, contactSync: result });
  }
  return reply.code(202).send({ received: true, event, ignored: true });
}

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 1_048_576 }, (request, body, done) => {
  request.rawBody = body;
  try { done(null, JSON.parse(body)); } catch (error) { done(error, undefined); }
});

app.get("/health", async (_request, reply) => {
  try { await prisma.$queryRaw`SELECT 1`; await redis.ping(); return { ok: true, database: "connected", queue: "connected" }; }
  catch (error) { reply.code(503); return { ok: false, error: error.message }; }
});

app.post("/webhooks/evolution", async (request, reply) => handleWebhook(request, reply, "EVOLUTION", request.rawBody || ""));
app.post("/webhooks/waha", async (request, reply) => handleWebhook(request, reply, "WAHA", request.rawBody || ""));

app.post("/instances/register", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const input = instanceInput.safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error: input.error.issues[0]?.message || "Dados inválidos." });
  try {
    const instance = await registerInstance(input.data);
    const sync = instance.status === "CONNECTED" ? await queueSync({ ...input.data, organizationId: instance.organizationId }) : null;
    return reply.send({ instance, sync });
  } catch (error) { request.log.error({ err: error }, "instance registration failed"); return reply.code(500).send({ error: "Não foi possível registrar a instância." }); }
});

app.post("/contacts/sync", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const input = instanceInput.safeParse(request.body);
  if (!input.success) return reply.code(400).send({ error: input.error.issues[0]?.message || "Dados inválidos." });
  try { return reply.code(202).send(await queueSync(input.data)); }
  catch (error) { request.log.error({ err: error }, "manual contact sync enqueue failed"); return reply.code(503).send({ error: error.message }); }
});

app.get("/dashboard/stats", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const organizationId = orgId();
  try {
    const [total, byStatus, connectedInstances] = await Promise.all([
      prisma.contact.count({ where: { organizationId } }),
      prisma.contact.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
      prisma.whatsAppInstance.count({ where: { organizationId, status: "CONNECTED" } }),
    ]);
    return reply.send({ total, byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])), connectedInstances });
  } catch (error) { request.log.error({ err: error }, "dashboard stats query failed"); return reply.code(500).send({ error: "Não foi possível calcular os indicadores dos contatos." }); }
});

app.get("/contacts", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const paginated = Object.hasOwn(request.query || {}, "page") || Object.hasOwn(request.query || {}, "pageSize");
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(120).default(""), status: z.enum(["Todos os status", "Bloqueados", "Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"]).optional(), instanceId: z.string().max(120).optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Parâmetros de paginação inválidos." });
  const { page, pageSize, q, status, instanceId } = query.data; const organizationId = orgId();
  const where = { organizationId, ...(status && status !== "Todos os status" ? { status: ({ Novo: "NOVO", Contatado: "CONTATADO", Respondeu: "RESPONDEU", Interessado: "INTERESSADO", Proposta: "PROPOSTA", Negociação: "NEGOCIACAO", Cliente: "CLIENTE", "Sem interesse": "SEM_INTERESSE", Bloqueados: undefined })[status] || undefined, ...(status === "Bloqueados" ? { optedOut: true } : {}) } : {}), ...(instanceId ? { instanceId } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { company: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { segment: { contains: q, mode: "insensitive" } }, { tags: { has: q } }] } : {}) };
  try {
    if (!paginated) {
      const rows = await prisma.contact.findMany({ where, orderBy: [{ updatedAt: "desc" }, { name: "asc" }], take: 5_000 });
      return reply.send(rows.map((row) => ({ ...row, status: statusMap[row.status], leadValue: Number(row.leadValue), lastContact: row.lastContact?.toISOString() || "—" })));
    }
    const [total, rows] = await prisma.$transaction([prisma.contact.count({ where }), prisma.contact.findMany({ where, orderBy: [{ updatedAt: "desc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize })]);
    const items = rows.map((row) => ({ ...row, status: statusMap[row.status], leadValue: Number(row.leadValue), lastContact: row.lastContact?.toISOString() || "—" }));
    return reply.send({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { request.log.error({ err: error }, "contacts list failed"); return reply.code(500).send({ error: "Não foi possível listar os contatos." }); }
});

app.post("/contacts", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const parsed = contactInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || "Contato inválido." });
  const input = parsed.data; const organizationId = orgId(); const phoneNormalized = normalizePhone(input.phone);
  try {
    await ensureOrganization(organizationId);
    const row = await prisma.contact.create({ data: { organizationId, ...input, status: prismaStatus(input.status), phoneNormalized } });
    return reply.code(201).send({ ...row, status: statusMap[row.status], leadValue: Number(row.leadValue), lastContact: "—" });
  } catch (error) { request.log.error({ err: error }, "contact create failed"); return reply.code(error.code === "P2002" ? 409 : 500).send({ error: error.code === "P2002" ? "Já existe um contato com esse WhatsApp." : "Não foi possível criar contato." }); }
});

app.patch("/contacts/:id", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  const parsed = z.object({ changes: contactInput.partial() }).safeParse(request.body);
  if (!params.success || !parsed.success) return reply.code(400).send({ error: "Dados inválidos." });
  const changes = parsed.data.changes;
  try {
    const row = await prisma.contact.update({ where: { id: params.data.id, organizationId: orgId() }, data: { ...changes, ...(changes.status ? { status: prismaStatus(changes.status) } : {}), ...(changes.phone ? { phoneNormalized: normalizePhone(changes.phone) } : {}) } });
    return reply.send({ ...row, status: statusMap[row.status], leadValue: Number(row.leadValue), lastContact: row.lastContact?.toISOString() || "—" });
  } catch (error) { request.log.error({ err: error }, "contact update failed"); return reply.code(error.code === "P2025" ? 404 : error.code === "P2002" ? 409 : 500).send({ error: error.code === "P2025" ? "Contato não encontrado." : error.code === "P2002" ? "Já existe um contato com esse WhatsApp." : "Não foi possível atualizar contato." }); }
});

app.put("/contacts", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const parsed = z.object({ contacts: z.array(contactInput).max(1000) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message || "Lista de contatos inválida." });
  const organizationId = orgId();
  try {
    await ensureOrganization(organizationId);
    let saved = 0;
    for (const contact of parsed.data.contacts) {
      const phoneNormalized = normalizePhone(contact.phone);
      const existing = await prisma.contact.findFirst({ where: { organizationId, phoneNormalized } });
      const data = { ...contact, status: prismaStatus(contact.status), phoneNormalized };
      if (existing) await prisma.contact.update({ where: { id: existing.id }, data: { ...data, status: existing.status, optedIn: contact.optedIn || existing.optedIn, optedOut: existing.optedOut, tags: contact.tags.length ? contact.tags : existing.tags, notes: contact.notes || existing.notes } });
      else await prisma.contact.create({ data: { organizationId, ...data } });
      saved++;
    }
    return reply.send({ saved });
  } catch (error) { request.log.error({ err: error }, "contact import failed"); return reply.code(error.code === "P2002" ? 409 : 500).send({ error: "Não foi possível importar os contatos." }); }
});

app.delete("/contacts", async (request, reply) => {
  if (!authorized(request, reply)) return;
  const parsed = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Informe contatos válidos para excluir." });
  const result = await prisma.contact.deleteMany({ where: { organizationId: orgId(), id: { in: parsed.data.ids } } });
  return reply.send({ deleted: result.count });
});

app.setErrorHandler((error, request, reply) => { request.log.error({ err: error }, "fastify route error"); return reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ error: error.statusCode && error.statusCode < 500 ? error.message : "Erro interno no serviço de contatos." }); });

const port = Number(process.env.FASTIFY_PORT || 3001);
const host = process.env.FASTIFY_HOST || "127.0.0.1";
app.listen({ port, host }).catch(async (error) => { app.log.error(error); await contactQueue.close(); await redis.quit(); await prisma.$disconnect(); process.exit(1); });

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await app.close(); await contactQueue.close(); await redis.quit(); await prisma.$disconnect(); process.exit(0); });
