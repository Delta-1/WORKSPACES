import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { AcademicInput, AcademicWork } from "@/lib/academic-meta";

export const runtime = "nodejs";
export const maxDuration = 300;

// Gera um TRABALHO ACADÊMICO estruturado (monografia, TCC, trabalho, redação)
// usando a IA configurada no Workspace — sem depender de nenhuma API externa.
// Devolve JSON estruturado (título, resumo, seções, referências) para depois
// virar .docx/PDF em ABNT.
function parseJson(text: string): AcademicWork | null {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    const o = JSON.parse(t);
    return {
      titulo: String(o.titulo || o.title || "Trabalho"),
      resumo: String(o.resumo || o.abstract || ""),
      palavras_chave: Array.isArray(o.palavras_chave) ? o.palavras_chave.map(String) : [],
      secoes: Array.isArray(o.secoes) ? o.secoes.map((s: { titulo?: string; conteudo?: string }) => ({ titulo: String(s.titulo || ""), conteudo: String(s.conteudo || "") })) : [],
      referencias: Array.isArray(o.referencias) ? o.referencias.map(String) : [],
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const input = (await request.json()) as AcademicInput;
  if (!input?.tema?.trim()) return NextResponse.json({ error: "Informe o tema do trabalho." }, { status: 400 });

  // Chave de IA: a do usuário (ai_config); senão a de algum agente da empresa.
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

  const paginas = Math.min(Math.max(Number(input.paginas) || 8, 1), 60);
  const tipo = (input.tipo || "trabalho").toLowerCase();

  const system =
    `Você é um redator acadêmico brasileiro especialista em ${tipo === "tcc" ? "TCC" : tipo === "monografia" ? "monografia" : "trabalhos acadêmicos"}.\n` +
    `Escreva em português formal${input.abnt === false ? "" : ", seguindo a estrutura das normas ABNT"}.\n` +
    `Produza um trabalho COMPLETO e coerente sobre o tema, com profundidade compatível com ~${paginas} páginas.\n` +
    `Estruture com Introdução, Desenvolvimento (várias seções numeradas, ex.: "2 REVISÃO DE LITERATURA", "3 ...") e Conclusão. Cada seção deve ter vários parágrafos reais e desenvolvidos — nada de tópicos vazios.\n` +
    `As referências devem ser plausíveis e no formato ABNT.\n\n` +
    `Responda SOMENTE com um JSON válido (sem texto fora dele) nesta forma:\n` +
    `{"titulo": "...", "resumo": "...(150-250 palavras)", "palavras_chave": ["...","...","..."], "secoes": [{"titulo": "1 INTRODUÇÃO", "conteudo": "parágrafos..."}, {"titulo": "2 ...", "conteudo": "..."}], "referencias": ["SOBRENOME, Nome. Título. Cidade: Editora, ano.", "..."]}`;

  const userMsg =
    `Tema/título: ${input.tema}\n` +
    (input.curso ? `Curso: ${input.curso}\n` : "") +
    (input.nivel ? `Nível: ${input.nivel}\n` : "") +
    (input.instituicao ? `Instituição: ${input.instituicao}\n` : "") +
    (input.observacoes ? `Observações do aluno: ${input.observacoes}\n` : "") +
    `Tamanho aproximado: ${paginas} páginas.\n\nGere o trabalho agora, no formato JSON pedido.`;

  let raw = "";
  try {
    raw = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }
  const work = parseJson(raw);
  if (!work || !work.secoes.length) {
    return NextResponse.json({ error: "A IA não retornou um trabalho válido. Tente de novo ou ajuste o tema." }, { status: 502 });
  }
  return NextResponse.json({ work });
}
