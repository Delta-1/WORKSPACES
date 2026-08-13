import { NextResponse } from "next/server";
import { sendWhatsappMessage } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

type Media = { type: "image" | "audio" | "video" | "document"; url: string; name?: string | null; mime?: string | null };

export async function POST(request: Request) {
  const { to, text, senderId, numberId, media, messageId, pix } = (await request.json()) as {
    to?: string;
    text?: string;
    senderId?: string;
    numberId?: string;
    media?: Media;
    messageId?: string;
    // Pix separado (QR + copia e cola + chave). key = chave simples; code = BR Code pronto.
    pix?: { key?: string; code?: string; name?: string; city?: string; amount?: number };
  };
  if (!to || (!text && !media?.url && !pix?.key && !pix?.code)) {
    return NextResponse.json({ error: "Informe 'to' e 'text', 'media' ou 'pix'." }, { status: 400 });
  }

  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/send", {
      method: "POST",
      body: JSON.stringify({ to, text, senderId, numberId, media, messageId, pix }),
    });
    return NextResponse.json(data, { status });
  }

  try {
    await sendWhatsappMessage(to, text ?? "");
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
