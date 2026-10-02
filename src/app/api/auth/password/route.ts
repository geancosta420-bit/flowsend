import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth/server";
import { updateStore } from "@/lib/storage/db";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) });
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const data = schema.parse(await request.json());
    const result = await updateStore((store) => {
      const saved = store.users.find((row) => row.id === user.id);
      if (!saved || !verifyPassword(data.currentPassword, saved.passwordSalt, saved.passwordHash)) return false;
      const password = hashPassword(data.newPassword);
      saved.passwordSalt = password.salt;
      saved.passwordHash = password.hash;
      return true;
    });
    return result ? NextResponse.json({ changed: true }) : NextResponse.json({ error: "A senha atual está incorreta." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível alterar a senha." }, { status: 400 });
  }
}
