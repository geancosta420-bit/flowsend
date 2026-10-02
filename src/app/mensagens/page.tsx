"use client";
import {useCallback,useEffect,useState} from "react";import {useRouter} from "next/navigation";
import {MoreHorizontal,Paperclip,Search,Send,Smile,RefreshCw,Radio} from "lucide-react";
import type {Contact,Message} from "@/types";
import {notifyBillingUpdated,notifyPlanLimit} from "@/lib/billing/client";
/* eslint react-hooks/set-state-in-effect: off */

function clock(value:string){return new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(value))}

export default function Inbox(){
 const router=useRouter();
 const[contacts,setContacts]=useState<Contact[]>([]);
 const[selectedId,setSelectedId]=useState("");
 const[messages,setMessages]=useState<Message[]>([]);
 const[text,setText]=useState("");
 const[busy,setBusy]=useState(false);
 const[toast,setToast]=useState("");
 const[query,setQuery]=useState("");
 const[live,setLive]=useState(false);
 const[emojiOpen,setEmojiOpen]=useState(false);
 const loadContacts=useCallback(async()=>{const response=await fetch("/api/contacts");if(response.ok)setContacts(await response.json())},[]);
 const loadMessages=useCallback(async(id:string)=>{if(!id)return;const response=await fetch(`/api/messages?contactId=${encodeURIComponent(id)}`,{cache:"no-store"});if(response.ok)setMessages(await response.json())},[]);

 useEffect(()=>{loadContacts().catch(()=>setToast("Não foi possível carregar os contatos."))},[loadContacts]);
 useEffect(()=>{
  if(!selectedId)return
  loadMessages(selectedId).catch(()=>setToast("Não foi possível carregar as mensagens."));
  const source=new EventSource(`/api/messages/events?contactId=${encodeURIComponent(selectedId)}`);
  source.addEventListener("ready",()=>setLive(true));
  source.addEventListener("update",event=>{
   const detail=JSON.parse((event as MessageEvent<string>).data) as {contactId:string};
   if(detail.contactId===selectedId){loadMessages(selectedId).catch(()=>{});loadContacts().catch(()=>{})}
  });
  source.onerror=()=>setLive(false);
  return()=>{source.close()};
 },[selectedId,loadContacts,loadMessages]);

 const contact=contacts.find(row=>row.id===selectedId);
 const filtered=contacts.filter(row=>[row.name,row.company,row.phone].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
 async function send(){if(!contact||!text.trim()||busy)return;if(contact.optedOut){setToast("Este contato bloqueou novas mensagens.");return}setBusy(true);setToast("");try{const response=await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId:contact.id,text})});const data=await response.json();if(!response.ok){if(data.code==="PLAN_LIMIT")notifyPlanLimit(data.error||"Limite do plano atingido.");throw new Error(data.error||"Falha ao enviar.")}setMessages(rows=>rows.some(row=>row.id===data.id)?rows:[...rows,data]);notifyBillingUpdated();setText("");setToast("Mensagem enviada pela Evolution API.")}catch(error){setToast(error instanceof Error?error.message:"Falha ao enviar mensagem.")}finally{setBusy(false)}}

 return <><div className="page-heading"><div><div className="eyebrow">CENTRAL DE ATENDIMENTO</div><h1>Mensagens</h1><p>Converse com contatos em tempo real pela sua instância da Evolution API.</p></div><button className="btn btn-outline" onClick={()=>selectedId&&loadMessages(selectedId)}><RefreshCw size={14}/> Atualizar</button></div><div className="chat-layout"><div className="chat-list"><label className="chat-search"><Search size={14}/><input aria-label="Buscar conversa" placeholder="Buscar conversa..." value={query} onChange={e=>setQuery(e.target.value)} style={{border:0,outline:0,width:"100%",fontSize:10}}/></label>{filtered.map(row=><button type="button" className={`chat-row ${selectedId===row.id?"selected":""}`} key={row.id} onClick={()=>{setMessages([]);setLive(false);setSelectedId(row.id)}}><span className="contact-initial">{row.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><span style={{flex:1,textAlign:"left",minWidth:0}}><b>{row.name}</b><small>{row.company||row.phone}</small></span></button>)}</div>{contact?<div className="chat-pane"><div className="chat-head"><span className="contact-initial">{contact.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><div><b>{contact.name}</b><small>{contact.company} · {contact.phone}</small></div><span className="status-pill" style={{marginLeft:"auto"}}><Radio size={12}/>{live?"Ao vivo":"Reconectando"}</span><button className="icon-button" aria-label="Abrir detalhes do contato" onClick={()=>router.push("/contatos")}><MoreHorizontal size={18}/></button></div><div className="chat-body">{messages.length?messages.map(message=><div className={`bubble ${message.direction==="out"?"out":""}`} key={message.id}>{message.text}<small>{message.status==="demonstration"?"Demonstração · ":message.direction==="out"?"Enviada · ":"Recebida · "}{clock(message.time)}</small></div>):<div className="empty-note">Ainda não há mensagens. Envie a primeira conversa com consentimento do contato.</div>}</div>{emojiOpen&&<div className="emoji-picker">{["😊","👋","✨","👍","🎉","❤️","🙏","📅"].map(emoji=><button key={emoji} onClick={()=>setText(current=>current+emoji)}>{emoji}</button>)}</div>}{toast&&<div className="connection-state">{toast}</div>}<div className="chat-compose"><button className="icon-button" aria-label="Anexos de mídia" onClick={()=>setToast("O envio de anexos ainda não está disponível nesta integração. Envie texto ou emoji.")}><Paperclip size={17}/></button><input value={text} disabled={contact.optedOut||busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={contact.optedOut?"Contato bloqueou mensagens":"Escreva sua mensagem..."}/><button className="icon-button" aria-label="Emojis" onClick={()=>setEmojiOpen(!emojiOpen)}><Smile size={17}/></button><button aria-label="Enviar pela Evolution API" onClick={send} disabled={busy||contact.optedOut||!text.trim()}><Send size={15}/></button></div></div>:<div className="chat-pane"><div className="empty-note">Escolha um contato para ver ou iniciar a conversa.</div></div>}</div></>;
}
