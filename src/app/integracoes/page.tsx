"use client";
import {useState} from "react";
import Image from "next/image";
import {Check,LoaderCircle,Plug,QrCode,RefreshCw,ShieldCheck,Smartphone,Wifi} from "lucide-react";
import {notifyBillingUpdated,notifyPlanLimit} from "@/lib/billing/client";

type AnyData=Record<string,unknown>;

export default function Integrations(){
 const[instance,setInstance]=useState("flowsend-comercial");
 const[busy,setBusy]=useState("");
 const[result,setResult]=useState<AnyData|null>(null);
 const[message,setMessage]=useState("");
 const[number,setNumber]=useState("");
 const[testText,setTestText]=useState("Olá! Esta é uma mensagem de teste do FlowSend.");
 async function action(kind:string){
  setBusy(kind);setMessage("");
  try{
   let response:Response;
   if(kind==="test")response=await fetch("/api/evolution/test");
   else if(kind==="send")response=await fetch("/api/evolution/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({instanceName:instance,number,text:testText})});
   else if(kind==="instance")response=await fetch("/api/evolution/instance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({instanceName:instance})});
   else if(kind==="qr")response=await fetch("/api/evolution/qrcode",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({instanceName:instance})});
   else response=await fetch(`/api/evolution/status?instanceName=${encodeURIComponent(instance)}`);
   const data=await response.json();setResult(data);
   if(!response.ok){if(data.code==="PLAN_LIMIT")notifyPlanLimit(data.error||"Limite do plano atingido.");throw new Error(data.error||data.message||"Falha na solicitação.");}notifyBillingUpdated();
   setMessage(kind==="test"?String(data.message||"Conexão estabelecida."):kind==="send"?"Mensagem de teste enviada.":kind==="instance"?"Instância criada ou localizada.":kind==="qr"?"QR Code solicitado.":"Status atualizado.");
  }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível conectar.");}
  finally{setBusy("");}
 }
 const qrValue=result?.base64||result?.code||result?.qrcode||"";
 const qr=typeof qrValue==="string"?qrValue:typeof qrValue==="object"&&qrValue!==null?String((qrValue as AnyData).base64||(qrValue as AnyData).code||""):"";
 const connected=JSON.stringify(result||{}).toLowerCase().includes("\"state\":\"open\"");
 return <>
  <div className="page-heading"><div><div className="eyebrow">CANAIS DE COMUNICAÇÃO</div><h1>Integrações</h1><p>Conecte seus canais e gerencie os números usados na operação.</p></div></div>
  <section className="integration-card">
   <div className="integration-head"><span className="integration-logo"><Smartphone size={20}/></span><div><h2>WhatsApp</h2><p>Evolution API · conexão não oficial</p></div><span className={`status-pill ${connected?"status-green":"status-gray"}`}><i/>{connected?"WhatsApp conectado":"Não conectado"}</span></div>
   <div className="warning-box"><b>Sobre esta conexão</b><br/>A Evolution API usa uma integração não oficial baseada em WhatsApp Web/Baileys. A conexão pode sofrer desconexões ou limitações impostas pelo WhatsApp. Use apenas com contatos que autorizaram o recebimento e respeite pedidos de opt-out.</div>
   <div className="integration-fields"><div className="form-field full"><label>Nome da instância</label><input value={instance} onChange={e=>setInstance(e.target.value)} placeholder="flowsend-comercial"/><small className="help-text">A URL e a API Key são configuradas no servidor em .env.local. A chave não é enviada ao navegador.</small></div><div className="connection-state"><ShieldCheck size={15}/> Credenciais mantidas no servidor · Evolution API URL configurável</div></div>
   <div className="integration-foot"><span className="help-text">Configure EVOLUTION_API_URL e EVOLUTION_API_KEY para habilitar a conexão.</span><button className="btn btn-outline" onClick={()=>action("test")} disabled={!!busy}>{busy==="test"?<LoaderCircle size={14}/>:<Wifi size={14}/>} Testar conexão</button></div>
   {message&&<div className="connection-state"><Check size={15}/> {message}</div>}
   <div style={{display:"flex",gap:8,marginTop:13,flexWrap:"wrap"}}><button className="btn btn-primary" onClick={()=>action("instance")} disabled={!!busy}>{busy==="instance"?<LoaderCircle size={14}/>:<Plug size={14}/>} Criar ou selecionar instância</button><button className="btn btn-outline" onClick={()=>action("qr")} disabled={!!busy}><QrCode size={14}/> Solicitar QR Code</button><button className="btn btn-outline" onClick={()=>action("status")} disabled={!!busy}><RefreshCw size={14}/> Consultar status</button></div>
   {qr&&<div style={{marginTop:17,textAlign:"center"}}><p style={{fontSize:11,color:"#858c9c"}}>Escaneie o código QR com o WhatsApp</p>{qr.startsWith("data:image")||qr.length>300?<Image src={qr.startsWith("data:image")?qr:`data:image/png;base64,${qr}`} alt="QR Code do WhatsApp" width={220} height={220} unoptimized style={{objectFit:"contain"}}/>:<code style={{display:"block",padding:12,wordBreak:"break-all",fontSize:9}}>{qr}</code>}</div>}
   <div className="page-card" style={{marginTop:17}}><h3 style={{fontSize:12,margin:"0 0 5px"}}>Mensagem de teste</h3><p style={{fontSize:10,color:"#969cab",margin:"0 0 12px"}}>Envie uma mensagem avulsa para validar a conexão. Use apenas um número que autorizou o contato.</p><div className="integration-fields"><div className="form-field"><label>WhatsApp com código do país</label><input value={number} onChange={e=>setNumber(e.target.value)} placeholder="+55 11 99999-9999"/></div><div className="form-field"><label>Mensagem</label><input value={testText} onChange={e=>setTestText(e.target.value)}/></div></div><button className="btn btn-primary" style={{marginTop:11}} disabled={!!busy||!number||!testText} onClick={()=>action("send")}>{busy==="send"?<LoaderCircle size={14}/>:<Wifi size={14}/>} Enviar teste</button></div>
   <details style={{marginTop:17,color:"#858c9c",fontSize:10}}><summary style={{cursor:"pointer"}}>Como configurar a Evolution API</summary><ol style={{lineHeight:1.8}}><li>Copie <code>.env.example</code> para <code>.env.local</code>.</li><li>Informe o endereço acessível pelo servidor FlowSend, por exemplo <code>http://localhost:8081</code>.</li><li>Preencha a API Key e reinicie o servidor.</li><li>Teste a conexão, crie a instância, solicite o QR Code e consulte o status após ler o código.</li></ol></details>
  </section>
  <div className="soft-card-grid" style={{maxWidth:790}}><div className="soft-card"><h3>Webhook</h3><p>Endpoint local configurado para eventos em tempo real:</p><code style={{fontSize:9}}>http://host.docker.internal:3000/api/webhooks/evolution</code></div><div className="soft-card"><h3>Instâncias</h3><div className="soft-number">{instance?"1":"0"}</div><p>Instâncias configuradas neste workspace</p></div><div className="soft-card"><h3>Segurança</h3><p>Chave de API usada somente em chamadas server-side.</p></div></div>
 </>;
}
