import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { podeSerLido } from "@/lib/bibliopen";

export const runtime = "nodejs";
export const maxDuration = 60;

// Serve o PDF para o leitor do BibliOpen.
//
// É o ÚNICO caminho até o arquivo — `arquivo_url` não sai em nenhuma listagem.
// Aqui a licença é conferida antes de qualquer byte sair, e o arquivo é
// transmitido por nós: entregar o link direto do Drive seria entregar a chave
// junto com a porta.
//
// Livro de origem 'link' nunca passa por aqui. Não temos direito de distribuir,
// então não distribuímos — a listagem manda a pessoa para a fonte externa.

/** Converte um link de visualização do Drive no endereço que devolve os bytes. */
function urlDeDownload(bruto: string): string {
  const u = String(bruto || "").trim();
  const id = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(u)?.[1] || /[?&]id=([\w-]+)/.exec(u)?.[1];
  return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download` : u;
}

/** Só a licença vale — sem ela, nem o livro nem o motivo saem daqui. */
async function conferirAcesso(id: string, url: URL) {
  const svc = supabaseService();
  if (!svc) return { erro: NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 }) };

  const { data: livro } = await svc
    .from("library_books")
    .select("id, titulo, origem, arquivo_url, disponivel_no_leitor")
    .eq("id", id)
    .maybeSingle();

  if (!livro) return { erro: NextResponse.json({ error: "Livro não encontrado." }, { status: 404 }) };
  if (!podeSerLido(livro) || !livro.arquivo_url) {
    return {
      erro: NextResponse.json(
        { error: "Este título não é servido pelo leitor — ele aponta para uma fonte externa." },
        { status: 403 }
      ),
    };
  }

  const { data: liberado } = await svc.rpc("library_pode_ler", {
    p_livro: id,
    p_contact: url.searchParams.get("c") || null,
    p_email: url.searchParams.get("e") || null,
  });
  if (liberado !== true) {
    return {
      erro: NextResponse.json(
        { error: "Sem licença de leitura para este título.", precisa_contribuir: true },
        { status: 402 }
      ),
    };
  }
  return { livro };
}

/**
 * O leitor pergunta "posso abrir?" antes de baixar.
 *
 * Precisa ser explícito: sem isto o Next responderia o HEAD rodando o GET
 * inteiro e jogando o corpo fora — ou seja, puxaria o PDF completo do Drive só
 * para dizer sim ou não.
 */
export async function HEAD(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { erro } = await conferirAcesso(id, new URL(request.url));
  return erro ? new NextResponse(null, { status: erro.status }) : new NextResponse(null, { status: 200 });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Quem está pedindo vem na URL: contato do WhatsApp (link que a Nina mandou)
  // ou e-mail (quem entrou pelo site).
  const { erro, livro } = await conferirAcesso(id, new URL(request.url));
  if (erro || !livro) return erro!;

  try {
    const resp = await fetch(urlDeDownload(livro.arquivo_url), {
      signal: AbortSignal.timeout(45_000),
      redirect: "follow",
    });
    if (!resp.ok || !resp.body) {
      return NextResponse.json({ error: "Não consegui buscar o arquivo agora." }, { status: 502 });
    }
    // `inline` para abrir no leitor em vez de baixar; o download continua
    // possível pelo botão, que é o que salva a leitura offline.
    return new NextResponse(resp.body, {
      headers: {
        "Content-Type": resp.headers.get("content-type") || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(livro.titulo)}.pdf"`,
        // Fica no cache do navegador (e do service worker) para a leitura
        // offline funcionar sem uma segunda ida à rede.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao transmitir o arquivo." }, { status: 502 });
  }
}
