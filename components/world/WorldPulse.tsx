"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, Globe2, RefreshCw, Satellite } from "lucide-react";
import { formatWorldDate, worldCategoryMeta, type WorldFeed } from "@/lib/world-data";

export default function WorldPulse({
  variant = "home",
  onOpen,
}: {
  variant?: "home" | "tv";
  onOpen?: () => void;
}) {
  const [feed, setFeed] = useState<WorldFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch(`/api/world/events?status=open&days=30&limit=${variant === "tv" ? 14 : 10}`);
      if (!response.ok) throw new Error("world feed unavailable");
      setFeed(await response.json() as WorldFeed);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [variant]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
    };
  }, [load]);

  const events = feed?.events.slice(0, variant === "tv" ? 5 : 4) ?? [];

  if (variant === "tv") {
    return (
      <section className="w-full overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#07111c]/90 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><Globe2 size={17} /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Pulso do mundo</p>
            <p className="text-[9px] text-slate-500">Eventos naturais · NASA EONET</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[9px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> AO VIVO
          </div>
        </div>
        <div className="grid min-h-[82px] grid-cols-5 divide-x divide-white/8">
          {loading && Array.from({ length: 5 }).map((_, index) => <div key={index} className="m-3 animate-pulse rounded-xl bg-white/5" />)}
          {!loading && error && <p className="col-span-5 grid place-items-center text-xs text-slate-500">Fonte mundial temporariamente indisponível.</p>}
          {!loading && !error && events.map((event) => {
            const meta = worldCategoryMeta(event.category);
            return (
              <div key={event.id} className="min-w-0 px-3 py-3">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                  <span>{meta.emoji}</span><span className="truncate">{meta.label}</span>
                </div>
                <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100">{event.title}</p>
                <p className="mt-1 text-[9px] text-slate-500">{formatWorldDate(event.date)}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-500/[0.08] via-slate-950/40 to-indigo-500/[0.08] p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300">
            <Globe2 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold">Pulso do mundo</h4>
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> ao vivo
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Eventos naturais relevantes em atualização contínua</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} aria-label="Atualizar dados mundiais" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {onOpen && (
            <button onClick={onOpen} className="flex items-center gap-1.5 rounded-xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/15">
              Explorar mapa <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      </div>

      {loading && <div className="mt-4 h-[92px] animate-pulse rounded-xl bg-white/5" />}
      {!loading && error && (
        <button onClick={() => void load()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-7 text-xs text-slate-500 hover:text-slate-300">
          <RefreshCw size={14} /> Não foi possível atualizar. Tentar novamente
        </button>
      )}
      {!loading && !error && feed && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[170px_minmax(0,1fr)]">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500"><Activity size={10} /> ativos</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-white">{feed.summary.active}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-slate-500"><Satellite size={10} /> categorias</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-white">{feed.summary.categories}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">com posição</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-white">{feed.summary.withLocation}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {events.map((event) => {
              const meta = worldCategoryMeta(event.category);
              return (
                <button key={event.id} onClick={onOpen} className="min-w-0 rounded-xl border border-white/8 bg-black/15 p-3 text-left transition hover:border-white/20 hover:bg-white/5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                    <span>{meta.emoji}</span><span className="truncate">{meta.label}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-100">{event.title}</p>
                  <p className="mt-1.5 text-[9px] text-slate-500">{formatWorldDate(event.date)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="relative mt-3 text-[9px] text-slate-600">Fonte: NASA Earth Observatory Natural Event Tracker (EONET v3)</p>
    </section>
  );
}
