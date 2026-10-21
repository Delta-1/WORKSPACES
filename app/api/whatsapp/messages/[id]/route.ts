import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

export const maxDuration = 60;

async function mutate(request: Request, params: Promise<{ id: string }>, action: "edit" | "delete") {
  try {
    const auth = supabaseForRequest(request);
    if (!auth) return NextResponse.json({ error: "Entre para alterar mensagens." }, { status: 401 });
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    const { data: profile } = await auth.from("profiles").select("company_id,tool_access").eq("id", user.id).single();
    if (!profile?.company_id || profile.tool_access?.mensagens === false) return NextResponse.json({ error: "Sem acesso às mensagens desta empresa." }, { status: 403 });
    const { id } = await params;
    const { data: message } = await auth.from("whatsapp_messages").select("id,sender_id,direction,conversations!inner(company_id,number_id)").eq("id", id).eq("conversations.company_id", profile.company_id).single();
    if (!message || message.direction !== "out" || message.sender_id !== user.id) return NextResponse.json({ error: "Você só pode alterar mensagens enviadas por você." }, { status: 403 });
    const conversation = Array.isArray(message.conversations) ? message.conversations[0] : message.conversations;
    if (!conversation?.number_id) return NextResponse.json({ error: "Esta mensagem não está vinculada a um número do WhatsApp." }, { status: 409 });
    const { data: allowed } = await auth.rpc("can_access_number", { nid: conversation.number_id });
    if (!allowed) return NextResponse.json({ error: "Sem acesso ao número desta mensagem." }, { status: 403 });
    let text: unknown;
    if (action === "edit") {
      text = (await request.json()).text;
      if (typeof text !== "string" || !text.trim() || text.length > 10000) return NextResponse.json({ error: "Escreva uma mensagem de 1 a 10.000 caracteres." }, { status: 400 });
    }
    if (!whatsappServiceConfigured) return NextResponse.json({ error: "Serviço de WhatsApp não configurado." }, { status: 503 });
    const { status, data } = await callWhatsappService("/messages/mutate", { method: "POST", body: JSON.stringify({ messageId: id, numberId: conversation.number_id, companyId: profile.company_id, actorId: user.id, action, text }) });
    if (status === 404) return NextResponse.json({ error: "O serviço de WhatsApp ainda está atualizando este recurso. Tente novamente em instantes." }, { status: 503 });
    return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível confirmar a alteração no WhatsApp. Confira a conversa antes de tentar novamente." }, { status: 502 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, "edit"); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, "delete"); }
