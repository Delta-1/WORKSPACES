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

type FlowNode = { id: string; type: string; x: number; y: number; data: Record<string, unknown> };
type FlowEdge = { id: string; from: string; handle: string; to: string };
type BotFlow = { nodes: FlowNode[]; edges: FlowEdge[] };

type BotDraft = {
  name?: string; persona?: string; instructions?: string; greeting?: string;
  capabilities?: string[]; gender?: string; humanized?: boolean; flow?: BotFlow;
};

const CAP_IDS = new Set(CAPS.map((c) => c.id));
const NODE_TYPES = new Set(["start", "message", "ask", "condition", "buttons", "ai", "action", "wait", "tool", "end"]);
const ACTIONS = new Set(["handoff", "close", "send_address", "send_phone", "send_website"]);

// Normaliza um fluxo que a EVA propôs: ids únicos e previsíveis, um único
// "start", posições automáticas (empilhadas) quando faltam, tool válida e
// arestas que só apontam para nós existentes. Deixa a EVA ser "relaxada".
function normalizeFlow(raw: unknown): BotFlow | null {
  const r = raw as { nodes?: unknown[]; edges?: unknown[] } | null;
  if (!r || !Array.isArray(r.nodes) || r.nodes.length === 0) return null;
  const idMap = new Map<string, string>();
  const nodes: FlowNode[] = [];
  let hasStart = false;
  r.nodes.forEach((raw2, i) => {
    const n = (raw2 && typeof raw2 === "object" ? raw2 : {}) as { id?: unknown; type?: unknown; x?: unknown; y?: unknown; data?: unknown };
    let type = typeof n.type === "string" && NODE_TYPES.has(n.type) ? n.type : "message";
    if (type === "start" && hasStart) type = "message"; // só um start
    const oldId = n.id != null ? String(n.id) : `#${i}`;
    const newId = type === "start" ? "start" : `n${i}`;
    idMap.set(oldId, newId);
    const data = (n.data && typeof n.data === "object" ? { ...(n.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
    if (type === "tool" && (typeof data.tool !== "string" || !CAP_IDS.has(data.tool))) delete data.tool;
    if (type === "action" && (typeof data.action !== "string" || !ACTIONS.has(data.action))) data.action = "handoff";
    if (type === "start") hasStart = true;
    nodes.push({
      id: newId, type,
      x: Number.isFinite(Number(n.x)) ? Number(n.x) : 140,
      y: Number.isFinite(Number(n.y)) ? Number(n.y) : 30 + i * 140,
      data,
    });
  });
  if (!hasStart) nodes.unshift({ id: "start", type: "start", x: 140, y: 20, data: {} });
  const valid = new Set(nodes.map((n) => n.id));
  const edges: FlowEdge[] = (Array.isArray(r.edges) ? r.edges : []).map((raw2, j) => {
    const e = (raw2 && typeof raw2 === "object" ? raw2 : {}) as { from?: unknown; to?: unknown; handle?: unknown };
    const from = idMap.get(String(e.from)) ?? String(e.from);
    const to = idMap.get(String(e.to)) ?? String(e.to);
    return { id: `e${j}`, from, handle: typeof e.handle === "string" && e.handle ? e.handle : "out", to };
  }).filter((e) => valid.has(e.from) && valid.has(e.to));
  return { nodes, edges };
}

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
      if (raw.flow) { const f = normalizeFlow(raw.flow); if (f) patch.flow = f; }
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
    "Se nada mudar nesta rodada, mande {}. Nunca invente IDs de capacidade fora da lista. Não explique o JSON, só o inclua.\n\n" +
    "FLUXOGRAMA (quando a pessoa pedir um roteiro/fluxo, ou descrever um passo a passo): inclua no JSON um campo `flow` com { nodes: [...], edges: [...] } montando o roteiro visual.\n" +
    "Cada node = { id (curto e único, ex.: 'msg1'), type, data }. Tipos e o que vai em data:\n" +
    "- start (a entrada; data vazio). message {text}. ask {text} (pergunta e espera resposta). ai (data vazio; a IA responde livre).\n" +
    "- buttons {text, options:[..]} (uma saída por opção). condition {keywords:'a,b,c'} (saídas 'sim' e 'nao'). wait {minutes, text} (saídas 'respondeu' e 'sem_resposta').\n" +
    "- tool {tool:'<id da capacidade>', extra?} (aciona uma ferramenta). action {action:'handoff'|'close'|'send_address'|'send_phone'|'send_website'}. end (encerra).\n" +
    "Cada edge = { from:'idOrigem', to:'idDestino', handle } onde handle é 'out' (padrão), ou 'sim'/'nao' (condition), 'respondeu'/'sem_resposta' (wait), 'opt0','opt1',… (buttons, na ordem das opções).\n" +
    "SEMPRE inclua um node start e ligue-o ao primeiro passo. Não precisa mandar x/y (eu posiciono). Só monte o flow quando fizer sentido; senão, omita o campo.";

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
