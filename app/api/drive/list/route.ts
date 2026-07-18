import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";

type DriveFile = { id: string; name: string; mimeType: string; size?: string };

// Lista o conteúdo da pasta da empresa no Drive (ou de uma subpasta dela).
// Só enxerga o que o app criou (escopo drive.file), então nunca vaza outros
// arquivos do Drive do usuário.
export async function POST(request: Request) {
  const supabase = supabaseForRequest(request);
  if (!supabase) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { providerToken, folderId } = (await request.json()) as {
    providerToken?: string;
    folderId?: string;
  };
  // Prefere o token permanente do servidor; senão usa o token da sessão.
  const token = (await getDriveAccessToken()) || providerToken;
  if (!token) {
    return NextResponse.json({ error: "Token do Google ausente. Reconecte o Google Drive." }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("company_settings")
    .select("google_drive_root_folder_id")
    .limit(1)
    .maybeSingle();

  const parent = folderId || company?.google_drive_root_folder_id;
  if (!parent) {
    return NextResponse.json({ error: "Sincronize o Drive antes (nenhuma pasta da empresa criada)." }, { status: 400 });
  }

  const q = encodeURIComponent(`'${parent}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=folder,name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Drive API (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
  }
  const json = (await res.json()) as { files: DriveFile[] };
  const isFolder = (f: DriveFile) => f.mimeType === "application/vnd.google-apps.folder";
  return NextResponse.json({
    parent,
    folders: json.files.filter(isFolder).map((f) => ({ id: f.id, name: f.name })),
    files: json.files
      .filter((f) => !isFolder(f))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null })),
  });
}
