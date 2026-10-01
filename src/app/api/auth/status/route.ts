import {NextResponse} from "next/server";
import {readStore} from "@/lib/storage/db";
export async function GET(){const store=await readStore();return NextResponse.json({setupRequired:store.users.length===0})}
