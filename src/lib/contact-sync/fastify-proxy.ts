import { NextRequest, NextResponse } from "next/server";

export async function proxyContactsToFastify(request: NextRequest) {
  if (!process.env.DATABASE_URL) return null;
  const token = process.env.FASTIFY_INTERNAL_TOKEN;
  if (!token) return NextResponse.json({ error: "Configure FASTIFY_INTERNAL_TOKEN para habilitar o repositório PostgreSQL de contatos." }, { status: 503 });

  const base = (process.env.FASTIFY_API_URL || `http://127.0.0.1:${process.env.FASTIFY_PORT || "3001"}`).replace(/\/$/, "");
  let path = "/contacts";
  let body: string | undefined;
  if (request.method === "PATCH") {
    const parsed = await request.json().catch(() => null) as { id?: string; changes?: unknown } | null;
    if (!parsed?.id || !parsed.changes) return NextResponse.json({ error: "Contato inválido." }, { status: 400 });
    path += `/${encodeURIComponent(parsed.id)}`;
    body = JSON.stringify({ changes: parsed.changes });
  } else if (request.method !== "GET") {
    body = await request.text();
  }

  const url = new URL(`${base}${path}`);
  if (request.method === "GET") url.search = request.nextUrl.search;
  try {
    const upstream = await fetch(url, { method: request.method, headers: { "x-internal-api-key": token, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const payload = await upstream.text();
    return new NextResponse(payload, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    console.error("[contacts:proxy] Fastify indisponível", error);
    return NextResponse.json({ error: "O serviço Fastify de contatos está indisponível. Inicie a API e o PostgreSQL." }, { status: 503 });
  }
}
