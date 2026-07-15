import { NextResponse } from "next/server";
import { runChat, aiIsLive, type ChatTurn, type AiOverride } from "@/lib/ai";
import { getCompany } from "@/lib/store";
import { supabaseForRequest } from "@/lib/supabase-server";

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

export async function POST(request: Request) {
  const body = (await request.json()) as { history?: ChatTurn[]; system?: string };
  const history = body.history ?? [];
  if (history.length === 0) {
    return NextResponse.json({ error: "Histórico vazio." }, { status: 400 });
  }
  const override = await loadOverride(request);
  const company = getCompany();
  // Modo treino: o copiloto responde COMO o chatbot do WhatsApp (system próprio).
  const systemPrompt =
    typeof body.system === "string" && body.system.trim()
      ? body.system
      : `Você é o copiloto interno de IA da plataforma "${company.name}". Ajuda funcionários com dúvidas de rotina, sugestões de respostas para clientes, e suporte técnico. Seja direto e útil.`;
  try {
    const reply = await runChat(history, systemPrompt, override);
    return NextResponse.json({ reply, live: aiIsLive(override) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao falar com a IA.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
