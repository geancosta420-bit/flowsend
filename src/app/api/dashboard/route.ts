import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/storage/db";
import { initialContacts } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusMap: Record<string, string> = { NOVO: "Novo", CONTATADO: "Contatado", RESPONDEU: "Respondeu", INTERESSADO: "Interessado", PROPOSTA: "Proposta", NEGOCIACAO: "Negociação", CLIENTE: "Cliente", SEM_INTERESSE: "Sem interesse" };

async function databaseContactStats() {
  if (!process.env.DATABASE_URL) return null;
  const token = process.env.FASTIFY_INTERNAL_TOKEN;
  if (!token) throw new Error("Configure FASTIFY_INTERNAL_TOKEN para consultar métricas do PostgreSQL.");
  const base = (process.env.FASTIFY_API_URL || `http://127.0.0.1:${process.env.FASTIFY_PORT || "3001"}`).replace(/\/$/, "");
  const response = await fetch(`${base}/dashboard/stats`, { headers: { "x-internal-api-key": token }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "O serviço Fastify de métricas está indisponível.");
  return data as { total: number; byStatus: Record<string, number>; connectedInstances: number };
}

export async function GET(request: NextRequest) {
  try {
    const [store, dbStats] = await Promise.all([readStore(), databaseContactStats()]);
    const requestedDays = Number(request.nextUrl.searchParams.get("days") || 7);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const demoIds = new Set(initialContacts.map((contact) => contact.id));
    const contacts = store.contacts.filter((contact) => !demoIds.has(contact.id));
    const statusCounts: Record<string, number> = {};
    for (const contact of contacts) statusCounts[contact.status] = (statusCounts[contact.status] || 0) + 1;
    if (dbStats) for (const [status, count] of Object.entries(dbStats.byStatus)) statusCounts[statusMap[status] || status] = count;
    const count = (status: string) => statusCounts[status] || 0;
    const messages = store.messages.filter((message) => message.status !== "demonstration");
    const realCampaigns = store.campaigns.filter((campaign) => campaign.contactIds?.length && campaign.status !== "Cancelada");
    const now = new Date();
    const series = Array.from({ length: days }, (_, index) => {
      const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (days - 1 - index));
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const onDay = messages.filter((message) => Date.parse(message.time) >= day.getTime() && Date.parse(message.time) < next.getTime());
      return { day: days === 7 ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day).replace(".", "") : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(day), sent: onDay.filter((message) => message.direction === "out").length, replies: onDay.filter((message) => message.direction === "in").length, conversions: 0 };
    });
    const recentActivity = messages.filter((message) => Date.parse(message.time) >= Date.now() - days * 86_400_000).slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 5).map((message) => ({ id: message.id, direction: message.direction, text: message.text, time: message.time, contactName: store.contacts.find((contact) => contact.id === message.contactId)?.name || "Contato" }));
    const statusBuckets = ["Novo", "Contatado", "Respondeu", "Interessado", "Proposta", "Cliente"].map((name) => ({ name, n: count(name) }));
    const connectedInstances = dbStats?.connectedInstances ?? store.instances.filter((instance) => instance.status === "connected").length;
    const messagesSent = messages.filter((message) => message.direction === "out").length;
    const replies = messages.filter((message) => message.direction === "in").length;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      metrics: { contacts: dbStats?.total ?? contacts.length, campaigns: realCampaigns.length, messagesSent, replies, interested: count("Interessado"), opportunities: count("Proposta") + count("Negociação"), sales: count("Cliente"), connectedInstances },
      chartData: series,
      stages: statusBuckets,
      campaigns: realCampaigns.slice().sort((a, b) => Date.parse(b.scheduledAt || b.date) - Date.parse(a.scheduledAt || a.date)).slice(0, 5),
      recentActivity,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[dashboard] falha ao montar indicadores", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o dashboard." }, { status: 503 });
  }
}
