import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSubscription, planCatalog } from "@/lib/billing/plans";
import { getCurrentUser } from "@/lib/auth/server";
import { readStore, updateStore } from "@/lib/storage/db";

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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Somente um administrador pode ativar ou alterar o plano." }, { status: 403 });

  try {
    const { plan } = z.object({ plan: z.enum(["STARTER", "PRO", "SCALE"]) }).parse(await req.json());
    const subscription = await updateStore((store) => {
      const current = store.subscription;
      const limits = createSubscription(plan);
      store.subscription = {
        ...limits,
        messagesUsed: current.messagesUsed,
        prospectsUsed: current.prospectsUsed,
        reservedMessages: current.reservedMessages,
        usagePeriod: current.usagePeriod,
      };
      return store.subscription;
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível alterar o plano." }, { status: 400 });
  }
}
