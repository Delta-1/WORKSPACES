import type { SupabaseClient } from "@supabase/supabase-js";

// Envia os arquivos coletados pelas rotinas (bucket "automation") para o Google
// Drive. Reutilizado pelo endpoint manual e pelo cron. `storage_path` pode ser
// um PREFIXO (pasta com vários arquivos) ou o caminho de um arquivo (legado).
export async function drainToDrive(
  supabase: SupabaseClient,
  token: string,
  parent: string,
  limit = 20
): Promise<number> {
  async function uploadToDrive(fileName: string, buffer: Buffer): Promise<string> {
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
    return ((await res.json()) as { id: string }).id;
  }

  const { data: runs } = await supabase
    .from("automation_runs")
    .select("id, storage_path, routine_id, automation_routines!inner(to_drive, name)")
    .eq("status", "uploaded")
    .limit(limit);

  let sent = 0;
  for (const run of runs ?? []) {
    const routine = (run as unknown as { automation_routines: { to_drive: boolean; name: string } }).automation_routines;
    if (!routine?.to_drive || !run.storage_path) continue;
    try {
      const { data: listed } = await supabase.storage.from("automation").list(run.storage_path, { limit: 1000 });
      const objects =
        listed && listed.length > 0
          ? listed.filter((o) => o.id).map((o) => `${run.storage_path}/${o.name}`)
          : [run.storage_path as string];

      let lastId = "";
      for (const objPath of objects) {
        const { data: blob } = await supabase.storage.from("automation").download(objPath);
        if (!blob) continue;
        const buffer = Buffer.from(await blob.arrayBuffer());
        const fileName = objPath.split("/").pop() || `${routine.name}.bin`;
        lastId = await uploadToDrive(fileName, buffer);
        await supabase.storage.from("automation").remove([objPath]);
        sent++;
      }
      await supabase.from("automation_runs").update({ status: "in_drive", drive_file_id: lastId || null }).eq("id", run.id);
    } catch (err) {
      await supabase
        .from("automation_runs")
        .update({ status: "error", error: err instanceof Error ? err.message : "falha" })
        .eq("id", run.id);
    }
  }
  return sent;
}
