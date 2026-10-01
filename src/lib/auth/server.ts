import {createHmac,randomBytes,scryptSync,timingSafeEqual} from "node:crypto";
import type {NextRequest} from "next/server";
import {readStore} from "@/lib/storage/db";
import {SESSION_COOKIE,verifySessionToken} from "./token";

const SESSION_TTL_MS=12*60*60*1000;
function secret(){const value=process.env.FLOWSEND_AUTH_SECRET;if(!value)throw new Error("FLOWSEND_AUTH_SECRET não está configurado.");return value}
export function hashPassword(password:string,salt=randomBytes(16).toString("hex")){return {salt,hash:scryptSync(password,salt,64).toString("hex")}}
export function verifyPassword(password:string,salt:string,hash:string){try{const actual=scryptSync(password,salt,64);const expected=Buffer.from(hash,"hex");return expected.length===actual.length&&timingSafeEqual(actual,expected)}catch{return false}}
export function createSession(){return {id:randomBytes(24).toString("base64url"),expiresAt:new Date(Date.now()+SESSION_TTL_MS).toISOString()}}
export function createSessionToken(sessionId:string,userId:string,expiresAt:string){const payload=Buffer.from(JSON.stringify({sid:sessionId,uid:userId,exp:Date.parse(expiresAt)})).toString("base64url");const signature=createHmac("sha256",secret()).update(payload).digest("base64url");return `${payload}.${signature}`}
export async function getCurrentUser(request:NextRequest){const token=request.cookies.get(SESSION_COOKIE)?.value;if(!token)return null;const claims=await verifySessionToken(token);if(!claims)return null;const store=await readStore();const session=store.sessions.find(row=>row.id===claims.sid&&row.userId===claims.uid&&Date.parse(row.expiresAt)>Date.now());const user=store.users.find(row=>row.id===claims.uid&&row.status==="active");if(!session||!user)return null;return {id:user.id,name:user.name,email:user.email,role:user.role as "admin"|"user"}}
export function sessionCookieOptions(secure:boolean){return {httpOnly:true,secure,sameSite:"lax" as const,path:"/",maxAge:SESSION_TTL_MS/1000}}
