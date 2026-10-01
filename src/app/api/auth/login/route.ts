import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createSession,createSessionToken,sessionCookieOptions,verifyPassword} from "@/lib/auth/server";import {SESSION_COOKIE} from "@/lib/auth/token";
import {readStore,updateStore} from "@/lib/storage/db";

const schema=z.object({email:z.string().trim().email(),password:z.string().min(1).max(200)});
export async function POST(request:NextRequest){
 try{
  const input=schema.parse(await request.json());const email=input.email.toLowerCase();const store=await readStore();const user=store.users.find(row=>row.email===email&&row.status==="active");
  if(!user||!verifyPassword(input.password,user.passwordSalt,user.passwordHash))return NextResponse.json({error:"E-mail ou senha incorretos."},{status:401});
  const session=createSession();await updateStore(db=>{const current=db.users.find(row=>row.id===user.id&&row.status==="active");if(!current)throw new Error("Conta desativada.");current.lastLoginAt=new Date().toISOString();db.sessions=db.sessions.filter(row=>Date.parse(row.expiresAt)>Date.now());db.sessions.push({id:session.id,userId:user.id,expiresAt:session.expiresAt})});
  const safeUser={id:user.id,name:user.name,email:user.email,role:user.role};const response=NextResponse.json({user:safeUser});response.cookies.set(SESSION_COOKIE,createSessionToken(session.id,user.id,session.expiresAt),sessionCookieOptions(request.nextUrl.protocol==="https:"));return response;
 }catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:"Falha no login."},{status:error instanceof z.ZodError?400:401})}
}
