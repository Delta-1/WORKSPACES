import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Portal do Motorista — acesso por TOKEN individual (sem login, sem ver o banco
// nem o financeiro da empresa). Usa a service role no servidor e SÓ expõe os
// dados do próprio motorista e das cargas atribuídas a ele.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
type SB = NonNullable<ReturnType<typeof svc>>;

async function getDriver(sb: SB, token: string) {
  const { data } = await sb.from("logistics_drivers").select("*").eq("access_token", token).maybeSingle();
  return data as { id: string; company_id: string; nome: string; telefone: string | null; veiculo: string | null } | null;
}

// GET: perfil do motorista + cargas atribuídas + últimas mensagens.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const sb = svc();
  if (!sb) return NextResponse.json({ error: "server_unconfigured" }, { status: 500 });
  const { token } = await params;
  const drv = await getDriver(sb, token);
  if (!drv) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ data: cargas }, { data: msgs }] = await Promise.all([
    sb.from("logistics_cargas").select("id,codigo,cliente_nome,produto,origem,destino,pais_destino,stage").eq("driver_id", drv.id).order("created_at", { ascending: false }),
    sb.from("logistics_driver_messages").select("id,sender,text,created_at").eq("driver_id", drv.id).order("created_at", { ascending: true }).limit(80),
  ]);
  return NextResponse.json({
    driver: { id: drv.id, nome: drv.nome, telefone: drv.telefone, veiculo: drv.veiculo },
    cargas: cargas ?? [],
    messages: msgs ?? [],
  });
}

// POST: ações do motorista — ping (GPS), message (chat), pod (foto), profile.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const sb = svc();
  if (!sb) return NextResponse.json({ error: "server_unconfigured" }, { status: 500 });
  const { token } = await params;
  const drv = await getDriver(sb, token);
  if (!drv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; lat?: number; lng?: number; text?: string; cargaId?: string;
    photoBase64?: string; kind?: string; nome?: string; telefone?: string; veiculo?: string;
  };

  if (body.action === "ping" && typeof body.lat === "number" && typeof body.lng === "number") {
    await sb.from("logistics_drivers").update({ gps_ativo: true, last_lat: body.lat, last_lng: body.lng, last_ping_at: new Date().toISOString() }).eq("id", drv.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "message" && body.text) {
    await sb.from("logistics_driver_messages").insert({ company_id: drv.company_id, driver_id: drv.id, carga_id: body.cargaId || null, sender: "motorista", text: body.text.slice(0, 2000) });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "profile") {
    await sb.from("logistics_drivers").update({ nome: body.nome || drv.nome, telefone: body.telefone ?? drv.telefone, veiculo: body.veiculo ?? drv.veiculo }).eq("id", drv.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "pod" && body.photoBase64) {
    try {
      const m = /^data:(.+?);base64,(.*)$/.exec(body.photoBase64);
      const mime = m?.[1] || "image/jpeg";
      const buf = Buffer.from(m?.[2] || body.photoBase64, "base64");
      const ext = (mime.split("/")[1] || "jpg").slice(0, 5);
      const path = `pod/${drv.company_id}/${drv.id}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("company-files").upload(path, buf, { contentType: mime, upsert: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { data: pub } = sb.storage.from("company-files").getPublicUrl(path);
      await sb.from("logistics_pod").insert({ company_id: drv.company_id, carga_id: body.cargaId || null, driver_id: drv.id, photo_url: pub?.publicUrl || null, kind: body.kind || "carga" });
      return NextResponse.json({ ok: true, url: pub?.publicUrl });
    } catch (e) {
      return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
