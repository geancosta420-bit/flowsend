import { updateStore } from "@/lib/storage/db";
import { PlanLimitError } from "@/lib/billing/plans";

export function ensureInstanceSlot(store: import("@/lib/storage/db").FlowSendStore, instanceName: string) {
  const existing = store.instances.find((instance) => instance.name.toLowerCase() === instanceName.toLowerCase());
  if (existing && existing.status !== "error") return;

  const connected = store.instances.filter((instance) => instance.status !== "error").length;
  if (connected >= store.subscription.maxWhatsapp) {
    throw new PlanLimitError("Limite de conexões atingido para o seu plano. Faça upgrade.");
  }

  if (existing) {
    existing.status = "connecting";
    existing.updatedAt = new Date().toISOString();
  } else {
    const now = new Date().toISOString();
    store.instances.push({ id: crypto.randomUUID(), name: instanceName, phone: "", provider: "evolution", status: "connecting", createdAt: now, updatedAt: now });
  }
}

export function reserveMessageSlot(instanceName?: string) {
  return updateStore((store) => {
    if (instanceName) ensureInstanceSlot(store, instanceName);
    if (store.subscription.messagesUsed + store.subscription.reservedMessages >= store.subscription.maxMessages) return false;
    store.subscription.reservedMessages += 1;
    return true;
  });
}

export function settleMessageSlot(sent: boolean) {
  return updateStore((store) => {
    store.subscription.reservedMessages = Math.max(0, store.subscription.reservedMessages - 1);
    if (sent) store.subscription.messagesUsed += 1;
  });
}
