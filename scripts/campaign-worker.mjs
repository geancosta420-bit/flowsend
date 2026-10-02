import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
const {loadEnvConfig}=nextEnv;

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
  try {
    const db=JSON.parse(await readFile(storeFile,"utf8"));
    const period=new Date().toISOString().slice(0,7);
    db.subscription ||= {plan:"STARTER",maxWhatsapp:1,maxMessages:2000,maxProspects:50,messagesUsed:0,prospectsUsed:0,reservedMessages:0,usagePeriod:period};
    if(db.subscription.usagePeriod!==period) Object.assign(db.subscription,{messagesUsed:0,prospectsUsed:0,reservedMessages:0,usagePeriod:period});
    return db;
  }
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
const nextUsageMonth=date=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
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
      if(db.subscription.messagesUsed+db.subscription.reservedMessages>=db.subscription.maxMessages){job.scheduledAt=nextUsageMonth(now).toISOString();continue;}
      const sentToday=db.messages.filter(message=>message.campaign===campaign.id&&message.status==="sent"&&new Date(message.time).toDateString()===now.toDateString()).length;
      const campaignStart=Date.parse(campaign.scheduledAt||now.toISOString());
      const elapsedDays=Math.max(0,Math.floor((Date.now()-campaignStart)/86400000));
      const dailyLimit=Math.floor((campaign.dailyLimit||250)*(campaign.rampDaily20?1+elapsedDays*0.2:1));
      if(sentToday>=dailyLimit) {job.scheduledAt=nextAllowed(new Date(now.getTime()+60_000),campaign).toISOString();continue;}
      if(!isAllowed(now,campaign)){job.scheduledAt=nextAllowed(now,campaign).toISOString();continue;}
      job.status="processing";job.attempts++;db.subscription.reservedMessages++;return {job:{...job},campaign:{...campaign},contact:{...contact}};
    }
    return null;
  });
}
async function finish(jobId, outcome) {
  await mutate(db=>{
    const job=db.jobs.find(row=>row.id===jobId); if(!job)return;
    const campaign=db.campaigns.find(row=>row.id===job.campaignId);
    db.subscription.reservedMessages=Math.max(0,db.subscription.reservedMessages-1);
    if(outcome.ok) {
      db.subscription.messagesUsed++;
      job.status="sent";job.sentAt=new Date().toISOString();job.providerMessageId=outcome.messageId;
      db.messages.push({id:randomUUID(),contactId:job.contactId,direction:"out",text:outcome.text,time:job.sentAt,status:"sent",campaign:job.campaignId,providerMessageId:outcome.messageId});
      if(campaign)campaign.sent++;
      const contact=db.contacts.find(row=>row.id===job.contactId);if(contact)contact.lastContact=new Date().toLocaleString("pt-BR");
      if(campaign?.status==="Ativa") {
        const next=db.jobs.filter(row=>row.campaignId===campaign.id&&row.status==="pending").sort((x,y)=>Date.parse(x.scheduledAt)-Date.parse(y.scheduledAt))[0];
        if(next) {
          const min=Math.max(1,Number(campaign.minIntervalSeconds||20));
          const max=Math.max(min,Number(campaign.maxIntervalSeconds||min));
          const dynamicDelay=Math.floor(min*1000+Math.random()*(max-min)*1000);
          const pauseEvery=Number(campaign.pauseEveryMessages||0);
          const pauseMinutes=Number(campaign.pauseMinutes||0);
          const cooldown=pauseEvery>0&&campaign.sent%pauseEvery===0?pauseMinutes*60*1000:0;
          next.scheduledAt=new Date(Date.now()+Math.max(dynamicDelay,cooldown)).toISOString();
        }
      }
      return;
    }
    if(job.attempts<3&&outcome.retryable&&campaign?.status==="Ativa") {job.status="pending";job.scheduledAt=new Date(Date.now()+60_000).toISOString();job.error=outcome.error;return;}
    job.status="failed";job.error=outcome.error;
    if(campaign?.status==="Ativa") {
      const next=db.jobs.filter(row=>row.campaignId===campaign.id&&row.status==="pending").sort((x,y)=>Date.parse(x.scheduledAt)-Date.parse(y.scheduledAt))[0];
      if(next) next.scheduledAt=new Date(Date.now()+Math.max(1000,Number(campaign.minIntervalSeconds||20)*1000)).toISOString();
    }
  });
}
function reportPeriod(now, frequency) {
  if (frequency === "daily") return now.toISOString().slice(0, 10);
  if (frequency === "monthly") return now.toISOString().slice(0, 7);
  const monday = new Date(now); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return `week-${monday.toISOString().slice(0, 10)}`;
}
async function sendScheduledReport() {
  const db = await readDb(); const settings = db.settings?.reportSchedule;
  if (!settings?.enabled || !settings.phone || nowLocalHour() < 9) return;
  const now = new Date(); const period = reportPeriod(now, settings.frequency);
  if (settings.lastSentPeriod === period) return;
  if (settings.lastAttemptAt && now.getTime() - Date.parse(settings.lastAttemptAt) < 15 * 60_000) return;
  const start = settings.frequency === "daily" ? new Date(`${period}T00:00:00.000Z`) : settings.frequency === "monthly" ? new Date(`${period}-01T00:00:00.000Z`) : new Date(`${period.slice(5)}T00:00:00.000Z`);
  const messages = db.messages.filter(message => message.status !== "demonstration" && Date.parse(message.time) >= start.getTime());
  const sent = messages.filter(message => message.direction === "out").length;
  const replies = messages.filter(message => message.direction === "in").length;
  const text = `Resumo FlowSend (${settings.frequency === "daily" ? "diário" : settings.frequency === "weekly" ? "semanal" : "mensal"})\nMensagens enviadas: ${sent}\nRespostas recebidas: ${replies}\nContatos no CRM: ${db.contacts.length}\nCampanhas ativas: ${db.campaigns.filter(campaign => campaign.status === "Ativa").length}`;
  try {
    await mutate(store => { if (store.settings?.reportSchedule) store.settings.reportSchedule.lastAttemptAt = now.toISOString(); });
    const response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(settings.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "flowsend-comercial")}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey }, body: JSON.stringify({ number: settings.phone.replace(/\D/g, ""), text }) });
    if (!response.ok) throw new Error(`Evolution API retornou HTTP ${response.status}`);
    await mutate(store => { if (store.settings?.reportSchedule) store.settings.reportSchedule.lastSentPeriod = period; });
    console.info(`Resumo de relatório ${period} enviado para ${settings.phone}`);
  } catch (error) { console.error(`Falha ao enviar resumo ${period}: ${error.message}`); }
}
function nowLocalHour() { return new Date().getHours(); }
async function run() {
  console.info("FlowSend campaign worker iniciado.");
  while(true) {
    await sendScheduledReport().catch(error => console.error("Falha ao verificar relatório agendado:", error));
    const item=await takeJob();
    if(!item){await sleep(1000);continue;}
    const {job,campaign,contact}=item;
    try {
      const response=await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(job.instanceName||campaign.instanceName)}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:apiKey},body:JSON.stringify({number:contact.phone.replace(/\D/g,""),text:job.text})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Object.assign(new Error(data.message||`Evolution API retornou HTTP ${response.status}`),{retryable:response.status===429||response.status>=500});
      const key=data.key||{};
      await finish(job.id,{ok:true,text:job.text,messageId:key.id||data.messageId});
      console.info(`Enviado ${campaign.name} → ${contact.name} via ${job.instanceName||campaign.instanceName}`);
    } catch(error) {
      await finish(job.id,{ok:false,error:error.message||"Falha no envio",retryable:Boolean(error.retryable)});
      console.error(`Falha ${campaign.name} → ${contact.name}: ${error.message}`);
      await sleep(1000);
    }
  }
}
run().catch(error=>{console.error(error);process.exit(1);});
