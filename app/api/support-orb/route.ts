import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// Assistente flutuante da MÁQUINA DO CLIENTE. Público, mas exige o access_code
// do agente (identifica a empresa/computador). Responde dúvidas/erros rápidos e
// registra o pedido em support_requests para o suporte ver no workspace.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { access_code?: string; text?: string; history?: { role: "user" | "assistant"; text: string }[] };
    const code = (body.access_code || "").trim();
    const text = (body.text || "").trim();
    if (!code || !text) return NextResponse.json({ error: "Faltou o código ou a mensagem." }, { status: 400 });

    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "Servidor sem configuração." }, { status: 500 });

    const { data: agent } = await supabase.from("remote_agents").select("id,company_id,client_id,name").eq("access_code", code).maybeSingle();
    if (!agent) return NextResponse.json({ error: "Código inválido." }, { status: 403 });

    // Chave de IA: agente Copilot (slot internal) da empresa, senão env.
    let apiKey = process.env.ANTHROPIC_API_KEY || null;
    let provider = "anthropic";
    if (agent.company_id) {
      const { data: bot } = await supabase.from("chatbots").select("provider,api_key").eq("company_id", agent.company_id).eq("slot", "internal").limit(1).maybeSingle();
      if (bot?.api_key) { apiKey = bot.api_key; provider = bot.provider; }
    }

    const system =
      "Você é um assistente de suporte técnico que ajuda a PESSOA na máquina dela. Seja MUITO breve, calmo e prático: " +
      "entenda o problema/erro e dê um passo a passo curto e numerado para resolver. Se não der para resolver sozinho, diga que vai chamar o suporte. Fale como gente, em português.";
    const hist = Array.isArray(body.history) ? body.history.filter((h) => h && h.text).slice(-8) : [];

    let answer = "";
    try {
      if (provider === "gemini" && apiKey) {
        const contents = [
          ...hist.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
          { role: "user", parts: [{ text }] },
        ];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
        });
        const data = await res.json();
        answer = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } else if (apiKey) {
        const client = new Anthropic({ apiKey });
        const messages = [
          ...hist.map((h) => ({ role: h.role, content: [{ type: "text" as const, text: h.text }] })),
          { role: "user" as const, content: [{ type: "text" as const, text }] },
        ];
        const res = await client.messages.create({ model: "claude-sonnet-5", max_tokens: 400, system, messages });
        const block = res.content.find((b) => b.type === "text");
        answer = block && "text" in block ? block.text : "";
      }
    } catch {
      /* segue sem resposta de IA */
    }
    if (!answer) answer = "Entendi. Vou registrar aqui e avisar o suporte para te ajudar.";

    await supabase.from("support_requests").insert({
      company_id: agent.company_id,
      agent_id: agent.id,
      client_id: agent.client_id,
      text,
      answer,
    });

    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
