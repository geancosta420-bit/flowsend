import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { reserveMessageSlot, settleMessageSlot } from "@/lib/billing/usage";
import { EvolutionProvider } from "@/lib/providers/evolution";

const schema = z.object({ instanceName: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/), number: z.string().regex(/^\+?[\d\s().-]{10,20}$/), text: z.string().trim().min(1).max(4000) });

export async function POST(req: NextRequest) {
  let reserved = false;
  try {
    const data = schema.parse(await req.json());
    if (!data.number.replace(/\D/g, "").startsWith("55")) return NextResponse.json({ error: "Use um número com código do país, por exemplo +55." }, { status: 400 });
    reserved = await reserveMessageSlot(data.instanceName);
    if (!reserved) return NextResponse.json(planLimitPayload("Saldo mensal de mensagens esgotado. Faça upgrade do plano."), { status: 403 });

    const result = await new EvolutionProvider().sendText(data.instanceName, data.number, data.text);
    await settleMessageSlot(true);
    reserved = false;
    return NextResponse.json(result);
  } catch (error) {
    if (reserved) await settleMessageSlot(false);
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Dados inválidos." }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
