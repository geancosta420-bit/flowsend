type InboxEvent={contactId:string;messageId?:string;kind:"message"|"status"};
type Listener=(event:InboxEvent)=>void;

const listeners=new Set<Listener>();

export function publishInboxEvent(event:InboxEvent){
 for(const listener of listeners)listener(event);
}

export function subscribeInbox(listener:Listener){
 listeners.add(listener);
 return()=>listeners.delete(listener);
}
