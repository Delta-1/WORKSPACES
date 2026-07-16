import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";
import { drainToDrive } from "@/lib/drive-sync";

export const runtime = "nodejs";

// Leva os arquivos coletados pelas rotinas (bucket automation) para o Google Drive.
// Chamado quando o usuário abre a aba Automação (e pode virar cron depois).
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const token = await getDriveAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Drive não configurado (modo permanente). Conecte o Drive nas Configurações." }, { status: 400 });
  }

  // Pasta de destino: a pasta da empresa no Drive.
  const { data: company } = await supabase
    .from("company_settings")
    .select("google_drive_root_folder_id")
    .eq("id", true)
    .maybeSingle();
  const parent = company?.google_drive_root_folder_id;
  if (!parent) return NextResponse.json({ error: "Sincronize o Drive antes (nenhuma pasta da empresa)." }, { status: 400 });

  const sent = await drainToDrive(supabase, token, parent);
  return NextResponse.json({ sent });
}
