import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Portal de TERCEIROS (contabilidades etc.) — servidor. Autentica o terceiro
// (código + login/senha, quando houver) e devolve os clientes atribuídos com:
// dados (se can_view_info), acessos remotos (se can_view_remote) e a árvore de
// pastas com links de download assinados (se can_view_folders). Tudo no servidor
// para poder assinar as URLs do bucket privado.
type FileRow = { id: string; name: string; type: string; parent_id: string | null; storage_path: string | null; mime: string | null };

export async function POST(request: Request) {
  const svc = supabaseService();
  if (!svc) return NextResponse.json({ ok: false, reason: "config" }, { status: 500 });
  const { code, email, password } = (await request.json().catch(() => ({}))) as { code?: string; email?: string; password?: string };
  if (!code) return NextResponse.json({ ok: false, reason: "notfound" });

  const { data: login } = await svc.rpc("third_party_login", { p_code: code, p_email: email ?? "", p_password: password ?? "" });
  const l = login as { ok: boolean; reason?: string; id?: string; name?: string; company_id?: string; needs_login?: boolean; perms?: { info: boolean; folders: boolean; remote: boolean } } | null;
  if (!l?.ok) return NextResponse.json({ ok: false, reason: l?.reason ?? "invalid", needs_login: l?.reason === "invalid" });

  const perms = l.perms ?? { info: true, folders: false, remote: false };
  const { data: companyRow } = await svc.from("companies").select("name").eq("id", l.company_id!).maybeSingle();
  const { data: clientsRaw } = await svc
    .from("clients")
    .select("id,name,phone,document,email,tax_regime,status,notes,logo_url,folder_id")
    .eq("third_party_id", l.id!)
    .order("name");
  const clients = clientsRaw ?? [];

  // Monta a saída por cliente respeitando as permissões.
  const out = [] as unknown[];
  for (const c of clients) {
    const item: Record<string, unknown> = {
      id: c.id, name: c.name, logo_url: c.logo_url,
      phone: perms.info ? c.phone : null, document: perms.info ? c.document : null,
      email: perms.info ? c.email : null, tax_regime: perms.info ? c.tax_regime : null,
      status: c.status ?? "ativo", notes: perms.info ? c.notes : null,
    };
    if (perms.remote) {
      const { data: agents } = await svc.from("remote_agents").select("id,name,os,status,last_seen").eq("client_id", c.id);
      item.remote = agents ?? [];
    }
    if (perms.folders && c.folder_id) {
      // Árvore de pastas/arquivos sob a pasta do cliente + URLs assinadas.
      const tree: FileRow[] = [];
      let frontier = [c.folder_id as string];
      for (let depth = 0; depth < 6 && frontier.length; depth++) {
        const { data: kids } = await svc.from("files").select("id,name,type,parent_id,storage_path,mime").in("parent_id", frontier);
        const rows = (kids as FileRow[]) ?? [];
        tree.push(...rows);
        frontier = rows.filter((r) => r.type === "folder").map((r) => r.id);
      }
      const files = tree.filter((r) => r.type === "file" && r.storage_path);
      const signed: Record<string, string> = {};
      if (files.length) {
        const { data: urls } = await svc.storage.from("company-files").createSignedUrls(files.map((f) => f.storage_path as string), 3600);
        (urls ?? []).forEach((u, i) => { if (u.signedUrl) signed[files[i].id] = u.signedUrl; });
      }
      item.folders = tree.map((r) => ({ id: r.id, name: r.name, type: r.type, parent_id: r.parent_id, url: signed[r.id] ?? null }));
      item.root_folder = c.folder_id;
    }
    out.push(item);
  }

  return NextResponse.json({ ok: true, name: l.name, company: companyRow?.name ?? "", perms, clients: out });
}
