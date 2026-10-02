import { NextResponse } from "next/server";
import { planCatalog } from "@/lib/billing/plans";
import { readStore } from "@/lib/storage/db";

export async function GET() {
  const store = await readStore();
  const subscription = store.subscription;
  const whatsappUsed = store.instances.filter((instance) => instance.status !== "error").length;

  return NextResponse.json({
    plans: planCatalog,
    subscription: {
      ...subscription,
      planName: planCatalog[subscription.plan].name,
      whatsappUsed,
      messagesRemaining: Math.max(0, subscription.maxMessages - subscription.messagesUsed),
      prospectsRemaining: Math.max(0, subscription.maxProspects - subscription.prospectsUsed),
    },
  });
}

export async function PATCH() {
  return NextResponse.json({ error: "A alteração de plano exige um provedor de pagamentos configurado e confirmação da cobrança." }, { status: 503 });
}
