import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { parsePipRef } from "@/lib/mercadopago";

export const runtime = "nodejs";

// Webhook do Mercado Pago: recebe os avisos de pagamento/assinatura e mantém a
// LICENÇA da empresa em dia — libera quando paga, bloqueia quando falha/cancela.
// Isso é o "bloqueio automático por falta de pagamento": a própria plataforma de
// pagamento nos avisa, e a gente aplica na hora.
//
// Fluxos tratados:
//  - preapproval (assinatura criada/alterada): authorized → ativa; paused/
//    cancelled → bloqueia.
//  - subscription_authorized_payment (cobrança mensal recorrente): approved →
//    renova +35 dias; rejected → marca como atrasada (past_due).

const MONTH_GRACE_DAYS = 35; // 30 dias do ciclo + 5 de folga

function inDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function mpGet(path: string, token: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Casa o evento a uma empresa: por external_reference (companyId) ou pelo
// mp_preapproval_id já guardado.
async function findCompanyId(svc: ReturnType<typeof supabaseService>, opts: { externalRef?: string | null; preapprovalId?: string | null }) {
  if (opts.externalRef) return opts.externalRef;
  if (opts.preapprovalId && svc) {
    const { data } = await svc.from("companies").select("id").eq("mp_preapproval_id", String(opts.preapprovalId)).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

async function applyToCompany(svc: NonNullable<ReturnType<typeof supabaseService>>, companyId: string, patch: Record<string, unknown>, event: string) {
  await svc
    .from("companies")
    .update({ ...patch, mp_last_event: event, mp_updated_at: new Date().toISOString() })
    .eq("id", companyId);
}

export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const svc = supabaseService();
  // Sempre responde 200 rápido — o MP reenvia se não receber 200, mas a gente
  // não quer que ele fique reenviando por erro nosso de config.
  if (!token || !svc) return NextResponse.json({ ok: true, skipped: "not-configured" });

  // O MP manda o tipo/id ora no corpo, ora na query string.
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; topic?: string; action?: string; data?: { id?: string } };
  const type = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "";
  const id = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "";

  try {
    if (!id) return NextResponse.json({ ok: true });

    if (type.includes("preapproval")) {
      const pre = await mpGet(`/preapproval/${id}`, token);
      if (!pre) return NextResponse.json({ ok: true });
      const companyId = await findCompanyId(svc, { externalRef: pre.external_reference, preapprovalId: pre.id });
      if (!companyId) return NextResponse.json({ ok: true });
      const status = String(pre.status || "");
      if (status === "authorized") {
        await applyToCompany(svc, companyId, { subscription_status: "active", license_until: inDays(MONTH_GRACE_DAYS), mp_preapproval_id: String(pre.id) }, `preapproval:${status}`);
      } else if (status === "paused" || status === "cancelled") {
        await applyToCompany(svc, companyId, { subscription_status: "blocked" }, `preapproval:${status}`);
      } else {
        await applyToCompany(svc, companyId, { subscription_status: "pending" }, `preapproval:${status}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (type.includes("subscription_authorized_payment") || type.includes("authorized_payment")) {
      const pay = await mpGet(`/authorized_payments/${id}`, token);
      if (!pay) return NextResponse.json({ ok: true });
      const companyId = await findCompanyId(svc, { preapprovalId: pay.preapproval_id });
      if (!companyId) return NextResponse.json({ ok: true });
      const status = String(pay.status || pay.payment?.status || "");
      if (status === "approved" || status === "processed") {
        await applyToCompany(svc, companyId, { subscription_status: "active", license_until: inDays(MONTH_GRACE_DAYS) }, `payment:${status}`);
      } else if (status === "rejected" || status === "cancelled") {
        await applyToCompany(svc, companyId, { subscription_status: "past_due" }, `payment:${status}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Pagamento avulso (Pix): aprovado → renova +35 dias e limpa o Pix pendente;
    // recusado → marca como atrasado. (authorized_payment já foi tratado acima.)
    if (type.includes("payment")) {
      const pay = await mpGet(`/v1/payments/${id}`, token);
      if (!pay) return NextResponse.json({ ok: true });

      // COMPRA DE PIPS — external_reference no formato "pip:<contato>:<pips>".
      // É o que credita os pips sozinho assim que o Pix cai, sem a pessoa
      // precisar avisar. credits_add é idempotente pelo `ref`, então o reenvio
      // do webhook (o MP insiste até receber 200) não credita em dobro.
      const pip = parsePipRef(pay.external_reference);
      if (pip) {
        if (String(pay.status || "") === "approved") {
          const { data: ct } = await svc.from("contacts").select("company_id").eq("id", pip.contactId).maybeSingle();
          await svc.rpc("credits_add", {
            p_contact: pip.contactId,
            p_company: ct?.company_id ?? null,
            p_pips: pip.pips,
            p_reason: "compra",
            p_detail: `Mercado Pago ${pay.id}`,
            p_ref: `mp:${pay.id}`,
          });
        }
        return NextResponse.json({ ok: true });
      }

      const companyId = await findCompanyId(svc, { externalRef: pay.external_reference });
      if (!companyId) return NextResponse.json({ ok: true });
      const status = String(pay.status || "");
      if (status === "approved") {
        await applyToCompany(svc, companyId, { subscription_status: "active", license_until: inDays(MONTH_GRACE_DAYS), pix_qr_code: null, pix_ticket_url: null, mp_last_payment_id: String(pay.id ?? "") }, `pix:${status}`);
      } else if (status === "rejected" || status === "cancelled") {
        await applyToCompany(svc, companyId, { subscription_status: "past_due" }, `pix:${status}`);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

// O MP às vezes faz um GET de verificação na URL do webhook.
export async function GET() {
  return NextResponse.json({ ok: true });
}
