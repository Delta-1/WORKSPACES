import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { cobrancaRef, criarPix } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const maxDuration = 30;

// Pix de UMA cobrança, criado pela API do Mercado Pago.
//
// Mora aqui, e não no serviço do WhatsApp, porque são dois caminhos que precisam
// do MESMO Pix: o agendador (que envia sozinho) e o botão "enviar agora" do
// painel. Se cada um gerasse o seu, o cliente receberia dois códigos diferentes
// para a mesma dívida — e um deles ficaria pendurado em aberto.
//
// Reaproveita o que já existe: chamar de novo para a mesma cobrança devolve o
// mesmo código, nunca um segundo pagamento.

async function gerar(companyId: string, targetId: string, origin: string) {
  const svc = supabaseService();
  if (!svc) return { error: "Servidor sem Supabase configurado.", status: 500 as const };

  const { data: alvo } = await svc
    .from("billing_targets")
    .select("id, company_id, valor, multa, motivo, pix_code, status")
    .eq("id", targetId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!alvo) return { error: "Cobrança não encontrada.", status: 404 as const };
  if (alvo.pix_code) return { pix_code: alvo.pix_code as string, reaproveitado: true };

  const { data: cfg } = await svc
    .from("company_settings")
    .select("billing_mercadopago_token, carteira_pix_auto, name")
    .eq("company_id", companyId)
    .maybeSingle();
  const token = (cfg?.billing_mercadopago_token as string) || "";
  if (!token || cfg?.carteira_pix_auto !== true) {
    // Sem Carteira ligada não é erro: o Cobrador segue com a chave estática.
    return { pix_code: null as string | null, motivo: "pix-automatico-desligado" };
  }

  const valor = Number(alvo.valor || 0) + Number(alvo.multa || 0);
  if (!(valor > 0)) return { error: "Cobrança sem valor.", status: 400 as const };

  const out = await criarPix({
    token,
    valor: Math.round(valor * 100) / 100,
    descricao: `${cfg?.name || "Cobrança"} — ${alvo.motivo || "pagamento"}`,
    ref: cobrancaRef(targetId),
    origin,
    // `cid` é indispensável: o pagamento é criado com o token DA EMPRESA e só
    // pode ser lido com ele. Sem isto o webhook consultaria com o token da
    // plataforma, tomaria 404 e a cobrança nunca seria quitada.
    notifyQuery: `cid=${companyId}`,
    // Se a chamada repetir por instabilidade, o Mercado Pago devolve o MESMO
    // pagamento em vez de cobrar o cliente duas vezes.
    idempotencyKey: `cob-${targetId}`,
  });
  if (!out.ok) return { error: out.error, status: 400 as const };

  await svc
    .from("billing_targets")
    .update({
      pix_code: out.charge.pixCode,
      mp_payment_id: out.charge.paymentId,
      pix_criado_em: new Date().toISOString(),
    })
    .eq("id", targetId);

  return { pix_code: out.charge.pixCode, payment_id: out.charge.paymentId };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { target_id?: string; company_id?: string };
  if (!body.target_id) return NextResponse.json({ error: "target_id é obrigatório." }, { status: 400 });
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  // Dois caminhos, como no resto do sistema: o serviço do WhatsApp (segredo
  // compartilhado + company_id explícito) e o navegador (sessão do usuário).
  const secret = request.headers.get("x-service-secret");
  const isService = !!secret && !!process.env.WHATSAPP_SERVICE_SECRET && secret === process.env.WHATSAPP_SERVICE_SECRET;

  let companyId: string | null = null;
  if (isService) {
    companyId = body.company_id ?? null;
    if (!companyId) return NextResponse.json({ error: "company_id é obrigatório na chamada de serviço." }, { status: 400 });
  } else {
    const client = supabaseForRequest(request);
    if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { data: perfil } = await client.from("profiles").select("company_id").eq("id", auth.user.id).maybeSingle();
    companyId = (perfil?.company_id as string) ?? null;
    if (!companyId) return NextResponse.json({ error: "Sem empresa vinculada." }, { status: 400 });
  }

  const out = await gerar(companyId, body.target_id, origin);
  if ("error" in out && out.error) return NextResponse.json({ error: out.error }, { status: out.status ?? 400 });
  return NextResponse.json(out);
}
