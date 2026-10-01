import {NextRequest} from "next/server";
import {subscribeInbox} from "@/lib/realtime/inbox-events";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export function GET(request:NextRequest){
 const contactId=request.nextUrl.searchParams.get("contactId");
 const encoder=new TextEncoder();
 let unsubscribe=()=>{};
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
   send("ready",{connected:true});
   unsubscribe=subscribeInbox(event=>{if(!contactId||event.contactId===contactId)send("update",event)});
   heartbeat=setInterval(()=>controller.enqueue(encoder.encode(": keep-alive\n\n")),20_000);
   request.signal.addEventListener("abort",()=>{unsubscribe();if(heartbeat)clearInterval(heartbeat);try{controller.close()}catch{}},{once:true});
  },
  cancel(){unsubscribe();if(heartbeat)clearInterval(heartbeat)},
 });
 return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
