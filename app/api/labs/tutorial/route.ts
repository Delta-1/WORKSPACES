import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { AiProvider } from "@/lib/types";

export const runtime = "nodejs";

// GERAR TUTORIAL: pega a conversa de treino (o que a pessoa explicou que vão
// fazer hoje) + a memória atual do agente e transforma num TUTORIAL passo a passo
// ("Passo 1: … explicação", "Passo 2: …", etc.) — um relatório. O tutorial é
// salvo como um arquivo .md na pasta de memória do agente, então aparece no grafo
// e qualquer pessoa que ficar em dúvida clica no arquivo e lê o passo a passo.
export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { agentId, history, topic } = (await request.json()) as {
    agentId?: string;
    history?: { role: "user" | "assistant"; text: string }[];
    topic?: string;
  };
  if (!agentId) return NextResponse.json({ error: "Informe agentId." }, { status: 400 });

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
    if (parts.length) brain = `\n\nMemória do agente (o que ele já aprendeu):\n${parts.join("\n\n")}`;
  }

  const conversa = (Array.isArray(history) ? history : [])
    .filter((h) => h && h.text)
    .map((h) => `${h.role === "user" ? "PESSOA" : "AGENTE"}: ${h.text}`)
    .join("\n");

  const system =
    `Você é ${agent.name}, um assistente que APRENDEU um procedimento e agora vai escrever o TUTORIAL oficial dele.\n` +
    `A partir da conversa de treino e da sua memória, escreva um passo a passo CLARO, em português, que qualquer pessoa da equipe consiga seguir sozinha.\n` +
    `Filtre o que é conversa e mantenha só o que importa para executar a tarefa.\n\n` +
    `Formato OBRIGATÓRIO (markdown):\n` +
    `# Tutorial: <título curto do que se faz>\n` +
    `**Objetivo:** <uma frase>\n\n` +
    `## Passos\n` +
    `1. **<ação do passo>** — <explicação do que fazer e por quê>\n` +
    `2. **<ação>** — <explicação>\n` +
    `(quantos passos forem necessários, na ordem certa)\n\n` +
    `## Observações\n- <dicas, cuidados, erros comuns>\n\n` +
    `Se faltar informação para algum passo, escreva "⚠️ (confirmar com quem ensinou)" no lugar em vez de inventar.` +
    (agent.knowledge ? `\n\nBase: ${agent.knowledge}` : "") + brain;

  const userMsg =
    (topic ? `Tema de hoje: ${topic}\n\n` : "") +
    `Conversa de treino:\n${conversa || "(sem conversa — use a memória do agente)"}\n\n` +
    `Escreva agora o tutorial completo no formato pedido.`;

  let tutorial = "";
  try {
    tutorial = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }
  tutorial = (tutorial || "").trim();
  if (!tutorial) return NextResponse.json({ error: "Não consegui gerar o tutorial." }, { status: 502 });

  // Salva o tutorial como um arquivo próprio na memória do agente (aparece no grafo).
  let fileId: string | null = null;
  let fileName = "";
  try {
    let folderId = agent.folder_id as string | null;
    if (!folderId) {
      const { data: folder } = await client.from("files").insert({ name: `Agente: ${agent.name}`, type: "folder", parent_id: null, company_id: agent.company_id }).select("id").single();
      folderId = folder?.id ?? null;
      if (folderId) await client.from("chatbots").update({ folder_id: folderId }).eq("id", agent.id);
    }
    if (folderId) {
      // Título do arquivo: a partir do "# Tutorial:" ou do tema/data.
      const m = tutorial.match(/#\s*Tutorial:\s*(.+)/i);
      const base = (m?.[1] || topic || "").trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 60);
      const stamp = new Date().toLocaleDateString("pt-BR");
      fileName = `Tutorial - ${base || stamp}.md`;
      const { data: created } = await client
        .from("files")
        .insert({ name: fileName, type: "file", parent_id: folderId, company_id: agent.company_id, text_content: tutorial, mime: "text/markdown" })
        .select("id")
        .single();
      fileId = created?.id ?? null;

      // Também registra no índice de tutoriais do agente (para ele reaproveitar).
      const indexEntry = `\n\n## ${fileName} (${stamp})\n${tutorial.split("\n").slice(0, 3).join("\n")}`;
      const { data: idx } = await client.from("files").select("id,text_content").eq("parent_id", folderId).eq("name", "tutoriais.md").maybeSingle();
      if (idx?.id) await client.from("files").update({ text_content: `${String(idx.text_content || "").slice(-60000)}${indexEntry}` }).eq("id", idx.id);
      else await client.from("files").insert({ name: "tutoriais.md", type: "file", parent_id: folderId, company_id: agent.company_id, text_content: `# Tutoriais de ${agent.name}${indexEntry}`, mime: "text/markdown" });
    }
  } catch { /* melhor esforço — o tutorial ainda volta pro chat */ }

  return NextResponse.json({ tutorial, fileId, fileName });
}
