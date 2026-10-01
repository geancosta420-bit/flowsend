import {NextRequest,NextResponse} from "next/server";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {updateStore} from "@/lib/storage/db";
import {publishInboxEvent} from "@/lib/realtime/inbox-events";
import type {Contact} from "@/types";

function sameSecret(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}
function normalize(value:string){return value.replace(/\D/g,"")}
function getText(message:Record<string,unknown>){const extended=message.extendedTextMessage as Record<string,unknown>|undefined;const image=message.imageMessage as Record<string,unknown>|undefined;const conversation=message.conversation;return typeof conversation==="string"?conversation:typeof extended?.text==="string"?extended.text:typeof image?.caption==="string"?image.caption:""}
export async function POST(req:NextRequest){
 const secret=process.env.EVOLUTION_WEBHOOK_SECRET;
 if(secret){const supplied=req.headers.get("x-webhook-secret")||req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";if(!sameSecret(secret,supplied))return NextResponse.json({error:"Não autorizado."},{status:401})}
 const payload=await req.json().catch(()=>null);
 if(!payload||typeof payload!=="object")return NextResponse.json({error:"Payload inválido."},{status:400});
 const event=String(payload.event||payload.type||"unknown").toLowerCase();
 const instance=String(payload.instance||payload.instanceName||"");
 const data=(payload.data&&typeof payload.data==="object"?payload.data:{}) as Record<string,unknown>;
 const key=(data.key&&typeof data.key==="object"?data.key:{}) as Record<string,unknown>;
 const message=(data.message&&typeof data.message==="object"?data.message:{}) as Record<string,unknown>;
 const messageId=String(key.id||data.id||"");
 try{
  if(event.includes("messages.upsert")||event.includes("messages_upsert")){
   const remoteJid=String(key.remoteJid||"");const phone=normalize(remoteJid.split("@")[0]||"");const fromMe=Boolean(key.fromMe);const text=getText(message);if(!phone||remoteJid.includes("@g.us")||!text)return NextResponse.json({received:true,ignored:true},{status:202});
   const result=await updateStore(store=>{
    if(messageId&&store.messages.some(row=>row.providerMessageId===messageId))return null;
    let contact=store.contacts.find(row=>normalize(row.phone)===phone);
    if(!contact&&!fromMe&&process.env.EVOLUTION_CREATE_UNKNOWN_CONTACTS==="true"){
     contact={id:randomUUID(),name:String(data.pushName||phone),phone:`+${phone}`,company:"",email:"",city:"",segment:"",status:"Novo",tags:[],optedOut:false,lastContact:"—"} satisfies Contact;store.contacts.push(contact);
    }
    if(!contact)return null;
    const time=Number(data.messageTimestamp)?new Date(Number(data.messageTimestamp)*1000).toISOString():new Date().toISOString();
    const previous=store.messages.filter(row=>row.contactId===contact!.id&&row.direction==="out").sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))[0];
    store.messages.push({id:randomUUID(),contactId:contact.id,direction:fromMe?"out":"in",text,time,status:"received",providerMessageId:messageId||undefined,campaign:previous?.campaign});
    contact.lastContact=new Date(time).toLocaleString("pt-BR");
    if(!fromMe){
     const stop=/^(parar|sair|cancelar|remover|stop|unsubscribe)\b/i.test(text.trim());
     if(stop){contact.optedOut=true;contact.status="Sem interesse";store.jobs=store.jobs.map(job=>job.contactId===contact!.id&&job.status==="pending"?{...job,status:"skipped"}:job);}
     else if(!contact.optedOut&&contact.status==="Contatado")contact.status="Respondeu";
     const matching=previous?.campaign?store.campaigns.find(c=>c.id===previous.campaign):undefined;
     if(matching){matching.replies++;if(matching.pauseOnReply&&matching.status==="Ativa")matching.status="Pausada";}
    }
    return {contactId:contact.id,messageId};
   });
   if(result)publishInboxEvent({contactId:result.contactId,messageId:result.messageId,kind:"message"});
  }else if(event.includes("messages.update")||event.includes("messages_update")){
   const update=data.update as Record<string,unknown>|undefined;const status=String(data.status||update?.status||"").toLowerCase();const changed=await updateStore(store=>{const row=store.messages.find(item=>item.providerMessageId===messageId);if(row&&["delivered","read","failed"].includes(status)){row.status=status;return row.contactId}return null});if(changed)publishInboxEvent({contactId:changed,messageId,kind:"status"});
  }
  console.info("[evolution:webhook] evento processado",{event,instance,messageId});
  return NextResponse.json({received:true,event},{status:202});
 }catch(error){console.error("[evolution:webhook] erro no processamento",error);return NextResponse.json({error:"Não foi possível processar o evento."},{status:500})}
}
