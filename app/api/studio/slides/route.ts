import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Gera uma APRESENTAÇÃO (slides) com a IA do Workspace — sem API externa.
// Retorna JSON: { titulo, slides: [{ titulo, topicos: [], nota }] }.
function parseDeck(text: string) {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) t = fence[1].trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try {
    const o = JSON.parse(t);
    const slides = Array.isArray(o.slides) ? o.slides.map((sl: { titulo?: string; topicos?: string[]; nota?: string }) => ({
      titulo: String(sl.titulo || ""),
      topicos: Array.isArray(sl.topicos) ? sl.topicos.map(String).slice(0, 8) : [],
      nota: String(sl.nota || ""),
    })) : [];
    return { titulo: String(o.titulo || "Apresentação"), slides };
  } catch { return null; }
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = (await request.json()) as { prompt?: string; n?: number };
  if (!body?.prompt?.trim()) return NextResponse.json({ error: "Diga o tema da apresentação." }, { status: 400 });

  let override: AiOverride | null = null;
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const { data: cfg } = await client.from("ai_config").select("provider, api_key").eq("user_id", user.id).maybeSingle();
    if (cfg?.api_key) override = { provider: cfg.provider, apiKey: cfg.api_key };
  }
  if (!override) {
    const { data: bot } = await client.from("chatbots").select("provider, api_key").not("api_key", "is", null).limit(1).maybeSingle();
    if (bot?.api_key) override = { provider: bot.provider as AiOverride["provider"], apiKey: bot.api_key };
  }

  const n = Math.min(Math.max(Number(body.n) || 8, 3), 20);
  const system =
    `Você cria apresentações de slides claras e objetivas em português.\n` +
    `Gere ${n} slides sobre o tema. Cada slide tem um título curto e de 3 a 5 tópicos (frases curtas, sem parágrafos longos). O primeiro slide é a capa (título + subtítulo nos tópicos).\n` +
    `Responda SOMENTE com JSON válido: {"titulo":"...","slides":[{"titulo":"...","topicos":["...","..."],"nota":"fala do apresentador (opcional)"}]}`;
  let raw = "";
  try { raw = await runChat([{ role: "user", text: `Tema: ${body.prompt}\n\nGere os ${n} slides em JSON.` }], system, override); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 }); }
  const deck = parseDeck(raw);
  if (!deck || !deck.slides.length) return NextResponse.json({ error: "Não consegui gerar os slides. Tente de novo." }, { status: 502 });
  return NextResponse.json({ deck });
}
