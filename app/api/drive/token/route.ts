import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";

// Devolve um access token do Drive gerado no servidor a partir do refresh_token
// (modo permanente). O navegador usa esse token para baixar arquivos grandes
// direto do Drive, sem reconectar o Google. Retorna null se não configurado.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const token = await getDriveAccessToken();
  return NextResponse.json({ accessToken: token });
}
