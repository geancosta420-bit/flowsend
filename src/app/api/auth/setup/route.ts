import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {hashPassword,createSession,createSessionToken,sessionCookieOptions} from "@/lib/auth/server";import {SESSION_COOKIE} from "@/lib/auth/token";
import {updateStore} from "@/lib/storage/db";

const schema=z.object({name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254),password:z.string().min(10).max(200)});
export async function POST(request:NextRequest){
 try{
  const input=schema.parse(await request.json());const email=input.email.toLowerCase();const password=hashPassword(input.password);const session=createSession();
  const user=await updateStore(store=>{if(store.users.length)throw new Error("A configuração inicial já foi concluída. Entre com sua conta.");const row={id:crypto.randomUUID(),name:input.name,email,passwordHash:password.hash,passwordSalt:password.salt,role:"admin" as const,status:"active" as const,createdAt:new Date().toISOString(),lastLoginAt:new Date().toISOString()};store.users.push(row);store.sessions.push({id:session.id,userId:row.id,expiresAt:session.expiresAt});return {id:row.id,name:row.name,email:row.email,role:row.role}});
  const response=NextResponse.json({user});response.cookies.set(SESSION_COOKIE,createSessionToken(session.id,user.id,session.expiresAt),sessionCookieOptions(request.nextUrl.protocol==="https:"));return response;
 }catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:"Não foi possível criar o administrador."},{status:error instanceof z.ZodError?400:409})}
}
