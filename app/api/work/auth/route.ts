import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Login próprio do Workspace.IA (clientes.IA). Guarda a senha só como HASH scrypt
// (salt aleatório) — nunca em texto puro. Registra entrada/saída e, quando a
// pessoa conecta o acesso, vincula a máquina ao usuário e renomeia p/ "nome — máquina".
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(pw: string, stored: string) {
  try {
    const [algo, salt, hash] = stored.split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const calc = scryptSync(pw, salt, 64);
    const orig = Buffer.from(hash, "hex");
    return calc.length === orig.length && timingSafeEqual(calc, orig);
  } catch {
    return false;
  }
}
const token = () => randomBytes(24).toString("hex");

export async function POST(request: Request) {
  try {
    const b = (await request.json()) as {
      action?: "signup" | "login" | "logout" | "link";
      slug?: string; email?: string; password?: string; username?: string;
      work_token?: string; access_code?: string;
    };
    const slug = (b.slug || "").trim();
    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "config" }, { status: 500 });

    const { data: company } = await supabase.from("company_settings").select("company_id, work_enabled").eq("work_slug", slug).maybeSingle();
    if (!company || !company.work_enabled) return NextResponse.json({ error: "Indisponível." }, { status: 404 });
    const cid = company.company_id as string | null;

    if (b.action === "signup") {
      const email = (b.email || "").trim().toLowerCase();
      const pw = b.password || "";
      const username = (b.username || "").trim() || email.split("@")[0];
      if (!email || pw.length < 4) return NextResponse.json({ error: "Informe e-mail e uma senha (mín. 4)." }, { status: 400 });
      const { data: exists } = await supabase.from("work_users").select("id").eq("company_id", cid).ilike("email", email).maybeSingle();
      if (exists) return NextResponse.json({ error: "Já existe uma conta com esse e-mail. Faça login." }, { status: 409 });
      const tk = token();
      const { data: u } = await supabase.from("work_users")
        .insert({ company_id: cid, email, username, password_hash: hashPassword(pw), session_token: tk, last_login_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
        .select("id, username").single();
      if (u) await supabase.from("work_access_log").insert({ company_id: cid, work_user_id: u.id, event: "in" });
      return NextResponse.json({ token: tk, username: u?.username || username });
    }

    if (b.action === "login") {
      const email = (b.email || "").trim().toLowerCase();
      const pw = b.password || "";
      const { data: u } = await supabase.from("work_users").select("id, username, password_hash").eq("company_id", cid).ilike("email", email).maybeSingle();
      if (!u || !verifyPassword(pw, u.password_hash)) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 403 });
      const tk = token();
      await supabase.from("work_users").update({ session_token: tk, last_login_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }).eq("id", u.id);
      await supabase.from("work_access_log").insert({ company_id: cid, work_user_id: u.id, event: "in" });
      return NextResponse.json({ token: tk, username: u.username });
    }

    // Resolve o usuário pelo token para as ações seguintes.
    const tk = (b.work_token || "").trim();
    if (!tk) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: user } = await supabase.from("work_users").select("id, username").eq("company_id", cid).eq("session_token", tk).maybeSingle();
    if (!user) return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });

    if (b.action === "logout") {
      await supabase.from("work_users").update({ session_token: null }).eq("id", user.id);
      await supabase.from("work_access_log").insert({ company_id: cid, work_user_id: user.id, event: "out" });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "link") {
      const code = (b.access_code || "").trim();
      const { data: agent } = await supabase.from("remote_agents").select("id, company_id, name, client_id").eq("access_code", code).maybeSingle();
      if (!agent || agent.company_id !== cid) return NextResponse.json({ error: "Código inválido." }, { status: 403 });
      // Nome da máquina "cru" = tira um prefixo "usuário — " anterior, se houver.
      const rawMachine = String(agent.name || "PC").replace(/^.*?—\s*/, "");
      const display = `${user.username} — ${rawMachine}`;
      await supabase.from("remote_agents").update({ name: display }).eq("id", agent.id);
      await supabase.from("work_users").update({ agent_id: agent.id, machine_name: rawMachine, last_seen_at: new Date().toISOString() }).eq("id", user.id);
      return NextResponse.json({ ok: true, username: user.username });
    }

    return NextResponse.json({ error: "ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
