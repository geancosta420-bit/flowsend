export function notifyPlanLimit(message: string) {
  window.dispatchEvent(new CustomEvent("flowsend:plan-limit", { detail: { message } }));
}

export function notifyBillingUpdated() {
  window.dispatchEvent(new Event("flowsend:billing-changed"));
}
