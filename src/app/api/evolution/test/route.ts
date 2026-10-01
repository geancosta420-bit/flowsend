import {NextResponse} from "next/server";import {EvolutionProvider} from "@/lib/providers/evolution";
export async function GET(){try{await new EvolutionProvider().test();return NextResponse.json({ok:true,message:"Conexão estabelecida com a Evolution API."})}catch(error){return NextResponse.json({ok:false,message:error instanceof Error?error.message:"Falha na conexão."},{status:502})}}
