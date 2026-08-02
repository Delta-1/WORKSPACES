import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Preenche um documento estruturado (contrato, orçamento, questionário, resumo)
// a partir de um pedido em texto. Devolve o MESMO formato de dados que o editor
// usa — então o resultado cai direto nos campos e continua totalmente editável,
// em vez de virar um bloco de texto que a pessoa não consegue mexer.

const SHAPES: Record<string, string> = {
  contrato: `{"objeto":"...","contratante":{"nome":"","doc":"","endereco":"","rep":""},"contratada":{"nome":"","doc":"","endereco":"","rep":""},"valor":"R$ 0,00","pagamento":"","prazo":"","vigencia":"","clausulas":[{"titulo":"DO OBJETO","texto":"..."}],"foro":"","testemunhas":[]}`,
  orcamento: `{"cliente":{"nome":"","doc":"","endereco":"","rep":""},"itens":[{"descricao":"","quant":"1","unidade":"un","valor":"0,00"}],"desconto":"","pagamento":"","prazoEntrega":"","observacoes":""}`,
  questionario: `{"titulo":"","disciplina":"","instrucoes":"","questoes":[{"enunciado":"","tipo":"objetiva","alternativas":["","","",""],"resposta":"a","valor":"1,0"}]}`,
  resumo: `{"titulo":"","materia":"","topicos":[{"titulo":"","conteudo":"","destaque":""}]}`,
  resumao: `{"titulo":"","materia":"","topicos":[{"titulo":"","conteudo":"","destaque":""}],"conceitos":[{"termo":"","definicao":""}],"maisCai":["..."]}`,
};

const GUIA: Record<string, string> = {
  contrato: "Escreva cláusulas completas e juridicamente coerentes (objeto, obrigações de cada parte, valor e pagamento, prazo, rescisão, confidencialidade, foro). Deixe em branco os dados pessoais que não foram informados — NÃO invente nomes, CPF/CNPJ nem endereços.",
  orcamento: "Detalhe os itens com descrição clara, quantidade, unidade e valor unitário. Use vírgula como separador decimal (ex.: 1250,00). Não invente dados do cliente que não foram informados.",
  questionario: "Crie questões claras e bem formuladas. Em questões objetivas gere 4 alternativas plausíveis e informe a letra correta em 'resposta' (a, b, c ou d). Em dissertativas use tipo 'dissertativa', deixe alternativas vazio e escreva em 'resposta' o que se espera.",
  resumo: "Organize em tópicos curtos e diretos, do mais importante para o detalhe. Em 'destaque' coloque a informação que não pode ser esquecida.",
  resumao: "Revisão completa: tópicos desenvolvidos, um glossário em 'conceitos' e, em 'maisCai', os temas com maior chance de cair na prova.",
};

function parseJson(text: string): Record<string, unknown> | null {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try {
    const o = JSON.parse(t);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { model, prompt, current } = (await request.json()) as { model?: string; prompt?: string; current?: unknown };
  const shape = model ? SHAPES[model] : null;
  if (!shape) return NextResponse.json({ error: "Modelo não suportado." }, { status: 400 });
  if (!prompt?.trim()) return NextResponse.json({ error: "Diga o que você quer neste documento." }, { status: 400 });

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

  const system =
    `Você preenche documentos profissionais em português do Brasil.\n` +
    `${GUIA[model!] ?? ""}\n` +
    `Responda SOMENTE com um JSON válido nesta forma (sem texto fora dele, sem \`\`\`):\n${shape}\n` +
    `Preencha apenas os campos que você tem informação para preencher; os demais devem ficar como string vazia. NÃO invente dados pessoais.`;

  const userMsg =
    `Pedido: ${prompt.trim()}\n\n` +
    (current ? `Conteúdo atual do documento (para complementar/corrigir, não jogue fora o que já está bom):\n${JSON.stringify(current).slice(0, 4000)}\n\n` : "") +
    `Gere o JSON agora.`;

  let raw = "";
  try {
    raw = await runChat([{ role: "user", text: userMsg }], system, override);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha na IA." }, { status: 502 });
  }
  const data = parseJson(raw);
  if (!data) return NextResponse.json({ error: "A IA não devolveu um documento válido. Tente descrever de outro jeito." }, { status: 502 });
  return NextResponse.json({ data });
}
