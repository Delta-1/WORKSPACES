"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Globe2, Newspaper, RefreshCw } from "lucide-react";
import { formatNewsTime, sourceColor, type CountryNewsFeed } from "@/lib/world-data";
import type { AppLanguage } from "@/lib/language";

export default function WorldPulse({
  variant = "home",
  language,
  onOpen,
}: {
  variant?: "home" | "tv";
  language: AppLanguage;
  onOpen?: () => void;
}) {
  const [feed, setFeed] = useState<CountryNewsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams({ country: "BR", mode: "language", language, limit: variant === "tv" ? "12" : "8" });
      const response = await fetch(`/api/world/news?${params.toString()}`);
      if (!response.ok) throw new Error("news unavailable");
      setFeed(await response.json() as CountryNewsFeed);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [language, variant]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
    };
  }, [load]);

  const articles = feed?.articles.slice(0, variant === "tv" ? 5 : 4) ?? [];

  if (variant === "tv") {
    return (
      <section className="w-full overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#07111c]/92 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Globe2 size={17} /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Mundo agora</p>
            <p className="text-[9px] text-slate-500">Principais notícias do Brasil</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[9px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> ATUALIZADO
          </div>
        </div>
        <div className="grid min-h-[82px] grid-cols-5 divide-x divide-white/8">
          {loading && Array.from({ length: 5 }).map((_, index) => <div key={index} className="m-3 animate-pulse rounded-xl bg-white/5" />)}
          {!loading && error && <p className="col-span-5 grid place-items-center text-xs text-slate-500">Noticiário temporariamente indisponível.</p>}
          {!loading && !error && articles.map((article) => (
            <div key={article.id} className="min-w-0 px-3 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: sourceColor(article.source) }}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="truncate">{article.source}</span>
              </div>
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100">{article.title}</p>
              <p className="mt-1 text-[9px] text-slate-500">{formatNewsTime(article.publishedAt, language)}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/[0.08] via-slate-950/40 to-indigo-500/[0.08] p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300"><Newspaper size={22} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold">Mundo agora</h4>
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> atualizado</span>
            </div>
            <p className="text-[11px] text-slate-400">Manchetes do dia reunidas em um só lugar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} aria-label="Atualizar notícias" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
          {onOpen && <button onClick={onOpen} className="flex items-center gap-1.5 rounded-xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/15">Abrir mapa <ArrowUpRight size={13} /></button>}
        </div>
      </div>

      {loading && <div className="mt-4 h-[96px] animate-pulse rounded-xl bg-white/5" />}
      {!loading && error && <button onClick={() => void load()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-7 text-xs text-slate-500 hover:text-slate-300"><RefreshCw size={14} /> Não foi possível atualizar. Tentar novamente</button>}
      {!loading && !error && feed && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {articles.map((article) => (
            <button key={article.id} onClick={onOpen} className="min-w-0 rounded-xl border border-white/8 bg-black/15 p-3 text-left transition hover:border-white/20 hover:bg-white/5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: sourceColor(article.source) }}><span className="h-1.5 w-1.5 rounded-full bg-current" /><span className="truncate">{article.source}</span></div>
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100">{article.title}</p>
              <p className="mt-1.5 text-[9px] text-slate-500">{formatNewsTime(article.publishedAt, language)}</p>
            </button>
          ))}
        </div>
      )}
      <p className="relative mt-3 text-[9px] text-slate-600">Fontes: G1, Folha, Agência Brasil, Google Notícias e outros veículos.</p>
    </section>
  );
}
