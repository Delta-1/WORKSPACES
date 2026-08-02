import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import { normById } from "@/lib/doc-templates/norms";

export const runtime = "nodejs";
export const maxDuration = 300;

// Redige UMA seção do trabalho acadêmico.
//
// Por que uma seção por chamada: o marco teórico pede o equivalente a 15-17
// páginas. Pedir o trabalho inteiro numa resposta só estoura o limite do modelo
// e volta cortado no meio de um parágrafo. Gerando seção a seção, cada uma sai
// completa, o usuário vê o progresso e uma falha isolada não perde o resto.

type Body = {
  titulo?: string;
  norma?: string;
  secao?: { id?: string; label?: string; instructions?: string | null };
  notas?: string;
  capa?: Record<string, string>;
  /** Seções já escritas (só rótulo + trecho) — dá continuidade e evita repetição. */
  anteriores?: { label: string; trecho: string }[];
  idioma?: string;
};

/** Tira cercas de código e qualquer conversa fora do HTML pedido. */
function cleanHtml(raw: string): string {
  let t = String(raw || "").trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // O modelo às vezes devolve um documento inteiro — fica só com o miolo.
  const bodyMatch = t.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) t = bodyMatch[1].trim();
  return t;
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await request.json()) as Body;
  const secao = body.secao;
  if (!secao?.label) return NextResponse.json({ error: "Seção não informada." }, { status: 400 });
  if (!body.titulo?.trim()) return NextResponse.json({ error: "Informe o título do trabalho." }, { status: 400 });

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

  const norma = normById(body.norma);
  const idioma = body.idioma?.trim() || "português do Brasil";

  const system =
    `Você é um redator acadêmico. Escreva SEMPRE em ${idioma}, em linguagem formal, impessoal e acadêmica.\n` +
    `Você está redigindo UMA seção de um trabalho acadêmico já em andamento — NÃO reescreva o trabalho inteiro, ` +
    `NÃO repita a capa, o sumário nem seções que já existem, e NÃO se despeça no fim.\n` +
    `A norma de citação deste trabalho é ${norma.citacao}. Use citações nesse formato ao longo do texto.\n` +
    `Baseie-se em informação REAL e verificável (autores, estudos e dados que existem). NÃO invente fontes.\n\n` +
    `RESPONDA SOMENTE COM HTML do conteúdo da seção, sem \`\`\`, sem <html> e sem <body>. ` +
    `Use <p> para parágrafos, <h2> para subtítulos e <h3> para sub-subtítulos, <ul>/<li> para listas. ` +
    `NÃO inclua o título da própria seção — ele já é inserido automaticamente.`;

  const contexto = [
    `Título do trabalho: ${body.titulo}`,
    body.capa?.universidade ? `Instituição: ${body.capa.universidade}` : "",
    body.capa?.carreira ? `Curso: ${body.capa.carreira}` : "",
    body.capa?.disciplina ? `Disciplina: ${body.capa.disciplina}` : "",
    `Norma de formatação: ${norma.nome} (citação ${norma.citacao})`,
  ].filter(Boolean).join("\n");

  const jaEscrito = (body.anteriores ?? []).length
    ? `\n\nSeções JÁ escritas (não repita o conteúdo delas, apenas dê continuidade):\n` +
      body.anteriores!.map((a) => `- ${a.label}: ${a.trecho.slice(0, 400)}…`).join("\n")
    : "";

  const userMsg =
    `${contexto}\n\n` +
    (body.notas?.trim() ? `Notas e material de base fornecidos pelo autor:\n${body.notas.trim()}\n\n` : "") +
    `SEÇÃO A REDIGIR AGORA: ${secao.label}\n` +
    (secao.instructions ? `Instruções desta seção: ${secao.instructions}\n` : "") +
    jaEscrito +
    `\n\nRedija agora somente esta seção, em HTML.`;

  let raw = "";
  try {
    raw = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }

  const html = cleanHtml(raw);
  if (!html) return NextResponse.json({ error: "A IA não retornou conteúdo para esta seção." }, { status: 502 });
  return NextResponse.json({ html });
}
