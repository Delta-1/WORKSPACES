import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseService } from "@/lib/supabase-server";
import { ACERVO_ABERTO } from "@/lib/bibliopen-abertos";

export const runtime = "nodejs";
export const maxDuration = 120;

// Enche o acervo. Só gestor.
//
// Dois caminhos:
//  • "abertos" — semeia as obras de acesso aberto (licença verificável).
//  • "csv"     — puxa a planilha antiga do BibliOnMed. Tudo que vem de lá entra
//                como origem 'link': são ponteiros para arquivos que não são
//                nossos, então ficam indexados e indicados, nunca servidos nem
//                cobrados. Marcar como 'aberto' aqui seria mentir para o resto
//                do sistema, que confia em `origem` para decidir o que cobrar.

type Linha = {
  titulo: string; autor: string | null; materia: string | null; tipo: string | null;
  idioma: string | null; origem: "aberto" | "link"; fonte: string | null;
  licenca: string | null; fonte_url: string | null; link_externo: string | null;
  capa_url: string | null; descricao: string | null; ano: number | null;
  disponivel_no_leitor: boolean;
};

/** O parser precisa respeitar aspas: título com vírgula é o caso comum. */
function parseCSV(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (aspas && texto[i + 1] === '"') { campo += '"'; i++; }
      else aspas = !aspas;
    } else if (c === "," && !aspas) {
      linha.push(campo); campo = "";
    } else if ((c === "\n" || c === "\r") && !aspas) {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

export async function POST(request: Request) {
  const client = supabaseForRequest(request);
  if (!client) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (perfil?.role !== "gestor") return NextResponse.json({ error: "Só o gestor importa acervo." }, { status: 403 });

  const svc = supabaseService();
  if (!svc) return NextResponse.json({ error: "Servidor sem Supabase configurado." }, { status: 500 });

  const b = (await request.json().catch(() => ({}))) as { acao?: "abertos" | "csv"; url?: string };

  // ── acesso aberto ─────────────────────────────────────────────────────────
  if (b.acao === "abertos") {
    const linhas: Linha[] = ACERVO_ABERTO.map((s) => ({
      titulo: s.titulo,
      autor: s.autor ?? null,
      materia: s.materia,
      tipo: s.tipo ?? "Livro",
      idioma: s.idioma ?? "pt",
      ano: s.ano ?? null,
      origem: "aberto",
      fonte: s.fonte,
      licenca: s.licenca,
      fonte_url: s.fonte_url,
      link_externo: s.fonte_url,
      capa_url: null,
      descricao: s.descricao ?? null,
      // Só entra no leitor quando alguém anexar o PDF conferido. Até lá o site
      // manda para a página oficial — que é honesto e já é útil.
      disponivel_no_leitor: false,
    }));
    const { error } = await svc.from("library_books").upsert(linhas, { ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, importados: linhas.length, origem: "aberto" });
  }

  // ── planilha antiga ───────────────────────────────────────────────────────
  if (b.acao === "csv") {
    const url = String(b.url || "").trim();
    if (!url.includes("output=csv")) {
      return NextResponse.json({ error: "Informe a URL da planilha publicada como .csv." }, { status: 400 });
    }
    let texto: string;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(String(resp.status));
      texto = await resp.text();
    } catch {
      return NextResponse.json({ error: "Não consegui ler a planilha. Confira se ela está publicada na web." }, { status: 400 });
    }

    // Colunas do BibliOnMed: nome, autor, matéria, tipo, data, link, capa, idioma.
    const linhas = parseCSV(texto).slice(1);
    const livros: Linha[] = [];
    const vistos = new Set<string>();
    for (const r of linhas) {
      const titulo = (r[0] || "").trim();
      if (!titulo) continue;
      const autor = (r[1] || "").trim() || null;
      const chave = `${titulo.toLowerCase()}|${(autor || "").toLowerCase()}`;
      if (vistos.has(chave)) continue; // a planilha tem repetido
      vistos.add(chave);
      livros.push({
        titulo,
        autor,
        materia: (r[2] || "").trim() || null,
        tipo: (r[3] || "").trim() || "Livro",
        idioma: (r[7] || "").trim() || "pt",
        ano: null,
        origem: "link",
        fonte: "Acervo BibliOnMed",
        licenca: null,
        fonte_url: null,
        link_externo: (r[5] || "").trim() || null,
        capa_url: (r[6] || "").trim() || null,
        descricao: null,
        disponivel_no_leitor: false,
      });
    }
    if (!livros.length) return NextResponse.json({ error: "A planilha não trouxe nenhuma linha válida." }, { status: 400 });

    // Em blocos: a planilha tem centenas de linhas e um insert só estoura.
    let gravados = 0;
    for (let i = 0; i < livros.length; i += 200) {
      const { error } = await svc.from("library_books").upsert(livros.slice(i, i + 200), { ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message, gravados }, { status: 500 });
      gravados += livros.slice(i, i + 200).length;
    }
    return NextResponse.json({ ok: true, importados: gravados, origem: "link" });
  }

  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
