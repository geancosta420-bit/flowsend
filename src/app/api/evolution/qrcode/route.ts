import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {EvolutionProvider} from "@/lib/providers/evolution";
const schema=z.object({instanceName:z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/)});
export async function POST(req:NextRequest){try{const{instanceName}=schema.parse(await req.json());return NextResponse.json(await new EvolutionProvider().getQRCode(instanceName))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Dados inválidos."},{status:e instanceof z.ZodError?400:502})}}
