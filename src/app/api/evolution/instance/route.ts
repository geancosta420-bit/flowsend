import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/storage/db";
import { z } from "zod";
import { PlanLimitError, planLimitPayload } from "@/lib/billing/plans";
import { EvolutionProvider } from "@/lib/providers/evolution";
import { updateStore } from "@/lib/storage/db";
import { registerInstanceInFastify } from "@/lib/contact-sync/client";

const schema = z.object({ instanceName: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/) });

export async function GET() { return NextResponse.json((await readStore()).instances); }

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
    let result: unknown;
    let alreadyExists = false;
    if (reservation.created) {
      try {
        result = await provider.createInstance(instanceName);
      } catch (createError) {
        // The local store can be empty after a reset while the provider still has
        // the instance. If its status endpoint recognizes it, reuse it instead of
        // leaving the UI stuck on a duplicate-instance error.
        try {
          result = await provider.getInstanceStatus(instanceName);
          alreadyExists = true;
        } catch {
          throw createError;
        }
      }
    } else result = await provider.getInstanceStatus(instanceName);

    let webhookWarning: string | undefined;
    try { await provider.configureContactWebhook(instanceName); }
    catch (error) {
      webhookWarning = error instanceof Error ? error.message : "Não foi possível configurar o webhook da Evolution.";
      console.error("[evolution:instance] instância criada/localizada, mas webhook não configurado", error);
    }
    const payload = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const nested = payload.instance && typeof payload.instance === "object" ? payload.instance as Record<string, unknown> : {};
    const state = String(payload.state || payload.status || payload.connectionStatus || nested.state || nested.status || nested.connectionStatus || "").toLowerCase();
    const instanceStatus = state.includes("open") || state.includes("connected") ? "CONNECTED" : state.includes("close") || state.includes("disconnect") ? "DISCONNECTED" : "CONNECTING";
    await updateStore((store) => {
      const local = store.instances.find((item) => item.name.toLowerCase() === instanceName.toLowerCase());
      if (local) { local.status = instanceStatus.toLowerCase() as typeof local.status; local.updatedAt = new Date().toISOString(); }
    });
    await registerInstanceInFastify({ provider: "EVOLUTION", instanceName, status: instanceStatus });
    return NextResponse.json({ ...(result && typeof result === "object" ? result : { result }), instanceName, alreadyExists, ...(webhookWarning ? { warning: webhookWarning } : {}) }, { status: 200 });
  } catch (error) {
    if (reservation?.created) {
      await updateStore((store) => { store.instances = store.instances.filter((instance) => instance.id !== reservation?.id); });
    }
    if (error instanceof PlanLimitError) return NextResponse.json(planLimitPayload(error.message), { status: 403 });
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Falha ao criar instância." }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
