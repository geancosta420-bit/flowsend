import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { ensureInstanceSlot } from "@/lib/billing/usage";
import { readStore, updateStore, type StoredCampaignJob } from "@/lib/storage/db";

const schema = z.object({ contactId: z.string().min(1), title: z.string().trim().min(2).max(100), scheduledAt: z.string().datetime(), message: z.string().trim().min(2).max(2000), instanceName: z.string().trim().min(2).max(80).regex(/^[\w-]+$/) });

export async function GET() { return NextResponse.json((await readStore()).campaigns.filter((campaign) => campaign.objective.startsWith("Lembrete:"))); }

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    if (Date.parse(body.scheduledAt) <= Date.now()) return NextResponse.json({ error: "Escolha uma data futura para o lembrete." }, { status: 400 });
    const campaign = await updateStore((store) => {
      const contact = store.contacts.find((row) => row.id === body.contactId);
      if (!contact) throw new Error("Contato não encontrado.");
      if (!contact.optedIn || contact.optedOut) throw new Error("Este contato não tem consentimento ativo para receber mensagens.");
      ensureInstanceSlot(store, body.instanceName);
      const pending = store.jobs.filter((job) => job.status === "pending").length;
      if (store.subscription.messagesUsed + store.subscription.reservedMessages + pending + 1 > store.subscription.maxMessages) throw new PlanLimitError("Saldo de mensagens insuficiente para este lembrete. Faça upgrade do plano.");
      const id = randomUUID();
      const text = body.message.replace(/\{\{\s*nome\s*\}\}/gi, contact.name).replace(/\{\{\s*empresa\s*\}\}/gi, contact.company).replace(/\{\{\s*cidade\s*\}\}/gi, contact.city).replace(/\{\{\s*segmento\s*\}\}/gi, contact.segment);
      const row = { id, name: body.title, objective: `Lembrete: ${body.title}`, audience: contact.name, sent: 0, total: 1, replies: 0, status: "Agendada" as const, date: new Date(body.scheduledAt).toLocaleString("pt-BR"), message: text, contactIds: [contact.id], instanceName: body.instanceName, minIntervalSeconds: 20, dailyLimit: 1, startTime: "00:00", endTime: "23:59", weekdays: [0, 1, 2, 3, 4, 5, 6], pauseOnReply: false, scheduledAt: body.scheduledAt };
      store.campaigns.unshift(row);
      const job: StoredCampaignJob = { id: randomUUID(), campaignId: id, contactId: contact.id, status: "pending", attempts: 0, scheduledAt: body.scheduledAt, text, instanceName: body.instanceName };
      store.jobs.push(job);
      return row;
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Não foi possível agendar o lembrete." }, { status: error instanceof z.ZodError ? 400 : 409 });
  }
}
