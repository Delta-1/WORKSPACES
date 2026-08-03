import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { consultarPagamento, criarLinkCartao, criarPix, pipRef, resolvePaymentToken } from "@/lib/mercadopago";
import { PACOTES, pipsToBrl, precoTexto, SERVICOS } from "@/lib/pips";

export const runtime = "nodejs";
export const maxDuration = 60;

// Compra e conferência de pips (créditos da Nina).
//
// Chamada só pelo serviço do WhatsApp, com o segredo compartilhado — não há
// usuário logado do outro lado. Todo movimento de saldo passa pelas funções do
// banco (credits_add / credits_debit), nunca por conta feita aqui ou pela IA.

type Body = {
  acao?: "comprar" | "conferir" | "saldo" | "debitar" | "extrato" | "tabela";
  contact_id?: string;
  company_id?: string;
  agent_id?: string;
  pips?: number;
  metodo?: "pix" | "cartao";
  payment_id?: string;
  servico?: string;
  detalhe?: string;
};

export async function POST(request: Request) {
  const secret = request.headers.get("x-service-secret");
  if (!secret || !process.env.WHATSAPP_SERVICE_SECRET || secret !== process.env.WHATSAPP_SERVICE_SECRET) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 500 });

  const b = (await request.json()) as Body;
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  // ── tabela de preços ──────────────────────────────────────────────────────
  if (b.acao === "tabela") {
    return NextResponse.json({
      valor_do_pip: "R$ 0,50",
      servicos: SERVICOS.map((s) => ({ id: s.id, nome: s.nome, pips: s.pips, preco: precoTexto(s.pips), descricao: s.descricao })),
      pacotes: PACOTES.map((p) => ({ pips: p.pips, preco: precoTexto(p.pips), da_para: p.destaque })),
    });
  }

  if (!b.contact_id) return NextResponse.json({ error: "contact_id é obrigatório." }, { status: 400 });

  // ── saldo ─────────────────────────────────────────────────────────────────
  if (b.acao === "saldo") {
    const { data, error } = await svc.rpc("credits_balance", { p_contact: b.contact_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const saldo = Number(data ?? 0);
    return NextResponse.json({ saldo, equivale: `R$ ${pipsToBrl(saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` });
  }

  // ── extrato ───────────────────────────────────────────────────────────────
  if (b.acao === "extrato") {
    const { data, error } = await svc.rpc("credits_extrato", { p_contact: b.contact_id, p_limit: 10 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ extrato: data ?? [] });
  }

  // ── débito de um serviço ──────────────────────────────────────────────────
  if (b.acao === "debitar") {
    const pips = Number(b.pips || 0);
    if (pips <= 0) return NextResponse.json({ error: "pips inválido." }, { status: 400 });
    const { data, error } = await svc.rpc("credits_debit", {
      p_contact: b.contact_id, p_company: b.company_id ?? null,
      p_pips: pips, p_reason: b.servico || "servico", p_detail: b.detalhe ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── comprar ───────────────────────────────────────────────────────────────
  if (b.acao === "comprar") {
    const pips = Number(b.pips || 0);
    if (pips <= 0) return NextResponse.json({ error: "Diga quantos pips a pessoa quer comprar." }, { status: 400 });
    const token = await resolvePaymentToken(b.agent_id);
    if (!token) return NextResponse.json({ error: "Pagamento não configurado (sem token do Mercado Pago)." }, { status: 400 });

    const valor = pipsToBrl(pips);
    const ref = pipRef(b.contact_id, pips);
    const descricao = `${pips} pips — Workspace`;

    if (b.metodo === "cartao") {
      const out = await criarLinkCartao({ token, valor, descricao, ref, origin });
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
      return NextResponse.json({ metodo: "cartao", pips, valor, link: out.url, preco: precoTexto(pips) });
    }

    const out = await criarPix({ token, valor, descricao, ref, origin });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({
      metodo: "pix", pips, valor, preco: precoTexto(pips),
      payment_id: out.charge.paymentId,
      pix_copia_e_cola: out.charge.pixCode,
      pix_qr_base64: out.charge.pixQrBase64,
      link: out.charge.ticketUrl,
    });
  }

  // ── conferir se caiu ──────────────────────────────────────────────────────
  // Rede de segurança para quando a pessoa diz "já paguei" antes de o webhook
  // chegar. Creditar aqui é seguro: credits_add é idempotente pelo `ref`, então
  // webhook e conferência nunca creditam duas vezes.
  if (b.acao === "conferir") {
    if (!b.payment_id) return NextResponse.json({ error: "payment_id é obrigatório." }, { status: 400 });
    const token = await resolvePaymentToken(b.agent_id);
    if (!token) return NextResponse.json({ error: "Pagamento não configurado." }, { status: 400 });

    const pay = await consultarPagamento(token, b.payment_id);
    if (!pay) return NextResponse.json({ error: "Não consegui consultar esse pagamento." }, { status: 400 });

    if (pay.status !== "approved") {
      return NextResponse.json({ pago: false, status: pay.status, mensagem: "O pagamento ainda não caiu. Se acabou de pagar, aguarde alguns segundos e peça para eu conferir de novo." });
    }
    const pips = Number(b.pips || 0) || Math.round((pay.transaction_amount ?? 0) / 0.5);
    const { data, error } = await svc.rpc("credits_add", {
      p_contact: b.contact_id, p_company: b.company_id ?? null, p_pips: pips,
      p_reason: "compra", p_detail: `Mercado Pago ${pay.id}`, p_ref: `mp:${pay.id}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pago: true, creditado: pips, saldo: Number(data ?? 0) });
  }

  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
