import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// A pessoa colou o CÓDIGO do acesso remoto dela no Workspace.IA. Aqui pedimos um
// print da tela DELA (ela mesma consentiu ao instalar o agente e informar o
// código) para a IA poder ver e guiar passo a passo. Exige o slug do Work +
// o access_code, e só funciona se o agente permitir screenshot.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  try {
    const { slug, access_code } = (await request.json()) as { slug?: string; access_code?: string };
    const code = (access_code || "").trim();
    if (!slug || !code) return NextResponse.json({ error: "Faltou o código." }, { status: 400 });

    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "config" }, { status: 500 });

    // O Work precisa estar ligado e o código precisa ser da MESMA empresa do link.
    const { data: company } = await supabase
      .from("company_settings")
      .select("company_id, work_enabled")
      .eq("work_slug", slug)
      .maybeSingle();
    if (!company || !company.work_enabled) return NextResponse.json({ error: "Indisponível." }, { status: 404 });

    const { data: agent } = await supabase
      .from("remote_agents")
      .select("id, company_id, name, allow_screenshot")
      .eq("access_code", code)
      .maybeSingle();
    if (!agent || agent.company_id !== company.company_id) return NextResponse.json({ error: "Código inválido." }, { status: 403 });
    if (agent.allow_screenshot === false) return NextResponse.json({ error: "Este acesso não permite ver a tela." }, { status: 403 });

    // Enfileira o job de screenshot (o agente na máquina responde com o print).
    const { data: job, error } = await supabase
      .from("agent_jobs")
      .insert({ agent_id: agent.id, company_id: agent.company_id, kind: "screenshot", status: "pending" })
      .select("id")
      .single();
    if (error || !job) return NextResponse.json({ error: "Não consegui pedir o print." }, { status: 500 });

    // Aguarda o agente concluir (result_url). Poll rápido para dar fluidez.
    for (let i = 0; i < 22; i++) {
      await sleep(900);
      const { data: cur } = await supabase.from("agent_jobs").select("status, result_url, error").eq("id", job.id).maybeSingle();
      if (cur?.result_url) return NextResponse.json({ url: cur.result_url, agent: agent.name });
      if (cur?.status === "error") return NextResponse.json({ error: cur.error || "Falhou no computador." }, { status: 502 });
    }
    return NextResponse.json({ error: "O computador não respondeu a tempo. Ele está ligado e com o acesso aberto?" }, { status: 504 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
