import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Cadastrar, editar e remover um livro. Só gestor.
//
// É por aqui que o acervo cresce no dia a dia — o importador serve para encher
// de uma vez, isto serve para o título que chega depois.
//
// A regra da origem é reforçada aqui de novo: só 'aberto' e 'proprio' podem
// entrar no leitor. O banco já recusa pelo CHECK, mas devolver um erro em
// português é melhor do que deixar o Postgres explicar.

type Corpo = {
  id?: string;
  titulo?: string;
  autor?: string | null;
  materia?: string | null;
  tipo?: string | null;
  edicao?: string | null;
  ano?: number | null;
  idioma?: string | null;
  capa_url?: string | null;
  descricao?: string | null;
  origem?: "aberto" | "proprio" | "link";
  fonte?: string | null;
  licenca?: string | null;
  fonte_url?: string | null;
  arquivo_url?: string | null;
  link_externo?: string | null;
  disponivel_no_leitor?: boolean;
};

async function exigirGestor(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const { data: perfil } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (perfil?.role !== "gestor") return { erro: NextResponse.json({ error: "Só o gestor mexe no acervo." }, { status: 403 }) };
  const svc = supabaseService();
  if (!svc) return { erro: NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 }) };
  return { svc };
}

/** Campos aceitos, já normalizados. Nada que o formulário não mande passa. */
function campos(b: Corpo) {
  const v = (x: unknown) => {
    const s = String(x ?? "").trim();
    return s || null;
  };
  return {
    titulo: String(b.titulo ?? "").trim(),
    autor: v(b.autor), materia: v(b.materia), tipo: v(b.tipo) ?? "Livro",
    edicao: v(b.edicao), idioma: v(b.idioma) ?? "pt",
    ano: Number.isFinite(Number(b.ano)) && b.ano ? Number(b.ano) : null,
    capa_url: v(b.capa_url), descricao: v(b.descricao),
    origem: b.origem === "aberto" || b.origem === "proprio" ? b.origem : "link",
    fonte: v(b.fonte), licenca: v(b.licenca), fonte_url: v(b.fonte_url),
    arquivo_url: v(b.arquivo_url), link_externo: v(b.link_externo),
    disponivel_no_leitor: b.disponivel_no_leitor === true,
    atualizado_em: new Date().toISOString(),
  };
}

/** A pergunta que decide tudo: temos direito de servir este arquivo? */
function conferirOrigem(c: ReturnType<typeof campos>) {
  if (!c.titulo) return "O título é obrigatório.";
  if (c.disponivel_no_leitor) {
    if (c.origem === "link") {
      return "Só entra no leitor o que a gente tem direito de distribuir. Marque a origem como acesso aberto ou acervo próprio — ou deixe o leitor desligado e aponte para a fonte.";
    }
    if (!c.arquivo_url) return "Para abrir no leitor, informe o endereço do arquivo (PDF).";
  }
  if (c.origem === "aberto" && !c.licenca) {
    // Sem licença escrita não dá para provar por que a obra pode estar aqui —
    // e é justamente essa prova que sustenta o acervo.
    return "Em acesso aberto, diga qual é a licença (CC BY, domínio público…).";
  }
  return null;
}

export async function POST(request: Request) {
  const { erro, svc } = await exigirGestor(request);
  if (erro || !svc) return erro!;
  const c = campos((await request.json().catch(() => ({}))) as Corpo);
  const problema = conferirOrigem(c);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const { data, error } = await svc.from("library_books").insert(c).select("id, titulo").single();
  if (error) {
    // O índice único é por título + edição + autor.
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um título igual com essa edição e autor." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, livro: data });
}

export async function PATCH(request: Request) {
  const { erro, svc } = await exigirGestor(request);
  if (erro || !svc) return erro!;
  const b = (await request.json().catch(() => ({}))) as Corpo;
  if (!b.id) return NextResponse.json({ error: "Informe o id do livro." }, { status: 400 });
  const c = campos(b);
  const problema = conferirOrigem(c);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const { error } = await svc.from("library_books").update(c).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { erro, svc } = await exigirGestor(request);
  if (erro || !svc) return erro!;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o id do livro." }, { status: 400 });
  const { error } = await svc.from("library_books").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
