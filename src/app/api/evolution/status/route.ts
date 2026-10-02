import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EvolutionProvider } from "@/lib/providers/evolution";
import { registerInstanceInFastify } from "@/lib/contact-sync/client";

const schema = z.object({ instanceName: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/) });

export async function GET(req: NextRequest) {
  try {
    const { instanceName } = schema.parse({ instanceName: req.nextUrl.searchParams.get("instanceName") });
    const provider = new EvolutionProvider();
    const [connection, rawInstances] = await Promise.all([provider.getInstanceStatus(instanceName), provider.getInstances()]);
    const instances = Array.isArray(rawInstances) ? rawInstances : Array.isArray((rawInstances as Record<string, unknown>)?.instances) ? (rawInstances as { instances: unknown[] }).instances : [];
    const account = instances.map((item) => item as Record<string, unknown>).find((item) => String(item.instanceName || item.name || "") === instanceName);
    const owner = String(account?.ownerJid || account?.owner || "");
    const payload = connection as Record<string, unknown>;
    const nested = payload.instance && typeof payload.instance === "object" ? payload.instance as Record<string, unknown> : {};
    const state = String(payload.state || payload.status || payload.connectionStatus || nested.state || nested.status || nested.connectionStatus || "").toLowerCase();
    const syncStatus = state.includes("open") || state.includes("connected") ? "CONNECTED" : state.includes("close") || state.includes("disconnect") ? "DISCONNECTED" : "CONNECTING";
    await registerInstanceInFastify({ provider: "EVOLUTION", instanceName, status: syncStatus, phone: owner.split("@")[0]?.replace(/\D/g, "") || undefined });
    return NextResponse.json({ ...payload, instanceName, normalizedState: syncStatus.toLowerCase(), account: account ? { instanceName, name: String(account.profileName || account.pushName || account.name || instanceName), phone: owner.split("@")[0]?.replace(/\D/g, "") || "", profilePictureUrl: String(account.profilePicUrl || account.profilePictureUrl || "") } : null });
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o status." }, { status: error instanceof z.ZodError ? 400 : status || 502 });
  }
}
