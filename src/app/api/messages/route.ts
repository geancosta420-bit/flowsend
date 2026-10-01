import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { reserveMessageSlot, settleMessageSlot } from "@/lib/billing/usage";
import { readStore, updateStore } from "@/lib/storage/db";
import { EvolutionProvider } from "@/lib/providers/evolution";
import { publishInboxEvent } from "@/lib/realtime/inbox-events";

export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get("contactId");
  const store = await readStore();
  return NextResponse.json(store.messages.filter((message) => !contactId || message.contactId === contactId).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)));
}

export async function POST(req: NextRequest) {
  let reserved = false;
  try {
    const { contactId, text, instanceName } = z.object({ contactId: z.string().min(1), text: z.string().trim().min(1).max(4000), instanceName: z.string().min(2).max(80).optional() }).parse(await req.json());
    const store = await readStore();
    const contact = store.contacts.find((row) => row.id === contactId);
    if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    if (contact.optedOut) return NextResponse.json({ error: "Este contato bloqueou novas mensagens." }, { status: 409 });

    const selectedInstance = instanceName || process.env.EVOLUTION_INSTANCE_NAME || "flowsend-comercial";
    reserved = await reserveMessageSlot(selectedInstance);
    if (!reserved) return NextResponse.json(planLimitPayload("Saldo mensal de mensagens esgotado. Faça upgrade do plano."), { status: 403 });

    const sent = await new EvolutionProvider().sendText(selectedInstance, contact.phone, text) as Record<string, unknown>;
    const message = await updateStore((db) => {
      const key = sent.key as Record<string, unknown> | undefined;
      const row = { id: crypto.randomUUID(), contactId, direction: "out" as const, text, time: new Date().toISOString(), status: "sent", providerMessageId: String(key?.id || sent.messageId || "") || undefined };
      db.messages.push(row);
      const target = db.contacts.find((item) => item.id === contactId);
      if (target) target.lastContact = new Date().toLocaleString("pt-BR");
      db.subscription.reservedMessages = Math.max(0, db.subscription.reservedMessages - 1);
      db.subscription.messagesUsed += 1;
      return row;
    });
    reserved = false;
    publishInboxEvent({ contactId, messageId: message.id, kind: "message" });
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (reserved) await settleMessageSlot(false);
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao enviar mensagem." }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
