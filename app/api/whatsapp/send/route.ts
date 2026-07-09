import { NextResponse } from "next/server";
import { sendWhatsappMessage } from "@/lib/whatsapp";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export async function POST(request: Request) {
  const { to, text, senderId } = (await request.json()) as { to?: string; text?: string; senderId?: string };
  if (!to || !text) {
    return NextResponse.json({ error: "Campos 'to' e 'text' são obrigatórios." }, { status: 400 });
  }

  if (whatsappServiceConfigured) {
    const { status, data } = await callWhatsappService("/send", {
      method: "POST",
      body: JSON.stringify({ to, text, senderId }),
    });
    return NextResponse.json(data, { status });
  }

  try {
    await sendWhatsappMessage(to, text);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
