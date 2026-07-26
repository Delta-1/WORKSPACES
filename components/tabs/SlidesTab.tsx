"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Presentation, Plus, Trash2, ArrowLeft, Sparkles, Loader2, FileDown, Printer, Save,
  ChevronUp, ChevronDown, Palette, Wand2,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import type { Deck, Slide } from "@/lib/studio-pptx";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Row = { id: string; title: string; content: string | null; kind: string; updated_at: string; meta?: { tema?: string } | null };

const THEMES: { id: string; label: string; bg: string; title: string; text: string; accent: string }[] = [
  { id: "azul", label: "Azul", bg: "#0B1220", title: "#fff", text: "#CBD5E1", accent: "#3B82F6" },
  { id: "claro", label: "Claro", bg: "#fff", title: "#0F172A", text: "#334155", accent: "#2563EB" },
  { id: "roxo", label: "Roxo", bg: "#1E1B4B", title: "#fff", text: "#DDD6FE", accent: "#A78BFA" },
  { id: "verde", label: "Verde", bg: "#052E24", title: "#fff", text: "#BBF7D0", accent: "#10B981" },
  { id: "grafite", label: "Grafite", bg: "#111318", title: "#fff", text: "#D1D5DB", accent: "#F59E0B" },
];
const themeOf = (id?: string) => THEMES.find((t) => t.id === id) || THEMES[0];

