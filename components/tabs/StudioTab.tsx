"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Plus, Trash2, ArrowLeft, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Image as ImageIcon,
  Table as TableIcon, Undo2, Redo2, RemoveFormatting, SeparatorHorizontal, Sparkles,
  Loader2, FileDown, Printer, Save, Heading1, Heading2, Heading3, Wand2, Baseline, Highlighter,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Doc = { id: string; title: string; template: string | null; content: string | null; kind: string; updated_at: string; meta?: Record<string, string> | null };

const FONTS = ["Times New Roman", "Arial", "Calibri", "Georgia", "Verdana", "Courier New"];
const SIZES = [10, 11, 12, 14, 16, 18, 24, 32, 48];

const TEMPLATES: { id: string; label: string; desc: string; html: (m?: Record<string, string>) => string }[] = [
  { id: "blank", label: "Em branco", desc: "Documento vazio", html: () => `<p><br></p>` },
  {
    id: "abnt", label: "ABNT", desc: "Trabalho acadêmico (capa + estrutura)",
    html: (m) => `<p style="text-align:center"><b>${m?.instituicao || "INSTITUIÇÃO"}</b></p><p style="text-align:center">${m?.curso || "Curso"}</p><p style="text-align:center"><br></p><p style="text-align:center"><br></p><p style="text-align:center">${m?.autor || "Autor(a)"}</p><p style="text-align:center"><br></p><p style="text-align:center"><br></p><h1 style="text-align:center">${m?.tema || "TÍTULO DO TRABALHO"}</h1><p style="text-align:center"><br></p><p style="text-align:center"><br></p><p style="text-align:center">${m?.cidade || "Cidade"}</p><p style="text-align:center">${m?.ano || new Date().getFullYear()}</p><div data-pagebreak="1"></div><h1>1 INTRODUÇÃO</h1><p>Escreva aqui…</p><h1>2 DESENVOLVIMENTO</h1><p>Escreva aqui…</p><h1>3 CONCLUSÃO</h1><p>Escreva aqui…</p><h1>REFERÊNCIAS</h1><p>SOBRENOME, Nome. <i>Título</i>. Cidade: Editora, ano.</p>`,
  },
  { id: "apa", label: "APA", desc: "Formato APA", html: () => `<h1 style="text-align:center">Título</h1><p style="text-align:center">Autor · Instituição</p><h2>Introdução</h2><p>Escreva aqui…</p><h2>Método</h2><p>Escreva aqui…</p><h2>Referências</h2><p>Autor (ano). Título. Editora.</p>` },
  { id: "carta", label: "Carta", desc: "Carta / ofício", html: () => `<p style="text-align:right">Cidade, ${new Date().toLocaleDateString("pt-BR")}</p><p><br></p><p>Prezado(a),</p><p>Escreva aqui…</p><p><br></p><p>Atenciosamente,</p><p>Seu nome</p>` },
  { id: "relatorio", label: "Relatório", desc: "Relatório simples", html: () => `<h1>Relatório</h1><h2>1. Objetivo</h2><p>…</p><h2>2. Desenvolvimento</h2><p>…</p><h2>3. Conclusão</h2><p>…</p>` },
];

