import { NextResponse } from "next/server";
import { sendWhatsappMessage } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

type Media = { type: "image" | "audio" | "video" | "document"; url: string; name?: string | null; mime?: string | null };

export async function POST(request: Request) {
  const { to, text, senderId, numberId, media } = (await request.json()) as {
    to?: string;
    text?: string;
    senderId?: string;
    numberId?: string;
    media?: Media;
  };
  if (!to || (!text && !media?.url)) {
    return NextResponse.json({ error: "Informe 'to' e 'text' ou 'media'." }, { status: 400 });
  }

  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/send", {
      method: "POST",
      body: JSON.stringify({ to, text, senderId, numberId, media }),
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
