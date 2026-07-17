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
  {
    name: "list_sectors",
    description: "Lista os setores da empresa (id e nome). Use antes de criar uma tarefa para escolher o setor.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_employees",
    description: "Lista os funcionários da empresa (id, nome, cargo). Use para escolher responsável de tarefa ou destinatário de recado.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_task",
    description: "Cria uma tarefa no Kanban. Requer sector_id (use list_sectors). assignee_id é opcional (use list_employees).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        sector_id: { type: "string" },
        assignee_id: { type: "string" },
        due_date: { type: "string", description: "AAAA-MM-DD (opcional)" },
      },
      required: ["title", "sector_id"],
    },
  },
  {
    name: "lookup_client",
    description: "Busca clientes cadastrados pelo nome. Retorna nome, telefone, email.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "create_client",
    description: "Cadastra um cliente novo no CRM.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "post_announcement",
    description: "Publica um aviso no mural da empresa.",
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] },
  },
  {
    name: "send_internal_message",
    description: "Envia um recado interno para um colega, pelo recipient_id (use list_employees).",
    input_schema: { type: "object", properties: { recipient_id: { type: "string" }, text: { type: "string" } }, required: ["recipient_id", "text"] },
  },
  {
    name: "list_tasks",
    description: "Lista as tarefas recentes (id, título, coluna).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "move_task",
    description: "Move uma tarefa de coluna. column: a_fazer | em_andamento | concluido.",
    input_schema: { type: "object", properties: { task_id: { type: "string" }, column: { type: "string" } }, required: ["task_id", "column"] },
  },
  {
    name: "set_attendance",
    description: "Abre/encerra atendimento de um contato pelo nome. status: espera (aguardando) | atendendo | fechado (finalizar).",
    input_schema: { type: "object", properties: { contact: { type: "string" }, status: { type: "string" } }, required: ["contact", "status"] },
  },
];

type Ctx = { userId: string | null; companyId: string | null };

async function runAction(client: SupabaseClient, ctx: Ctx, name: string, input: Record<string, string>) {
  try {
    if (name === "list_sectors") {
      const { data } = await client.from("sectors").select("id,name").order("name");
      return data ?? [];
    }
    if (name === "list_employees") {
      const { data } = await client.from("profiles").select("id,full_name,role").order("full_name");
      return (data ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role }));
    }
    if (name === "create_task") {
      const { error } = await client.from("tasks").insert({
        title: input.title,
        description: input.description ?? null,
        sector_id: input.sector_id,
        assignee_id: input.assignee_id ?? null,
        column_name: "a_fazer",
        due_date: input.due_date ?? null,
        company_id: ctx.companyId,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: `Tarefa "${input.title}" criada em A fazer.` };
    }
    if (name === "lookup_client") {
      const { data } = await client.from("clients").select("id,name,phone,email").ilike("name", `%${input.query}%`).limit(10);
      return data ?? [];
    }
    if (name === "create_client") {
      const { error } = await client.from("clients").insert({
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        company_id: ctx.companyId,
        created_by: ctx.userId,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: `Cliente "${input.name}" cadastrado.` };
    }
    if (name === "post_announcement") {
      const { error } = await client.from("announcements").insert({
        title: input.title,
        body: input.body,
        author_id: ctx.userId,
        company_id: ctx.companyId,
        pinned: false,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: "Aviso publicado no mural." };
    }
    if (name === "send_internal_message") {
      if (!ctx.userId) return { ok: false, message: "Sem usuário para enviar." };
      const { error } = await client.from("internal_messages").insert({ sender_id: ctx.userId, recipient_id: input.recipient_id, text: input.text });
      return error ? { ok: false, message: error.message } : { ok: true, message: "Recado enviado." };
    }
    if (name === "list_tasks") {
      const { data } = await client.from("tasks").select("id,title,column_name").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    }
    if (name === "move_task") {
      const cols = ["a_fazer", "em_andamento", "concluido"];
      if (!cols.includes(input.column)) return { ok: false, message: "Coluna inválida." };
      const { error } = await client.from("tasks").update({ column_name: input.column }).eq("id", input.task_id);
      return error ? { ok: false, message: error.message } : { ok: true, message: "Tarefa movida." };
    }
    if (name === "set_attendance") {
      const st = ["espera", "atendendo", "fechado"].includes(input.status) ? input.status : null;
      if (!st) return { ok: false, message: "Status inválido." };
      const { data: c } = await client.from("contacts").select("id,name").ilike("name", `%${input.contact}%`).limit(1).maybeSingle();
      if (!c) return { ok: false, message: "Contato não encontrado." };
      const { data: conv } = await client
        .from("conversations")
        .select("id")
        .eq("contact_id", c.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!conv) return { ok: false, message: "Sem conversa para este contato." };
      const patch: Record<string, unknown> = { status: st };
      if (st === "fechado") patch.closed_at = new Date().toISOString();
      const { error } = await client.from("conversations").update(patch).eq("id", conv.id);
      return error ? { ok: false, message: error.message } : { ok: true, message: `Atendimento de ${c.name ?? "contato"} → ${st}.` };
    }
    return { error: "ferramenta desconhecida" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "erro" };
  }
}

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
async function dispatchTool(client: SupabaseClient, ctx: Ctx, name: string, input: Record<string, string>, sent: SentFile[]) {
  if (name === "search_files") return await runSearchFiles(client, input.query);
  if (name === "send_file") return await runSendFile(client, input.id, sent);
  return await runAction(client, ctx, name, input);
}

async function runCopilot(
  apiKey: string,
  client: SupabaseClient,
  ctx: Ctx,
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
      const out = await dispatchTool(client, ctx, tu.name, input, sent);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply, files: sent };
}

