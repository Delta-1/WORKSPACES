import { NextResponse } from "next/server";
import { sendWhatsappMessage } from "@/lib/whatsapp";

export async function POST(request: Request) {
  const { to, text } = (await request.json()) as { to?: string; text?: string };
  if (!to || !text) {
    return NextResponse.json({ error: "Campos 'to' e 'text' são obrigatórios." }, { status: 400 });
  }
  try {
    await sendWhatsappMessage(to, text);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao enviar mensagem.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
