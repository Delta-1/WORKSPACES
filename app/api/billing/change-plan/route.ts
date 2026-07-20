import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Troca de plano (a pessoa adicionou/removeu ferramentas e o valor mudou).
// Regra pedida: no CARTÃO, cancela a assinatura recorrente atual e cria uma nova
// com o novo valor. No PIX não há assinatura recorrente para cancelar — o próximo
// Pix (na tela de bloqueio) já usa o novo valor.
// Sem MERCADOPAGO_ACCESS_TOKEN, não faz nada de cobrança (acesso segue liberado).
export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const { amount, companyId, companyName, aiAddon } = (await request.json().catch(() => ({}))) as {
    amount?: number;
    companyId?: string;
    companyName?: string;
    aiAddon?: boolean;
  };
  if (!token) return NextResponse.json({ activated: true, note: "Mercado Pago não configurado." });
  if (!companyId) return NextResponse.json({ error: "empresa não informada" }, { status: 400 });

  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "serviço indisponível" }, { status: 500 });

  const { data: company } = await svc
    .from("companies")
    .select("pay_method, mp_preapproval_id")
    .eq("id", companyId)
    .maybeSingle();

  // Só o cartão tem assinatura recorrente para cancelar+recriar.
  if (company?.pay_method !== "card" || !company?.mp_preapproval_id) {
    return NextResponse.json({ ok: true, note: "Sem assinatura de cartão ativa — nada a cancelar." });
  }

  let payerEmail = "";
  const sb = supabaseForRequest(request);
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    payerEmail = user?.email ?? "";
  }
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const value = typeof amount === "number" && amount > 0 ? amount : 50;

  try {
    // 1) Cancela a assinatura atual.
    await fetch(`https://api.mercadopago.com/preapproval/${company.mp_preapproval_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "cancelled" }),
    });

    // 2) Cria a nova assinatura com o novo valor.
    const res = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        reason: `Workspace — ${companyName || "Plano"}${aiAddon ? " + IA" : ""}`,
        external_reference: companyId,
        notification_url: `${origin}/api/billing/webhook`,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: value, currency_id: "BRL" },
        back_url: origin,
        payer_email: payerEmail || undefined,
        status: "pending",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.message ?? "Falha ao recriar a assinatura." }, { status: 400 });
    }
    if (data?.id) {
      await svc
        .from("companies")
        .update({ mp_preapproval_id: String(data.id), subscription_status: "pending", mp_updated_at: new Date().toISOString() })
        .eq("id", companyId);
    }
    return NextResponse.json({ url: data.init_point ?? data.sandbox_init_point ?? null, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao contatar o Mercado Pago.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
