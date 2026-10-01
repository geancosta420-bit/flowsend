import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth/server";import {SESSION_COOKIE} from "@/lib/auth/token";
import {updateStore} from "@/lib/storage/db";

export async function POST(request:NextRequest){const user=await getCurrentUser(request);const token=request.cookies.get(SESSION_COOKIE)?.value;if(user&&token){const sid=token.split(".")[0];try{const claims=JSON.parse(Buffer.from(sid,"base64url").toString("utf8")) as {sid?:string};if(claims.sid)await updateStore(store=>{store.sessions=store.sessions.filter(session=>session.id!==claims.sid)})}catch{}}const response=NextResponse.json({ok:true});response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:0});return response}
