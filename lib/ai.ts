import Anthropic from "@anthropic-ai/sdk";

export type ChatImage = { mediaType: string; base64: string };

export type ChatTurn = { role: "user" | "assistant"; text: string; image?: ChatImage };

const MODEL = "claude-sonnet-5";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function aiIsLive(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function demoReply(lastUserText: string, hasImage: boolean): string {
  const base = hasImage
    ? "Recebi a imagem. (Modo demo: configure ANTHROPIC_API_KEY no ambiente para respostas reais da IA analisando a imagem.)"
    : `Modo demo (sem ANTHROPIC_API_KEY configurada). Você disse: "${lastUserText}". Assim que a chave for configurada, o copiloto responde de verdade usando o modelo Claude.`;
  return base;
}

export async function runChat(
  history: ChatTurn[],
  systemPrompt: string
): Promise<string> {
  const client = getClient();
  const last = history[history.length - 1];

  if (!client) {
    return demoReply(last?.text ?? "", Boolean(last?.image));
  }

  const messages = history.map((turn) => {
    const content: Anthropic.MessageParam["content"] = [];
    if (turn.image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: turn.image.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: turn.image.base64,
        },
      });
    }
    if (turn.text) {
      content.push({ type: "text", text: turn.text });
    }
    return { role: turn.role, content };
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}
