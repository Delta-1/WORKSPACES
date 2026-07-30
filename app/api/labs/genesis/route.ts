import { NextResponse } from "next/server";
import { runChat, type AiOverride } from "@/lib/ai";
import { supabaseForRequest } from "@/lib/supabase-server";
import type { AiProvider } from "@/lib/types";

export const runtime = "nodejs";

type GenesisTurn = { role: "user" | "assistant"; text: string };

type GenesisDraft = {
  name: string;
  persona: string;
  instructions: string;
  greeting: string;
  capabilities: string[];
  continuous: boolean;
  voice_reply: boolean;
  test_mode: boolean;
};

type GenesisResult = {
  reply: string;
  ready: boolean;
  draft: GenesisDraft | null;
};

const ALLOWED_CAPABILITIES = new Set([
  "files", "tasks", "clients", "announcements", "attendance", "relay",
  "remote", "forms", "academico", "logistica", "cobranca", "calendar",
]);

const SYSTEM = `Você é Genesis, a ajudante fixa do Labs do Workspace.
Seu único trabalho é conversar em português com o usuário para montar um novo agente de IA. Você não é o agente final e nunca afirma ter criado ou executado algo antes de ter dados suficientes.

Descubra progressivamente, sem enviar um questionário enorme:
1. nome e objetivo do agente;
2. público e canal de atendimento;
3. dados que ele recebe e perguntas que deve fazer;
4. tom, forma de resposta (texto/voz) e quando transferir para humano;
5. ações e capacidades necessárias;
6. se deve lembrar continuamente das conversas.

Faça no máximo duas perguntas curtas por resposta. Use o histórico e nunca pergunte novamente o que já foi respondido.
Quando houver informações suficientes, gere um rascunho completo. As instruções devem ser específicas, operacionais e preservar tudo que o usuário pediu.

Responda SOMENTE JSON válido, sem markdown, neste formato:
{"reply":"texto para o usuário","ready":false,"draft":null}
ou:
{"reply":"Rascunho pronto. Revise os detalhes antes de salvar.","ready":true,"draft":{"name":"...","persona":"...","instructions":"...","greeting":"...","capabilities":["files"],"continuous":false,"voice_reply":true,"test_mode":true}}

Capacidades permitidas:
- files: arquivos
- tasks: tarefas
- clients: clientes/CRM
- announcements: mural
- attendance: atendimento e transferência humana
- relay: envio de mensagens
- remote: acesso remoto
- forms: formulários
- academico: documentos acadêmicos
- logistica: logística
- cobranca: cobranças
- calendar: agenda e criação de compromissos

Comece conservador: test_mode true. Só use capacidades necessárias.`;

function parseResult(raw: string): GenesisResult | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as Partial<GenesisResult>;
    if (typeof value.reply !== "string" || typeof value.ready !== "boolean") return null;
    if (!value.ready || !value.draft) return { reply: value.reply, ready: false, draft: null };
    const draft = value.draft as Partial<GenesisDraft>;
    if (!draft.name?.trim() || !draft.persona?.trim() || !draft.instructions?.trim()) return null;
    return {
      reply: value.reply,
      ready: true,
      draft: {
        name: draft.name.trim(),
        persona: draft.persona.trim(),
        instructions: draft.instructions.trim(),
        greeting: draft.greeting?.trim() ?? "",
        capabilities: Array.isArray(draft.capabilities)
          ? draft.capabilities.filter((cap): cap is string => typeof cap === "string" && ALLOWED_CAPABILITIES.has(cap))
          : [],
        continuous: draft.continuous === true,
        voice_reply: draft.voice_reply !== false,
        test_mode: draft.test_mode !== false,
      },
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = (await request.json()) as { message?: string; history?: GenesisTurn[] };
  if (!body.message?.trim()) return NextResponse.json({ error: "Escreva uma mensagem para a Genesis." }, { status: 400 });

  const { data: cfg } = await client
    .from("ai_config")
    .select("provider,api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cfg?.api_key) {
    return NextResponse.json(
      { error: "Configure sua chave de IA em Configurações antes de usar a Genesis." },
      { status: 409 }
    );
  }

  const override: AiOverride = {
    provider: (cfg.provider || "gemini") as AiProvider,
    apiKey: cfg.api_key,
  };
  const history = Array.isArray(body.history)
    ? body.history.filter((turn) => turn && typeof turn.text === "string").slice(-18)
    : [];

  try {
    const raw = await runChat([...history, { role: "user", text: body.message.trim() }], SYSTEM, override);
    const result = parseResult(raw);
    if (!result) return NextResponse.json({ error: "A Genesis não conseguiu montar uma resposta válida. Tente novamente." }, { status: 502 });
    return NextResponse.json({ ...result, provider: override.provider });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar a IA." },
      { status: 502 }
    );
  }
}
