import {NextRequest,NextResponse} from "next/server";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/auth/token";
import {readStore} from "@/lib/storage/db";

const publicPaths=new Set(["/login","/api/auth/status","/api/auth/setup","/api/auth/login","/api/webhooks/evolution"]);
export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname;
 if(publicPaths.has(pathname))return NextResponse.next();
 const token=request.cookies.get(SESSION_COOKIE)?.value;
 const claims=token?await verifySessionToken(token):null;
 if(claims){
  const store=await readStore();
  const session=store.sessions.find(row=>row.id===claims.sid&&row.userId===claims.uid&&Date.parse(row.expiresAt)>Date.now());
  const user=store.users.find(row=>row.id===claims.uid&&row.status==="active");
  if(session&&user){
  if(pathname==="/login")return NextResponse.redirect(new URL("/",request.url));
  return NextResponse.next();
  }
 }
 if(pathname.startsWith("/api/"))return NextResponse.json({error:"Faça login para continuar."},{status:401});
 const login=new URL("/login",request.url);
 if(pathname!=="/")login.searchParams.set("next",pathname);
 return NextResponse.redirect(login);
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