export default function StudioTab({ profile }: { profile: Profile | null }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [open, setOpen] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("studio_documents").select("*").eq("kind", "document").order("updated_at", { ascending: false });
    setDocs((data as Doc[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(templateId: string) {
    if (!supabase) return;
    const tpl = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
    const { data } = await supabase.from("studio_documents").insert({
      company_id: companyId, created_by: profile?.id ?? null, kind: "document",
      title: tpl.id === "blank" ? "Novo documento" : `Documento (${tpl.label})`,
      template: tpl.id, content: tpl.html({ autor: profile?.full_name ?? "" }),
    }).select("*").single();
    if (data) { await load(); setOpen(data as Doc); }
  }
  async function remove(id: string) {
    if (!supabase || !confirm("Excluir este documento?")) return;
    await supabase.from("studio_documents").delete().eq("id", id);
    load();
  }

  if (open) return <Editor doc={open} onClose={() => { setOpen(null); load(); }} />;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><FileText className="text-blue-400" size={20} /> Estúdio <span className="text-xs font-normal text-gray-500">documentos</span></h3>
      </div>

      <div>
        <p className="text-[11px] text-gray-400 mb-2">Começar um novo documento:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => create(t.id)} className="text-left rounded-xl border border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-white/10 p-3 cursor-pointer transition">
              <div className="flex items-center gap-1.5 font-semibold text-sm"><Plus size={14} className="text-blue-400" /> {t.label}</div>
              <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll">
        <p className="text-[11px] text-gray-400 mb-2">Seus documentos:</p>
        {loading ? <p className="text-sm text-gray-500 p-2">Carregando…</p> : docs.length === 0 ? (
          <p className="text-sm text-gray-500 p-2">Nenhum documento ainda.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {docs.map((d) => (
              <div key={d.id} onClick={() => setOpen(d)} className="cursor-pointer rounded-2xl border border-white/10 bg-white/5 hover:border-blue-500/40 p-4 transition group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold truncate flex items-center gap-1.5"><FileText size={14} className="text-blue-400" /> {d.title}</p>
                  <span onClick={(e) => { e.stopPropagation(); remove(d.id); }} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={14} /></span>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">{d.template?.toUpperCase() || "DOC"} · {new Date(d.updated_at).toLocaleDateString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Editor tipo Word ───────────────────────────
function Editor({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(doc.title);
  const [font, setFont] = useState("Times New Roman");
  const [size, setSize] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showNina, setShowNina] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (ref.current) ref.current.innerHTML = doc.content || "<p><br></p>"; document.execCommand("styleWithCSS", false, "true"); /* eslint-disable-next-line */ }, []);

  const doSave = useCallback(async () => {
    if (!supabase || !ref.current) return;
    setSaving(true);
    await supabase.from("studio_documents").update({ title: title.trim() || "Sem título", content: ref.current.innerHTML, updated_at: new Date().toISOString() }).eq("id", doc.id);
    setSaving(false); setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [doc.id, title]);

  function scheduleSave() { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(doSave, 1200); }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function focusEditor() { ref.current?.focus(); }
  function cmd(command: string, value?: string) { document.execCommand("styleWithCSS", false, "true"); document.execCommand(command, false, value); focusEditor(); scheduleSave(); }
  function applyFont(f: string) { setFont(f); cmd("fontName", f); }
  function applySize(px: number) {
    setSize(px);
    document.execCommand("fontSize", false, "7");
    ref.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement("span"); span.style.fontSize = `${px}px`; span.innerHTML = (f as HTMLElement).innerHTML; f.replaceWith(span);
    });
    focusEditor(); scheduleSave();
  }
  function insertPageBreak() { document.execCommand("insertHTML", false, '<div data-pagebreak="1" class="pgbreak"></div><p><br></p>'); scheduleSave(); }
  function insertTable() { document.execCommand("insertHTML", false, '<table class="doc-tbl"><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>'); scheduleSave(); }
  function insertImage(file: File) { const r = new FileReader(); r.onload = () => { document.execCommand("insertImage", false, r.result as string); scheduleSave(); }; r.readAsDataURL(file); }

  async function exportDocx() {
    if (!ref.current || exporting) return;
    setExporting(true);
    try {
      const { editorHtmlToDocxBlob } = await import("@/lib/studio-docx");
      const blob = await editorHtmlToDocxBlob(ref.current, title);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title.slice(0, 60) || "documento"}.docx`; a.click(); URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }
  function exportPdf() {
    if (!ref.current) return;
    const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${title}</title>
      <style>@page{margin:2cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000}
      h1,h2,h3{page-break-after:avoid}.pgbreak{page-break-after:always}img{max-width:100%}
      table.doc-tbl{border-collapse:collapse;width:100%}table.doc-tbl td{border:1px solid #000;padding:4px}</style></head>
      <body>${ref.current.innerHTML}<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
  }

  const T = ({ icon: Icon, on, title: tt, cmd: c, val }: { icon: typeof Bold; on?: () => void; title: string; cmd?: string; val?: string }) => (
    <button onMouseDown={(e) => { e.preventDefault(); on ? on() : c && cmd(c, val); }} title={tt} className="w-8 h-8 grid place-items-center rounded hover:bg-white/10 text-gray-200 cursor-pointer"><Icon size={16} /></button>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Barra superior */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 flex-wrap">
        <button onClick={async () => { await doSave(); onClose(); }} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); scheduleSave(); }} className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-white/20 px-1 min-w-[120px]" />
        <span className="text-[10px] text-gray-500">{saving ? "salvando…" : savedAt ? `salvo ${savedAt}` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setShowNina((v) => !v)} className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer ${showNina ? "bg-blue-600 text-white" : "bg-white/10 hover:bg-white/15"}`}><Wand2 size={13} /> Nina</button>
          <button onClick={exportDocx} disabled={exporting} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">{exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} .docx</button>
          <button onClick={exportPdf} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Printer size={13} /> PDF</button>
          <button onClick={doSave} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Save size={13} /></button>
        </div>
      </div>

      {/* Barra de ferramentas (Word) */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/10 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible bg-black/20">
        <select value={font} onChange={(e) => applyFont(e.target.value)} className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-xs outline-none cursor-pointer" style={{ minWidth: 120 }}>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={size} onChange={(e) => applySize(Number(e.target.value))} className="bg-black/30 border border-white/10 rounded px-1.5 py-1 text-xs outline-none cursor-pointer">
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T icon={Bold} title="Negrito" cmd="bold" /><T icon={Italic} title="Itálico" cmd="italic" /><T icon={Underline} title="Sublinhado" cmd="underline" /><T icon={Strikethrough} title="Tachado" cmd="strikeThrough" />
        <label className="w-8 h-8 grid place-items-center rounded hover:bg-white/10 cursor-pointer relative" title="Cor da letra"><Baseline size={16} /><input type="color" onChange={(e) => cmd("foreColor", e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
        <label className="w-8 h-8 grid place-items-center rounded hover:bg-white/10 cursor-pointer relative" title="Marca-texto"><Highlighter size={16} /><input type="color" onChange={(e) => cmd("hiliteColor", e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T icon={Heading1} title="Título 1" on={() => cmd("formatBlock", "H1")} /><T icon={Heading2} title="Título 2" on={() => cmd("formatBlock", "H2")} /><T icon={Heading3} title="Título 3" on={() => cmd("formatBlock", "H3")} /><T icon={FileText} title="Parágrafo normal" on={() => cmd("formatBlock", "P")} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T icon={AlignLeft} title="Esquerda" cmd="justifyLeft" /><T icon={AlignCenter} title="Centro" cmd="justifyCenter" /><T icon={AlignRight} title="Direita" cmd="justifyRight" /><T icon={AlignJustify} title="Justificar" cmd="justifyFull" />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T icon={List} title="Lista" cmd="insertUnorderedList" /><T icon={ListOrdered} title="Lista numerada" cmd="insertOrderedList" />
        <T icon={AlignLeft} title="Diminuir recuo" on={() => cmd("outdent")} /><T icon={AlignRight} title="Aumentar recuo" on={() => cmd("indent")} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <label className="w-8 h-8 grid place-items-center rounded hover:bg-white/10 cursor-pointer relative" title="Imagem"><ImageIcon size={16} /><input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
        <T icon={TableIcon} title="Tabela" on={insertTable} /><T icon={SeparatorHorizontal} title="Quebra de página" on={insertPageBreak} />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T icon={Undo2} title="Desfazer" cmd="undo" /><T icon={Redo2} title="Refazer" cmd="redo" /><T icon={RemoveFormatting} title="Limpar formatação" cmd="removeFormat" />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} className="w-7 h-7 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">−</button>
        <span className="text-[11px] text-gray-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))} className="w-7 h-7 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">+</button>
      </div>

      {/* Canvas + Nina */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto custom-scroll bg-[#20242c] p-6 flex justify-center">
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={scheduleSave}
            spellCheck
            className="doc-page bg-white text-black outline-none"
            style={{ width: "21cm", minHeight: "29.7cm", padding: "3cm 2cm 2cm 3cm", boxShadow: "0 10px 40px rgba(0,0,0,.5)", transform: `scale(${zoom})`, transformOrigin: "top center", fontFamily: font, fontSize: `${size}pt`, lineHeight: 1.5 }}
          />
        </div>
        {showNina && <NinaPanel doc={doc} editorRef={ref} onApplied={scheduleSave} />}
      </div>

      <style>{`
        .doc-page h1{font-size:1.3em;font-weight:bold;margin:.6em 0 .3em}
        .doc-page h2{font-size:1.15em;font-weight:bold;margin:.5em 0 .3em}
        .doc-page h3{font-size:1.05em;font-weight:bold;margin:.4em 0 .2em}
        .doc-page p{margin:0 0 .5em;text-align:justify}
        .doc-page .pgbreak{border-top:1px dashed #bbb;margin:1em 0;height:0}
        .doc-page table.doc-tbl td{border:1px solid #333;padding:4px;min-width:40px}
        .doc-page:focus{outline:none}
      `}</style>
    </div>
  );
}

// Painel lateral da Nina: conversa e aplica o conteúdo no documento.
function NinaPanel({ doc, editorRef, onApplied }: { doc: Doc; editorRef: React.RefObject<HTMLDivElement | null>; onApplied: () => void }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "nina"; text: string; html?: string }[]>([
    { role: "nina", text: "Oi! Sou a Nina 💙 Me diga o que criar ou ajustar neste documento (ex.: “faça uma introdução sobre energia solar”). Eu escrevo e você aplica na página." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })); }, [msgs, busy]);

  async function send(mode: "replace" | "append" | "edit") {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setMsgs((m) => [...m, { role: "user", text: prompt }]); setInput(""); setBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/studio/compose", {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ prompt, template: doc.template, meta: doc.meta || {}, mode, currentText: editorRef.current?.innerText?.slice(0, 8000) }),
      });
      const data = await res.json();
      if (data.error) { setMsgs((m) => [...m, { role: "nina", text: `Não consegui: ${data.error}` }]); return; }
      setMsgs((m) => [...m, { role: "nina", text: "Prontinho! Confira e clique em Aplicar.", html: data.html }]);
    } catch { setMsgs((m) => [...m, { role: "nina", text: "Tive um problema. Tenta de novo?" }]); }
    finally { setBusy(false); }
  }

  function apply(html: string, append: boolean) {
    const el = editorRef.current; if (!el) return;
    if (append) el.innerHTML = el.innerHTML + html; else el.innerHTML = html;
    onApplied();
  }

  return (
    <div className="fixed sm:static inset-x-0 bottom-0 z-40 h-[58vh] sm:h-auto w-full sm:w-80 border-t sm:border-t-0 sm:border-l border-white/10 flex flex-col bg-[#0b0f16] rounded-t-2xl sm:rounded-none shadow-2xl sm:shadow-none">
      <div className="px-3 py-2 border-b border-white/10 text-sm font-bold flex items-center gap-2"><Sparkles size={14} className="text-blue-400" /> Nina — criação com IA</div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-2 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className={`inline-block rounded-2xl px-3 py-1.5 text-xs max-w-[90%] text-left whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white" : "bg-white/10"}`}>{m.text}</span>
            {m.html && (
              <div className="mt-1 flex gap-1.5 justify-start">
                <button onClick={() => apply(m.html!, false)} className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">Aplicar (substituir)</button>
                <button onClick={() => apply(m.html!, true)} className="text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer">Inserir no fim</button>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-[11px] text-gray-500 italic px-1">Nina está escrevendo…</p>}
      </div>
      <div className="p-2 border-t border-white/10 space-y-1.5">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send("append"); } }} rows={2} placeholder="Peça algo à Nina…" className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none resize-none" />
        <div className="flex gap-1.5">
          <button onClick={() => send("replace")} disabled={busy || !input.trim()} className="flex-1 text-[11px] py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-50">Criar documento</button>
          <button onClick={() => send("append")} disabled={busy || !input.trim()} className="flex-1 text-[11px] py-1.5 rounded bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">Complementar</button>
        </div>
      </div>
    </div>
  );
}
