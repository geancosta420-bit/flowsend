export type SessionClaims={sid:string;uid:string;exp:number};
export const SESSION_COOKIE="flowsend_session";

export async function verifySessionToken(token:string,secret=process.env.FLOWSEND_AUTH_SECRET||""):Promise<SessionClaims|null>{
 if(!secret)return null;
 const [payload,signature,...extra]=token.split(".");
 if(!payload||!signature||extra.length)return null;
 try{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const bytes=Uint8Array.from(atob(signature.replace(/-/g,"+").replace(/_/g,"/")),char=>char.charCodeAt(0));
  const valid=await crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(payload));
  if(!valid)return null;
  const claims=JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/"))) as SessionClaims;
  return typeof claims.sid==="string"&&typeof claims.uid==="string"&&Number.isFinite(claims.exp)&&claims.exp>Date.now()?claims:null;
 }catch{return null}
}
