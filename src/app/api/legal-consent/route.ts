import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { readStore, updateStore } from "@/lib/storage/db";

const TERMS_VERSION = "2026-10-01";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const saved = (await readStore()).users.find((row) => row.id === user.id);
  return NextResponse.json({ accepted: saved?.termsVersion === TERMS_VERSION, version: TERMS_VERSION });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const result = await updateStore((store) => {
    const saved = store.users.find((row) => row.id === user.id);
    if (!saved) return false;
    saved.termsVersion = TERMS_VERSION;
    saved.termsAcceptedAt = new Date().toISOString();
    return true;
  });
  return result ? NextResponse.json({ accepted: true, version: TERMS_VERSION }) : NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
}
