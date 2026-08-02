"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Briefcase, FileDown, GraduationCap, Loader2, Palette, Plus, Printer,
  Save, Sparkles, Tags, Trash2, User,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import {
  EMPTY_RESUME, RESUME_PAGE, RESUME_THEMES, renderResumeHtml,
  type Resume, type ResumeThemeId,
} from "@/lib/doc-templates/resume";
import { PAPER, pageStyle } from "@/lib/doc-templates/types";
import { printDocument } from "@/lib/doc-templates/print";

const ACCENTS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#0f172a"];

type Row = { id: string; title: string; content: string | null; template: string | null };
type Tab = "dados" | "experiencia" | "formacao" | "habilidades" | "tema";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "dados", label: "Dados", icon: User },
  { id: "experiencia", label: "Experiência", icon: Briefcase },
  { id: "formacao", label: "Formação", icon: GraduationCap },
  { id: "habilidades", label: "Habilidades", icon: Tags },
  { id: "tema", label: "Tema", icon: Palette },
];

const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500";
const labelCls = "block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1";

// Campo simples — fora do componente para não ser recriado a cada render.
function Field({ label, value, onChange, placeholder, area }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className={`${inputCls} resize-y leading-relaxed`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
      )}
    </div>
  );
}

// Lista editável de textos (habilidades / palavras-chave).
function ChipList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className={inputCls}
        />
        <button onClick={add} className="shrink-0 w-8 h-8 grid place-items-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"><Plus size={14} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white/10 rounded-full pl-2.5 pr-1 py-1">
            {s}
            <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="w-4 h-4 grid place-items-center rounded-full hover:bg-red-500/40 cursor-pointer text-gray-400">×</button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[10px] text-gray-600">Nada por aqui ainda.</span>}
      </div>
    </div>
  );
}

