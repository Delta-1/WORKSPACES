import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";

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

  // Runs pendentes cuja rotina manda pro Drive.
  const { data: runs } = await supabase
    .from("automation_runs")
    .select("id, storage_path, routine_id, automation_routines!inner(to_drive, name)")
    .eq("status", "uploaded")
    .limit(20);

  let sent = 0;
  for (const run of runs ?? []) {
    const routine = (run as unknown as { automation_routines: { to_drive: boolean; name: string } }).automation_routines;
    if (!routine?.to_drive || !run.storage_path) continue;
    try {
      const { data: blob } = await supabase.storage.from("automation").download(run.storage_path);
      if (!blob) throw new Error("arquivo não encontrado no storage");
      const buffer = Buffer.from(await blob.arrayBuffer());
      const fileName = run.storage_path.split("/").pop() || `${routine.name}.bin`;

      // Upload multipart para o Drive.
      const boundary = "wsp" + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: fileName, parents: [parent] });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 150)}`);
      const json = (await res.json()) as { id: string };
      await supabase.from("automation_runs").update({ status: "in_drive", drive_file_id: json.id }).eq("id", run.id);
      // limpa do storage após ir pro Drive
      await supabase.storage.from("automation").remove([run.storage_path]);
      sent++;
    } catch (err) {
      await supabase
        .from("automation_runs")
        .update({ status: "error", error: err instanceof Error ? err.message : "falha" })
        .eq("id", run.id);
    }
  }

  return NextResponse.json({ sent });
}
