import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { updateStore } from "@/lib/storage/db";
import type { Contact } from "@/types";

const rowSchema = z.object({ name: z.string().trim().min(1), phone: z.string().trim().regex(/^\+?[\d\s().-]{10,20}$/), company: z.string().optional().default(""), email: z.string().email().or(z.literal("")).optional().default(""), city: z.string().optional().default(""), segment: z.string().optional().default(""), tags: z.array(z.string()).optional().default([]), optedIn: z.boolean().optional().default(false) });
const normalize = (value: string) => value.replace(/\D/g, "");

export async function POST(req: NextRequest) {
  try {
    const { rows } = z.object({ rows: z.array(z.unknown()).max(5000) }).parse(await req.json());
    const parsed = rows.map((row) => rowSchema.safeParse(row));
    const result = await updateStore((store) => {
      const known = new Set(store.contacts.map((contact) => normalize(contact.phone)));
      const valid = parsed.flatMap((item) => item.success ? [item.data] : []);
      const projectedPhones = new Set(known);
      let added = 0;
      for (const row of valid) {
        const phone = normalize(row.phone);
        if (projectedPhones.has(phone)) continue;
        projectedPhones.add(phone);
        added++;
      }
      if (store.subscription.prospectsUsed + added > store.subscription.maxProspects) throw new PlanLimitError("Limite mensal de prospects excedido por esta importação. Faça upgrade do plano.");

      let invalid = 0;
      let duplicates = 0;
      let imported = 0;
      for (const item of parsed) {
        if (!item.success) { invalid++; continue; }
        const row = item.data;
        const phone = normalize(row.phone);
        if (known.has(phone)) { duplicates++; continue; }
        known.add(phone);
        const contact: Contact = { ...row, id: crypto.randomUUID(), status: "Novo", optedOut: false, lastContact: "—" };
        store.contacts.push(contact);
        imported++;
      }
      store.subscription.prospectsUsed += imported;
      return { imported, duplicates, invalid };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha na importação." }, { status: error instanceof z.ZodError ? 400 : 409 });
  }
}
