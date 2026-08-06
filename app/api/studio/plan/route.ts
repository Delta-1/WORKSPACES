import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

type RawNode = { id?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; text?: unknown; color?: unknown; kind?: unknown };
type RawEdge = { id?: unknown; from?: unknown; to?: unknown; color?: unknown; dashed?: unknown };
const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#64748b"];
const KINDS = new Set(["box", "text", "sticky", "ellipse", "diamond"]);

function parseObject(text: string): Record<string, unknown> | null {
  let value = String(text || "").trim(); const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced) value = fenced[1];
  const start = value.indexOf("{"); const end = value.lastIndexOf("}"); if (start >= 0 && end > start) value = value.slice(start, end + 1);
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : null; } catch { return null; }
}

function normalize(raw: Record<string, unknown>) {
  const ids = new Set<string>();
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, 24).map((item, index) => {
    const node = (item || {}) as RawNode; let id = String(node.id || `n${index + 1}`); while (ids.has(id)) id = `${id}-${index}`; ids.add(id);
    return {
      id, x: Number(node.x) || 0, y: Number(node.y) || 0,
      w: Math.max(120, Math.min(260, Number(node.w) || (index === 0 ? 210 : 180))),
      h: Math.max(64, Math.min(180, Number(node.h) || (index === 0 ? 100 : 86))),
      text: String(node.text || `Tópico ${index + 1}`).slice(0, 180),
      color: /^#[0-9a-f]{6}$/i.test(String(node.color || "")) ? String(node.color) : COLORS[index % COLORS.length],
      kind: KINDS.has(String(node.kind)) ? String(node.kind) : index === 0 ? "ellipse" : "box",
    };
  });
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 36).map((item, index) => {
    const edge = (item || {}) as RawEdge;
    return { id: String(edge.id || `e${index + 1}`), from: String(edge.from || ""), to: String(edge.to || ""), color: String(edge.color || COLORS[index % COLORS.length]), dashed: Boolean(edge.dashed) };
  }).filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  return { nodes, edges, strokes: [] as unknown[] };
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request); if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = (await request.json()) as { prompt?: string; referenceDecision?: "file" | "none"; referenceText?: string; referenceName?: string };
  if (!body.prompt?.trim()) return NextResponse.json({ error: "Diga qual é o tema do mapa mental." }, { status: 400 });
  if (body.referenceDecision !== "file" && body.referenceDecision !== "none") return NextResponse.json({ needsReference: true, error: "A Yumi precisa perguntar primeiro se você tem um arquivo de referência." }, { status: 400 });
  if (body.referenceDecision === "file" && !body.referenceText?.trim()) return NextResponse.json({ needsReference: true, error: "Envie o arquivo de referência antes de criar o mapa." }, { status: 400 });

  let override: AiOverride | null = null; const { data: { user } } = await client.auth.getUser();
  if (user) { const { data } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle(); if (data?.api_key) override = { provider: data.provider, apiKey: data.api_key }; }
  if (!override) { const { data } = await client.from("chatbots").select("provider, api_key").not("api_key", "is", null).limit(1).maybeSingle(); if (data?.api_key) override = { provider: data.provider as AiOverride["provider"], apiKey: data.api_key }; }

  const system = `Você é a Yumi, arquiteta visual do Estúdio. Crie um mapa mental claro, curto e fiel ao pedido. Responda SOMENTE JSON válido: {"title":"...","nodes":[{"id":"root","x":0,"y":0,"w":210,"h":100,"text":"Tema","color":"#6366f1","kind":"ellipse"}],"edges":[{"id":"e1","from":"root","to":"n1","color":"#6366f1"}]}.
Use 1 nó central, de 4 a 8 ramos principais e subtópicos somente quando ajudarem. Limite a 18 nós. Distribua os ramos dos dois lados, com x entre -900 e 900 e y entre -600 e 600, sem sobrepor caixas. kind pode ser box, ellipse, diamond ou sticky. Os textos devem ser diretos. Não inclua strokes. Não invente fatos específicos que não estejam no pedido ou na referência.`;
  const reference = body.referenceDecision === "file" ? `\n\nArquivo de referência "${body.referenceName || "material"}":\n${body.referenceText!.slice(0, 50000)}` : "\n\nA pessoa informou que não tem arquivo de referência; use apenas o pedido.";
  let raw = ""; try { raw = await runChat([{ role: "user", text: `Pedido: ${body.prompt.trim()}${reference}` }], system, override); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na IA." }, { status: 502 }); }
  const parsed = parseObject(raw); if (!parsed) return NextResponse.json({ error: "A Yumi não conseguiu estruturar o mapa. Tente novamente." }, { status: 502 });
  const scene = normalize(parsed); if (!scene.nodes.length) return NextResponse.json({ error: "O mapa veio sem tópicos. Tente detalhar o tema." }, { status: 502 });
  return NextResponse.json({ title: String(parsed.title || body.prompt).slice(0, 80), scene });
}
