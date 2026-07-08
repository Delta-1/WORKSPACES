import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "./types";

export type ChatImage = { mediaType: string; base64: string };

export type ChatTurn = { role: "user" | "assistant"; text: string; image?: ChatImage };

export type AiOverride = { provider: AiProvider; apiKey: string };

const ANTHROPIC_MODEL = "claude-sonnet-5";
const GEMINI_MODEL = "gemini-2.5-flash";

export function aiIsLive(override?: AiOverride | null): boolean {
  if (override) return Boolean(override.apiKey);
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function demoReply(lastUserText: string, hasImage: boolean): string {
  return hasImage
    ? "Recebi a imagem. (Modo demo: configure uma chave de IA em Configurações para respostas reais analisando a imagem.)"
    : `Modo demo (nenhuma chave de IA configurada). Você disse: "${lastUserText}". Configure uma chave em Configurações para respostas de verdade.`;
}

async function runAnthropic(apiKey: string, history: ChatTurn[], systemPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const messages = history.map((turn) => {
    const content: Anthropic.MessageParam["content"] = [];
    if (turn.image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: turn.image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: turn.image.base64,
        },
      });
    }
    if (turn.text) content.push({ type: "text", text: turn.text });
    return { role: turn.role, content };
  });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

async function runGemini(apiKey: string, history: ChatTurn[], systemPrompt: string): Promise<string> {
  const contents = history.map((turn) => {
    const parts: Record<string, unknown>[] = [];
    if (turn.text) parts.push({ text: turn.text });
    if (turn.image) parts.push({ inlineData: { mimeType: turn.image.mediaType, data: turn.image.base64 } });
    return { role: turn.role === "assistant" ? "model" : "user", parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return text;
}

export async function runChat(
  history: ChatTurn[],
  systemPrompt: string,
  override?: AiOverride | null
): Promise<string> {
  const last = history[history.length - 1];
  const provider = override?.provider ?? "anthropic";
  const apiKey = override?.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return demoReply(last?.text ?? "", Boolean(last?.image));
  }

  if (provider === "gemini") {
    return runGemini(apiKey, history, systemPrompt);
  }
  return runAnthropic(apiKey, history, systemPrompt);
}
