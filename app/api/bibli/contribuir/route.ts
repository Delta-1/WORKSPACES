import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { criarLinkCartao, criarPix, resolvePaymentToken } from "@/lib/mercadopago";
import { bibliRef, CONTRIBUICAO, podeSerLido, reais } from "@/lib/bibliopen";

export const runtime = "nodejs";
export const maxDuration = 60;

// Contribuição que libera a leitura: avulsa (um livro) ou passe mensal.
//
// O valor é MÍNIMO, não fixo: quem quiser contribuir mais, contribui. Por isso
// a referência carrega o valor em centavos — o webhook credita o que a pessoa
// realmente pagou, e não o que a gente sugeriu.

export async function POST(request: Request) {
  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const b = (await request.json().catch(() => ({}))) as {
    tipo?: "avulsa" | "mensal";
    livro_id?: string;
    contact_id?: string;
    email?: string;
    valor?: number; // em reais; abaixo do mínimo é recusado
    metodo?: "pix" | "cartao";
  };

  const tipo = b.tipo === "mensal" ? "mensal" : "avulsa";
  const minimo = tipo === "mensal" ? CONTRIBUICAO.mensalCents : CONTRIBUICAO.avulsaCents;
  const cents = b.valor ? Math.round(Number(b.valor) * 100) : minimo;
  if (!Number.isFinite(cents) || cents < minimo) {
    return NextResponse.json(
      { error: `A contribuição ${tipo === "mensal" ? "do passe mensal" : "por livro"} é de no mínimo ${reais(minimo)}.` },
      { status: 400 }
    );
  }

  // Quem é a pessoa. Sem isso não há como devolver a licença depois.
  const quem = b.contact_id || (b.email ? b.email.trim().toLowerCase() : "");
  if (!quem) return NextResponse.json({ error: "Informe um e-mail para receber o acesso." }, { status: 400 });

  // Avulsa precisa de um livro que a gente possa mesmo servir.
  if (tipo === "avulsa") {
    if (!b.livro_id) return NextResponse.json({ error: "Diga qual livro." }, { status: 400 });
    const { data: livro } = await svc
      .from("library_books")
      .select("id, titulo, origem, disponivel_no_leitor")
      .eq("id", b.livro_id)
      .maybeSingle();
    if (!livro) return NextResponse.json({ error: "Livro não encontrado." }, { status: 404 });
    if (!podeSerLido(livro)) {
      // Trava de verdade: um título de origem 'link' nunca gera cobrança.
      return NextResponse.json(
        { error: "Este título é de fonte externa e não é cobrado — o acesso a ele é direto na fonte." },
        { status: 400 }
      );
    }
  }

  const token = await resolvePaymentToken(null);
  if (!token) return NextResponse.json({ error: "Pagamento não configurado." }, { status: 400 });

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const ref = bibliRef(tipo, quem, b.livro_id);
  const descricao = tipo === "mensal" ? "BibliOpen — passe mensal" : "BibliOpen — contribuição por livro";
  const valor = cents / 100;

  if (b.metodo === "cartao") {
    const out = await criarLinkCartao({ token, valor, descricao, ref, origin });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ metodo: "cartao", valor: reais(cents), link: out.url });
  }

  const out = await criarPix({ token, valor, descricao, ref, origin, email: b.email ?? null });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({
    metodo: "pix",
    valor: reais(cents),
    payment_id: out.charge.paymentId,
    pix_copia_e_cola: out.charge.pixCode,
    pix_qr_base64: out.charge.pixQrBase64,
  });
}
