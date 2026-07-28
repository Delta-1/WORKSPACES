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

const OPEN_TARGETS = [
  { names: ["youtube"], target: "https://www.youtube.com/", label: "YouTube" },
  { names: ["google maps", "maps"], target: "https://maps.google.com/", label: "Google Maps" },
  { names: ["gmail"], target: "https://mail.google.com/", label: "Gmail" },
  { names: ["chrome", "google chrome"], target: "chrome", label: "Google Chrome" },
  { names: ["google"], target: "https://www.google.com/", label: "Google" },
  { names: ["edge", "microsoft edge"], target: "edge", label: "Microsoft Edge" },
  { names: ["firefox"], target: "firefox", label: "Firefox" },
  { names: ["whatsapp"], target: "whatsapp", label: "WhatsApp" },
  { names: ["explorador de arquivos", "explorer"], target: "explorer", label: "Explorador de Arquivos" },
  { names: ["calculadora"], target: "calculadora", label: "Calculadora" },
] as const;

function requestedOpenTarget(text: string) {
  const normalized = text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/\b(?:abra|abre|abrir|inicie|inicia|execute|executa|entre|entrar)\b/.test(normalized)) return null;
  return OPEN_TARGETS.find((item) =>
    item.names.some((name) => normalized.includes(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
  ) ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { access_code?: string; text?: string; history?: { role: "user" | "assistant"; text: string }[] };
    const code = (body.access_code || "").trim();
    const text = (body.text || "").trim();
    if (!code || !text) return NextResponse.json({ error: "Faltou o código ou a mensagem." }, { status: 400 });

    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "Servidor sem configuração." }, { status: 500 });

    const { data: agent } = await supabase.from("remote_agents")
      .select("id,company_id,client_id,name,allow_control").eq("access_code", code).maybeSingle();
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

    const openTarget = requestedOpenTarget(text);
    if (openTarget && agent.allow_control !== false) {
      const { data: job } = await supabase.from("agent_jobs").insert({
        agent_id: agent.id,
        company_id: agent.company_id,
        kind: "input",
        status: "pending",
        params: { action: "open", text: openTarget.target },
      }).select("id").single();
      if (job) {
        let completed = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          await sleep(450);
          const { data: current } = await supabase.from("agent_jobs").select("status").eq("id", job.id).maybeSingle();
          if (current?.status === "done") { completed = true; break; }
          if (current?.status === "error") break;
        }
        answer = completed
          ? `${openTarget.label} foi aberto. Posso ajudar com mais alguma coisa?`
          : `Estou abrindo ${openTarget.label}. Se demorar, aguarde o computador terminar de carregar.`;
      }
    }

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