// Mesmo copiloto, mas com Gemini (function calling) — para quem usa chave Gemini.
type GeminiPart = { text?: string; functionCall?: { name: string; args: Record<string, string> }; functionResponse?: { name: string; response: unknown } };
async function runCopilotGemini(
  apiKey: string,
  client: SupabaseClient,
  ctx: Ctx,
  history: ChatTurn[],
  system: string
): Promise<{ reply: string; files: SentFile[] }> {
  const contents: { role: string; parts: GeminiPart[] }[] = history
    .filter((h) => h.text)
    .map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] }));
  const functionDeclarations = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema }));
  const sent: SentFile[] = [];
  let reply = "";
  for (let i = 0; i < 6; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations }] }),
      }
    );
    const data = await res.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    reply = parts.filter((p) => p.text).map((p) => p.text).join("\n") || reply;
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) break;
    contents.push({ role: "model", parts });
    const responseParts: GeminiPart[] = [];
    for (const c of calls) {
      const fc = c.functionCall!;
      const out = await dispatchTool(client, ctx, fc.name, (fc.args || {}) as Record<string, string>, sent);
      responseParts.push({ functionResponse: { name: fc.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return { reply, files: sent };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { history?: ChatTurn[]; system?: string; tools?: boolean; agentId?: string };
  const history = body.history ?? [];
  // A IA exige que a conversa COMECE com uma mensagem do usuário. A saudação
  // inicial do assistente (Orb/ChatTab) quebrava a chamada — removemos os turnos
  // de "assistant" do início.
  while (history.length && history[0].role === "assistant") history.shift();
  if (history.length === 0) {
    return NextResponse.json({ error: "Histórico vazio." }, { status: 400 });
  }
  let override = await loadOverride(request);
  const company = getCompany();
  const client = supabaseForRequest(request);

  // Agente do Labs (Orb / Copiloto interno): usa a chave e a personalidade dele.
  let agentContext = "";
  if (body.agentId && client) {
    const { data: ag } = await client.from("chatbots").select("provider,api_key,persona,instructions,knowledge").eq("id", body.agentId).maybeSingle();
    if (ag) {
      if (ag.api_key) override = { provider: ag.provider, apiKey: ag.api_key };
      const bits = [ag.persona && `Personalidade: ${ag.persona}`, ag.instructions && `Instruções: ${ag.instructions}`, ag.knowledge && `Conhecimento:\n${ag.knowledge}`].filter(Boolean);
      if (bits.length) agentContext = bits.join("\n") + "\n\n";
    }
  }

  const baseSystem =
    typeof body.system === "string" && body.system.trim()
      ? body.system
      : `Você é o copiloto interno de IA da plataforma "${company.name}". Ajuda os funcionários com dúvidas de rotina, sugestões de resposta para clientes e suporte.\n\n` +
        `ENTENDA A CONVERSA ANTES DE RESPONDER: leia todo o histórico, guarde na memória o que já foi dito (nomes, datas, números) e responda de forma CLARA e CONCISA, sem recomeçar nem repetir saudações.\n\n` +
        `Você TEM ACESSO aos arquivos e ações da empresa. Para arquivos, use search_files; se o nome estiver vago ou houver várias opções, PERGUNTE qual é o certo antes de enviar; quando tiver certeza, use send_file. ` +
        `Para criar tarefa, cadastrar cliente, publicar aviso, etc., use as ferramentas certas.`;
  const systemPrompt = agentContext + baseSystem;

  // Contexto do usuário (para agir no workspace: criar tarefa, recado, etc.).
  let ctx: Ctx = { userId: null, companyId: null };
  if (client) {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: prof } = await client.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      ctx = { userId: user.id, companyId: prof?.company_id ?? null };
    }
  }

  const anthropicKey =
    override?.provider === "anthropic" ? override.apiKey : !override ? process.env.ANTHROPIC_API_KEY : undefined;
  const geminiKey = override?.provider === "gemini" ? override.apiKey : undefined;
  const useTools = body.tools !== false && Boolean(client) && Boolean(anthropicKey || geminiKey);

  try {
    if (useTools && client) {
      const { reply, files } = geminiKey
        ? await runCopilotGemini(geminiKey, client, ctx, history, systemPrompt)
        : await runCopilot(anthropicKey as string, client, ctx, history, systemPrompt);
      return NextResponse.json({ reply, files, live: true });
    }
    const reply = await runChat(history, systemPrompt, override);
    return NextResponse.json({ reply, files: [], live: aiIsLive(override) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao falar com a IA.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
