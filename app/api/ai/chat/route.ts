import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runChat, aiIsLive, type ChatTurn, type AiOverride } from "@/lib/ai";
import { getCompany } from "@/lib/store";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

const ANTHROPIC_MODEL = "claude-sonnet-5";

async function loadOverride(request: Request): Promise<AiOverride | null> {
  const client = supabaseForRequest(request);
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle();
  if (!data?.api_key) return null;
  return { provider: data.provider, apiKey: data.api_key };
}

export async function GET(request: Request) {
  const override = await loadOverride(request);
  return NextResponse.json({ live: aiIsLive(override) });
}

// Ferramentas do copiloto: buscar e ENTREGAR arquivos/imagens do workspace.
type SentFile = { name: string; url: string; mime: string | null };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_files",
    description:
      "Busca arquivos e pastas da empresa pelo nome (ou parte dele). Use quando a pessoa pedir um arquivo, imagem ou documento. Retorna id, nome e tipo.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Parte do nome do arquivo/pasta" } },
      required: ["query"],
    },
  },
  {
    name: "send_file",
    description:
      "Envia (entrega) um arquivo específico para a pessoa no chat, pelo id retornado por search_files. Use quando tiver certeza de qual arquivo a pessoa quer.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "id do arquivo" } },
      required: ["id"],
    },
  },
];

async function runSearchFiles(client: SupabaseClient, query: string) {
  const q = String(query || "").trim();
  if (!q) return [];
  const { data } = await client
    .from("files")
    .select("id,name,type,storage_path,data_url")
    .ilike("name", `%${q}%`)
    .limit(15);
  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    hasContent: Boolean(f.storage_path || f.data_url),
  }));
}

async function runSendFile(client: SupabaseClient, id: string, sent: SentFile[]) {
  const { data: f } = await client
    .from("files")
    .select("id,name,type,storage_path,data_url,mime")
    .eq("id", id)
    .maybeSingle();
  if (!f) return { ok: false, message: "Arquivo não encontrado." };
  if (f.type === "folder") return { ok: false, message: "Isto é uma pasta, não um arquivo. Peça um arquivo de dentro dela." };
  let url: string | null = null;
  if (f.storage_path) {
    const { data: signed } = await client.storage.from("company-files").createSignedUrl(f.storage_path, 600);
    url = signed?.signedUrl ?? null;
  } else if (f.data_url) {
    url = f.data_url;
  }
  if (!url) return { ok: false, message: "Este arquivo ainda não tem conteúdo para enviar." };
  sent.push({ name: f.name, url, mime: f.mime ?? null });
  return { ok: true, message: `Arquivo "${f.name}" entregue no chat.` };
}

// Loop de tool-use da Anthropic (só quando há chave Anthropic).
async function runCopilot(
  apiKey: string,
  client: SupabaseClient,
  history: ChatTurn[],
  system: string
): Promise<{ reply: string; files: SentFile[] }> {
  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history.map((turn) => {
    const content: Anthropic.ContentBlockParam[] = [];
    if (turn.image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: turn.image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: turn.image.base64,
        },
      });
    }
    if (turn.text) content.push({ type: "text", text: turn.text });
    return { role: turn.role, content };
  });

  const sent: SentFile[] = [];
  let reply = "";
  for (let i = 0; i < 6; i++) {
    const res = await anthropic.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1200, system, tools: TOOLS, messages });
    reply = res.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("\n");
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || toolUses.length === 0) break;
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const input = tu.input as Record<string, string>;
      let out: unknown;
      if (tu.name === "search_files") out = await runSearchFiles(client, input.query);
      else if (tu.name === "send_file") out = await runSendFile(client, input.id, sent);
      else out = { error: "ferramenta desconhecida" };
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply, files: sent };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { history?: ChatTurn[]; system?: string; tools?: boolean };
  const history = body.history ?? [];
  if (history.length === 0) {
    return NextResponse.json({ error: "Histórico vazio." }, { status: 400 });
  }
  const override = await loadOverride(request);
  const company = getCompany();
  const client = supabaseForRequest(request);

  const systemPrompt =
    typeof body.system === "string" && body.system.trim()
      ? body.system
      : `Você é o copiloto interno de IA da plataforma "${company.name}". Ajuda os funcionários com dúvidas de rotina, sugestões de resposta para clientes e suporte.\n\n` +
        `Você TEM ACESSO aos arquivos da empresa. Quando pedirem um arquivo, imagem ou documento, use a ferramenta search_files para procurar pelo nome. ` +
        `Se houver várias opções ou o nome estiver vago, PERGUNTE para descobrir qual é o certo antes de enviar. ` +
        `Quando tiver certeza, use send_file para entregar o arquivo no chat. Seja direto e prestativo.`;

  // Modo com ferramentas: só com Anthropic (env ou override anthropic) e sem system de treino.
  const anthropicKey =
    override?.provider === "anthropic" ? override.apiKey : !override ? process.env.ANTHROPIC_API_KEY : undefined;
  const useTools = body.tools !== false && Boolean(anthropicKey) && Boolean(client);

  try {
    if (useTools && anthropicKey && client) {
      const { reply, files } = await runCopilot(anthropicKey, client, history, systemPrompt);
      return NextResponse.json({ reply, files, live: true });
    }
    const reply = await runChat(history, systemPrompt, override);
    return NextResponse.json({ reply, files: [], live: aiIsLive(override) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao falar com a IA.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
