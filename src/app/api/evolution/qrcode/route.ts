import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EvolutionProvider } from "@/lib/providers/evolution";

const schema = z.object({ instanceName: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/) });

export async function POST(req: NextRequest) {
  try {
    const { instanceName } = schema.parse(await req.json());
    const provider = new EvolutionProvider();
    const status = await provider.getInstanceStatus(instanceName) as Record<string, unknown>;
    const instance = status.instance && typeof status.instance === "object" ? status.instance as Record<string, unknown> : {};
    const state = String(status.state || status.status || status.connectionStatus || instance.state || instance.status || instance.connectionStatus || "").toLowerCase();
    if (state.includes("open") || state.includes("connected")) {
      return NextResponse.json({ ...status, instanceName, alreadyConnected: true });
    }
    return NextResponse.json(await provider.getQRCode(instanceName));
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível obter o QR Code." }, { status: error instanceof z.ZodError ? 400 : status || 502 });
  }
}
