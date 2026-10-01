import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {readStore,updateStore} from "@/lib/storage/db";
const schema=z.object({workspaceName:z.string().trim().min(1).max(100),email:z.string().email(),timezone:z.string().min(1).max(80),optOutPolicy:z.string().min(1).max(100)});
export async function GET(){return NextResponse.json((await readStore()).settings)}
export async function PUT(req:NextRequest){try{const data=schema.parse(await req.json());await updateStore(store=>{store.settings=data});return NextResponse.json(data)}catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:"Falha ao salvar configurações."},{status:400})}}
