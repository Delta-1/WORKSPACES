"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json";
import isoCountries from "i18n-iso-countries";
import ptLocale from "i18n-iso-countries/langs/pt.json";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  ArrowUpRight, ExternalLink, Globe2, Languages, Loader2, MapPin, Newspaper,
  RefreshCw, Search, SlidersHorizontal,
} from "lucide-react";
import {
  countryFlag, formatNewsTime, sourceColor, type CountryNewsFeed, type NewsArticle, type NewsMode,
} from "@/lib/world-data";
import { languageConfig, type AppLanguage } from "@/lib/language";

isoCountries.registerLocale(ptLocale);

type CountryShape = { code: string; name: string; path: string };

function buildCountryShapes(): { countries: CountryShape[]; graticule: string } {
  const topology = worldTopology as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
  const projection = geoNaturalEarth1().fitExtent([[12, 12], [988, 488]], collection);
  const path = geoPath(projection);
  const countries = collection.features.flatMap((item): CountryShape[] => {
    const numeric = String(item.id ?? "").padStart(3, "0");
    const code = isoCountries.numericToAlpha2(numeric);
    const shape = path(item);
    if (!code || !shape || code === "AQ") return [];
    return [{ code, name: isoCountries.getName(code, "pt") || item.properties.name, path: shape }];
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { countries, graticule: path(geoGraticule10()) || "" };
}

function CountryMap({ countries, graticule, selected, onSelect }: { countries: CountryShape[]; graticule: string; selected: string; onSelect: (code: string) => void }) {
  const [hovered, setHovered] = useState<CountryShape | null>(null);
  return (
    <div className="relative min-h-[330px] overflow-hidden rounded-2xl border border-cyan-300/10 bg-[#06101b] sm:min-h-[430px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.1),transparent_55%)]" />
      <svg viewBox="0 0 1000 500" className="absolute inset-0 h-full w-full" role="img" aria-label="Mapa-múndi com países selecionáveis">
        <path d={graticule} fill="none" stroke="#7dd3fc" strokeOpacity=".07" strokeWidth=".7" />
        {countries.map((country) => {
          const active = country.code === selected;
          const hover = country.code === hovered?.code;
          return (
            <path
              key={country.code}
              d={country.path}
              role="button"
              tabIndex={0}
              aria-label={`Selecionar ${country.name}`}
              onClick={() => onSelect(country.code)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(country.code); }}
              onMouseEnter={() => setHovered(country)}
              onMouseLeave={() => setHovered(null)}
              fill={active ? "#22d3ee" : hover ? "#1d6074" : "#153547"}
              stroke={active ? "#a5f3fc" : "#2a5668"}
              strokeWidth={active ? 1.8 : .7}
              className="cursor-pointer outline-none transition-colors duration-150"
            />
          );
        })}
      </svg>
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-semibold text-slate-200 backdrop-blur-md">
        <MapPin size={12} className="text-cyan-300" /> {hovered ? `${countryFlag(hovered.code)} ${hovered.name}` : "Clique em qualquer país"}
      </div>
      <div className="absolute bottom-3 left-3 rounded-lg border border-white/8 bg-black/45 px-2.5 py-1.5 text-[9px] text-slate-400 backdrop-blur-md">Cada país abre seu noticiário do dia</div>
    </div>
  );
}

function ArticleCard({ article, language, featured = false }: { article: NewsArticle; language: AppLanguage; featured?: boolean }) {
  const color = sourceColor(article.source);
  return (
    <a href={article.url} target="_blank" rel="noreferrer" className={`group block rounded-2xl border border-white/8 bg-white/[0.025] transition hover:border-white/20 hover:bg-white/[0.045] ${featured ? "p-5" : "p-3.5"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color }}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{article.source}</span></span>
        <span className="shrink-0 text-[9px] text-slate-600">{formatNewsTime(article.publishedAt, language)}</span>
      </div>
      <h4 className={`${featured ? "text-lg sm:text-xl" : "text-[12px]"} font-bold leading-snug text-slate-100 group-hover:text-white`}>{article.title}</h4>
      {featured && article.description && <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-400">{article.description}</p>}
      <span className="mt-3 flex items-center gap-1 text-[9px] font-semibold text-cyan-300 opacity-0 transition group-hover:opacity-100">Ler na fonte <ArrowUpRight size={10} /></span>
    </a>
  );
}

export default function WorldTab({ language }: { language: AppLanguage }) {
  const map = useMemo(() => buildCountryShapes(), []);
  const [country, setCountry] = useState("BR");
  const [mode, setMode] = useState<NewsMode>("language");
  const [feed, setFeed] = useState<CountryNewsFeed | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedCountry = map.countries.find((item) => item.code === country) ?? map.countries.find((item) => item.code === "BR")!;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ country, mode, language, limit: "50" });
      const response = await fetch(`/api/world/news?${params.toString()}`);
      if (!response.ok) throw new Error("O noticiário deste país não respondeu agora.");
      setFeed(await response.json() as CountryNewsFeed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar as notícias.");
    } finally {
      setLoading(false);
    }
  }, [country, language, mode]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const chooseCountry = (code: string) => {
    setCountry(code);
    setSource("");
    setQuery("");
  };

  const chooseMode = (next: NewsMode) => {
    setMode(next);
    setSource("");
    setQuery("");
  };

  const articles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language);
    return (feed?.articles ?? []).filter((article) => {
      if (source && article.source !== source) return false;
      return !normalized || `${article.title} ${article.description ?? ""} ${article.source}`.toLocaleLowerCase(language).includes(normalized);
    });
  }, [feed, language, query, source]);

  const languageMeta = languageConfig(language);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300"><Globe2 size={23} /></div>
          <div>
            <div className="flex items-center gap-2"><h3 className="text-lg font-bold">Mundo</h3><span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">notícias</span></div>
            <p className="text-[11px] text-slate-400">Escolha um país e acompanhe as principais notícias do dia</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500/15 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-3 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <MapPin size={14} className="shrink-0 text-cyan-300" />
            <select value={country} onChange={(event) => chooseCountry(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-200 outline-none">
              {map.countries.map((item) => <option key={item.code} value={item.code} className="bg-[#0b1420]">{countryFlag(item.code)} {item.name}</option>)}
            </select>
          </label>
          <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
            <button onClick={() => chooseMode("local")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition ${mode === "local" ? "bg-cyan-400/15 text-cyan-100" : "text-slate-500 hover:text-white"}`}><Newspaper size={12} /> Imprensa local</button>
            <button onClick={() => chooseMode("language")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition ${mode === "language" ? "bg-cyan-400/15 text-cyan-100" : "text-slate-500 hover:text-white"}`}><Languages size={12} /> No meu idioma</button>
          </div>
          <div className="relative min-w-0 lg:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nas manchetes…" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-cyan-400/40" />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-600"><SlidersHorizontal size={10} /> Fontes</span>
          <button onClick={() => setSource("")} className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold transition ${!source ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-200" : "border-white/8 text-slate-500 hover:text-white"}`}>Todas</button>
          {(feed?.sources ?? []).map((item) => <button key={item.name} onClick={() => setSource(source === item.name ? "" : item.name)} className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold transition ${source === item.name ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-200" : "border-white/8 text-slate-500 hover:text-white"}`}>{item.name} <span className="font-mono opacity-60">{item.count}</span></button>)}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,.82fr)]">
          <div className="space-y-3">
            <CountryMap countries={map.countries} graticule={map.graticule} selected={country} onSelect={chooseCountry} />
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
              <div><p className="text-sm font-bold">{countryFlag(country)} {selectedCountry.name}</p><p className="text-[10px] text-slate-500">{mode === "local" ? `Imprensa local traduzida para ${languageMeta.shortLabel}` : `Cobertura internacional em ${languageMeta.shortLabel}`}</p></div>
              <p className="font-mono text-xs text-cyan-300">{feed?.articles.length ?? 0} matérias</p>
            </div>
          </div>

          <div className="min-h-[430px] overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><p className="text-xs font-bold">Notícias de hoje</p><p className="text-[9px] text-slate-500">{selectedCountry.name} · atualização automática</p></div>{feed?.partial && <span className="text-[9px] text-amber-300">Uma fonte está lenta</span>}</div>
            <div className="max-h-[620px] overflow-y-auto p-3">
              {loading && <div className="grid min-h-[360px] place-items-center"><div className="text-center"><Loader2 size={24} className="mx-auto animate-spin text-cyan-300" /><p className="mt-2 text-xs text-slate-500">Buscando notícias em {selectedCountry.name}…</p></div></div>}
              {!loading && error && <div className="grid min-h-[360px] place-items-center p-8 text-center"><div><Newspaper size={28} className="mx-auto mb-3 text-slate-600" /><p className="text-sm font-semibold">Noticiário indisponível</p><p className="mt-1 text-xs text-slate-500">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-white/5 px-4 py-2 text-xs hover:bg-white/10">Tentar novamente</button></div></div>}
              {!loading && !error && articles.length === 0 && <p className="p-10 text-center text-xs text-slate-500">Nenhuma matéria corresponde aos filtros.</p>}
              {!loading && !error && articles.length > 0 && <div className="space-y-2.5"><ArticleCard article={articles[0]} language={language} featured />{articles.slice(1).map((article) => <ArticleCard key={article.id} article={article} language={language} />)}</div>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[9px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>O Workspaces exibe títulos e resumos dos feeds; a leitura completa abre no veículo responsável.</span>
          <span className="flex shrink-0 items-center gap-1">Selecione um país no mapa <ExternalLink size={9} /></span>
        </div>
      </div>
    </div>
  );
}
