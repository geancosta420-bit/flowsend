import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { readStore, updateStore } from "@/lib/storage/db";
import type { Contact } from "@/types";

const phoneSchema = z.string().trim().regex(/^\+?[\d\s().-]{10,20}$/, "Informe um WhatsApp válido.");
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  company: z.string().max(160).default(""),
  email: z.string().email().or(z.literal("")).default(""),
  city: z.string().max(120).default(""),
  segment: z.string().max(100).default(""),
  notes: z.string().max(2000).optional().default(""),
  leadValue: z.number().min(0).max(100000000).optional().default(0),
  tags: z.array(z.string().max(40)).default([]),
  status: z.enum(["Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Negociação", "Cliente", "Sem interesse"]).default("Novo"),
  optedIn: z.boolean().default(false),
  optedOut: z.boolean().default(false),
});
const normalize = (value: string) => value.replace(/\D/g, "");

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
  return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : fallback }, { status: error instanceof z.ZodError ? 400 : 409 });
}

export async function GET(req: NextRequest) {
  const store = await readStore();
  const query = (req.nextUrl.searchParams.get("q") || "").toLocaleLowerCase("pt-BR");
  const status = req.nextUrl.searchParams.get("status");
  return NextResponse.json(store.contacts.filter((contact) =>
    (!query || [contact.name, contact.phone, contact.company, contact.city, contact.segment, ...contact.tags].join(" ").toLocaleLowerCase("pt-BR").includes(query)) &&
    (!status || status === "Todos os status" || (status === "Bloqueados" ? contact.optedOut : contact.status === status)),
  ));
}

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json());
    const contact = await updateStore((store) => {
      if (store.contacts.some((row) => normalize(row.phone) === normalize(body.phone))) throw new Error("Já existe um contato com esse WhatsApp.");
      if (store.subscription.prospectsUsed >= store.subscription.maxProspects) throw new PlanLimitError("Limite mensal de prospects atingido. Faça upgrade do plano.");
      const row: Contact = { ...body, id: crypto.randomUUID(), lastContact: "—" };
      store.contacts.unshift(row);
      store.subscription.prospectsUsed += 1;
      return row;
    });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Não foi possível criar contato.");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = z.object({ id: z.string().min(1), changes: createSchema.partial() }).parse(await req.json());
    const contact = await updateStore((store) => {
      const row = store.contacts.find((item) => item.id === body.id);
      if (!row) throw new Error("Contato não encontrado.");
      if (body.changes.phone && store.contacts.some((item) => item.id !== row.id && normalize(item.phone) === normalize(body.changes.phone!))) throw new Error("Já existe um contato com esse WhatsApp.");
      Object.assign(row, body.changes);
      return row;
    });
    return NextResponse.json(contact);
  } catch (error) {
    return errorResponse(error, "Não foi possível atualizar contato.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { contacts } = z.object({ contacts: z.array(createSchema.extend({ id: z.string().min(1), lastContact: z.string().default("—") })).max(10000) }).parse(await req.json());
    const result = await updateStore((store) => {
      const seen = new Set<string>();
      for (const contact of contacts) {
        const phone = normalize(contact.phone);
        if (seen.has(phone)) throw new Error("A lista contém WhatsApps duplicados.");
        seen.add(phone);
      }
      const existingIds = new Set(store.contacts.map((contact) => contact.id));
      const added = contacts.filter((contact) => !existingIds.has(contact.id)).length;
      if (store.subscription.prospectsUsed + added > store.subscription.maxProspects) throw new PlanLimitError("Limite mensal de prospects excedido por esta importação. Faça upgrade do plano.");
      store.subscription.prospectsUsed += added;
      store.contacts = contacts as Contact[];
      return store.contacts.length;
    });
    return NextResponse.json({ saved: result });
  } catch (error) {
    return errorResponse(error, "Não foi possível salvar contatos.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(await req.json());
    const removed = await updateStore((store) => {
      const before = store.contacts.length;
      store.contacts = store.contacts.filter((contact) => !ids.includes(contact.id));
      const deleted = new Set(ids);
      store.jobs = store.jobs.map((job) => deleted.has(job.contactId) && job.status === "pending" ? { ...job, status: "skipped" } : job);
      return before - store.contacts.length;
    });
    return NextResponse.json({ deleted: removed });
  } catch (error) {
    return errorResponse(error, "Não foi possível remover contatos.");
  }
}
