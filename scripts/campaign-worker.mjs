import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {loadEnvConfig} from "@next/env";

loadEnvConfig(process.cwd());
const dataDirectory = process.env.FLOWSEND_DATA_DIR || path.join(process.cwd(), ".data");
const storeFile = path.join(dataDirectory, "flowsend.json");
const lockFile = `${storeFile}.lock`;
const apiUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
if (!apiUrl || !apiKey) {
  console.error("Configure EVOLUTION_API_URL e EVOLUTION_API_KEY antes de iniciar o worker.");
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function lock() {
  await mkdir(dataDirectory, {recursive:true});
  for (let attempt=0; attempt<200; attempt++) {
    try { await mkdir(lockFile); return () => rm(lockFile,{recursive:true,force:true}); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      try { if (Date.now()-(await stat(lockFile)).mtimeMs > 60_000) await rm(lockFile,{recursive:true,force:true}); } catch {}
      await sleep(25);
    }
  }
  throw new Error("Armazenamento ocupado por mais de 5 segundos.");
}
async function readDb() {
  try { return JSON.parse(await readFile(storeFile,"utf8")); }
  catch { throw new Error("Inicie a aplicação e crie o arquivo .data/flowsend.json antes de iniciar o worker."); }
}
async function mutate(fn) {
  const release=await lock();
  try {
    const db=await readDb(); const result=await fn(db);
    const temp=`${storeFile}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp,JSON.stringify(db,null,2),"utf8"); await rename(temp,storeFile); return result;
  } finally { await release(); }
}
const localMinute=date=>date.getHours()*60+date.getMinutes();
function isAllowed(date,campaign) {
  const weekdays=campaign.weekdays||[1,2,3,4,5];
  const minute=localMinute(date); const [startH,startM]=(campaign.startTime||"09:00").split(":").map(Number); const [endH,endM]=(campaign.endTime||"18:00").split(":").map(Number);
  return weekdays.includes(date.getDay())&&minute>=startH*60+startM&&minute<endH*60+endM;
}
function nextAllowed(date,campaign) {
  const result=new Date(date); result.setSeconds(0,0);
  for(let day=0;day<8;day++) {
    const [startH,startM]=(campaign.startTime||"09:00").split(":").map(Number);
    if((campaign.weekdays||[1,2,3,4,5]).includes(result.getDay())) {
      result.setHours(startH,startM,0,0);
      if(result>date)return result;
    }
    result.setDate(result.getDate()+1);
  }
  return new Date(date.getTime()+24*60*60*1000);
}
async function takeJob() {
  return mutate(db=>{
    const now=new Date();
    for(const campaign of db.campaigns) if(campaign.status==="Agendada"&&Date.parse(campaign.scheduledAt||"")<=now.getTime())campaign.status="Ativa";
    for(const campaign of db.campaigns.filter(c=>c.status==="Ativa")) {
      const open=db.jobs.some(job=>job.campaignId===campaign.id&&["pending","processing"].includes(job.status));
      if(!open)campaign.status="Concluída";
    }
    const candidates=db.jobs.filter(job=>job.status==="pending"&&Date.parse(job.scheduledAt)<=now.getTime()).sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
    for(const job of candidates) {
      const campaign=db.campaigns.find(row=>row.id===job.campaignId);
      if(!campaign||campaign.status==="Cancelada"||campaign.status==="Pausada"){job.status="cancelled";continue;}
      if(campaign.status!=="Ativa")continue;
      const contact=db.contacts.find(row=>row.id===job.contactId);
      if(!contact||contact.optedIn!==true||contact.optedOut){job.status="skipped";job.error="Contato sem consentimento registrado ou com opt-out ativo.";continue;}
      const sentToday=db.messages.filter(message=>message.campaign===campaign.id&&message.status==="sent"&&new Date(message.time).toDateString()===now.toDateString()).length;
      if(sentToday>=(campaign.dailyLimit||250)) {job.scheduledAt=nextAllowed(new Date(now.getTime()+60_000),campaign).toISOString();continue;}
      if(!isAllowed(now,campaign)){job.scheduledAt=nextAllowed(now,campaign).toISOString();continue;}
      job.status="processing";job.attempts++;return {job:{...job},campaign:{...campaign},contact:{...contact}};
    }
    return null;
  });
}
async function finish(jobId, outcome) {
  await mutate(db=>{
    const job=db.jobs.find(row=>row.id===jobId); if(!job)return;
    const campaign=db.campaigns.find(row=>row.id===job.campaignId);
    if(outcome.ok) {
      job.status="sent";job.sentAt=new Date().toISOString();job.providerMessageId=outcome.messageId;
      db.messages.push({id:randomUUID(),contactId:job.contactId,direction:"out",text:outcome.text,time:job.sentAt,status:"sent",campaign:job.campaignId,providerMessageId:outcome.messageId});
      if(campaign)campaign.sent++;
      const contact=db.contacts.find(row=>row.id===job.contactId);if(contact)contact.lastContact=new Date().toLocaleString("pt-BR");
      return;
    }
    if(job.attempts<3&&outcome.retryable&&campaign?.status==="Ativa") {job.status="pending";job.scheduledAt=new Date(Date.now()+60_000).toISOString();job.error=outcome.error;return;}
    job.status="failed";job.error=outcome.error;
  });
}
async function run() {
  console.info("FlowSend campaign worker iniciado.");
  while(true) {
    const item=await takeJob();
    if(!item){await sleep(1000);continue;}
    const {job,campaign,contact}=item;
    try {
      const response=await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(job.instanceName||campaign.instanceName)}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:apiKey},body:JSON.stringify({number:contact.phone.replace(/\D/g,""),text:job.text})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(new Error(data.message||`Evolution API retornou HTTP ${response.status}`),{retryable:response.status===429||response.status>=500});
      const key=data.key||{};
      await finish(job.id,{ok:true,text:job.text,messageId:key.id||data.messageId});
      console.info(`Enviado ${campaign.name} → ${contact.name}`);
      await sleep(Math.max(1000,(campaign.minIntervalSeconds||30)*1000));
    } catch(error) {
      await finish(job.id,{ok:false,error:error.message||"Falha no envio",retryable:Boolean(error.retryable)});
      console.error(`Falha ${campaign.name} → ${contact.name}: ${error.message}`);
      await sleep(1000);
    }
  }
}
run().catch(error=>{console.error(error);process.exit(1);});
