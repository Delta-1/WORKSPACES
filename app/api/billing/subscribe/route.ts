import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Assinatura recorrente via Mercado Pago (preapproval).
// - Amarra a assinatura à empresa por `external_reference` (= companyId), para o
//   webhook saber qual empresa liberar/bloquear quando o pagamento acontece.
// - Aponta o `notification_url` para o nosso webhook (/api/billing/webhook).
// - Guarda o `mp_preapproval_id` na empresa.
// Se MERCADOPAGO_ACCESS_TOKEN não estiver configurado, retorna sem URL — o
// cliente libera o acesso para testes (fluxo atual mantido).
export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const { aiAddon, amount, companyId, companyName, method } = (await request.json().catch(() => ({}))) as {
    aiAddon?: boolean;
    amount?: number;
    companyId?: string;
    companyName?: string;
    method?: "pix" | "card";
  };

  if (!token) {
    return NextResponse.json({ activated: true, note: "Mercado Pago não configurado — acesso liberado para testes." });
  }

  // E-mail do assinante a partir da sessão Supabase.
  let payerEmail = "";
  const sb = supabaseForRequest(request);
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    payerEmail = user?.email ?? "";
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const value = typeof amount === "number" && amount > 0 ? amount : 50;
  const reason = `Workspace — ${companyName || "Plano Base"}${aiAddon ? " + IA" : ""}`;
  const svc = supabaseService();

  try {
    // ─── PIX (cobrança avulsa do mês) ───────────────────────────────────────
    // O MP não tem Pix recorrente; geramos uma cobrança Pix por ciclo. A pessoa
    // paga o QR/copia-e-cola; o webhook libera quando o pagamento cai. No próximo
    // vencimento a tela de bloqueio pede um novo Pix.
    if (method === "pix") {
      const res = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": `${companyId || "sub"}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: value,
          description: reason,
          payment_method_id: "pix",
          external_reference: companyId || undefined,
          notification_url: `${origin}/api/billing/webhook`,
          payer: { email: payerEmail || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data?.message ?? "Falha ao gerar o Pix." }, { status: 400 });
      }
      const tx = data?.point_of_interaction?.transaction_data ?? {};
      const qr = tx.qr_code ?? null; // copia-e-cola
      const ticket = tx.ticket_url ?? null;
      if (companyId && svc) {
        await svc
          .from("companies")
          .update({
            pay_method: "pix",
            pix_qr_code: qr,
            pix_ticket_url: ticket,
            mp_last_payment_id: String(data.id ?? ""),
            subscription_status: "pending",
            mp_updated_at: new Date().toISOString(),
          })
          .eq("id", companyId);
      }
      return NextResponse.json({ method: "pix", pixCode: qr, pixQrBase64: tx.qr_code_base64 ?? null, ticketUrl: ticket, paymentId: data?.id });
    }

    // ─── CARTÃO (assinatura recorrente automática) ──────────────────────────
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        reason,
        external_reference: companyId || undefined,
        notification_url: `${origin}/api/billing/webhook`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: value,
          currency_id: "BRL",
        },
        back_url: origin,
        payer_email: payerEmail || undefined,
        status: "pending",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.message ?? "Falha ao iniciar a assinatura." }, { status: 400 });
    }
    // Guarda o id da assinatura na empresa (o webhook usa para casar o evento).
    if (companyId && data?.id && svc) {
      await svc
        .from("companies")
        .update({ mp_preapproval_id: String(data.id), pay_method: "card", subscription_status: "pending", mp_updated_at: new Date().toISOString() })
        .eq("id", companyId);
    }
    return NextResponse.json({ method: "card", url: data.init_point ?? data.sandbox_init_point ?? null, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao contatar o Mercado Pago.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
