import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { consultarPagamento, criarLinkCartao, criarPix, recargaRef, resolvePaymentToken } from "@/lib/mercadopago";
import { brlToCents, centsToBrl, reais, RECARGAS, SERVICOS } from "@/lib/precos";

export const runtime = "nodejs";
export const maxDuration = 60;

// Saldo em reais do cliente: consulta, recarga e cobrança dos serviços da Yumi.
//
// Chamada só pelo serviço do WhatsApp, com o segredo compartilhado — não há
// usuário logado do outro lado. Todo movimento de saldo passa pelas funções do
// banco (credits_add / credits_debit), nunca por conta feita aqui ou pela IA.
//
// Por dentro tudo é CENTAVOS (inteiro); reais só aparecem nos campos de texto
// que a Yumi lê para falar com a pessoa.

type Body = {
  acao?: "recarregar" | "conferir" | "saldo" | "cobrar" | "extrato" | "tabela";
  contact_id?: string;
  company_id?: string;
  agent_id?: string;
  /** Valor em reais (ex.: 50 ou 49.9). Convertido para centavos aqui. */
  valor?: number;
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
  const cents = Number.isFinite(Number(b.valor)) ? brlToCents(Number(b.valor)) : 0;

  // ── tabela de preços ──────────────────────────────────────────────────────
  if (b.acao === "tabela") {
    return NextResponse.json({
      servicos: SERVICOS.map((s) => ({ id: s.id, nome: s.nome, preco: reais(s.cents), valor: centsToBrl(s.cents), descricao: s.descricao })),
      recargas: RECARGAS.map((r) => ({ preco: reais(r.cents), valor: centsToBrl(r.cents), da_para: r.destaque })),
    });
  }

  if (!b.contact_id) return NextResponse.json({ error: "contact_id é obrigatório." }, { status: 400 });

  // ADM: usa tudo sem pagar. A checagem é aqui, no único ponto por onde o saldo
  // se move — assim a isenção não depende da IA lembrar dela.
  const { data: ct } = await svc.from("contacts").select("billing_exempt").eq("id", b.contact_id).maybeSingle();
  const isento = ct?.billing_exempt === true;

  // ── saldo ─────────────────────────────────────────────────────────────────
  if (b.acao === "saldo") {
    if (isento) {
      return NextResponse.json({
        isento: true,
        mensagem: "Este contato é ADM: usa os serviços sem pagar. Não fale de saldo, preço nem pagamento com ele.",
      });
    }
    const { data, error } = await svc.rpc("credits_balance", { p_contact: b.contact_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const saldo = Number(data ?? 0);
    return NextResponse.json({ saldo: reais(saldo), saldo_centavos: saldo });
  }

  // ── extrato ───────────────────────────────────────────────────────────────
  if (b.acao === "extrato") {
    const { data, error } = await svc.rpc("credits_extrato", { p_contact: b.contact_id, p_limit: 10 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    type Linha = { quando: string; delta_centavos: number; saldo_centavos: number; motivo: string; detalhe: string | null };
    const extrato = ((data ?? []) as Linha[]).map((l) => ({
      quando: l.quando,
      // O sinal importa na leitura: "+R$ 50,00" é recarga, "−R$ 50,00" é serviço.
      valor: `${l.delta_centavos < 0 ? "−" : "+"}${reais(Math.abs(l.delta_centavos))}`,
      saldo_depois: reais(l.saldo_centavos),
      motivo: l.motivo,
      detalhe: l.detalhe,
    }));
    return NextResponse.json({ extrato });
  }

  // ── cobrança de um serviço ────────────────────────────────────────────────
  if (b.acao === "cobrar") {
    // Isento: devolve "ok" sem tocar no saldo. A IA segue e produz o serviço,
    // e nada aparece no extrato — não houve cobrança para registrar.
    if (isento) {
      return NextResponse.json({
        ok: true, isento: true, cobrado: reais(0),
        mensagem: "Contato ADM — não cobrei nada. Produza o serviço normalmente e NÃO comente valores.",
      });
    }
    if (cents <= 0) return NextResponse.json({ error: "valor inválido." }, { status: 400 });
    const { data, error } = await svc.rpc("credits_debit", {
      p_contact: b.contact_id, p_company: b.company_id ?? null,
      p_cents: cents, p_reason: b.servico || "servico", p_detail: b.detalhe ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // A função do banco devolve centavos; a Yumi precisa de reais escritos.
    const r = (data ?? {}) as { ok?: boolean; saldo_centavos?: number; faltam_centavos?: number; cobrado_centavos?: number; mensagem?: string };
    return NextResponse.json(
      r.ok
        ? { ok: true, cobrado: reais(r.cobrado_centavos ?? cents), saldo: reais(r.saldo_centavos ?? 0) }
        : { ok: false, saldo: reais(r.saldo_centavos ?? 0), faltam: reais(r.faltam_centavos ?? 0), mensagem: r.mensagem }
    );
  }

  // ── recarregar ────────────────────────────────────────────────────────────
  if (b.acao === "recarregar") {
    // Cobrar um ADM seria constrangedor — ele não paga por nada aqui.
    if (isento) {
      return NextResponse.json({
        isento: true,
        mensagem: "Este contato é ADM e não paga pelos serviços. Não gere pagamento; apenas faça o que ele pediu.",
      });
    }
    if (cents <= 0) return NextResponse.json({ error: "Diga quanto a pessoa quer colocar de saldo, em reais." }, { status: 400 });
    const token = await resolvePaymentToken(b.agent_id);
    if (!token) return NextResponse.json({ error: "Pagamento não configurado (sem token do Mercado Pago)." }, { status: 400 });

    const valor = centsToBrl(cents);
    const ref = recargaRef(b.contact_id, cents);
    const descricao = `Saldo de ${reais(cents)} — Workspace`;

    if (b.metodo === "cartao") {
      const out = await criarLinkCartao({ token, valor, descricao, ref, origin });
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
      return NextResponse.json({ metodo: "cartao", valor: reais(cents), link: out.url });
    }

    const out = await criarPix({ token, valor, descricao, ref, origin });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({
      metodo: "pix", valor: reais(cents),
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
    // O valor que vale é o que o Mercado Pago realmente recebeu — não o que a
    // IA achou que era.
    const creditar = brlToCents(pay.transaction_amount ?? 0) || cents;
    if (creditar <= 0) return NextResponse.json({ error: "Não consegui saber o valor desse pagamento." }, { status: 400 });
    const { data, error } = await svc.rpc("credits_add", {
      p_contact: b.contact_id, p_company: b.company_id ?? null, p_cents: creditar,
      p_reason: "recarga", p_detail: `Mercado Pago ${pay.id}`, p_ref: `mp:${pay.id}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pago: true, creditado: reais(creditar), saldo: reais(Number(data ?? 0)) });
  }

  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
