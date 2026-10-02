import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function matchesDigest(secret: string, body: string, supplied: string) {
  const expected = createHmac("sha512", secret).update(body).digest("hex");
  const normalized = supplied.replace(/^sha512=/i, "").trim().toLowerCase();
  const left = Buffer.from(expected);
  const right = Buffer.from(normalized);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.WAHA_HMAC_SECRET;
  const signature = request.headers.get("x-webhook-hmac") || "";
  if (secret && !matchesDigest(secret, rawBody, signature)) return NextResponse.json({ error: "Assinatura de webhook inválida." }, { status: 401 });
  if (!secret) {
    const expected = process.env.CONTACTS_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET;
    const supplied = request.headers.get("x-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!expected) return NextResponse.json({ error: "Configure WAHA_HMAC_SECRET ou CONTACTS_WEBHOOK_SECRET para proteger o webhook." }, { status: 503 });
    const left = Buffer.from(expected); const right = Buffer.from(supplied);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return NextResponse.json({ error: "Assinatura de webhook inválida." }, { status: 401 });
  }
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) return NextResponse.json({ error: "Configure DATABASE_URL e REDIS_URL para enfileirar a sincronização." }, { status: 503 });

  const base = (process.env.FASTIFY_API_URL || `http://127.0.0.1:${process.env.FASTIFY_PORT || "3001"}`).replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-webhook-hmac"] = createHmac("sha512", secret).update(rawBody).digest("hex");
  else headers["x-webhook-secret"] = process.env.CONTACTS_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET!;

  try {
    const response = await fetch(`${base}/webhooks/waha`, { method: "POST", headers, body: rawBody, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const payload = await response.text();
    return new NextResponse(payload, { status: response.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    console.error("[waha:webhook] não foi possível encaminhar evento ao Fastify", error);
    return NextResponse.json({ error: "Serviço de sincronização indisponível." }, { status: 503 });
  }
}
