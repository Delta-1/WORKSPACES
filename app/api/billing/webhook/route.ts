import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { companyPaymentToken, parseCobrancaRef, parseRecargaRef } from "@/lib/mercadopago";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";

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

// Baixa automática de uma COBRANÇA do Cobrador.
//
// É o que tira a IA do caminho: o Pix foi criado pela API com a referência desta
// cobrança, então quando ele cai o Mercado Pago nos diz exatamente qual quitar,
// de quanto e por qual meio. Nada de ler o comprovante que o cliente mandou.
async function quitarCobranca(
  svc: NonNullable<ReturnType<typeof supabaseService>>,
  targetId: string,
  pay: Record<string, unknown>
) {
  const status = String(pay.status || "");
  if (status !== "approved") return;
  const { data: alvo } = await svc
    .from("billing_targets")
    .select("id, status, paid_at, name, phone, contacts(jid, phone)")
    .eq("id", targetId)
    .maybeSingle();
  if (!alvo || alvo.paid_at) return; // já quitada — webhook repetido não faz nada
  const valor = Number(pay.transaction_amount ?? 0);
  await svc
    .from("billing_targets")
    .update({
      status: "pago",
      paid_at: new Date().toISOString(),
      paid_amount: valor,
      paid_method: (pay.payment_method_id as string) ?? "pix",
      mp_payment_id: String(pay.id ?? ""),
      // Pagou = respondeu: para o follow-up na hora, senão o Cobrador continua
      // cobrando alguém que já pagou.
      responded_at: new Date().toISOString(),
      inadimplente: false,
    })
    .eq("id", targetId);

  // Avisa o cliente. É o que fecha a promessa do "assim que cair eu te aviso" —
  // e sai pelo /send do serviço, então também aparece no app Mensagens.
  try {
    if (!whatsappServiceConfigured) return;
    const ct = alvo.contacts as { jid?: string; phone?: string } | null;
    const to = ct?.jid || ct?.phone || (alvo.phone as string) || "";
    if (!to) return;
    const primeiro = String(alvo.name || "").split(" ")[0];
    const brl = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    await callWhatsappService("/send", {
      method: "POST",
      body: JSON.stringify({
        to,
        text: `Pagamento de ${brl} confirmado${primeiro ? ", " + primeiro : ""}! ✅ Caiu aqui agora e já dei baixa. Obrigado! 🙏`,
      }),
    });
  } catch (e) {
    // O aviso é um extra: a baixa já está feita e não pode ser desfeita por isso.
    console.error("aviso de pagamento não enviado:", e);
  }
}

export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const svc = supabaseService();
  // Sempre responde 200 rápido — o MP reenvia se não receber 200, mas a gente
  // não quer que ele fique reenviando por erro nosso de config.
  if (!svc) return NextResponse.json({ ok: true, skipped: "not-configured" });

  // O MP manda o tipo/id ora no corpo, ora na query string.
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; topic?: string; action?: string; data?: { id?: string } };
  const type = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "";
  const id = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "";

  // `cid` vem do notification_url que o Cobrador monta ao gerar o Pix da empresa.
  // É indispensável: um pagamento criado com o token da empresa NÃO pode ser
  // lido com o token da plataforma — sem isto a consulta volta 404 e a cobrança
  // nunca seria quitada.
  const cid = url.searchParams.get("cid");
  const tokenDaEmpresa = cid ? await companyPaymentToken(cid) : null;
  const tokenLeitura = tokenDaEmpresa || token;

  try {
    if (!id) return NextResponse.json({ ok: true });
    if (!tokenLeitura) return NextResponse.json({ ok: true, skipped: "sem-token" });

    // Assinatura da PLATAFORMA (licença da empresa) — sempre no nosso token.
    if (type.includes("preapproval")) {
      if (!token) return NextResponse.json({ ok: true });
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
      if (!token) return NextResponse.json({ ok: true });
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
      const pay = await mpGet(`/v1/payments/${id}`, tokenLeitura);
      if (!pay) return NextResponse.json({ ok: true });

      // COBRANÇA DO COBRADOR — "cob:<alvo>". O Pix foi criado pela API com esta
      // referência, então o pagamento volta identificado e a baixa é automática.
      const alvo = parseCobrancaRef(pay.external_reference);
      if (alvo) {
        await quitarCobranca(svc, alvo, pay);
        return NextResponse.json({ ok: true });
      }

      // RECARGA DE SALDO — external_reference no formato "rec:<contato>:<centavos>".
      // É o que credita o saldo sozinho assim que o Pix cai, sem a pessoa
      // precisar avisar. credits_add é idempotente pelo `ref`, então o reenvio
      // do webhook (o MP insiste até receber 200) não credita em dobro.
      const rec = parseRecargaRef(pay.external_reference);
      if (rec) {
        if (String(pay.status || "") === "approved") {
          const { data: ct } = await svc.from("contacts").select("company_id").eq("id", rec.contactId).maybeSingle();
          // Vale o que o MP realmente recebeu; a referência é só o fallback.
          const cents = Math.round(Number(pay.transaction_amount ?? 0) * 100) || rec.cents;
          await svc.rpc("credits_add", {
            p_contact: rec.contactId,
            p_company: ct?.company_id ?? null,
            p_cents: cents,
            p_reason: "recarga",
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
