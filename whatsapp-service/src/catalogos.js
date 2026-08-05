// CATÁLOGOS ABERTOS — de onde a Nina tira os livros.
//
// A Nina não tem acervo próprio e não consulta banco nenhum: ela pergunta, na
// hora, aos mesmos catálogos que o site do BibliOpen usa. Isso mantém as duas
// pontas dando a mesma resposta — se a busca do WhatsApp e a do site
// divergissem, ela indicaria um livro que a pessoa não acha na tela.
//
// Quatro fontes, de propósito bem diferentes entre si:
//   • Project Gutenberg — domínio público, texto completo. É o que a pessoa
//     realmente consegue ler e baixar na hora.
//   • Internet Archive  — acervo comunitário: quem envia é o público.
//   • Wikisource        — transcrição feita por voluntários, em português.
//   • Open Library      — o catálogo grande, para quando o resto não achar.
//
// Cada uma falha sozinha. Se o Archive cair, as outras três respondem: uma
// bibliotecária não fica muda porque uma estante travou.

const TEMPO_LIMITE = 12_000;

async function pegarJSON(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(TEMPO_LIMITE),
      headers: { "User-Agent": "BibliOpen/1.0 (biblioteca aberta)", Accept: "application/json" },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** "Austen, Jane, 1775-1817" → "Jane Austen". */
function nomeDireito(bruto) {
  const s = String(bruto ?? "").trim();
  if (!s) return null;
  const m = /^([^,]+),\s*(.+)$/.exec(s);
  if (!m) return s;
  const resto = m[2].replace(/,?\s*\d{3,4}\??\s*-\s*\d{0,4}\??\.?$/, "").trim();
  return resto ? `${resto} ${m[1].trim()}` : m[1].trim();
}

/**
 * Escolhe o arquivo do Gutenberg.
 *
 * Texto puro na frente do HTML: o HTML do Gutenberg referencia imagens por
 * caminho relativo, e num link solto no WhatsApp isso quebra. Texto abre em
 * qualquer lugar.
 */
function arquivoDoGutenberg(formats) {
  const entradas = Object.entries(formats || {});
  const serve = (u) => u && !String(u).endsWith(".zip");
  const txt = entradas.find(([k, v]) => k.startsWith("text/plain") && serve(v));
  if (txt) return txt[1];
  const html = entradas.find(([k, v]) => k.startsWith("text/html") && serve(v));
  return html ? html[1] : null;
}

function deGutenberg(l) {
  if (!l?.id || !l?.title) return null;
  // O Gutenberg tem um punhado de obras ainda em copyright, publicadas com
  // autorização. A autorização é deles, não nossa: essas ficam de fora.
  if (l.copyright === true) return null;
  return {
    id: `gutenberg:${l.id}`,
    titulo: String(l.title).trim(),
    autor: nomeDireito(l.authors?.[0]?.name),
    idioma: l.languages?.[0] || "en",
    assunto: (l.subjects || []).slice(0, 2).join(" · ") || null,
    fonte: "Project Gutenberg",
    licenca: "Domínio público",
    pagina: `https://www.gutenberg.org/ebooks/${l.id}`,
    arquivo: arquivoDoGutenberg(l.formats),
  };
}

async function buscarGutenberg(termo) {
  const j = await pegarJSON(`https://gutendex.com/books?search=${encodeURIComponent(termo)}`);
  return (j?.results || []).slice(0, 10).map(deGutenberg).filter(Boolean);
}

async function buscarArchive(termo) {
  const q = `title:(${termo}) AND mediatype:texts`;
  const url =
    "https://archive.org/advancedsearch.php" +
    `?q=${encodeURIComponent(q)}` +
    "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year" +
    "&rows=10&page=1&output=json";
  const j = await pegarJSON(url);
  return (j?.response?.docs || [])
    .filter((d) => d?.identifier && d?.title)
    .map((d) => ({
      id: `archive:${d.identifier}`,
      titulo: String(d.title).trim(),
      autor: nomeDireito(Array.isArray(d.creator) ? d.creator[0] : d.creator),
      idioma: null,
      assunto: d.year ? `de ${d.year}` : null,
      fonte: "Internet Archive",
      licenca: null,
      pagina: `https://archive.org/details/${d.identifier}`,
      arquivo: null,
    }));
}

async function buscarWikisource(termo) {
  const url =
    "https://pt.wikisource.org/w/api.php?action=query&list=search&format=json" +
    `&srsearch=${encodeURIComponent(termo)}&srlimit=6`;
  const j = await pegarJSON(url);
  return (j?.query?.search || []).map((h) => ({
    id: `wikisource:${h.pageid}`,
    titulo: h.title,
    autor: null,
    idioma: "pt",
    assunto: null,
    fonte: "Wikisource",
    licenca: "Texto livre",
    pagina: `https://pt.wikisource.org/?curid=${h.pageid}`,
    arquivo: null,
  }));
}

async function buscarOpenLibrary(termo) {
  const campos = "key,title,author_name,first_publish_year,ia,public_scan_b";
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(termo)}&limit=10&fields=${campos}`;
  const j = await pegarJSON(url);
  return (j?.docs || [])
    .filter((d) => d?.key && d?.title)
    .map((d) => {
      const scan = d.public_scan_b === true && d.ia?.[0];
      return {
        id: `openlibrary:${d.key}`,
        titulo: String(d.title).trim(),
        autor: nomeDireito(d.author_name?.[0]),
        idioma: null,
        assunto: d.first_publish_year ? `de ${d.first_publish_year}` : null,
        fonte: scan ? "Internet Archive" : "Open Library",
        licenca: null,
        pagina: scan ? `https://archive.org/details/${d.ia[0]}` : `https://openlibrary.org${d.key}`,
        arquivo: null,
      };
    });
}

