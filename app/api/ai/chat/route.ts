import { NextResponse } from "next/server";
import { runChat, aiIsLive, type ChatTurn } from "@/lib/ai";
import { getCompany } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ live: aiIsLive() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { history?: ChatTurn[] };
  const history = body.history ?? [];
  if (history.length === 0) {
    return NextResponse.json({ error: "Histórico vazio." }, { status: 400 });
  }
  const company = getCompany();
  const reply = await runChat(
    history,
    `Você é o copiloto interno de IA da plataforma "${company.name}". Ajuda funcionários com dúvidas de rotina, sugestões de respostas para clientes, e suporte técnico. Seja direto e útil.`
  );
  return NextResponse.json({ reply, live: aiIsLive() });
}
