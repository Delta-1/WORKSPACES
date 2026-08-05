"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Library, Loader2, Search } from "lucide-react";
import { CONTRIBUICAO, ORIGEM_ROTULO, reais, type Origem } from "@/lib/bibliopen";

// BIBLIOPEN — o site público da biblioteca.
//
// Fora do app: não pede login para pesquisar, porque uma biblioteca que exige
// cadastro para você olhar a estante não é uma biblioteca.

type Livro = {
  id: string;
  titulo: string;
  titulo_completo: string;
  autor: string | null;
  materia: string | null;
  tipo: string | null;
  ano: number | null;
  idioma: string | null;
  capa_url: string | null;
  origem: Origem;
  fonte: string | null;
  licenca: string | null;
  fonte_url: string | null;
  link_externo: string | null;
  disponivel_no_leitor: boolean;
};

const CorOrigem: Record<Origem, string> = {
  aberto: "bg-emerald-500/15 text-emerald-300 border-emerald-700/40",
  proprio: "bg-sky-500/15 text-sky-300 border-sky-700/40",
  link: "bg-zinc-500/15 text-zinc-300 border-zinc-600/40",
};

export default function BibliOpen() {
  const [q, setQ] = useState("");
  const [materia, setMateria] = useState("");
  const [livros, setLivros] = useState<Livro[]>([]);
  const [materias, setMaterias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscado, setBuscado] = useState(false);

  const buscar = useCallback(async (termo: string, mat: string) => {
    const qs = new URLSearchParams({ limite: "40" });
    if (termo) qs.set("q", termo);
    if (mat) qs.set("materia", mat);
    try {
      const res = await fetch(`/api/bibli/buscar?${qs}`);
      const json = await res.json();
      return (json.livros ?? []) as Livro[];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const iniciais = await buscar("", "");
      if (!vivo) return;
      setLivros(iniciais);
      setMaterias([...new Set(iniciais.map((l) => l.materia).filter((m): m is string => !!m))].sort());
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [buscar]);

  async function pesquisar(e?: React.FormEvent) {
    e?.preventDefault();
    setCarregando(true);
    setBuscado(true);
    setLivros(await buscar(q, materia));
    setCarregando(false);
  }

  return (
    <div className="min-h-screen bg-[#0B132B] text-gray-100">
      <header className="border-b border-white/10 bg-[#0B132B]/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-900/60 grid place-items-center shrink-0">
              <Library size={20} className="text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight">BibliOpen</h1>
              <p className="text-[11px] text-gray-400">Biblioteca aberta de medicina · acesso rápido, sem enrolação</p>
            </div>
          </div>

          <form onSubmit={pesquisar} className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Livro, autor ou assunto — ex.: Guyton, anatomia do coração…"
                className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <select
              value={materia}
              onChange={(e) => setMateria(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-xl px-2 py-2.5 text-xs outline-none cursor-pointer max-w-[140px]"
            >
              <option value="">Toda matéria</option>
              {materias.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 rounded-xl cursor-pointer">
              Buscar
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {carregando ? (
          <div className="flex justify-center py-20 text-gray-500"><Loader2 size={22} className="animate-spin" /></div>
        ) : livros.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-gray-400">
              {buscado ? "Não achei nada com esse termo. Tente pelo nome do autor ou por outra grafia." : "O acervo ainda está vazio."}
            </p>
          </div>
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
                    {l.materia && <span className="text-[10px] text-gray-500 shrink-0">{l.materia}</span>}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold leading-snug">{l.titulo_completo}</h2>
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
                    // Fonte externa: mandamos para a origem, sem cobrar nada. O
                    // BibliOpen indexa e indica; distribuir o que não é nosso, não.
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
      </main>

      <footer className="border-t border-white/10 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-6 text-[11px] text-gray-500 space-y-1.5">
          <p>
            <b className="text-gray-300">Como o BibliOpen se mantém:</b> a leitura no nosso leitor é sustentada por
            contribuição — a partir de {reais(CONTRIBUICAO.avulsaCents)} por livro, ou {reais(CONTRIBUICAO.mensalCents)} no
            passe mensal, que abre o acervo inteiro por 30 dias.
          </p>
          <p>
            O acervo é formado por obras de <b>acesso aberto</b> (domínio público, Creative Commons, open access) e por
            material <b>próprio ou cedido pelos autores</b>. Títulos de fontes externas são apenas indexados: o acesso a
            eles é direto na origem e nunca é cobrado por aqui.
          </p>
        </div>
      </footer>
    </div>
  );
}
