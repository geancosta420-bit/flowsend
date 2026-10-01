export const planCatalog = {
  STARTER: { name: "Starter", priceLabel: "R$ 97 / mês", maxWhatsapp: 1, maxMessages: 2_000, maxProspects: 50 },
  PRO: { name: "Pro", priceLabel: "R$ 197 / mês", maxWhatsapp: 3, maxMessages: 15_000, maxProspects: 500 },
  SCALE: { name: "Scale", priceLabel: "R$ 397 / mês", maxWhatsapp: 10, maxMessages: 50_000, maxProspects: 999_999 },
} as const;

export type PlanId = keyof typeof planCatalog;

export interface SubscriptionRecord {
  plan: PlanId;
  maxWhatsapp: number;
  maxMessages: number;
  maxProspects: number;
  messagesUsed: number;
  prospectsUsed: number;
  reservedMessages: number;
  usagePeriod: string;
}

export function currentUsagePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function createSubscription(plan: PlanId = "STARTER"): SubscriptionRecord {
  const limits = planCatalog[plan];
  return {
    plan,
    maxWhatsapp: limits.maxWhatsapp,
    maxMessages: limits.maxMessages,
    maxProspects: limits.maxProspects,
    messagesUsed: 0,
    prospectsUsed: 0,
    reservedMessages: 0,
    usagePeriod: currentUsagePeriod(),
  };
}

export function normalizeSubscription(saved?: Partial<SubscriptionRecord> | null): SubscriptionRecord {
  const plan: PlanId = saved?.plan && saved.plan in planCatalog ? saved.plan : "STARTER";
  const defaults = createSubscription(plan);
  const period = saved?.usagePeriod || defaults.usagePeriod;
  if (period !== currentUsagePeriod()) return defaults;

  return {
    ...defaults,
    messagesUsed: Math.max(0, saved?.messagesUsed || 0),
    prospectsUsed: Math.max(0, saved?.prospectsUsed || 0),
    reservedMessages: Math.max(0, saved?.reservedMessages || 0),
    usagePeriod: period,
  };
}

export function planLimitPayload(message: string) {
  return { error: message, code: "PLAN_LIMIT", upgradeUrl: "/planos" };
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}
