import { NextResponse } from "next/server";
import { runChat, aiIsLive, type ChatTurn, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import { CAPS } from "@/lib/capabilities";

// EVA — a criadora de agentes. Recebe a conversa + o rascunho atual do bot e
// devolve uma resposta amigável + um "patch" (JSON) com os campos a mudar no
// agente. O front aplica o patch no editor na hora, então a pessoa vê o bot
// sendo montado enquanto conversa com a EVA.

async function loadOverride(request: Request): Promise<AiOverride | null> {
  const client = supabaseForRequest(request);
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle();
  if (!data?.api_key) return null;
  return { provider: data.provider, apiKey: data.api_key };
}

type BotDraft = {
  name?: string; persona?: string; instructions?: string; greeting?: string;
  capabilities?: string[]; gender?: string; humanized?: boolean;
};

const CAP_IDS = new Set(CAPS.map((c) => c.id));

// Tira o bloco ```json {...}``` do texto e devolve { texto limpo, patch }.
function extrairPatch(reply: string): { texto: string; patch: BotDraft } {
  const re = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
  const m = reply.match(re);
  let patch: BotDraft = {};
  if (m) {
    try {
      const raw = JSON.parse(m[1]) as BotDraft;
      // Só deixa passar campos válidos (e IDs de capacidade que existem).
      if (typeof raw.name === "string") patch.name = raw.name;
      if (typeof raw.persona === "string") patch.persona = raw.persona;
      if (typeof raw.instructions === "string") patch.instructions = raw.instructions;
      if (typeof raw.greeting === "string") patch.greeting = raw.greeting;
      if (raw.gender === "masculino" || raw.gender === "feminino" || raw.gender === "neutro") patch.gender = raw.gender;
      if (typeof raw.humanized === "boolean") patch.humanized = raw.humanized;
      if (Array.isArray(raw.capabilities)) patch.capabilities = raw.capabilities.filter((c) => typeof c === "string" && CAP_IDS.has(c));
    } catch { patch = {}; }
  }
  const texto = reply.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  return { texto, patch };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: { role: "user" | "assistant"; text: string }[]; bot?: BotDraft };
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && m.text) : [];
  const bot = body.bot ?? {};
  const override = await loadOverride(request);

  const capList = CAPS.map((c) => `- ${c.id} — ${c.label}: ${c.desc}`).join("\n");
  const system =
    "Você é a EVA, a criadora de agentes de IA do Workspaces. Você monta e ajusta um agente de atendimento CONVERSANDO com a pessoa — amigável, animada e objetiva. Faça no máximo uma pergunta por vez quando faltar algo; quando já der, proponha e vá montando.\n\n" +
    "RASCUNHO ATUAL do agente (o que já existe):\n" +
    JSON.stringify({ name: bot.name || "", persona: bot.persona || "", instructions: bot.instructions || "", greeting: bot.greeting || "", capabilities: bot.capabilities || [], gender: bot.gender || "neutro", humanized: bot.humanized ?? false }, null, 0) + "\n\n" +
    "CAPACIDADES (ferramentas) que o agente pode ganhar — use os IDs exatos:\n" + capList + "\n\n" +
    "SUA TAREFA: entenda o que a pessoa quer e proponha a configuração do agente. Escreva uma resposta curta e simpática (o que você entendeu/fez, e a próxima pergunta se precisar). " +
    "AO FINAL da sua mensagem, SEMPRE inclua um bloco de código ```json``` com APENAS os campos que devem MUDAR no agente. Campos possíveis: " +
    "name (string), persona (string curta do papel), instructions (texto rico e específico de como agir), greeting (saudação inicial), gender ('masculino'|'feminino'|'neutro'), humanized (true/false), capabilities (array com IDs da lista acima). " +
    "Se nada mudar nesta rodada, mande {}. Nunca invente IDs de capacidade fora da lista. Não explique o JSON, só o inclua.";

  if (!aiIsLive(override)) {
    return NextResponse.json({
      reply: "Pra eu criar os agentes de verdade, configure uma chave de IA em Configurações → Inteligência Artificial. 🙂",
      patch: {}, live: false,
    });
  }

  try {
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));
    const raw = await runChat(history, system, override);
    const { texto, patch } = extrairPatch(raw || "");
    return NextResponse.json({ reply: texto || "Prontinho! ✨", patch, live: true });
  } catch (err) {
    console.error("EVA falhou:", err);
    return NextResponse.json({ reply: "Tive um probleminha aqui, pode repetir?", patch: {}, live: true }, { status: 200 });
  }
}
