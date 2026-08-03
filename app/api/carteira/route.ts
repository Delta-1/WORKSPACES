import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { mpConta, mpRecebimentos, mpSaldo, parseCobrancaRef } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const maxDuration = 60;

// CARTEIRA — a conta Mercado Pago da empresa, vista de dentro da plataforma.
//
// Junta três coisas numa resposta só:
//  • a conta conectada (para a pessoa confirmar que é a certa);
//  • o que entrou (via /v1/payments/search, que é documentado e estável);
//  • o saldo (best-effort — ver mpSaldo; o MP não tem endpoint público disso).
//
// Os recebimentos são cruzados com as cobranças do Cobrador pelo
// external_reference, então dá para ver "este R$ 300 é da cobrança do fulano".
//
// O token nunca sai daqui: quem chama é o navegador com a sessão do usuário, e
// só o `company_id` dele é usado para achar o token no banco.

export async function GET(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // A empresa vem do PERFIL do usuário logado, nunca da query string — senão
  // qualquer um leria a carteira de outra empresa trocando um parâmetro.
  const { data: perfil } = await client
    .from("profiles")
    .select("company_id, role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const companyId = perfil?.company_id as string | undefined;
  if (!companyId) return NextResponse.json({ error: "Sem empresa vinculada." }, { status: 400 });
  // Dinheiro da empresa é coisa de gestão.
  if (perfil?.role !== "gestor" && perfil?.role !== "gerente") {
    return NextResponse.json({ error: "Só gestores e gerentes veem a carteira." }, { status: 403 });
  }

  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const { data: cfg } = await svc
    .from("company_settings")
    .select("billing_mercadopago_token, carteira_pix_auto")
    .eq("company_id", companyId)
    .maybeSingle();

  const token = (cfg?.billing_mercadopago_token as string) || "";
  const pixAuto = cfg?.carteira_pix_auto === true;

  if (!token) {
    return NextResponse.json({
      conectada: false,
      pix_auto: pixAuto,
      aviso: "Nenhum token do Mercado Pago configurado. Cole o token nas configurações da Carteira para ver o que entra e ligar o Pix automático.",
    });
  }

  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias") ?? 30), 1), 180);

  const conta = await mpConta(token);
  if (!conta) {
    return NextResponse.json({
      conectada: false,
      pix_auto: pixAuto,
      aviso: "O Mercado Pago recusou este token. Confira se ele foi copiado inteiro e se é o token de produção da conta certa.",
    });
  }

  const [saldo, recebimentos] = await Promise.all([
    mpSaldo(token, conta.id),
    mpRecebimentos(token, { dias, limite: 100 }),
  ]);

  // Cruza com as cobranças: o Pix criado pela API carrega "cob:<alvo>", então dá
  // para dizer de QUEM é cada entrada em vez de mostrar uma lista anônima.
  const lista = recebimentos ?? [];
  const alvoIds = [...new Set(lista.map((r) => parseCobrancaRef(r.ref)).filter((v): v is string => !!v))];
  const nomePorAlvo = new Map<string, string>();
  if (alvoIds.length) {
    const { data: alvos } = await svc
      .from("billing_targets")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", alvoIds);
    for (const a of alvos ?? []) nomePorAlvo.set(a.id as string, (a.name as string) || "");
  }

  const aprovados = lista.filter((r) => r.status === "approved");
  const soma = (rs: typeof aprovados) => Math.round(rs.reduce((s, r) => s + r.valor, 0) * 100) / 100;
  const desde = (d: number) => {
    const limite = Date.now() - d * 86400000;
    return aprovados.filter((r) => r.em && new Date(r.em).getTime() >= limite);
  };

  // Cobranças em aberto — o outro lado da moeda: o que ainda não entrou.
  const { data: emAberto } = await svc
    .from("billing_targets")
    .select("valor")
    .eq("company_id", companyId)
    .in("status", ["pendente", "lembrete", "enviado", "atrasado"]);
  const aReceber = Math.round((emAberto ?? []).reduce((s, t) => s + Number(t.valor || 0), 0) * 100) / 100;

  return NextResponse.json({
    conectada: true,
    pix_auto: pixAuto,
    conta: { id: conta.id, apelido: conta.nickname, email: conta.email },
    // null = o Mercado Pago não devolveu o saldo. A tela esconde o cartão em vez
    // de mostrar R$ 0,00, que seria mentira.
    saldo,
    resumo: {
      hoje: soma(desde(1)),
      semana: soma(desde(7)),
      periodo: soma(aprovados),
      dias,
      a_receber: aReceber,
    },
    movimentos: lista.map((r) => {
      const alvo = parseCobrancaRef(r.ref);
      return {
        id: r.id,
        valor: r.valor,
        liquido: r.liquido,
        status: r.status,
        metodo: r.metodo,
        em: r.em,
        // Quando veio de uma cobrança, mostramos o nome do cliente.
        de: alvo ? nomePorAlvo.get(alvo) || r.pagador : r.pagador,
        origem: alvo ? "cobrador" : "avulso",
        descricao: r.descricao,
      };
    }),
  });
}
