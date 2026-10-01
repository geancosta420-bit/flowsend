"use client";

import { useEffect, useState } from "react";
import { Check, Crown, MessageSquareText, Search, Smartphone } from "lucide-react";
import { planCatalog, type PlanId } from "@/lib/billing/plans";
import { notifyBillingUpdated } from "@/lib/billing/client";

type Billing = { plan: PlanId; messagesUsed: number; prospectsUsed: number; whatsappUsed: number };
const planOrder: PlanId[] = ["STARTER", "PRO", "SCALE"];
const formatter = new Intl.NumberFormat("pt-BR");

export default function PlansPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<PlanId | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/billing").then((response) => response.json()).then((data) => setBilling(data.subscription)).catch(() => {});
    fetch("/api/auth/me").then((response) => response.json()).then((data) => setIsAdmin(data.user?.role === "admin")).catch(() => {});
  }, []);

  async function activatePlan() {
    if (!requestedPlan) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: requestedPlan }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o plano.");
      setBilling((current) => current ? { ...current, ...data.subscription } : current);
      notifyBillingUpdated();
      setNotice(`Plano ${planCatalog[requestedPlan].name} ativado para este workspace.`);
      setRequestedPlan(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao alterar o plano.");
    } finally {
      setBusy(false);
    }
  }

  const selected = requestedPlan ? planCatalog[requestedPlan] : null;
  return <>
    <div className="page-heading"><div><div className="eyebrow">ASSINATURA DO WORKSPACE</div><h1>Planos e preços</h1><p>Encontre a capacidade certa para sua operação e acompanhe seus limites mensais.</p></div></div>
    <div className="plan-current-banner"><Crown size={17} /><span>Plano atual: <b>{billing ? planCatalog[billing.plan].name : "Carregando…"}</b></span><span className="plan-current-usage">{billing ? `${formatter.format(billing.messagesUsed)} mensagens · ${formatter.format(billing.prospectsUsed)} prospects · ${billing.whatsappUsed} conexões` : ""}</span></div>
    <section className="pricing-grid" aria-label="Tabela de planos FlowSend">
      {planOrder.map((id) => {
        const plan = planCatalog[id];
        const isCurrent = billing?.plan === id;
        return <article className={`pricing-card ${id === "PRO" ? "pricing-featured" : ""}`} key={id}>
          {id === "PRO" && <span className="pricing-popular">MAIS POPULAR</span>}
          <div className="pricing-card-heading"><div><span className="eyebrow">{plan.name.toUpperCase()}</span><h2>{plan.name}</h2></div>{isCurrent && <span className="status-pill status-green"><i />Atual</span>}</div>
          <div className="pricing-price">{plan.priceLabel}<small>por workspace / mês</small></div>
          <p className="pricing-description">{id === "STARTER" ? "Para começar e organizar a prospecção." : id === "PRO" ? "Para equipes que estão crescendo." : "Para operações com alto volume."}</p>
          <ul className="pricing-features">
            <li><Smartphone size={15} /><span><b>{plan.maxWhatsapp}</b> conexão{plan.maxWhatsapp === 1 ? "" : "ões"} WhatsApp</span></li>
            <li><MessageSquareText size={15} /><span><b>{formatter.format(plan.maxMessages)}</b> mensagens por mês</span></li>
            <li><Search size={15} /><span><b>{plan.maxProspects >= 999_999 ? "Ilimitado" : formatter.format(plan.maxProspects)}</b> prospects por mês</span></li>
            <li><Check size={15} /><span>CRM, campanhas e caixa de entrada</span></li>
          </ul>
          <button className={`btn ${isCurrent ? "btn-outline" : "btn-primary"} pricing-action`} disabled={isCurrent} onClick={() => setRequestedPlan(id)}>{isCurrent ? "Seu plano atual" : isAdmin ? "Ativar após pagamento" : "Como pedir upgrade"}</button>
        </article>;
      })}
    </section>
    {notice && <div className="connection-state plan-notice">{notice}</div>}
    <p className="pricing-footnote">Os limites mensais reiniciam no primeiro dia de cada mês. O upgrade é ativado após a confirmação da assinatura.</p>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && setRequestedPlan(null)}><section className="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="plan-request-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => !busy && setRequestedPlan(null)} aria-label="Fechar">×</button><div className="eyebrow">UPGRADE PARA {selected.name.toUpperCase()}</div><h2 id="plan-request-title">{isAdmin ? "Confirme a ativação" : "Solicite mais capacidade"}</h2><p>{isAdmin ? `Ative ${selected.name} por ${selected.priceLabel} somente após confirmar o pagamento. A troca altera os limites do workspace imediatamente; a cobrança online ainda não está integrada.` : `O plano ${selected.name} custa ${selected.priceLabel}. Peça ao administrador do workspace para confirmar o pagamento e ativar a assinatura.`}</p><div className="upgrade-modal-actions"><button className="btn btn-outline" disabled={busy} onClick={() => setRequestedPlan(null)}>Cancelar</button>{isAdmin ? <button className="btn btn-primary" disabled={busy} onClick={activatePlan}>{busy ? "Ativando…" : "Confirmar ativação"}</button> : <button className="btn btn-primary" onClick={() => setRequestedPlan(null)}>Entendi</button>}</div></section></div>}
  </>;
}
