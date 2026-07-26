import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

// A IA (Nina) do Estúdio: recebe o pedido do usuário e devolve HTML pronto para
// entrar na página do editor (títulos, parágrafos, listas). Usa a IA configurada
// no Workspace — sem API externa.
export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await request.json()) as {
    prompt?: string;
    template?: string; // abnt | apa | vancouver | blank
    meta?: Record<string, string>;
    currentText?: string; // texto atual do documento (para editar/continuar)
    mode?: "replace" | "append" | "edit";
  };
  if (!body?.prompt?.trim()) return NextResponse.json({ error: "Diga o que você quer criar." }, { status: 400 });

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

  const norma = body.template === "apa" ? "normas APA" : body.template === "vancouver" ? "normas Vancouver" : body.template === "blank" ? "formatação livre" : "normas ABNT";
  const metaTxt = body.meta ? Object.entries(body.meta).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") : "";

  const system =
    `Você é a Nina, redatora do Estúdio (editor de documentos do Workspace). Você produz o conteúdo de um documento seguindo ${norma}.\n` +
    `Devolva SOMENTE HTML de corpo de documento — use apenas as tags <h1> <h2> <h3> <p> <ul> <li> <ol> <b> <i> <u>. Sem <html>, <head>, <style>, sem markdown, sem comentários.\n` +
    `Títulos de seção em <h1>/<h2>. Parágrafos reais e desenvolvidos em <p> (nada de tópicos vazios).\n` +
    (metaTxt ? `Dados do trabalho: ${metaTxt}.\n` : "") +
    (body.mode === "append" ? `Você vai COMPLEMENTAR o documento atual — gere só o novo trecho.\n` : body.mode === "edit" ? `Você vai REESCREVER/AJUSTAR conforme o pedido.\n` : `Gere o documento do zero.\n`);

  const userMsg =
    (body.currentText ? `Documento atual:\n"""${String(body.currentText).slice(0, 8000)}"""\n\n` : "") +
    `Pedido: ${body.prompt}\n\nResponda com o HTML.`;

  let html = "";
  try {
    html = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }
  html = (html || "").trim();
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) html = fence[1].trim();
  // Segurança básica: remove scripts/estilos que a IA por acaso tenha mandado.
  html = html.replace(/<\/?(script|style|html|head|body)[^>]*>/gi, "").trim();
  if (!html) return NextResponse.json({ error: "Não consegui gerar o conteúdo. Tente de novo." }, { status: 502 });

  return NextResponse.json({ html });
}
