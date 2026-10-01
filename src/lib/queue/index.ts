export type QueueStatus="pending"|"processing"|"sent"|"delivered"|"read"|"failed"|"cancelled"|"skipped";
export interface CampaignMessageJob { id:string;campaignId:string;contactId:string;instanceId:string;status:QueueStatus;attempts:number;scheduledAt:string;sentAt?:string;error?:string;providerMessageId?:string }
export interface CampaignQueue { enqueue(job:CampaignMessageJob):Promise<void>; pause(campaignId:string):Promise<void>; resume(campaignId:string):Promise<void>; cancel(campaignId:string):Promise<void> }
export class InMemoryCampaignQueue implements CampaignQueue { async enqueue(){throw new Error("Fila demonstrativa: conecte Redis/BullMQ para processar campanhas em produção.")} async pause(){} async resume(){} async cancel(){} }
