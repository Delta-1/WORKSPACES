import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Body = {
  agentId?: string;
  kind?: "input" | "screenshot" | "android_file";
  params?: Record<string, unknown>;
  wait?: boolean;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function safeParams(kind: Body["kind"], params: Record<string, unknown>) {
  if (kind === "input") {
    const action = String(params.action || "");
    if (!["clickat", "doubleclickat", "type", "key", "open", "swipe"].includes(action)) throw new Error("Ação Android inválida.");
    return {
      action,
      x: Math.max(0, Math.min(1, Number(params.x) || 0)),
      y: Math.max(0, Math.min(1, Number(params.y) || 0)),
      x2: Math.max(0, Math.min(1, Number(params.x2) || 0)),
      y2: Math.max(0, Math.min(1, Number(params.y2) || 0)),
      text: String(params.text || "").slice(0, 4000),
      name: String(params.name || "").slice(0, 80),
    };
  }
  if (kind === "android_file") {
    const action = String(params.action || "");
    if (!["list", "mkdir", "rename", "delete"].includes(action)) throw new Error("Operação de arquivo inválida.");
    return {
      action,
      path: String(params.path || "").replaceAll("\\", "/").slice(0, 800),
      name: String(params.name || "").slice(0, 180),
    };
  }
  return {};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const auth = supabaseForRequest(request);
    const service = serviceClient();
    if (!auth || !service) return NextResponse.json({ error: "Servidor não configurado." }, { status: 500 });
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Entre no Workspace novamente." }, { status: 401 });

    const body = (await request.json()) as Body;
    const agentId = String(body.agentId || "");
    if (!agentId || !body.kind) return NextResponse.json({ error: "Faltaram dados do dispositivo." }, { status: 400 });
    const { data: allowed } = await auth.rpc("my_remote_agents");
    const matched = Array.isArray(allowed) ? allowed.find((agent: {
      id?: string; company_id?: string | null; allow_control?: boolean | null;
      allow_files?: boolean | null; allow_screenshot?: boolean | null;
    }) => agent.id === agentId) : null;
    if (!matched) return NextResponse.json({ error: "Você não tem acesso a este dispositivo." }, { status: 403 });
    if (body.kind === "input" && matched.allow_control === false) return NextResponse.json({ error: "O controle está desativado neste dispositivo." }, { status: 403 });
    if (body.kind === "android_file" && matched.allow_files === false) return NextResponse.json({ error: "O acesso a arquivos está desativado neste dispositivo." }, { status: 403 });
    if (body.kind === "screenshot" && matched.allow_screenshot === false) return NextResponse.json({ error: "A captura de tela está desativada neste dispositivo." }, { status: 403 });

    const params = safeParams(body.kind, body.params ?? {});
    const { data: job, error } = await service.from("agent_jobs")
      .insert({ agent_id: agentId, company_id: matched.company_id ?? null, kind: body.kind, status: "pending", params })
      .select("id").single();
    if (error || !job) return NextResponse.json({ error: error?.message || "Não foi possível enviar a ação." }, { status: 500 });
    if (!body.wait) return NextResponse.json({ ok: true, jobId: job.id });
    for (let attempt = 0; attempt < 24; attempt++) {
      await sleep(500);
      const { data } = await service.from("agent_jobs").select("status,result_url,error").eq("id", job.id).maybeSingle();
      if (data?.status === "done") return NextResponse.json({ ok: true, url: data.result_url || null });
      if (data?.status === "error") return NextResponse.json({ error: data.error || "A ação falhou no celular." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, pending: true, jobId: job.id });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Falha no agente Android." }, { status: 400 });
  }
}
