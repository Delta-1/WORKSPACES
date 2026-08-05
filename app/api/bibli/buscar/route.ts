import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { CAMPOS_PUBLICOS, termoDeBusca, tituloCompleto, type Livro } from "@/lib/bibliopen";

export const runtime = "nodejs";

// Busca no acervo. Rota PÚBLICA, sem login — é uma biblioteca.
//
// Serve o site e a Nina com a mesma resposta: se a busca do WhatsApp e a do site
// divergissem, a Nina indicaria um livro que a pessoa não acha na tela.
//
// `arquivo_url` NUNCA sai daqui (ver CAMPOS_PUBLICOS): quem serve o arquivo é a
// rota do leitor, que confere a licença antes.

export async function GET(request: Request) {
  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const url = new URL(request.url);
  const q = termoDeBusca(url.searchParams.get("q") ?? "");
  const materia = url.searchParams.get("materia");
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 20), 1), 50);

  // Um livro só, pelo id — é como a Nina volta ao título que a pessoa escolheu
  // na lista, sem ter que buscar de novo pelo nome e arriscar pegar outro.
  const id = url.searchParams.get("id");
  if (id) {
    const { data } = await svc.from("library_books").select(CAMPOS_PUBLICOS).eq("id", id).maybeSingle();
    const livros = data ? [{ ...(data as Livro), titulo_completo: tituloCompleto(data as Livro) }] : [];
    return NextResponse.json({ total: livros.length, livros });
  }

  let query = svc.from("library_books").select(CAMPOS_PUBLICOS).limit(limite);

  if (q) {
    // Busca por relevância no índice de texto; se o termo não render nada
    // (nome próprio, sigla), cai no "contém" do título, que é mais tolerante.
    query = query.textSearch("busca", q, { type: "websearch", config: "portuguese" });
  }
  if (materia) query = query.eq("materia", materia);

  const resultado = await query;
  if (resultado.error) return NextResponse.json({ error: resultado.error.message }, { status: 500 });
  let data: unknown[] | null = resultado.data;

  if (q && (!data || data.length === 0)) {
    let alt = svc.from("library_books").select(CAMPOS_PUBLICOS).ilike("titulo", `%${q}%`).limit(limite);
    if (materia) alt = alt.eq("materia", materia);
    const r = await alt;
    data = r.data;
  }

  const livros = ((data ?? []) as Livro[]).map((l) => ({
    ...l,
    titulo_completo: tituloCompleto(l),
  }));

  return NextResponse.json({ total: livros.length, livros });
}
