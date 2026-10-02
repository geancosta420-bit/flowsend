"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, MessageCircle, PlayCircle, Search } from "lucide-react";

const faqs = [
  ["Como conecto meu WhatsApp?", "Abra Integrações, configure EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor, teste a conexão e leia o QR Code com o WhatsApp."],
  ["Por que não consigo avançar ou iniciar uma campanha?", "O wizard permite configurar cada etapa. Para iniciar, é necessário ter contatos com consentimento registrado na lista escolhida, uma instância configurada e saldo disponível no plano."],
  ["Como importo contatos?", "Em Contatos, baixe o modelo CSV, preencha as colunas, indique consentimento somente quando houver autorização registrada e use Importar CSV."],
  ["Como recebo mensagens inbound em tempo real?", "Configure o webhook da Evolution API para /api/webhooks/evolution e informe o segredo compartilhado em EVOLUTION_WEBHOOK_SECRET quando configurado."],
  ["Como funcionam os limites do plano?", "A página Planos exibe conexões, mensagens e prospects. Pagamentos online precisam de um provedor habilitado pelo administrador do FlowSend."],
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "");
  return <>
    <div className="page-heading"><div><div className="eyebrow">SUPORTE FLOWSEND</div><h1>Central de ajuda</h1><p>Guias rápidos para configurar seu workspace e tirar dúvidas.</p></div></div>
    <div className="soft-card-grid help-grid"><article className="soft-card"><BookOpen size={19} color="#a5b4fc"/><h3>Primeiros passos</h3><p>Cadastre contatos com consentimento, organize listas, conecte a Evolution API e teste mensagens antes de criar campanhas.</p><a className="text-link" href="/integracoes">Abrir integrações →</a></article><article className="soft-card"><PlayCircle size={19} color="#a5b4fc"/><h3>Tutoriais</h3><p>O mini tutorial aparece no primeiro acesso e pode ser reaberto pelo menu de ajuda. Consulte também as respostas abaixo.</p><a className="text-link" href="/contatos">Começar pelos contatos →</a></article><article className="soft-card"><MessageCircle size={19} color="#a5b4fc"/><h3>Fale com o suporte</h3><p>{supportPhone ? "Abra uma conversa com nossa equipe pelo WhatsApp." : "O número de suporte ainda não foi configurado pelo administrador."}</p>{supportPhone&&<a className="btn btn-primary" href={`https://wa.me/${supportPhone}`} target="_blank" rel="noreferrer">Conversar no WhatsApp</a>}</article></div>
    <section className="page-card faq-card"><div className="panel-head"><div><h2><Search size={15}/> Perguntas frequentes</h2><p>Respostas para as tarefas mais comuns.</p></div></div>{faqs.map(([question,answer],index)=><div className="faq-item" key={question}><button onClick={()=>setOpen(open===index?null:index)} aria-expanded={open===index}>{question}<ChevronDown size={16}/></button>{open===index&&<p>{answer}</p>}</div>)}</section>
  </>;
}