const chave = (l) => `${l.titulo.toLowerCase().replace(/\s+/g, " ").trim()}|${(l.autor || "").toLowerCase()}`;

/**
 * Pergunta aos quatro ao mesmo tempo e junta, sem repetir.
 *
 * O Gutenberg vem primeiro porque é o único que entrega o arquivo — é o que a
 * pessoa consegue ler agora, e não só uma ficha para olhar.
 */
async function buscarLivros(termo, limite = 12) {
  const t = String(termo || "").trim();
  if (t.length < 2) return [];

  const partes = await Promise.all([
    buscarGutenberg(t).catch(() => []),
    buscarArchive(t).catch(() => []),
    buscarWikisource(t).catch(() => []),
    buscarOpenLibrary(t).catch(() => []),
  ]);

  const vistos = new Set();
  const juntos = [];
  for (const lista of partes) {
    for (const l of lista) {
      const k = chave(l);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      juntos.push(l);
    }
  }
  return juntos.slice(0, limite);
}

/** Um título específico, pelo id que a busca devolveu. */
async function acharLivro(id) {
  const bruto = String(id || "");
  const corte = bruto.indexOf(":");
  if (corte < 0) return null;
  const catalogo = bruto.slice(0, corte);
  const ref = bruto.slice(corte + 1);
  if (!ref) return null;

  if (catalogo === "gutenberg") {
    const numero = ref.replace(/\D/g, "");
    if (!numero) return null;
    return deGutenberg(await pegarJSON(`https://gutendex.com/books/${numero}`));
  }
  if (catalogo === "archive") {
    const j = await pegarJSON(`https://archive.org/metadata/${encodeURIComponent(ref)}`);
    if (!j?.metadata?.title) return null;
    return {
      id: bruto,
      titulo: String(j.metadata.title).trim(),
      autor: nomeDireito(j.metadata.creator),
      idioma: null,
      assunto: null,
      fonte: "Internet Archive",
      licenca: j.metadata.licenseurl || null,
      pagina: `https://archive.org/details/${ref}`,
      arquivo: null,
    };
  }
  if (catalogo === "wikisource") {
    return { id: bruto, titulo: "Texto no Wikisource", autor: null, idioma: "pt", assunto: null,
             fonte: "Wikisource", licenca: "Texto livre", pagina: `https://pt.wikisource.org/?curid=${ref}`, arquivo: null };
  }
  if (catalogo === "openlibrary") {
    const caminho = ref.startsWith("/") ? ref : `/${ref}`;
    const j = await pegarJSON(`https://openlibrary.org${caminho}.json`);
    if (!j?.title) return null;
    return { id: bruto, titulo: j.title, autor: null, idioma: null, assunto: null,
             fonte: "Open Library", licenca: null, pagina: `https://openlibrary.org${caminho}`, arquivo: null };
  }
  return null;
}

export { buscarLivros, acharLivro };