export default function ResumeEditor({ row, authorName, onClose }: { row: Row; authorName: string; onClose: () => void }) {
  // Estado inicial preguiçoso: lê o JSON salvo uma única vez, sem efeito.
  const [resume, setResume] = useState<Resume>(() => {
    try {
      const saved = JSON.parse(row.content || "null");
      if (saved && typeof saved === "object" && saved.name !== undefined) return { ...EMPTY_RESUME(authorName), ...saved } as Resume;
    } catch { /* conteúdo antigo/invalidado — começa do zero */ }
    return EMPTY_RESUME(authorName);
  });
  const [title, setTitle] = useState(row.title);
  const [tab, setTab] = useState<Tab>("dados");
  const [zoom, setZoom] = useState(0.72);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async (r: Resume, t: string) => {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("studio_documents")
      .update({ title: t.trim() || "Currículo", content: JSON.stringify(r), template: "curriculo", meta: { modelo: "curriculo", tema: r.theme }, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [row.id]);

  function schedule(r: Resume, t: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(r, t), 1000);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function patch(up: Partial<Resume>) {
    setResume((prev) => { const next = { ...prev, ...up }; schedule(next, title); return next; });
  }

  function photoUpload(file: File) {
    const r = new FileReader();
    r.onload = () => patch({ photo: String(r.result || "") });
    r.readAsDataURL(file);
  }

  async function exportDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const { buildResumeDocxBlob } = await import("@/lib/doc-templates/resume-docx");
      const blob = await buildResumeDocxBlob(resume);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(title || resume.name || "curriculo").slice(0, 60)}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }

  function exportPdf() {
    printDocument(renderResumeHtml(resume), RESUME_PAGE, title || resume.name || "Currículo");
  }

  const exp = resume.experiences;
  const edu = resume.education;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Topo */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 flex-wrap shrink-0">
        <button onClick={async () => { await doSave(resume, title); onClose(); }} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(resume, e.target.value); }} className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-white/20 px-1 min-w-[120px]" />
        <span className="text-[10px] text-gray-500">{saving ? "salvando…" : savedAt ? `salvo ${savedAt}` : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={exportDocx} disabled={exporting} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Word
          </button>
          <button onClick={exportPdf} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Printer size={13} /> PDF</button>
          <button onClick={() => doSave(resume, title)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Save size={13} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Painel de edição */}
        <div className="w-full sm:w-[340px] shrink-0 border-r border-white/10 flex flex-col overflow-hidden bg-[#0b0f16]">
          <div className="flex items-center gap-0.5 p-1.5 border-b border-white/10 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg cursor-pointer shrink-0 ${tab === t.id ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-3">
            {tab === "dados" && (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 overflow-hidden grid place-items-center shrink-0">
                    {resume.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={resume.photo} alt="foto" className="w-full h-full object-cover" />
                      : <User size={22} className="text-gray-600" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer inline-block">
                      {resume.photo ? "Trocar foto" : "Adicionar foto"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && photoUpload(e.target.files[0])} />
                    </label>
                    {resume.photo && <button onClick={() => patch({ photo: "" })} className="block text-[10px] text-red-400 hover:text-red-300 cursor-pointer">remover foto</button>}
                    {resume.photo && (
                      <label className="block text-[10px] text-gray-500">Tamanho: {resume.photoSize}%
                        <input type="range" min={50} max={160} value={resume.photoSize} onChange={(e) => patch({ photoSize: Number(e.target.value) })} className="w-full accent-indigo-500" />
                      </label>
                    )}
                  </div>
                </div>
                <Field label="Nome completo" value={resume.name} onChange={(v) => patch({ name: v })} />
                <Field label="Cargo desejado" value={resume.title} onChange={(v) => patch({ title: v })} placeholder="Ex.: Analista de Marketing" />
                <Field label="Telefone" value={resume.phone} onChange={(v) => patch({ phone: v })} />
                <Field label="E-mail" value={resume.email} onChange={(v) => patch({ email: v })} />
                <Field label="Cidade" value={resume.location} onChange={(v) => patch({ location: v })} placeholder="São Paulo, SP" />
                <Field label="Resumo profissional" value={resume.about} onChange={(v) => patch({ about: v })} area placeholder="Um parágrafo curto sobre a sua trajetória…" />
              </>
            )}

            {tab === "experiencia" && (
              <>
                {exp.map((e, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Experiência {i + 1}</span>
                      <button onClick={() => patch({ experiences: exp.filter((_, k) => k !== i) })} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                    <Field label="Cargo" value={e.role} onChange={(v) => patch({ experiences: exp.map((x, k) => (k === i ? { ...x, role: v } : x)) })} />
                    <Field label="Empresa" value={e.company} onChange={(v) => patch({ experiences: exp.map((x, k) => (k === i ? { ...x, company: v } : x)) })} />
                    <Field label="Período" value={e.period} onChange={(v) => patch({ experiences: exp.map((x, k) => (k === i ? { ...x, period: v } : x)) })} placeholder="2022 - Atual" />
                    <Field label="O que você fazia" value={e.description} onChange={(v) => patch({ experiences: exp.map((x, k) => (k === i ? { ...x, description: v } : x)) })} area />
                  </div>
                ))}
                <button onClick={() => patch({ experiences: [...exp, { role: "", company: "", period: "", description: "" }] })} className="w-full text-[11px] py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1"><Plus size={12} /> adicionar experiência</button>
              </>
            )}

            {tab === "formacao" && (
              <>
                {edu.map((e, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Formação {i + 1}</span>
                      <button onClick={() => patch({ education: edu.filter((_, k) => k !== i) })} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                    <Field label="Curso / grau" value={e.degree} onChange={(v) => patch({ education: edu.map((x, k) => (k === i ? { ...x, degree: v } : x)) })} />
                    <Field label="Instituição" value={e.institution} onChange={(v) => patch({ education: edu.map((x, k) => (k === i ? { ...x, institution: v } : x)) })} />
                    <Field label="Período" value={e.period} onChange={(v) => patch({ education: edu.map((x, k) => (k === i ? { ...x, period: v } : x)) })} placeholder="2016 - 2020" />
                  </div>
                ))}
                <button onClick={() => patch({ education: [...edu, { degree: "", institution: "", period: "" }] })} className="w-full text-[11px] py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1"><Plus size={12} /> adicionar formação</button>
              </>
            )}

            {tab === "habilidades" && (
              <>
                <div>
                  <label className={labelCls}>Habilidades</label>
                  <ChipList items={resume.skills} onChange={(v) => patch({ skills: v })} placeholder="Ex.: Excel avançado — Enter para adicionar" />
                </div>
                <div className="pt-2">
                  <label className={labelCls}>Palavras-chave (leitura por robô de RH)</label>
                  <ChipList items={resume.keywords} onChange={(v) => patch({ keywords: v })} placeholder="Ex.: Gestão de projetos" />
                  <p className="text-[10px] text-gray-600 mt-1.5">Muita empresa filtra currículo por palavra antes de um humano ler. Repita aqui os termos exatos que aparecem na vaga.</p>
                </div>
              </>
            )}

            {tab === "tema" && (
              <>
                <div>
                  <label className={labelCls}>Modelo</label>
                  <div className="space-y-1.5">
                    {RESUME_THEMES.map((t) => (
                      <button key={t.id} onClick={() => patch({ theme: t.id as ResumeThemeId })} className={`w-full text-left rounded-xl border px-3 py-2 cursor-pointer transition ${resume.theme === t.id ? "border-indigo-500 bg-indigo-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}>
                        <div className="text-xs font-bold">{t.label}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Cor de destaque</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ACCENTS.map((c) => (
                      <button key={c} onClick={() => patch({ accent: c })} className="w-7 h-7 rounded-full border-2 cursor-pointer" style={{ background: c, borderColor: resume.accent === c ? "#fff" : "transparent" }} />
                    ))}
                    <label className="w-7 h-7 rounded-full border-2 border-white/20 cursor-pointer relative overflow-hidden" title="Outra cor">
                      <span className="absolute inset-0" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }} />
                      <input type="color" value={resume.accent} onChange={(e) => patch({ accent: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 flex items-start gap-1.5 pt-1">
                  <Sparkles size={12} className="text-indigo-400 shrink-0 mt-0.5" />
                  A folha é A4 com margem de 1,4 cm — a mesma medida sai no Word e no PDF, sem corte nem sobra.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Prévia — folha real */}
        <div className="hidden sm:flex flex-1 overflow-auto custom-scroll bg-[#20242c] p-6 justify-center items-start">
          <div className="shrink-0" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
            <div
              className="bg-white text-black shadow-2xl overflow-hidden"
              style={{ ...pageStyle(RESUME_PAGE), boxShadow: "0 10px 40px rgba(0,0,0,.5)" }}
              dangerouslySetInnerHTML={{ __html: renderResumeHtml(resume) }}
            />
          </div>
        </div>
      </div>

      {/* Zoom */}
      <div className="hidden sm:flex items-center justify-center gap-2 py-1.5 border-t border-white/10 shrink-0">
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">−</button>
        <span className="text-[11px] text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">+</button>
        <span className="text-[10px] text-gray-600 ml-2">{PAPER[RESUME_PAGE.paper].label}</span>
      </div>
    </div>
  );
}
