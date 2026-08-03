// Mercado Pago — cobrança avulsa (recarga de saldo do cliente).
//
// Diferente da assinatura do plano, que usa `preapproval` (recorrente), aqui é
// pagamento único: Pix criado pela API (devolve o copia-e-cola e o QR) ou um
// link de Checkout para cartão.

import { supabaseService } from "./supabase-server";

const MP = "https://api.mercadopago.com";

/**
 * Token de quem RECEBE.
 *
 * Ordem: token do próprio agente → token da plataforma (env). Hoje os agentes
 * não têm token, então tudo cai na conta da plataforma — que é o desejado. No
 * dia em que cada empresa for receber por conta própria, basta preencher
 * chatbots.mercadopago_token; nada de código muda.
 */
export async function resolvePaymentToken(agentId?: string | null): Promise<string | null> {
  if (agentId) {
    const svc = supabaseService();
    if (svc) {
      const { data } = await svc.from("chatbots").select("mercadopago_token").eq("id", agentId).maybeSingle();
      if (data?.mercadopago_token) return data.mercadopago_token as string;
    }
  }
  return process.env.MERCADOPAGO_ACCESS_TOKEN || null;
}

/**
 * `external_reference` carrega quem creditar, e quanto, quando o pagamento cair.
 * O valor vai em CENTAVOS — o mesmo inteiro que o banco guarda, sem conversão
 * no caminho de volta.
 */
export const recargaRef = (contactId: string, cents: number) => `rec:${contactId}:${cents}`;
export function parseRecargaRef(ref?: string | null): { contactId: string; cents: number } | null {
  const m = /^rec:([0-9a-f-]{36}):(\d+)$/i.exec(String(ref ?? ""));
  return m ? { contactId: m[1], cents: Number(m[2]) } : null;
}

export type PixCharge = {
  paymentId: string;
  /** Copia-e-cola: é o que a pessoa cola no app do banco. */
  pixCode: string | null;
  /** QR como imagem (base64, sem o prefixo data:). */
  pixQrBase64: string | null;
  ticketUrl: string | null;
};

export async function criarPix(opts: {
  token: string; valor: number; descricao: string; ref: string; origin: string; email?: string | null;
}): Promise<{ ok: true; charge: PixCharge } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${MP}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
        // Evita cobrar duas vezes se a chamada for repetida por instabilidade.
        "X-Idempotency-Key": `${opts.ref}-${Math.floor(Date.now() / 60000)}`,
      },
      body: JSON.stringify({
        transaction_amount: opts.valor,
        description: opts.descricao,
        payment_method_id: "pix",
        external_reference: opts.ref,
        notification_url: `${opts.origin}/api/billing/webhook`,
        payer: { email: opts.email || "comprador@workspace.app" },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message || "Falha ao gerar o Pix." };
    const tx = data?.point_of_interaction?.transaction_data ?? {};
    return {
      ok: true,
      charge: {
        paymentId: String(data.id ?? ""),
        pixCode: tx.qr_code ?? null,
        pixQrBase64: tx.qr_code_base64 ?? null,
        ticketUrl: tx.ticket_url ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao falar com o Mercado Pago." };
  }
}

/** Link de Checkout para cartão (pagamento único, não assinatura). */
export async function criarLinkCartao(opts: {
  token: string; valor: number; descricao: string; ref: string; origin: string;
}): Promise<{ ok: true; url: string; preferenceId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${MP}/checkout/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({
        items: [{ title: opts.descricao, quantity: 1, unit_price: opts.valor, currency_id: "BRL" }],
        external_reference: opts.ref,
        notification_url: `${opts.origin}/api/billing/webhook`,
        back_urls: { success: opts.origin, pending: opts.origin, failure: opts.origin },
        // Cartão é pagamento único aqui — nada de boleto/Pix para não confundir
        // com o fluxo do Pix, que tem tela própria.
        payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message || "Falha ao gerar o link de pagamento." };
    const url = data.init_point || data.sandbox_init_point;
    if (!url) return { ok: false, error: "O Mercado Pago não devolveu o link." };
    return { ok: true, url, preferenceId: String(data.id ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao falar com o Mercado Pago." };
  }
}

/** Consulta um pagamento — usado quando a pessoa diz "já paguei". */
export async function consultarPagamento(token: string, paymentId: string) {
  try {
    const res = await fetch(`${MP}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as { id: number; status: string; external_reference?: string; transaction_amount?: number };
  } catch {
    return null;
  }
}
