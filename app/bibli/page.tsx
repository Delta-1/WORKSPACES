"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink, Library, Loader2, Search, X } from "lucide-react";
import { CONTRIBUICAO, ORIGEM_ROTULO, reais, type Origem } from "@/lib/bibliopen";

// BIBLIOPEN — o site público da biblioteca.
//
// Fora do app: não pede login para pesquisar, porque uma biblioteca que exige
// cadastro para você olhar a estante não é uma biblioteca.
//
// A tela abre pela ESTANTE (áreas do conhecimento com a contagem de cada uma),
// não por uma lista de tudo. Com acervo grande, "aqui estão 900 títulos" não
// ajuda ninguém: a pessoa escolhe a área, depois a matéria, e a busca continua
// ali no topo para quem já sabe o que quer.

type Livro = {
  id: string; titulo: string; titulo_completo: string; autor: string | null;
  area: string | null; materia: string | null; tipo: string | null;
  idioma: string | null; origem: Origem; fonte: string | null; licenca: string | null;
  fonte_url: string | null; link_externo: string | null; disponivel_no_leitor: boolean;
};

type Materia = { nome: string; total: number };
type Area = { nome: string; total: number; materias: Materia[] };

const CorOrigem: Record<Origem, string> = {
  aberto: "bg-emerald-500/15 text-emerald-300 border-emerald-700/40",
  proprio: "bg-sky-500/15 text-sky-300 border-sky-700/40",
  link: "bg-zinc-500/15 text-zinc-300 border-zinc-600/40",
};

// Cor por área, para a estante não ser um bloco cinza só.
const CorArea: Record<string, string> = {
  "Saúde": "from-emerald-600/20 to-emerald-900/10 border-emerald-700/30",
  "Exatas": "from-sky-600/20 to-sky-900/10 border-sky-700/30",
  "Humanas": "from-amber-600/20 to-amber-900/10 border-amber-700/30",
  "Direito": "from-red-600/20 to-red-900/10 border-red-700/30",
  "Tecnologia": "from-violet-600/20 to-violet-900/10 border-violet-700/30",
  "Negócios": "from-teal-600/20 to-teal-900/10 border-teal-700/30",
  "Educação": "from-orange-600/20 to-orange-900/10 border-orange-700/30",
};
const corDaArea = (n: string) => CorArea[n] ?? "from-zinc-600/20 to-zinc-900/10 border-zinc-700/30";

