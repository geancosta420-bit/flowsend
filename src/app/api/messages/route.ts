import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { reserveMessageSlot, settleMessageSlot } from "@/lib/billing/usage";
import { readStore, updateStore } from "@/lib/storage/db";
import { EvolutionProvider } from "@/lib/providers/evolution";
import { publishInboxEvent } from "@/lib/realtime/inbox-events";
import { resolveContactInFastify } from "@/lib/contact-sync/fastify-proxy";
import type { Contact } from "@/types";

const phoneSchema = z.string().trim().regex(/^\+?[\d\s().-]{10,24}$/, "Informe um WhatsApp válido com DDD.");
const normalizePhone = (value: string) => value.replace(/\D/g, "");
const toWhatsAppPhone = (value: string) => {
  const digits = normalizePhone(value);
  return digits.startsWith("55") ? digits : `55${digits}`;
};

export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get("contactId");
  const store = await readStore();
  return NextResponse.json(store.messages.filter((message) => !contactId || message.contactId === contactId).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)));
}

export async function POST(req: NextRequest) {
  let reserved = false;
  try {
    const input = z.object({
      contactId: z.string().min(1).optional(),
      phone: phoneSchema.optional(),
      name: z.string().trim().min(1).max(120).optional(),
      text: z.string().trim().min(1).max(4000),
      instanceName: z.string().min(2).max(80).optional(),
    }).refine((value) => Boolean(value.contactId || value.phone), "Selecione um contato ou informe o WhatsApp.").parse(await req.json());

    const store = await readStore();
    let contact = input.contactId ? store.contacts.find((row) => row.id === input.contactId) : undefined;
    if (process.env.DATABASE_URL) {
      try {
        contact = await resolveContactInFastify(input.contactId
          ? { contactId: input.contactId }
          : { phone: toWhatsAppPhone(input.phone!), name: input.name, createIfMissing: true }) as unknown as Contact;
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status !== 404 || (input.contactId && !contact)) throw error;
      }
    } else if (!contact && input.phone) {
      const phone = toWhatsAppPhone(input.phone);
      const digits = normalizePhone(phone);
      contact = store.contacts.find((row) => {
        const candidate = normalizePhone(row.phone);
        const jidPhone = normalizePhone(row.remoteJid || "").replace(/\d{5,}@.*/, "");
        return candidate === digits || candidate === digits.slice(2) || jidPhone === digits || jidPhone === digits.slice(2);
      });
      if (!contact) {
        contact = await updateStore((db) => {
          const current = db.contacts.find((row) => normalizePhone(row.phone) === digits || normalizePhone(row.phone) === digits.slice(2));
          if (current) return current;
          if (db.subscription.prospectsUsed >= db.subscription.maxProspects) throw new PlanLimitError("Limite mensal de prospects atingido. Faça upgrade do plano.");
          const created: Contact = { id: crypto.randomUUID(), name: input.name || input.phone!, phone: `+${digits}`, company: "", email: "", city: "", segment: "", status: "Novo", tags: [], optedIn: false, optedOut: false, lastContact: "—", source: "manual" };
          db.contacts.unshift(created);
          db.subscription.prospectsUsed += 1;
          return created;
        });
      }
    }
    if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    if (contact.optedOut) return NextResponse.json({ error: "Este contato bloqueou novas mensagens." }, { status: 409 });

    const selectedInstance = input.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "flowsend-comercial";
    reserved = await reserveMessageSlot(selectedInstance);
    if (!reserved) return NextResponse.json(planLimitPayload("Saldo mensal de mensagens esgotado. Faça upgrade do plano."), { status: 403 });

    const phoneForProvider = toWhatsAppPhone(contact.phone || input.phone!);
    const sent = await new EvolutionProvider().sendText(selectedInstance, phoneForProvider, input.text) as Record<string, unknown>;
    const message = await updateStore((db) => {
      const key = sent.key as Record<string, unknown> | undefined;
      const row = { id: crypto.randomUUID(), contactId: contact!.id, direction: "out" as const, text: input.text, time: new Date().toISOString(), status: "sent", providerMessageId: String(key?.id || sent.messageId || "") || undefined };
      db.messages.push(row);
      const target = db.contacts.find((item) => item.id === contact!.id);
      if (target) target.lastContact = new Date().toLocaleString("pt-BR");
      db.subscription.reservedMessages = Math.max(0, db.subscription.reservedMessages - 1);
      db.subscription.messagesUsed += 1;
      return row;
    });
    reserved = false;
    publishInboxEvent({ contactId: contact.id, messageId: message.id, kind: "message" });
    return NextResponse.json({ ...message, contact }, { status: 201 });
  } catch (error) {
    if (reserved) await settleMessageSlot(false);
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    const status = (error as Error & { status?: number }).status;
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao enviar mensagem." }, { status: error instanceof z.ZodError ? 400 : status || 502 });
  }
}
