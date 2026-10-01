import {NextRequest,NextResponse} from "next/server";
import {getCurrentUser} from "@/lib/auth/server";
export async function GET(request:NextRequest){const user=await getCurrentUser(request);return user?NextResponse.json({user}):NextResponse.json({error:"Sessão expirada."},{status:401})}
