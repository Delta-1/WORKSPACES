"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarDays, ChevronRight, CircleDot, ExternalLink, Globe2, ListFilter,
  LocateFixed, RefreshCw, Satellite, Search, X,
  type LucideIcon,
} from "lucide-react";
import {
  coordinateLabel, formatWorldDate, worldCategoryMeta, type WorldEvent, type WorldFeed,
} from "@/lib/world-data";

const DAYS = [7, 30, 90, 365];

function pointFor(event: WorldEvent) {
  if (!event.coordinates) return null;
  return {
    x: ((event.coordinates.longitude + 180) / 360) * 1000,
    y: ((90 - event.coordinates.latitude) / 180) * 500,
  };
}

function WorldMap({ events, selected, onSelect }: { events: WorldEvent[]; selected: string | null; onSelect: (event: WorldEvent) => void }) {
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-2xl border border-cyan-300/10 bg-[#06101b] sm:min-h-[390px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.08),transparent_55%)]" />
      <svg viewBox="0 0 1000 500" className="absolute inset-0 h-full w-full" role="img" aria-label="Mapa mundial de eventos naturais">
        <defs>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#183b4d" /><stop offset="1" stopColor="#10283a" /></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {[-120, -60, 0, 60, 120].map((longitude) => <line key={`lon-${longitude}`} x1={((longitude + 180) / 360) * 1000} y1="0" x2={((longitude + 180) / 360) * 1000} y2="500" stroke="#7dd3fc" strokeOpacity=".07" />)}
        {[-60, -30, 0, 30, 60].map((latitude) => <line key={`lat-${latitude}`} x1="0" y1={((90 - latitude) / 180) * 500} x2="1000" y2={((90 - latitude) / 180) * 500} stroke="#7dd3fc" strokeOpacity=".07" />)}
        <g fill="url(#land)" stroke="#2b6071" strokeWidth="1.5" opacity=".95">
          <path d="M55 112 L106 78 180 72 235 92 270 132 249 166 211 174 189 208 151 211 123 184 82 170 62 141Z" />
          <path d="M208 216 L263 229 294 278 284 333 257 398 230 438 214 381 190 323 183 270Z" />
          <path d="M415 103 L465 86 534 95 556 122 523 143 481 136 452 149 416 132Z" />
          <path d="M460 157 L525 162 563 210 548 282 512 344 470 326 444 269 427 211Z" />
          <path d="M536 104 L646 71 768 88 890 121 929 162 880 199 808 183 755 213 686 190 628 198 585 164 534 145Z" />
          <path d="M790 292 L842 273 902 299 913 345 866 372 811 354 779 320Z" />
          <path d="M311 45 L351 28 383 48 362 79 322 81Z" />
          <path d="M927 205 L947 198 958 221 943 238Z" />
        </g>
        {events.map((event) => {
          const point = pointFor(event);
          if (!point) return null;
          const meta = worldCategoryMeta(event.category);
          const active = selected === event.id;
          return (
            <g key={event.id} role="button" tabIndex={0} aria-label={event.title} onClick={() => onSelect(event)} onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") onSelect(event); }} className="cursor-pointer outline-none">
              <circle cx={point.x} cy={point.y} r={active ? 15 : 10} fill={meta.color} opacity=".14" className="animate-pulse" />
              <circle cx={point.x} cy={point.y} r={active ? 6 : 4} fill={meta.color} stroke="#fff" strokeOpacity={active ? ".9" : ".35"} strokeWidth={active ? 2 : 1} filter={active ? "url(#glow)" : undefined} />
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 rounded-lg border border-white/8 bg-black/45 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md">
        Selecione um ponto para ver os detalhes
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> dados atuais
      </div>
    </div>
  );
}

export default function WorldTab() {
  const [feed, setFeed] = useState<WorldFeed | null>(null);
  const [availableCategories, setAvailableCategories] = useState<WorldFeed["categories"]>([]);
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorldEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: "open", days: String(days), limit: "100" });
      if (category) params.set("category", category);
      const response = await fetch(`/api/world/events?${params.toString()}`);
      if (!response.ok) throw new Error("Não foi possível consultar a NASA agora.");
      const next = await response.json() as WorldFeed;
      setFeed(next);
      if (!category) setAvailableCategories(next.categories);
      setSelected((current) => current ? next.events.find((event) => event.id === current.id) ?? null : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar os dados.");
    } finally {
      setLoading(false);
    }
  }, [category, days]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const events = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return feed?.events ?? [];
    return (feed?.events ?? []).filter((event) => `${event.title} ${event.description ?? ""} ${event.category.title}`.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [feed, query]);

  const summaryCards: Array<{ label: string; value: string | number; Icon: LucideIcon; color: string }> = [
    { label: "Eventos ativos", value: feed?.summary.active ?? "—", Icon: Activity, color: "text-emerald-300" },
    { label: "Categorias", value: feed?.summary.categories ?? "—", Icon: ListFilter, color: "text-violet-300" },
    { label: "No mapa", value: feed?.summary.withLocation ?? "—", Icon: LocateFixed, color: "text-cyan-300" },
    { label: "Fonte", value: "NASA", Icon: Satellite, color: "text-sky-300" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300"><Globe2 size={23} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">Mundo</h3>
              <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">dados</span>
            </div>
            <p className="text-[11px] text-slate-400">Radar global de eventos naturais · primeira fonte: NASA EONET</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://eonet.gsfc.nasa.gov/" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] text-slate-400 transition hover:text-white">NASA EONET <ExternalLink size={12} /></a>
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryCards.map(({ label, value, Icon, color }) => (
            <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <div className={`mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 ${color}`}><Icon size={11} /> {label}</div>
              <p className="font-mono text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evento, local ou categoria…" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-cyan-400/40" />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <CalendarDays size={13} className="mx-1 shrink-0 text-slate-500" />
            {DAYS.map((value) => <button key={value} onClick={() => setDays(value)} className={`shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-semibold transition ${days === value ? "bg-cyan-400/15 text-cyan-200" : "text-slate-500 hover:bg-white/5 hover:text-white"}`}>{value === 365 ? "1 ano" : `${value} dias`}</button>)}
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-white/10 bg-[#0b1420] px-3 py-2.5 text-[11px] text-slate-300 outline-none focus:border-cyan-400/40">
            <option value="">Todas as categorias</option>
            {availableCategories.map((item) => <option key={item.id} value={item.id}>{worldCategoryMeta(item).label} ({item.count})</option>)}
          </select>
        </div>

        {error && (
          <div className="grid min-h-[340px] place-items-center rounded-2xl border border-dashed border-rose-400/20 bg-rose-400/[0.03] p-8 text-center">
            <div><CircleDot size={28} className="mx-auto mb-3 text-rose-300" /><p className="text-sm font-semibold">Dados mundiais indisponíveis</p><p className="mt-1 text-xs text-slate-500">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-white/5 px-4 py-2 text-xs hover:bg-white/10">Tentar novamente</button></div>
          </div>
        )}

        {!error && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]">
            <div className="space-y-3">
              <WorldMap events={events} selected={selected?.id ?? null} onSelect={setSelected} />
              <div className="flex flex-wrap gap-2">
                {availableCategories.slice(0, 8).map((item) => {
                  const meta = worldCategoryMeta(item);
                  return <button key={item.id} onClick={() => setCategory(category === item.id ? "" : item.id)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold transition ${category === item.id ? "border-white/25 bg-white/10 text-white" : "border-white/8 text-slate-500 hover:text-slate-300"}`}><span style={{ color: meta.color }}>{meta.emoji}</span> {meta.label} <span className="font-mono opacity-60">{item.count}</span></button>;
                })}
              </div>
            </div>

            <div className="min-h-[390px] overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <div><p className="text-xs font-bold">Eventos recentes</p><p className="text-[9px] text-slate-500">{events.length} resultados no período</p></div>
                {selected && <button onClick={() => setSelected(null)} aria-label="Fechar detalhes" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"><X size={14} /></button>}
              </div>

              {selected ? (
                <div className="p-4">
                  {(() => {
                    const meta = worldCategoryMeta(selected.category);
                    return <>
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}><span>{meta.emoji}</span>{meta.label}</div>
                      <h4 className="text-lg font-bold leading-snug">{selected.title}</h4>
                      {selected.description && <p className="mt-3 text-xs leading-relaxed text-slate-400">{selected.description}</p>}
                      <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-black/15 p-3 text-[11px] text-slate-400">
                        <p className="flex items-center gap-2"><CalendarDays size={12} className="text-cyan-300" /> {formatWorldDate(selected.date, true)}</p>
                        <p className="flex items-center gap-2"><LocateFixed size={12} className="text-cyan-300" /> {coordinateLabel(selected)}</p>
                        {selected.magnitude && <p className="flex items-center gap-2"><Activity size={12} className="text-cyan-300" /> Intensidade: {selected.magnitude.value} {selected.magnitude.unit ?? ""}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selected.sources.filter((source) => source.url).map((source) => <a key={`${source.id}-${source.url}`} href={source.url!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-[10px] font-semibold text-cyan-100">Abrir fonte {source.id} <ExternalLink size={11} /></a>)}
                      </div>
                    </>;
                  })()}
                </div>
              ) : (
                <div className="max-h-[460px] overflow-y-auto p-2">
                  {loading && Array.from({ length: 6 }).map((_, index) => <div key={index} className="m-2 h-16 animate-pulse rounded-xl bg-white/5" />)}
                  {!loading && events.length === 0 && <p className="p-8 text-center text-xs text-slate-500">Nenhum evento encontrado com esses filtros.</p>}
                  {!loading && events.map((event) => {
                    const meta = worldCategoryMeta(event.category);
                    return (
                      <button key={event.id} onClick={() => setSelected(event)} className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/5">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${meta.color}16`, color: meta.color }}>{meta.emoji}</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-slate-200">{event.title}</p><p className="mt-0.5 text-[9px] text-slate-500">{meta.label} · {formatWorldDate(event.date)}</p></div>
                        <ChevronRight size={13} className="text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[9px] text-slate-600">
          <span>Metadados quase em tempo real. Confirme alertas críticos nas autoridades locais.</span>
          <span className="shrink-0">NASA EONET API v3</span>
        </div>
      </div>
    </div>
  );
}