export default function SlidesTab({ profile }: { profile: Profile | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("studio_documents").select("*").eq("kind", "presentation").order("updated_at", { ascending: false });
    setRows((data as Row[]) ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!supabase) return;
    const deck: Deck = { titulo: "Nova apresentação", tema: "azul", slides: [{ titulo: "Título da apresentação", topicos: ["Subtítulo"], nota: "" }] };
    const { data } = await supabase.from("studio_documents").insert({
      company_id: companyId, created_by: profile?.id ?? null, kind: "presentation",
      title: "Nova apresentação", template: "azul", content: JSON.stringify(deck), meta: { tema: "azul" },
    }).select("*").single();
    if (data) { await load(); setOpen(data as Row); }
  }
  async function remove(id: string) {
    if (!supabase || !confirm("Excluir esta apresentação?")) return;
    await supabase.from("studio_documents").delete().eq("id", id); load();
  }

  if (open) return <SlideEditor row={open} onClose={() => { setOpen(null); load(); }} />;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><Presentation className="text-amber-400" size={20} /> Apresentações</h3>
        <button onClick={create} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><Plus size={14} /> Nova apresentação</button>
      </div>
      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">Crie slides com a Nina, edite e exporte em <b>.pptx</b> (PowerPoint) e <b>PDF</b>. Sem API externa.</p>
      <div className="flex-1 overflow-y-auto custom-scroll">
        {loading ? <p className="text-sm text-gray-500 p-2">Carregando…</p> : rows.length === 0 ? (
          <p className="text-sm text-gray-500 p-2">Nenhuma apresentação ainda.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => {
              const th = themeOf(r.meta?.tema);
              return (
                <div key={r.id} onClick={() => setOpen(r)} className="cursor-pointer rounded-2xl border border-white/10 overflow-hidden hover:border-amber-500/40 transition">
                  <div className="h-24 flex items-center justify-center text-sm font-bold px-3 text-center" style={{ background: th.bg, color: th.title, borderBottom: `4px solid ${th.accent}` }}>{r.title}</div>
                  <div className="p-3 bg-white/5 flex items-center justify-between">
                    <p className="text-[10px] text-gray-500">{new Date(r.updated_at).toLocaleDateString("pt-BR")}</p>
                    <span onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SlideEditor({ row, onClose }: { row: Row; onClose: () => void }) {
  const parseDeck = (): Deck => { try { const d = JSON.parse(row.content || "{}"); return { titulo: d.titulo || row.title, tema: d.tema || "azul", slides: Array.isArray(d.slides) && d.slides.length ? d.slides : [{ titulo: "Título", topicos: [], nota: "" }] }; } catch { return { titulo: row.title, tema: "azul", slides: [{ titulo: "Título", topicos: [], nota: "" }] }; } };
  const [deck, setDeck] = useState<Deck>(parseDeck);
  const [cur, setCur] = useState(0);
  const [title, setTitle] = useState(row.title);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showNina, setShowNina] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const th = themeOf(deck.tema);

  const doSave = useCallback(async (d: Deck, t: string) => {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("studio_documents").update({ title: t.trim() || "Apresentação", content: JSON.stringify(d), template: d.tema, meta: { tema: d.tema }, updated_at: new Date().toISOString() }).eq("id", row.id);
    setSaving(false); setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [row.id]);
  function schedule(d: Deck, t: string) { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => doSave(d, t), 1000); }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function update(mut: (d: Deck) => Deck) { setDeck((prev) => { const next = mut(structuredClone(prev)); schedule(next, title); return next; }); }
  function patchSlide(i: number, up: Partial<Slide>) { update((d) => { d.slides[i] = { ...d.slides[i], ...up }; return d; }); }
  function addSlide() { update((d) => { d.slides.splice(cur + 1, 0, { titulo: "Novo slide", topicos: ["Tópico"], nota: "" }); return d; }); setCur((c) => c + 1); }
  function removeSlide(i: number) { if (deck.slides.length <= 1) return; update((d) => { d.slides.splice(i, 1); return d; }); setCur((c) => Math.max(0, Math.min(c, deck.slides.length - 2))); }
  function moveSlide(i: number, dir: -1 | 1) { const j = i + dir; if (j < 0 || j >= deck.slides.length) return; update((d) => { [d.slides[i], d.slides[j]] = [d.slides[j], d.slides[i]]; return d; }); setCur(j); }

  async function exportPptx() {
    if (exporting) return; setExporting(true);
    try {
      const { buildPptxBlob } = await import("@/lib/studio-pptx");
      const blob = await buildPptxBlob(deck);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title.slice(0, 60) || "apresentacao"}.pptx`; a.click(); URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }
  function exportPdf() {
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const slidesHtml = deck.slides.map((s, i) => `<section class="slide"><div class="bar"></div>${i === 0
      ? `<div class="cover"><h1>${esc(s.titulo)}</h1><p>${esc((s.topicos || []).join("  •  "))}</p></div>`
      : `<h2>${esc(s.titulo)}</h2><ul>${(s.topicos || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`}</section>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}
      .slide{width:100vw;height:100vh;background:${th.bg};color:${th.text};padding:6vh 7vw;page-break-after:always;position:relative;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
      .bar{position:absolute;top:0;left:0;right:0;height:1.5vh;background:${th.accent}}
      h1{color:${th.title};font-size:6vh;text-align:center;margin:0}h2{color:${th.title};font-size:4.5vh;margin:0 0 3vh}
      .cover{text-align:center}.cover p{font-size:2.6vh;margin-top:2vh}
      ul{font-size:3vh;line-height:1.8;margin:0;padding-left:5vw}</style></head>
      <body>${slidesHtml}<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }

  const s = deck.slides[cur] || deck.slides[0];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 flex-wrap">
        <button onClick={async () => { await doSave(deck, title); onClose(); }} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(deck, e.target.value); }} className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-white/20 px-1 min-w-[120px]" />
        <span className="text-[10px] text-gray-500">{saving ? "salvando…" : savedAt ? `salvo ${savedAt}` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center gap-1 mr-1" title="Tema"><Palette size={13} className="text-gray-400" />
            {THEMES.map((t) => <button key={t.id} onClick={() => update((d) => { d.tema = t.id; return d; })} title={t.label} className={`w-5 h-5 rounded-full border ${deck.tema === t.id ? "border-white" : "border-white/20"}`} style={{ background: t.bg }} />)}
          </div>
          <button onClick={() => setShowNina((v) => !v)} className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer ${showNina ? "bg-amber-600 text-white" : "bg-white/10 hover:bg-white/15"}`}><Wand2 size={13} /> Nina</button>
          <button onClick={exportPptx} disabled={exporting} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">{exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} .pptx</button>
          <button onClick={exportPdf} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Printer size={13} /> PDF</button>
          <button onClick={() => doSave(deck, title)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Save size={13} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Rail de slides */}
        <div className="w-40 border-r border-white/10 overflow-y-auto custom-scroll p-2 space-y-2 bg-black/20">
          {deck.slides.map((sl, i) => (
            <div key={i} onClick={() => setCur(i)} className={`rounded-lg overflow-hidden cursor-pointer border ${i === cur ? "border-amber-500" : "border-white/10"}`}>
              <div className="h-16 text-[8px] p-1.5 flex flex-col justify-center relative" style={{ background: th.bg, color: th.title, borderTop: `2px solid ${th.accent}` }}>
                <span className="absolute top-0.5 left-1 text-[7px] text-white/40">{i + 1}</span>
                <b className="line-clamp-2">{sl.titulo || "—"}</b>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="w-full text-[11px] py-1.5 rounded bg-white/10 hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1"><Plus size={12} /> slide</button>
        </div>

        {/* Canvas central */}
        <div className="flex-1 overflow-auto custom-scroll p-6 flex flex-col items-center gap-4 bg-[#20242c]">
          <div className="w-full max-w-2xl aspect-video rounded-lg shadow-2xl relative overflow-hidden flex flex-col justify-center p-8" style={{ background: th.bg, color: th.text }}>
            <div className="absolute top-0 left-0 right-0 h-2" style={{ background: th.accent }} />
            {cur === 0 ? (
              <div className="text-center">
                <input value={s.titulo} onChange={(e) => patchSlide(cur, { titulo: e.target.value })} className="w-full bg-transparent text-3xl font-bold text-center outline-none" style={{ color: th.title }} />
                <input value={(s.topicos || []).join(" • ")} onChange={(e) => patchSlide(cur, { topicos: e.target.value.split("•").map((x) => x.trim()).filter(Boolean) })} className="w-full bg-transparent text-center outline-none mt-3" placeholder="subtítulo" />
              </div>
            ) : (
              <>
                <input value={s.titulo} onChange={(e) => patchSlide(cur, { titulo: e.target.value })} className="w-full bg-transparent text-2xl font-bold outline-none mb-3" style={{ color: th.title }} />
                <textarea value={(s.topicos || []).join("\n")} onChange={(e) => patchSlide(cur, { topicos: e.target.value.split("\n").map((x) => x.replace(/^•\s*/, "")).filter((x) => x !== "") })} rows={7} className="w-full bg-transparent outline-none resize-none leading-relaxed" placeholder="Um tópico por linha…" style={{ color: th.text }} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => moveSlide(cur, -1)} disabled={cur === 0} className="w-8 h-8 grid place-items-center rounded bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-40"><ChevronUp size={15} /></button>
            <button onClick={() => moveSlide(cur, 1)} disabled={cur === deck.slides.length - 1} className="w-8 h-8 grid place-items-center rounded bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-40"><ChevronDown size={15} /></button>
            <button onClick={() => removeSlide(cur)} disabled={deck.slides.length <= 1} className="h-8 px-3 grid place-items-center rounded bg-white/10 hover:bg-red-600/40 cursor-pointer disabled:opacity-40 text-xs flex items-center gap-1"><Trash2 size={13} /> excluir slide</button>
            <span className="text-[11px] text-gray-500">Slide {cur + 1}/{deck.slides.length}</span>
          </div>
        </div>

        {showNina && (
          <NinaSlides onDeck={(d) => { const next = { ...deck, titulo: d.titulo || deck.titulo, slides: d.slides }; setDeck(next); setTitle(d.titulo || title); setCur(0); doSave(next, d.titulo || title); }} />
        )}
      </div>
    </div>
  );
}

function NinaSlides({ onDeck }: { onDeck: (d: Deck) => void }) {
  const [prompt, setPrompt] = useState("");
  const [n, setN] = useState(8);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    if (!prompt.trim() || busy) return; setBusy(true); setErr(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/studio/slides", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ prompt, n }) });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      onDeck(data.deck as Deck);
    } catch { setErr("Falha ao gerar. Tente de novo."); } finally { setBusy(false); }
  }

  return (
    <div className="w-72 border-l border-white/10 flex flex-col bg-[#0b0f16] p-3 gap-2">
      <div className="text-sm font-bold flex items-center gap-2"><Sparkles size={14} className="text-amber-400" /> Nina — criar slides</div>
      <p className="text-[11px] text-gray-400">Descreva o tema e a Nina monta a apresentação inteira.</p>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="Ex.: Energia solar no Brasil, para uma aula do ensino médio" className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none resize-none" />
      <label className="text-[11px] text-gray-400 flex items-center gap-2">Slides: <input type="number" min={3} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-16 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none" /></label>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      <button onClick={go} disabled={busy || !prompt.trim()} className="w-full text-xs py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
        {busy ? <><Loader2 size={13} className="animate-spin" /> Montando…</> : <><Wand2 size={13} /> Gerar apresentação</>}
      </button>
      <p className="text-[10px] text-gray-600">Substitui os slides atuais pelos gerados. Você ajusta depois.</p>
    </div>
  );
}
