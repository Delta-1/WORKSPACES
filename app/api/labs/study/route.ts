import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { AiProvider } from "@/lib/types";

export const runtime = "nodejs";

// O agente ESTUDA um documento: gera um .txt com os dados brutos/estruturados e
// um .md com a LÓGICA (como usar), nomeia os arquivos por finalidade e grava na
// pasta de MEMÓRIA do agente (que alimenta o cérebro dele automaticamente).
export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { agentId, filename, text } = (await request.json()) as { agentId?: string; filename?: string; text?: string };
  if (!agentId || !text?.trim()) return NextResponse.json({ error: "Informe agentId e o conteúdo." }, { status: 400 });

  const { data: agent } = await client
    .from("chatbots")
    .select("id,name,provider,api_key,folder_id,company_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  // Chave de IA: a do agente; senão a do usuário (ai_config); senão a do ambiente.
  let override: AiOverride | null = agent.api_key ? { provider: agent.provider as AiProvider, apiKey: agent.api_key } : null;
  if (!override) {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: cfg } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle();
      if (cfg?.api_key) override = { provider: cfg.provider, apiKey: cfg.api_key };
    }
  }

  const system =
    `Você é ${agent.name}, um agente que ESTUDA documentos e organiza a própria memória. ` +
    `Ao receber um documento, você produz arquivos de memória: (1) arquivos .txt com os DADOS brutos/estruturados ` +
    `(listas, tabelas — uma informação por linha, limpo), e (2) um arquivo .md com a LÓGICA: explique, passo a passo, ` +
    `o que cada parte significa e COMO usar esses dados (ex.: "de cada linha, extraia X e Y; para calcular Z faça..."). ` +
    `Dê NOMES claros aos arquivos, pela finalidade (ex.: "ncm_aliquotas", "regras_calculo"). ` +
    `Responda SOMENTE com um JSON válido no formato: {"files":[{"name":"nome_sem_extensao","ext":"txt|md","content":"..."}]}. ` +
    `Sem texto fora do JSON.`;
  const userMsg = `Documento "${filename || "arquivo"}":\n\n${text.slice(0, 60000)}`;

  let reply = "";
  try {
    reply = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }

  // Extrai o JSON (tolera cercas de código).
  let parsed: { files?: { name?: string; ext?: string; content?: string }[] } = {};
  try {
    const m = reply.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : reply);
  } catch {
    return NextResponse.json({ error: "A IA não retornou um resultado válido. Tente de novo.", raw: reply.slice(0, 500) }, { status: 502 });
  }
  const files = (parsed.files ?? []).filter((f) => f?.content && f?.name);
  if (files.length === 0) return NextResponse.json({ error: "Nada foi extraído do documento." }, { status: 422 });

  // Garante a pasta de memória do agente.
  let folderId = agent.folder_id as string | null;
  if (!folderId) {
    const { data: folder } = await client.from("files").insert({ name: `Agente: ${agent.name}`, type: "folder", parent_id: null }).select("id").single();
    folderId = folder?.id ?? null;
    if (folderId) await client.from("chatbots").update({ folder_id: folderId }).eq("id", agent.id);
  }

  const created: string[] = [];
  for (const f of files) {
    const ext = f.ext === "md" ? "md" : "txt";
    const safe = String(f.name).replace(/[^\w.-]+/g, "_").replace(/\.(txt|md)$/i, "");
    const name = `${safe}.${ext}`;
    await client.from("files").insert({
      name,
      type: "file",
      parent_id: folderId,
      company_id: agent.company_id,
      text_content: String(f.content).slice(0, 100000),
      mime: ext === "md" ? "text/markdown" : "text/plain",
    });
    created.push(name);
  }

  return NextResponse.json({ ok: true, created });
}
