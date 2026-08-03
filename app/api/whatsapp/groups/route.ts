import { NextResponse } from "next/server";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

// Manda o serviço reler os grupos direto do WhatsApp.
//
// A LISTA em si o app lê do Supabase (tabela whatsapp_groups, com RLS) — aqui só
// pedimos a atualização, porque quem enxerga os grupos é a sessão do Baileys, que
// vive no serviço. As escolhas do gestor (IA ligada, agente, só quando marcam)
// não são tocadas na sincronização.
export async function POST(request: Request) {
  const { numberId } = (await request.json().catch(() => ({}))) as { numberId?: string };
  if (!numberId) return NextResponse.json({ error: "numberId é obrigatório." }, { status: 400 });
  if (!whatsappServiceConfigured) {
    return NextResponse.json({ error: "Serviço de WhatsApp não configurado." }, { status: 400 });
  }
  const { status, data } = await callWhatsappService("/groups/sync", {
    method: "POST",
    body: JSON.stringify({ numberId }),
  });
  return NextResponse.json(data, { status });
}
