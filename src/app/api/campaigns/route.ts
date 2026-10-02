import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { ensureInstanceSlot } from "@/lib/billing/usage";
import { readStore, updateStore, type StoredCampaignJob } from "@/lib/storage/db";

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  objective: z.string().min(1),
  audience: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  instanceName: z.string().trim().min(2).max(80).regex(/^[\w-]+$/).optional(),
  instanceNames: z.array(z.string().trim().min(2).max(80).regex(/^[\w-]+$/)).min(1).max(20).optional(),
  minIntervalSeconds: z.number().int().min(1).max(3600),
  maxIntervalSeconds: z.number().int().min(1).max(3600),
  dailyLimit: z.number().int().min(1).max(5000),
  pauseEveryMessages: z.number().int().min(0).max(5000),
  pauseMinutes: z.number().int().min(0).max(1440),
  rampDaily20: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  pauseOnReply: z.boolean(),
  scheduledAt: z.string().datetime().optional(),
});

export async function GET() {
  return NextResponse.json((await readStore()).campaigns);
}

export async function POST(req: NextRequest) {
  try {
    const body = campaignSchema.parse(await req.json());
    if (body.maxIntervalSeconds < body.minIntervalSeconds) throw new Error("O intervalo máximo deve ser maior ou igual ao mínimo.");
    const instanceNames = [...new Set(body.instanceNames?.length ? body.instanceNames : body.instanceName ? [body.instanceName] : [])];
    if (!instanceNames.length) throw new Error("Selecione ao menos uma instância.");
    if (body.pauseEveryMessages > 0 && body.pauseMinutes === 0) throw new Error("Informe a duração da pausa técnica.");
    const campaign = await updateStore((store) => {
      instanceNames.forEach((instanceName) => ensureInstanceSlot(store, instanceName));
      const audience = body.audience.toLocaleLowerCase("pt-BR");
      const contacts = store.contacts.filter((contact) =>
        contact.optedIn === true &&
        !contact.optedOut &&
        (contact.tags.some((tag) => tag.toLocaleLowerCase("pt-BR") === audience) ||
          contact.segment.toLocaleLowerCase("pt-BR") === audience),
      );

      if (!contacts.length) {
        throw new Error("Nenhum contato com consentimento registrado encontrado nessa lista.");
      }

      const queued = store.jobs.filter((job) => job.status === "pending").length;
      const reserved = store.subscription.reservedMessages + queued;
      if (store.subscription.messagesUsed + reserved + contacts.length > store.subscription.maxMessages) {
        throw new PlanLimitError("Saldo de mensagens insuficiente para esta campanha. Faça upgrade do plano.");
      }

      const id = crypto.randomUUID();
      const now = new Date();
      const scheduledAt = body.scheduledAt || now.toISOString();
      const status = Date.parse(scheduledAt) > now.getTime() ? "Agendada" : "Ativa";
      const row = {
        id,
        name: body.name,
        objective: body.objective,
        audience: body.audience,
        sent: 0,
        total: contacts.length,
        replies: 0,
        status: status as "Agendada" | "Ativa",
        date: status === "Ativa" ? "Agora" : new Date(scheduledAt).toLocaleString("pt-BR"),
        message: body.message,
        contactIds: contacts.map((contact) => contact.id),
        instanceName: instanceNames[0],
        instanceNames,
        minIntervalSeconds: body.minIntervalSeconds,
        maxIntervalSeconds: body.maxIntervalSeconds,
        dailyLimit: body.dailyLimit,
        pauseEveryMessages: body.pauseEveryMessages,
        pauseMinutes: body.pauseMinutes,
        rampDaily20: body.rampDaily20,
        startTime: body.startTime,
        endTime: body.endTime,
        weekdays: body.weekdays,
        pauseOnReply: body.pauseOnReply,
        scheduledAt,
      };

      store.campaigns.unshift(row);
      contacts.forEach((contact, index) => {
        const personalized = body.message
          .replace(/\{\{\s*nome\s*\}\}/gi, contact.name)
          .replace(/\{\{\s*empresa\s*\}\}/gi, contact.company)
          .replace(/\{\{\s*cidade\s*\}\}/gi, contact.city)
          .replace(/\{\{\s*segmento\s*\}\}/gi, contact.segment);
        const job: StoredCampaignJob = {
          id: crypto.randomUUID(),
          campaignId: id,
          contactId: contact.id,
          status: "pending",
          attempts: 0,
          scheduledAt: scheduledAt,
          text: personalized,
          instanceName: instanceNames[index % instanceNames.length],
        };
        store.jobs.push(job);
      });

      return row;
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    if (error instanceof PlanLimitError) {
      return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    }
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao criar campanha." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = z.object({ id: z.string().min(1), action: z.enum(["pause", "resume", "cancel"]) }).parse(await req.json());
    const campaign = await updateStore((store) => {
      const row = store.campaigns.find((item) => item.id === id);
      if (!row) throw new Error("Campanha não encontrada.");
      if (action === "pause") row.status = "Pausada";
      if (action === "resume") row.status = "Ativa";
      if (action === "cancel") row.status = "Cancelada";
      if (action === "cancel") store.jobs = store.jobs.map((job) => job.campaignId === id && ["pending", "processing"].includes(job.status) ? { ...job, status: "cancelled" } : job);
      return row;
    });
    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao atualizar campanha." }, { status: 400 });
  }
}
