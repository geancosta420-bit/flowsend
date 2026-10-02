import type { MessagingProvider } from "./messaging";
export class EvolutionProvider implements MessagingProvider {
 private base=process.env.EVOLUTION_API_URL?.replace(/\/$/,"");
 private key=process.env.EVOLUTION_API_KEY;
 private async request(path:string,method="GET",body?:unknown){
  if(!this.base||!this.key) throw new Error("Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor.");
  const response=await fetch(`${this.base}${path}`,{method,headers:{"Content-Type":"application/json","apikey":this.key},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(typeof data.message==="string"?data.message:`Evolution API retornou ${response.status}`);
  return data;
 }
 async createInstance(instanceName:string){return this.request("/instance/create","POST",{instanceName,qrcode:true,integration:"WHATSAPP-BAILEYS"});}
 async configureContactWebhook(instanceName:string){
  const url=process.env.EVOLUTION_WEBHOOK_URL?.trim();
  if(!url)return null;
  const secret=process.env.CONTACTS_WEBHOOK_SECRET||process.env.EVOLUTION_WEBHOOK_SECRET;
  if(!secret)throw new Error("Configure CONTACTS_WEBHOOK_SECRET ou EVOLUTION_WEBHOOK_SECRET para proteger o webhook Evolution.");
  return this.request(`/webhook/set/${encodeURIComponent(instanceName)}`,"POST",{webhook:{enabled:true,url,webhookByEvents:false,webhookBase64:false,events:["CONNECTION_UPDATE","CONTACTS_SET","CONTACTS_UPSERT","CONTACTS_UPDATE","MESSAGES_UPSERT","MESSAGES_UPDATE"],...(secret?{headers:{"x-webhook-secret":secret}}:{})}});
 }
 async getInstanceStatus(instanceName:string){return this.request(`/instance/connectionState/${encodeURIComponent(instanceName)}`);}
 async getQRCode(instanceName:string){return this.request(`/instance/connect/${encodeURIComponent(instanceName)}`);}
 async sendText(instanceName:string,number:string,text:string){return this.request(`/message/sendText/${encodeURIComponent(instanceName)}`,"POST",{number,text});}
 async logout(instanceName:string){return this.request(`/instance/logout/${encodeURIComponent(instanceName)}`,"DELETE");}
 async test(){return this.request("/instance/fetchInstances");}
 async getInstances(){return this.request("/instance/fetchInstances");}
}
