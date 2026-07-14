import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { storeDriveRefreshToken, googleOAuthConfigured } from "@/lib/google-drive";

// Guarda o refresh_token do Google para acesso permanente ao Drive.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Só gestor/gerente pode configurar a conta do Drive da empresa.
  const { data: role } = await supabase.rpc("my_role");
  if (role !== "gestor" && role !== "gerente") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  if (!googleOAuthConfigured()) {
    return NextResponse.json({ persistent: false, message: "Modo permanente não configurado no servidor." });
  }

  const { refreshToken } = (await request.json()) as { refreshToken?: string };
  if (!refreshToken) return NextResponse.json({ error: "refreshToken ausente." }, { status: 400 });

  const ok = await storeDriveRefreshToken(refreshToken);
  return NextResponse.json({ persistent: ok });
}
