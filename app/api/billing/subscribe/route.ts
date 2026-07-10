import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";

// Assinatura via Mercado Pago (preapproval). Se MERCADOPAGO_ACCESS_TOKEN não
// estiver configurado, retorna sem URL — o cliente libera o acesso para testes.
export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const { aiAddon, amount } = (await request.json().catch(() => ({}))) as {
    aiAddon?: boolean;
    amount?: number;
  };

  if (!token) {
    return NextResponse.json({ activated: true, note: "Mercado Pago não configurado — acesso liberado para testes." });
  }

  // Descobre o e-mail do assinante a partir da sessão Supabase
  let payerEmail = "";
  const sb = supabaseForRequest(request);
  if (sb) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    payerEmail = user?.email ?? "";
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const value = typeof amount === "number" && amount > 0 ? amount : 50;

  try {
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        reason: `Workspace — Plano Base${aiAddon ? " + Complemento de IA" : ""}`,
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
    return NextResponse.json({ url: data.init_point ?? data.sandbox_init_point ?? null, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao contatar o Mercado Pago.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
