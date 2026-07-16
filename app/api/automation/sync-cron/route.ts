import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { getDriveAccessToken } from "@/lib/google-drive";
import { drainToDrive } from "@/lib/drive-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backstop agendado (Vercel Cron): drena o bucket -> Drive mesmo sem ninguém
// com o app aberto. Autenticado pelo header do próprio Vercel Cron ou por
// CRON_SECRET (se configurado).
export async function GET(request: Request) {
  const isVercelCron = request.headers.get("x-vercel-cron") != null;
  const secret = process.env.CRON_SECRET;
  const authOk = secret ? request.headers.get("authorization") === `Bearer ${secret}` : true;
  if (!isVercelCron && !authOk) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const supabase = supabaseService();
  if (!supabase) return NextResponse.json({ error: "service role não configurado" }, { status: 500 });

  const token = await getDriveAccessToken();
  if (!token) return NextResponse.json({ error: "Drive não configurado" }, { status: 400 });

  const { data: company } = await supabase
    .from("company_settings")
    .select("google_drive_root_folder_id")
    .eq("id", true)
    .maybeSingle();
  const parent = company?.google_drive_root_folder_id;
  if (!parent) return NextResponse.json({ error: "sem pasta da empresa no Drive" }, { status: 400 });

  const sent = await drainToDrive(supabase, token, parent, 100);
  return NextResponse.json({ sent });
}
