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
 async getInstanceStatus(instanceName:string){return this.request(`/instance/connectionState/${encodeURIComponent(instanceName)}`);}
 async getQRCode(instanceName:string){return this.request(`/instance/connect/${encodeURIComponent(instanceName)}`);}
 async sendText(instanceName:string,number:string,text:string){return this.request(`/message/sendText/${encodeURIComponent(instanceName)}`,"POST",{number,text});}
 async logout(instanceName:string){return this.request(`/instance/logout/${encodeURIComponent(instanceName)}`,"DELETE");}
 async test(){return this.request("/instance/fetchInstances");}
}
