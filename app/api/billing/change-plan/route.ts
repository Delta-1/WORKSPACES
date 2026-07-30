import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { planPrice, type FeatureId } from "@/lib/plan";

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
    .select("pay_method, mp_preapproval_id, owner_id, company_type")
    .eq("id", companyId)
    .maybeSingle();

  const sb = supabaseForRequest(request);
  const { data: { user } } = sb ? await sb.auth.getUser() : { data: { user: null } };
  if (!user || company?.owner_id !== user.id) {
    return NextResponse.json({ error: "sem permissão para alterar este plano" }, { status: 403 });
  }

  // Só o cartão tem assinatura recorrente para cancelar+recriar.
  if (company?.pay_method !== "card" || !company?.mp_preapproval_id) {
    return NextResponse.json({ ok: true, note: "Sem assinatura de cartão ativa — nada a cancelar." });
  }

  let payerEmail = "";
  payerEmail = user.email ?? "";
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const { data: settings } = await svc
    .from("company_settings")
    .select("enabled_features,wa_number_limit,remote_access_limit")
    .eq("company_id", companyId)
    .maybeSingle();
  const value = settings?.enabled_features
    ? planPrice(settings.enabled_features as FeatureId[], settings.wa_number_limit ?? 1, {
        remoteLimit: settings.remote_access_limit ?? 1,
        accountKind: company.company_type === "Casa" ? "home" : "business",
      })
    : typeof amount === "number" && amount >= 0 ? amount : 0;

  try {
    // 1) Cancela a assinatura atual.
    await fetch(`https://api.mercadopago.com/preapproval/${company.mp_preapproval_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (value === 0) {
      await svc
        .from("companies")
        .update({ mp_preapproval_id: null, subscription_status: "active", mp_updated_at: new Date().toISOString() })
        .eq("id", companyId);
      return NextResponse.json({ ok: true, activated: true, free: true });
    }

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
