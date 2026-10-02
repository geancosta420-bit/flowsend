"use client";

import { useEffect, useState } from "react";
import { Check, Crown, MessageSquareText, Search, Smartphone } from "lucide-react";
import Link from "next/link";
import { planCatalog, type PlanId } from "@/lib/billing/plans";

type Billing = { plan: PlanId; messagesUsed: number; prospectsUsed: number; whatsappUsed: number };
const planOrder: PlanId[] = ["STARTER", "PRO", "SCALE"];
const formatter = new Intl.NumberFormat("pt-BR");

export default function PlansPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<PlanId | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/billing").then((response) => response.json()).then((data) => setBilling(data.subscription)).catch(() => {});
    fetch("/api/auth/me").then((response) => response.json()).then((data) => setIsAdmin(data.user?.role === "admin")).catch(() => {});
  }, []);

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
    <p className="pricing-footnote">Os limites mensais reiniciam no primeiro dia de cada mês. O upgrade é ativado após a confirmação da assinatura.</p>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={() => setRequestedPlan(null)}><section className="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="plan-request-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setRequestedPlan(null)} aria-label="Fechar">×</button><div className="eyebrow">UPGRADE PARA {selected.name.toUpperCase()}</div><h2 id="plan-request-title">{isAdmin ? "Revise pagamento e limites" : "Solicite mais capacidade"}</h2><p>{isAdmin ? `O plano ${selected.name} custa ${selected.priceLabel} e inclui ${selected.maxWhatsapp} conexões, ${selected.maxMessages.toLocaleString("pt-BR")} mensagens e ${selected.maxProspects >= 999_999 ? "prospects ilimitados" : `${selected.maxProspects.toLocaleString("pt-BR")} prospects`}. O pagamento online não está conectado; os limites não serão alterados até a confirmação por um provedor.` : `O plano ${selected.name} custa ${selected.priceLabel}. Peça ao administrador do workspace para revisar as opções de pagamento.`}</p><div className="upgrade-modal-actions"><button className="btn btn-outline" onClick={() => setRequestedPlan(null)}>Fechar</button><Link className="btn btn-primary" href="/pagamentos" onClick={() => setRequestedPlan(null)}>Ver pagamentos</Link></div></section></div>}
  </>;
}
