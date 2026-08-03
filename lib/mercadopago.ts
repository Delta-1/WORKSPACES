// Mercado Pago — cobrança avulsa (recarga de saldo do cliente).
//
// Diferente da assinatura do plano, que usa `preapproval` (recorrente), aqui é
// pagamento único: Pix criado pela API (devolve o copia-e-cola e o QR) ou um
// link de Checkout para cartão.

import { supabaseService } from "@/lib/supabase-server";

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
  /**
   * Query extra no notification_url (ex.: `cid=<empresa>`). Necessária quando o
   * Pix é criado com o token DE UMA EMPRESA: o webhook precisa saber com qual
   * token consultar o pagamento, senão toma 404 e a baixa nunca acontece.
   */
  notifyQuery?: string;
  /** Chave de idempotência fixa — para o mesmo pedido nunca virar dois Pix. */
  idempotencyKey?: string;
}): Promise<{ ok: true; charge: PixCharge } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${MP}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.token}`,
        // Evita cobrar duas vezes se a chamada for repetida por instabilidade.
        "X-Idempotency-Key": opts.idempotencyKey || `${opts.ref}-${Math.floor(Date.now() / 60000)}`,
      },
      body: JSON.stringify({
        transaction_amount: opts.valor,
        description: opts.descricao,
        payment_method_id: "pix",
        external_reference: opts.ref,
        notification_url: `${opts.origin}/api/billing/webhook${opts.notifyQuery ? `?${opts.notifyQuery}` : ""}`,
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

/**
 * `external_reference` de uma COBRANÇA do Cobrador.
 *
 * É o que faz o pagamento voltar identificado: quando o Pix cai, o webhook sabe
 * exatamente qual cobrança quitar — sem depender da IA ler o comprovante que o
 * cliente mandou (que pode ser de outro valor, de outro dia, ou de ninguém).
 */
export const cobrancaRef = (targetId: string) => `cob:${targetId}`;
export function parseCobrancaRef(ref?: string | null): string | null {
  const m = /^cob:([0-9a-f-]{36})$/i.exec(String(ref ?? ""));
  return m ? m[1] : null;
}

/** Token do Mercado Pago DA EMPRESA (configurado na Carteira). */
export async function companyPaymentToken(companyId?: string | null): Promise<string | null> {
  if (!companyId) return null;
  const svc = supabaseService();
  if (!svc) return null;
  const { data } = await svc
    .from("company_settings")
    .select("billing_mercadopago_token")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data?.billing_mercadopago_token as string) || null;
}

export type MpConta = { id: number; nickname: string | null; email: string | null };

/** Dona do token — serve para confirmar na tela QUAL conta está conectada. */
export async function mpConta(token: string): Promise<MpConta | null> {
  try {
    const res = await fetch(`${MP}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const d = await res.json();
    return { id: Number(d.id), nickname: d.nickname ?? null, email: d.email ?? null };
  } catch {
    return null;
  }
}

export type MpSaldo = { disponivel: number; aLiberar: number; total: number };

/**
 * Saldo da conta.
 *
 * ATENÇÃO: o Mercado Pago NÃO tem endpoint público documentado de saldo em
 * tempo real — o caminho oficial é o relatório de conta, que é assíncrono e não
 * serve para uma tela. Este endpoint existe e é o que as integrações usam, mas
 * não é documentado: pode mudar sem aviso.
 *
 * Por isso ele é BEST-EFFORT: devolve null em vez de estourar, e a Carteira
 * funciona sem ele — o que a empresa precisa ver (o que entrou) vem de
 * `mpRecebimentos`, que é documentado e estável.
 */
export async function mpSaldo(token: string, userId?: number): Promise<MpSaldo | null> {
  try {
    const uid = userId ?? (await mpConta(token))?.id;
    if (!uid) return null;
    const res = await fetch(`${MP}/users/${uid}/mercadopago_account/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // Nomes variam entre contas/países; pegamos o que vier.
    const disponivel = n(d.available_balance ?? d.availableBalance);
    const aLiberar = n(d.unavailable_balance ?? d.unavailableBalance);
    const total = n(d.total_balance ?? d.totalBalance) || disponivel + aLiberar;
    return { disponivel, aLiberar, total };
  } catch {
    return null;
  }
}

export type MpRecebimento = {
  id: string;
  valor: number;
  liquido: number;
  status: string;
  metodo: string | null;
  descricao: string | null;
  pagador: string | null;
  ref: string | null;
  em: string | null;
};

/**
 * O que entrou na conta. `/v1/payments/search` é documentado e estável — é a
 * base da Carteira, e o que responde "quanto caiu do que o Cobrador cobrou".
 */
export async function mpRecebimentos(
  token: string,
  opts: { dias?: number; limite?: number } = {}
): Promise<MpRecebimento[] | null> {
  const dias = Math.min(Math.max(opts.dias ?? 30, 1), 180);
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 100);
  try {
    const qs = new URLSearchParams({
      sort: "date_created",
      criteria: "desc",
      range: "date_created",
      begin_date: `NOW-${dias}DAYS`,
      end_date: "NOW",
      limit: String(limite),
    });
    const res = await fetch(`${MP}/v1/payments/search?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const d = await res.json();
    const results = Array.isArray(d?.results) ? d.results : [];
    return results.map((p: Record<string, unknown>) => {
      const detail = (p.transaction_details ?? {}) as Record<string, unknown>;
      const payer = (p.payer ?? {}) as Record<string, unknown>;
      const ident = (payer.first_name || payer.last_name)
        ? `${payer.first_name ?? ""} ${payer.last_name ?? ""}`.trim()
        : (payer.email as string) || null;
      return {
        id: String(p.id ?? ""),
        valor: Number(p.transaction_amount ?? 0),
        // O que sobra depois da taxa do Mercado Pago — é o que realmente entra.
        liquido: Number(detail.net_received_amount ?? p.transaction_amount ?? 0),
        status: String(p.status ?? ""),
        metodo: (p.payment_method_id as string) ?? null,
        descricao: (p.description as string) ?? null,
        pagador: ident,
        ref: (p.external_reference as string) ?? null,
        em: (p.date_approved as string) ?? (p.date_created as string) ?? null,
      };
    });
  } catch {
    return null;
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
