"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, FileText, LockKeyhole, QrCode, ShieldCheck } from "lucide-react";
import { planCatalog, type PlanId } from "@/lib/billing/plans";

type Billing = { plan: PlanId; messagesUsed: number; maxMessages: number; prospectsUsed: number; maxProspects: number; whatsappUsed: number; maxWhatsapp: number };

export default function PaymentsPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  useEffect(() => { fetch("/api/billing", { cache: "no-store" }).then((response) => response.json()).then((data) => setBilling(data.subscription)).catch(() => {}); }, []);
  const plan = billing ? planCatalog[billing.plan] : null;
  return <>
    <div className="page-heading"><div><div className="eyebrow">FATURAMENTO DO WORKSPACE</div><h1>Pagamentos</h1><p>Acompanhe sua assinatura e os recursos disponíveis.</p></div><Link href="/planos" className="btn btn-primary">Ver opções de upgrade</Link></div>
    <section className="soft-card-grid payment-grid"><article className="soft-card payment-current"><span className="payment-icon"><CreditCard size={18}/></span><div className="eyebrow">ASSINATURA ATUAL</div><h2>{plan?.name || "Carregando…"}</h2><div className="pricing-price">{plan?.priceLabel || "—"}<small>por workspace / mês</small></div><p>O pagamento online ainda não está conectado a um provedor neste ambiente. Nenhum cartão foi solicitado ou armazenado.</p><Link href="/planos" className="btn btn-outline">Revisar planos e limites</Link></article><article className="soft-card"><span className="payment-icon"><ShieldCheck size={18}/></span><h3>Dados de pagamento protegidos</h3><p>O FlowSend não coleta dados de cartão diretamente. Um provedor de pagamento precisa ser configurado antes de cadastrar cartões ou gerar cobranças PIX.</p><span className="status-pill status-gray">Provedor não configurado</span></article><article className="soft-card"><span className="payment-icon"><QrCode size={18}/></span><h3>Cobrança via PIX</h3><p>Não há chave ou conta de cobrança vinculada ao workspace. Após habilitar o provedor, esta área poderá exibir QR Code e status da cobrança.</p><button className="btn btn-outline" disabled title="Configure um provedor de pagamento para gerar cobranças">PIX indisponível</button></article></section>
    <section className="page-card payment-summary"><div className="panel-head"><div><h2>Resumo de uso do plano</h2><p>Consumo atual informado pelo workspace.</p></div><button className="btn btn-outline" onClick={() => window.print()}><FileText size={14}/> Imprimir resumo</button></div><div className="payment-usage">{[["Mensagens",billing?.messagesUsed,billing?.maxMessages],["Prospects",billing?.prospectsUsed,billing?.maxProspects],["Conexões WhatsApp",billing?.whatsappUsed,billing?.maxWhatsapp]].map(([label,used,limit])=><div key={String(label)}><span>{label}</span><b>{Number(used||0).toLocaleString("pt-BR")} / {Number(limit||0).toLocaleString("pt-BR")}</b></div>)}</div><div className="payment-note"><LockKeyhole size={14}/> Este resumo não é uma fatura fiscal ou comprovante de pagamento.</div></section>
    <p className="pricing-footnote">Para ativar cobrança recorrente, emissão de faturas e PIX é necessário conectar uma conta de pagamento do workspace.</p>
  </>;
}
