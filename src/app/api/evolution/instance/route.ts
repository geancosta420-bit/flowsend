import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { EvolutionProvider } from "@/lib/providers/evolution";
import { updateStore } from "@/lib/storage/db";

const schema = z.object({ instanceName: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/) });

export async function POST(req: NextRequest) {
  let reservation: { id: string; created: boolean } | undefined;
  try {
    const { instanceName } = schema.parse(await req.json());
    reservation = await updateStore((store) => {
      const existing = store.instances.find((instance) => instance.name.toLowerCase() === instanceName.toLowerCase());
      if (existing) return { id: existing.id, created: false };

      const used = store.instances.filter((instance) => instance.status !== "error").length;
      if (used >= store.subscription.maxWhatsapp) throw new PlanLimitError("Limite de conexões atingido para o seu plano. Faça upgrade.");

      const now = new Date().toISOString();
      const instance = { id: crypto.randomUUID(), name: instanceName, phone: "", provider: "evolution" as const, status: "connecting" as const, createdAt: now, updatedAt: now };
      store.instances.push(instance);
      return { id: instance.id, created: true };
    });

    const provider = new EvolutionProvider();
    const result = reservation.created ? await provider.createInstance(instanceName) : await provider.getInstanceStatus(instanceName);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (reservation?.created) {
      await updateStore((store) => { store.instances = store.instances.filter((instance) => instance.id !== reservation?.id); });
    }
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao criar instância." }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
