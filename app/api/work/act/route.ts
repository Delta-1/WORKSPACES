import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Executa uma AÇÃO na máquina da pessoa a partir do Workspace.IA:
//  - mode "guiado": desenha um círculo (vermelho/amarelo) onde clicar (job highlight);
//  - mode "autonomo": a IA realmente clica/digita/abre (job input) — exige que o
//    acesso permita controle.
// Valida o slug (Work ligado) e o access_code (mesma empresa). A pessoa consentiu
// ao instalar o agente e colar o próprio código.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Body = {
  slug?: string;
  access_code?: string;
  mode?: "guiado" | "autonomo";
  action?: string; // clickat | doubleclickat | type | key | open | click
  x?: number;
  y?: number;
  text?: string;
  name?: string;
  color?: "vermelho" | "amarelo";
  label?: string;
};

export async function POST(request: Request) {
  try {
    const b = (await request.json()) as Body;
    const slug = (b.slug || "").trim();
    const code = (b.access_code || "").trim();
    if (!slug || !code || !b.action) return NextResponse.json({ error: "faltou dados" }, { status: 400 });

    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "config" }, { status: 500 });

    const { data: company } = await supabase.from("company_settings").select("company_id, work_enabled").eq("work_slug", slug).maybeSingle();
    if (!company || !company.work_enabled) return NextResponse.json({ error: "Indisponível." }, { status: 404 });

    const { data: agent } = await supabase.from("remote_agents").select("id, company_id, allow_control, allow_screenshot").eq("access_code", code).maybeSingle();
    if (!agent || agent.company_id !== company.company_id) return NextResponse.json({ error: "Código inválido." }, { status: 403 });

    const autonomous = b.mode === "autonomo";
    if (autonomous && agent.allow_control === false) return NextResponse.json({ error: "Este acesso não permite controle." }, { status: 403 });

    const kind = autonomous ? "input" : "highlight";
    const params = autonomous
      ? { action: b.action, x: b.x, y: b.y, text: b.text, name: b.name }
      : { x: b.x, y: b.y, color: b.color || "vermelho", label: b.label || "" };

    const { data: job, error } = await supabase
      .from("agent_jobs")
      .insert({ agent_id: agent.id, company_id: agent.company_id, kind, status: "pending", params })
      .select("id")
      .single();
    if (error || !job) return NextResponse.json({ error: "Não consegui enviar a ação." }, { status: 500 });

    // Espera o agente concluir (rápido). Não bloqueia muito.
    for (let i = 0; i < 8; i++) {
      await sleep(700);
      const { data: cur } = await supabase.from("agent_jobs").select("status, error").eq("id", job.id).maybeSingle();
      if (cur?.status === "done") return NextResponse.json({ ok: true });
      if (cur?.status === "error") return NextResponse.json({ error: cur.error || "falhou" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, pending: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
