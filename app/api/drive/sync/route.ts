import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";

type DriveFolder = { id: string };

async function createDriveFolder(providerToken: string, name: string, parentId: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as DriveFolder;
  return json.id;
}

export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { providerToken } = (await request.json()) as { providerToken?: string };
  const token = (await getDriveAccessToken()) || providerToken;
  if (!token) {
    return NextResponse.json({ error: "Token do Google ausente. Reconecte o Google Drive." }, { status: 400 });
  }

  const { data: files, error: filesError } = await supabase
    .from("files")
    .select("id, name, type, parent_id, drive_file_id")
    .eq("type", "folder");
  if (filesError) {
    return NextResponse.json({ error: filesError.message }, { status: 500 });
  }

  const { data: company } = await supabase
    .from("company_settings")
    .select("google_drive_root_folder_id, google_drive_bot_folder_id, name")
    .limit(1)
    .maybeSingle();

  let rootDriveId = company?.google_drive_root_folder_id ?? null;
  let created = 0;

  try {
    const root = files?.find((f) => f.parent_id === null);
    if (root) {
      if (!rootDriveId) {
        // "root" of our folder tree maps to a real folder created inside the
        // user's Drive (My Drive is not a creatable parent via this API).
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: company?.name ?? root.name, mimeType: "application/vnd.google-apps.folder" }),
        });
        if (!res.ok) throw new Error(`Drive API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
        const json = (await res.json()) as DriveFolder;
        rootDriveId = json.id;
        created++;
        await supabase.from("company_settings").update({ google_drive_root_folder_id: rootDriveId }).eq("id", true);
      }
      if (!root.drive_file_id) {
        await supabase.from("files").update({ drive_file_id: rootDriveId }).eq("id", root.id);
      }
    }

    const idToDriveId = new Map<string, string>();
    if (root && rootDriveId) idToDriveId.set(root.id, rootDriveId);
    files?.forEach((f) => {
      if (f.drive_file_id) idToDriveId.set(f.id, f.drive_file_id);
    });

    let pending = (files ?? []).filter((f) => !idToDriveId.has(f.id));
    // Multiple passes handle arbitrary folder depth: each pass resolves any
    // folder whose parent now has a known Drive id.
    for (let pass = 0; pass < 10 && pending.length > 0; pass++) {
      const stillPending: typeof pending = [];
      for (const folder of pending) {
        const parentDriveId = folder.parent_id ? idToDriveId.get(folder.parent_id) : rootDriveId ?? undefined;
        if (!parentDriveId) {
          stillPending.push(folder);
          continue;
        }
        const driveId = await createDriveFolder(token, folder.name, parentDriveId);
        created++;
        idToDriveId.set(folder.id, driveId);
        await supabase.from("files").update({ drive_file_id: driveId }).eq("id", folder.id);
      }
      pending = stillPending;
    }

    // Pasta SEPARADA (fora da pasta da empresa) só para as memórias do robô.
    let botFolderId = company?.google_drive_bot_folder_id ?? null;
    if (!botFolderId) {
      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${company?.name ?? "Empresa"} — Memórias do Robô`,
          mimeType: "application/vnd.google-apps.folder",
        }),
      });
      if (res.ok) {
        botFolderId = ((await res.json()) as DriveFolder).id;
        created++;
        await supabase.from("company_settings").update({ google_drive_bot_folder_id: botFolderId }).eq("id", true);
      }
    }

    return NextResponse.json({ success: true, created, skipped: pending.length, rootDriveId, botFolderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao sincronizar com o Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
