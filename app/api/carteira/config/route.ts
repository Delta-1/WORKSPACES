import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { mpConta } from "@/lib/mercadopago";

export const runtime = "nodejs";

// Configurações da Carteira: o token do Mercado Pago da empresa e o Pix
// automático do Cobrador.
//
// Passa por uma rota (e não direto pelo Supabase do navegador) por dois motivos:
// o token é VALIDADO no Mercado Pago antes de ser salvo — melhor descobrir que
// está errado agora do que na hora de cobrar um cliente — e o token salvo nunca
// volta para a tela.

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await client
    .from("profiles").select("company_id, role").eq("id", auth.user.id).maybeSingle();
  const companyId = perfil?.company_id as string | undefined;
  if (!companyId) return NextResponse.json({ error: "Sem empresa vinculada." }, { status: 400 });
  // Mexer no recebimento da empresa é coisa de gestor.
  if (perfil?.role !== "gestor") {
    return NextResponse.json({ error: "Só o gestor mexe na carteira." }, { status: 403 });
  }

  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const b = (await request.json().catch(() => ({}))) as { token?: string | null; pix_auto?: boolean };
  const patch: Record<string, unknown> = {};

  if (b.token !== undefined) {
    const token = String(b.token ?? "").trim();
    if (!token) {
      // Apagar o token desliga o Pix automático junto — sem token ele não tem
      // como gerar cobrança nenhuma, e ficar "ligado" seria mentira na tela.
      patch.billing_mercadopago_token = null;
      patch.carteira_pix_auto = false;
    } else {
      const conta = await mpConta(token);
      if (!conta) {
        return NextResponse.json(
          { error: "O Mercado Pago recusou este token. Confira se copiou o token de produção inteiro." },
          { status: 400 }
        );
      }
      patch.billing_mercadopago_token = token;
    }
  }

  if (b.pix_auto !== undefined) {
    const ligar = b.pix_auto === true;
    if (ligar) {
      // Não deixa ligar sem token: o Cobrador mandaria a cobrança sem Pix nenhum.
      const tokenAtual =
        (patch.billing_mercadopago_token as string | null | undefined) ??
        (await svc.from("company_settings").select("billing_mercadopago_token").eq("company_id", companyId).maybeSingle())
          .data?.billing_mercadopago_token;
      if (!tokenAtual) {
        return NextResponse.json({ error: "Configure o token do Mercado Pago antes de ligar o Pix automático." }, { status: 400 });
      }
    }
    patch.carteira_pix_auto = ligar;
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });

  const { error } = await svc.from("company_settings").update(patch).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
