import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Branding PÚBLICO do Workspace.IA de uma empresa (só o necessário para a página
// pública: nome, logo, cor e link de instalação). Nada confidencial.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "slug" }, { status: 400 });
  const supabase = svc();
  if (!supabase) return NextResponse.json({ error: "config" }, { status: 500 });
  const { data } = await supabase
    .from("company_settings")
    .select("name, logo_url, theme_color, icon_color, work_enabled, remote_agent_download_url")
    .eq("work_slug", slug)
    .maybeSingle();
  if (!data || !data.work_enabled) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    name: data.name || "Workspace",
    logo_url: data.logo_url || null,
    theme_color: data.theme_color || "#6366f1",
    icon_color: data.icon_color || null,
    download_url: data.remote_agent_download_url || null,
  });
}