export default function BibliOpen() {
  const [q, setQ] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [total, setTotal] = useState(0);
  const [area, setArea] = useState<string | null>(null);
  const [materia, setMateria] = useState<string | null>(null);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);

  // Só busca quando há motivo: termo, área ou matéria. Sem nada, a tela mostra
  // a estante — e nem chega a pedir livros.
  const temFiltro = !!(q.trim() || area || materia);

  const puxar = useCallback(async (termo: string, a: string | null, m: string | null) => {
    const qs = new URLSearchParams({ limite: "50" });
    if (termo.trim()) qs.set("q", termo.trim());
    if (a) qs.set("area", a);
    if (m) qs.set("materia", m);
    try {
      const res = await fetch(`/api/bibli/buscar?${qs}`);
      const json = await res.json();
      return (json.livros ?? []) as Livro[];
    } catch { return []; }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/bibli/areas");
        const json = await res.json();
        if (!vivo) return;
        setAreas(json.areas ?? []);
        setTotal(json.total ?? 0);
      } catch { /* estante vazia */ }
      if (vivo) setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!temFiltro) return; // sem filtro a tela mostra a estante; nem busca
    let vivo = true;
    void (async () => {
      const r = await puxar(q, area, materia);
      if (!vivo) return;
      setLivros(r);
      setBuscando(false);
    })();
    return () => { vivo = false; };
  }, [puxar, q, area, materia, temFiltro]);

  function limpar() {
    setQ(""); setArea(null); setMateria(null); setLivros([]);
  }

  const areaAberta = areas.find((a) => a.nome === area) ?? null;

  return (
    <div className="min-h-screen bg-[#0B132B] text-gray-100">
      <header className="border-b border-white/10 bg-[#0B132B]/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button onClick={limpar} className="flex items-center gap-3 text-left cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-emerald-900/60 grid place-items-center shrink-0">
              <Library size={20} className="text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">BibliOpen</h1>
              <p className="text-[11px] text-gray-400">
                Biblioteca aberta · {total > 0 ? `${total} títulos em ${areas.length} áreas` : "conhecimento sem paywall"}
              </p>
            </div>
          </button>

          <div className="relative mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={q}
              onChange={(e) => { setBuscando(true); setQ(e.target.value); }}
              placeholder="Busque por título, autor ou assunto…"
              className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Onde estou — e como voltar */}
          {(area || materia) && (
            <div className="flex items-center gap-1.5 mt-2.5 text-[11px] flex-wrap">
              <button onClick={limpar} className="text-gray-400 hover:text-white cursor-pointer">Estante</button>
              {area && (
                <>
                  <ChevronRight size={11} className="text-gray-600" />
                  <button
                    onClick={() => setMateria(null)}
                    className={materia ? "text-gray-400 hover:text-white cursor-pointer" : "text-emerald-300 font-semibold"}
                  >
                    {area}
                  </button>
                </>
              )}
              {materia && (
                <>
                  <ChevronRight size={11} className="text-gray-600" />
                  <span className="text-emerald-300 font-semibold">{materia}</span>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {carregando ? (
          <div className="flex justify-center py-20 text-gray-500"><Loader2 size={22} className="animate-spin" /></div>
        ) : !temFiltro ? (
          /* ── A ESTANTE ─────────────────────────────────────────────────── */
          <>
            <h2 className="text-sm font-bold mb-3">Escolha uma área</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {areas.map((a) => (
                <button
                  key={a.nome}
                  onClick={() => setArea(a.nome)}
                  className={`text-left rounded-2xl border bg-gradient-to-br p-4 cursor-pointer hover:brightness-125 transition ${corDaArea(a.nome)}`}
                >
                  <p className="text-base font-bold">{a.nome}</p>
                  <p className="text-[11px] text-gray-300/80 mt-0.5">
                    {a.total} {a.total === 1 ? "título" : "títulos"} · {a.materias.length} {a.materias.length === 1 ? "matéria" : "matérias"}
                  </p>
                  <p className="text-[10px] text-gray-400/70 mt-2 line-clamp-2">
                    {a.materias.slice(0, 4).map((m) => m.nome).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
            {areas.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-16">O acervo ainda está vazio.</p>
            )}
          </>
        ) : (
          <>
            {/* Matérias da área aberta, quando não há busca por texto */}
            {areaAberta && !q.trim() && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setMateria(null)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer ${!materia ? "bg-emerald-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-300"}`}
                >
                  Todas ({areaAberta.total})
                </button>
                {areaAberta.materias.map((m) => (
                  <button
                    key={m.nome}
                    onClick={() => setMateria(m.nome)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-lg cursor-pointer ${materia === m.nome ? "bg-emerald-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-300"}`}
                  >
                    {m.nome} ({m.total})
                  </button>
                ))}
              </div>
            )}

            {buscando ? (
              <div className="flex justify-center py-16 text-gray-500"><Loader2 size={20} className="animate-spin" /></div>
            ) : livros.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-16">
                Nada encontrado. Tente pelo nome do autor ou por outra grafia.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 mb-3">{livros.length} {livros.length === 1 ? "título" : "títulos"}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {livros.map((l) => (
                    <article key={l.id} className="rounded-2xl border border-white/10 bg-white/5 p-3.5 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${CorOrigem[l.origem]}`}>
                          {ORIGEM_ROTULO[l.origem]}
                        </span>
                        {l.materia && <span className="text-[10px] text-gray-500 shrink-0 truncate max-w-[45%]">{l.materia}</span>}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug">{l.titulo_completo}</h3>
                        {l.autor && <p className="text-[11px] text-gray-400 mt-0.5">{l.autor}</p>}
                        {l.licenca && <p className="text-[10px] text-emerald-400/70 mt-1">{l.licenca}</p>}
                      </div>

                      {l.disponivel_no_leitor ? (
                        <Link
                          href={`/bibli/ler/${l.id}`}
                          className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg"
                        >
                          <BookOpen size={13} /> Ler
                        </Link>
                      ) : (
                        // Fonte externa (ou aberto ainda sem PDF anexado): mandamos
                        // para a origem, sem cobrar nada.
                        <a
                          href={l.link_externo || l.fonte_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 py-2 rounded-lg"
                        >
                          <ExternalLink size={13} /> Abrir na fonte
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/10 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-6 text-[11px] text-gray-500 space-y-1.5">
          <p>
            <b className="text-gray-300">Como o BibliOpen se mantém:</b> a leitura no nosso leitor é sustentada por
            contribuição — a partir de {reais(CONTRIBUICAO.avulsaCents)} por obra, ou {reais(CONTRIBUICAO.mensalCents)} no
            passe mensal, que abre o acervo inteiro por 30 dias.
          </p>
          <p>
            O acervo reúne obras de <b>acesso aberto</b> (domínio público, Creative Commons, open access) e material{" "}
            <b>próprio ou cedido pelos autores</b>. Títulos de fontes externas são apenas indexados: o acesso a eles é
            direto na origem e nunca é cobrado por aqui.
          </p>
        </div>
      </footer>
    </div>
  );
}
