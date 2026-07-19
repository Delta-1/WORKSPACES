import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { AiProvider } from "@/lib/types";

export const runtime = "nodejs";

// TREINAR o agente: você conversa/ensina, ele responde no personagem dele (usando
// o cérebro atual) e o que foi ensinado é GUARDADO na pasta de memória dele
// (aparece no grafo), pra ele ir aprendendo. Ele pergunta quando não entende.
export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { agentId, message, history } = (await request.json()) as { agentId?: string; message?: string; history?: { role: "user" | "assistant"; text: string }[] };
  if (!agentId || !message?.trim()) return NextResponse.json({ error: "Informe agentId e a mensagem." }, { status: 400 });

  const { data: agent } = await client
    .from("chatbots")
    .select("id,name,persona,instructions,knowledge,provider,api_key,folder_id,company_id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  // Chave de IA: a do agente; senão a do usuário (ai_config).
  let override: AiOverride | null = agent.api_key ? { provider: agent.provider as AiProvider, apiKey: agent.api_key } : null;
  if (!override) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data: cfg } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle();
      if (cfg?.api_key) override = { provider: cfg.provider, apiKey: cfg.api_key };
    }
  }

  // Cérebro atual: textos dos arquivos na pasta de memória do agente.
  let brain = "";
  if (agent.folder_id) {
    const { data: files } = await client.from("files").select("name,text_content").eq("parent_id", agent.folder_id).eq("type", "file").limit(30);
    const parts = (files ?? []).filter((f) => f.text_content).map((f) => `### ${f.name}\n${String(f.text_content).slice(0, 2500)}`);
    if (parts.length) brain = `\n\nO que você já aprendeu (memória):\n${parts.join("\n\n")}`;
  }

  const system =
    `Você é ${agent.name}. ${agent.persona ? `Personalidade: ${agent.persona}. ` : ""}${agent.instructions || ""}\n` +
    `VOCÊ ESTÁ SENDO TREINADO. A pessoa vai te ensinar como fazer as coisas. Preste atenção, RESUMA o que entendeu e FAÇA PERGUNTAS quando algo ficar vago ou faltar detalhe — assim você aprende de verdade. Seja objetivo.` +
    (agent.knowledge ? `\n\nBase: ${agent.knowledge}` : "") + brain;

  const hist = Array.isArray(history) ? history.filter((h) => h && h.text).slice(-12) : [];

  let reply = "";
  try {
    reply = await runChat([...hist, { role: "user", text: message }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }

  // Salva o que foi ensinado na memória do agente (pasta do grafo/servidor).
  try {
    let folderId = agent.folder_id as string | null;
    if (!folderId) {
      const { data: folder } = await client.from("files").insert({ name: `Agente: ${agent.name}`, type: "folder", parent_id: null, company_id: agent.company_id }).select("id").single();
      folderId = folder?.id ?? null;
      if (folderId) await client.from("chatbots").update({ folder_id: folderId }).eq("id", agent.id);
    }
    if (folderId) {
      const stamp = new Date().toLocaleString("pt-BR");
      const entry = `\n\n## Treino ${stamp}\n**Ensinado:** ${message.trim()}\n**Entendi:** ${reply.trim()}`;
      const { data: ex } = await client.from("files").select("id,text_content").eq("parent_id", folderId).eq("name", "treinamento.md").maybeSingle();
      if (ex?.id) await client.from("files").update({ text_content: `${String(ex.text_content || "").slice(-60000)}${entry}` }).eq("id", ex.id);
      else await client.from("files").insert({ name: "treinamento.md", type: "file", parent_id: folderId, company_id: agent.company_id, text_content: `# Treinamento de ${agent.name}${entry}`, mime: "text/markdown" });
    }
  } catch { /* melhor esforço */ }

  return NextResponse.json({ reply });
}
