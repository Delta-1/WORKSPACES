import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Chat PÚBLICO do Workspace.IA. Qualquer pessoa com o link usa, SEM login.
// Regras de segurança:
//  - resolve a empresa pelo work_slug e exige work_enabled;
//  - NÃO expõe painel, arquivos, finanças, clientes nem nada confidencial —
//    o prompt só conhece o nome e os contatos PÚBLICOS da empresa;
//  - se a pessoa colar o código do acesso remoto dela, a IA pode "ver a tela"
//    (a imagem chega aqui) e explicar passo a passo como fazer as coisas.
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Body = {
  slug?: string;
  session_id?: string;
  text?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  image?: { mediaType: string; base64: string } | null;
  has_access?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const slug = (body.slug || "").trim();
    const text = (body.text || "").trim();
    if (!slug || !text) return NextResponse.json({ error: "Faltou a mensagem." }, { status: 400 });

    const supabase = svc();
    if (!supabase) return NextResponse.json({ error: "Servidor sem configuração." }, { status: 500 });

    const { data: company } = await supabase
      .from("company_settings")
      .select("company_id, name, address, address_link, phone, email, website, review_link, work_enabled")
      .eq("work_slug", slug)
      .maybeSingle();
    if (!company || !company.work_enabled) return NextResponse.json({ error: "Indisponível." }, { status: 404 });

    // Chave de IA: agente Copilot (slot internal) da empresa, senão o ambiente.
    let apiKey = process.env.ANTHROPIC_API_KEY || null;
    let provider = "anthropic";
    if (company.company_id) {
      const { data: bot } = await supabase
        .from("chatbots")
        .select("provider,api_key")
        .eq("company_id", company.company_id)
        .eq("slot", "internal")
        .limit(1)
        .maybeSingle();
      if (bot?.api_key) { apiKey = bot.api_key; provider = bot.provider; }
    }

    // Contexto PÚBLICO apenas (nada de dados internos).
    const pub: string[] = [];
    if (company.address) pub.push(`Endereço: ${company.address}`);
    if (company.phone) pub.push(`Telefone: ${company.phone}`);
    if (company.email) pub.push(`E-mail: ${company.email}`);
    if (company.website) pub.push(`Site: ${company.website}`);

    const system =
      `Você é o Workspace.IA de "${company.name || "Workspace"}", um assistente PÚBLICO que ajuda qualquer pessoa (sem login). ` +
      `Seja prático, gentil e direto, em português. Ajude a pessoa a resolver o que ela precisa no computador dela: ` +
      `procurar/instalar programas, achar coisas, resolver erros — sempre explicando PASSO A PASSO, numerado e simples. ` +
      `Para instalar algo, oriente a ir ao SITE OFICIAL do programa e baixar a versão oficial; se houver edições diferentes, pergunte qual. ` +
      (body.has_access
        ? `A pessoa conectou o acesso remoto e você pode VER A TELA dela quando um print vier junto: olhe o print e diga exatamente onde clicar. `
        : `Se a pessoa quiser que você VEJA A TELA e guie ao vivo, peça para ela instalar o acesso remoto e colar o código de acesso no campo indicado. `) +
      `NUNCA invente dados internos da empresa e NÃO forneça informações confidenciais — você só conhece os contatos públicos abaixo. ` +
      (pub.length ? `\nContatos públicos da empresa:\n- ${pub.join("\n- ")}` : "");

    const hist = Array.isArray(body.history) ? body.history.filter((h) => h && h.text).slice(-10) : [];
    const img = body.image?.base64 ? body.image : null;

    let answer = "";
    try {
      if (provider === "gemini" && apiKey) {
        const userParts: Record<string, unknown>[] = [{ text }];
        if (img) userParts.push({ inline_data: { mime_type: img.mediaType, data: img.base64 } });
        const contents = [
          ...hist.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
          { role: "user", parts: userParts },
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
        const userContent: Anthropic.ContentBlockParam[] = [];
        if (img) userContent.push({ type: "image", source: { type: "base64", media_type: img.mediaType as "image/jpeg", data: img.base64 } });
        userContent.push({ type: "text", text });
        const messages = [
          ...hist.map((h) => ({ role: h.role, content: [{ type: "text" as const, text: h.text }] })),
          { role: "user" as const, content: userContent },
        ];
        const res = await client.messages.create({ model: "claude-sonnet-5", max_tokens: 700, system, messages });
        const block = res.content.find((b) => b.type === "text");
        answer = block && "text" in block ? block.text : "";
      }
    } catch {
      /* segue sem resposta */
    }
    if (!answer) answer = "Desculpe, não consegui responder agora. Pode tentar de novo?";

    // Guarda a conversa pública no banco da empresa (memória do Work).
    const sid = (body.session_id || "anon").slice(0, 64);
    await supabase.from("work_messages").insert([
      { company_id: company.company_id, session_id: sid, role: "user", text: text.slice(0, 4000) },
      { company_id: company.company_id, session_id: sid, role: "assistant", text: answer.slice(0, 4000) },
    ]);

    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
