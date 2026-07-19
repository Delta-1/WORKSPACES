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
  const { aiAddon, amount, companyId, companyName } = (await request.json().catch(() => ({}))) as {
    aiAddon?: boolean;
    amount?: number;
    companyId?: string;
    companyName?: string;
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

  try {
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        reason: `Workspace — ${companyName || "Plano Base"}${aiAddon ? " + IA" : ""}`,
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
    if (companyId && data?.id) {
      const svc = supabaseService();
      if (svc) {
        await svc
          .from("companies")
          .update({ mp_preapproval_id: String(data.id), subscription_status: "pending", mp_updated_at: new Date().toISOString() })
          .eq("id", companyId);
      }
    }
    return NextResponse.json({ url: data.init_point ?? data.sandbox_init_point ?? null, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao contatar o Mercado Pago.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
