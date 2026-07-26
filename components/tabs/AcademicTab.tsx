"use client";

import { useState } from "react";
import { GraduationCap, Sparkles, FileText, FileDown, Printer, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import type { AcademicInput, AcademicWork } from "@/lib/academic-meta";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

const TIPOS = [
  { v: "trabalho", l: "Trabalho acadêmico" },
  { v: "monografia", l: "Monografia" },
  { v: "tcc", l: "TCC" },
  { v: "artigo", l: "Artigo" },
  { v: "redacao", l: "Redação" },
];

export default function AcademicTab({ profile }: { profile: Profile | null }) {
  const [meta, setMeta] = useState<AcademicInput>({
    tipo: "trabalho", tema: "", instituicao: "", curso: "", nivel: "", autor: profile?.full_name ?? "",
    orientador: "", paginas: 8, abnt: true, observacoes: "", cidade: "", ano: String(new Date().getFullYear()),
  });
  const [work, setWork] = useState<AcademicWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function set<K extends keyof AcademicInput>(k: K, v: AcademicInput[K]) { setMeta((m) => ({ ...m, [k]: v })); }

  async function generate() {
    if (!meta.tema?.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/academic/generate", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(meta) });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setWork(data.work as AcademicWork);
    } catch {
      setError("Não consegui gerar agora. Tente de novo.");
    } finally { setBusy(false); }
  }

  async function downloadDocx() {
    if (!work || exporting) return;
    setExporting(true);
    try {
      const { buildAcademicDocxBlob } = await import("@/lib/academic-docx");
      const blob = await buildAcademicDocxBlob(work, meta);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(work.titulo || "trabalho").slice(0, 60)}.docx`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch {
      setError("Falha ao gerar o .docx.");
    } finally { setExporting(false); }
  }

  function printPdf() {
    if (!work) return;
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const secoes = work.secoes.map((s) => `<h2>${esc(s.titulo)}</h2>${(s.conteudo || "").split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}`).join("");
    const refs = work.referencias?.length ? `<h2>REFERÊNCIAS</h2>${work.referencias.map((r) => `<p class="ref">${esc(r)}</p>`).join("")}` : "";
    const html = `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${esc(work.titulo)}</title>
      <style>@page{margin:3cm 2cm 2cm 3cm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-align:justify;color:#000}
      .cover{text-align:center;height:92vh;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
      .cover .top b{display:block}.cover h1{font-size:14pt;margin:auto 0}
      h2{font-size:12pt;font-weight:bold;text-transform:uppercase;margin:18pt 0 8pt;page-break-after:avoid}
      p{margin:0 0 8pt;text-indent:1.25cm}p.ref{text-indent:0;text-align:left}
      .resumo{page-break-before:always}</style></head><body>
      <div class="cover"><div class="top"><b>${esc(meta.instituicao || "")}</b><span>${esc(meta.curso || "")}</span></div>
      <div><p style="text-indent:0">${esc(meta.autor || "")}</p><h1>${esc(work.titulo)}</h1></div>
      <div><p style="text-indent:0">${esc(meta.cidade || "")}</p><p style="text-indent:0">${esc(meta.ano || "")}</p></div></div>
      ${work.resumo ? `<div class="resumo"><h2 style="text-align:center">RESUMO</h2><p>${esc(work.resumo)}</p>${work.palavras_chave?.length ? `<p><b>Palavras-chave:</b> ${esc(work.palavras_chave.join("; "))}.</p>` : ""}</div>` : ""}
      ${secoes}${refs}
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // Edição do resultado
  function patchSecao(i: number, up: Partial<{ titulo: string; conteudo: string }>) {
    setWork((wk) => wk ? { ...wk, secoes: wk.secoes.map((s, k) => (k === i ? { ...s, ...up } : s)) } : wk);
  }
  function addSecao() { setWork((wk) => wk ? { ...wk, secoes: [...wk.secoes, { titulo: `${wk.secoes.length + 1} NOVA SEÇÃO`, conteudo: "" }] } : wk); }
  function removeSecao(i: number) { setWork((wk) => wk ? { ...wk, secoes: wk.secoes.filter((_, k) => k !== i) } : wk); }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><GraduationCap className="text-indigo-400" size={20} /> Estúdio Acadêmico</h3>
        {work && (
          <div className="flex items-center gap-2">
            <button onClick={downloadDocx} disabled={exporting} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50">{exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Baixar .docx (editável)</button>
            <button onClick={printPdf} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><Printer size={14} /> PDF / Imprimir</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll">
        {!work ? (
          <div className="max-w-2xl mx-auto space-y-3">
            <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">Preencha o trabalho, a IA desenvolve e você baixa em <b>.docx editável</b> e <b>PDF</b> (formatação ABNT). Sem API externa — usa a IA do Workspace.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-xs text-gray-300">Tema / título *
                <input value={meta.tema} onChange={(e) => set("tema", e.target.value)} placeholder="Ex.: O impacto da IA na educação básica" className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
              </label>
              <label className="text-xs text-gray-300">Tipo
                <select value={meta.tipo} onChange={(e) => set("tipo", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                  {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-300">Páginas (aprox.)
                <input type="number" min={1} max={60} value={meta.paginas} onChange={(e) => set("paginas", Number(e.target.value))} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Instituição / escola
                <input value={meta.instituicao} onChange={(e) => set("instituicao", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Curso
                <input value={meta.curso} onChange={(e) => set("curso", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Nível
                <input value={meta.nivel} onChange={(e) => set("nivel", e.target.value)} placeholder="graduação, ensino médio…" className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Autor(a)
                <input value={meta.autor} onChange={(e) => set("autor", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Cidade
                <input value={meta.cidade} onChange={(e) => set("cidade", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="text-xs text-gray-300">Ano
                <input value={meta.ano} onChange={(e) => set("ano", e.target.value)} className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </label>
              <label className="col-span-2 text-xs text-gray-300">Observações (opcional)
                <textarea value={meta.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} placeholder="Pontos que devem aparecer, enfoque, etc." className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input type="checkbox" checked={meta.abnt ?? true} onChange={(e) => set("abnt", e.target.checked)} className="accent-indigo-500" /> Seguir normas ABNT
              </label>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button onClick={generate} disabled={busy || !meta.tema?.trim()} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl cursor-pointer disabled:opacity-50">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Desenvolvendo o trabalho…</> : <><Sparkles size={16} /> Gerar trabalho</>}
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            <button onClick={() => setWork(null)} className="text-xs text-gray-400 hover:text-white cursor-pointer">← Novo trabalho</button>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="rounded-xl p-4 bg-black/20 border border-white/10 space-y-2">
              <input value={work.titulo} onChange={(e) => setWork({ ...work, titulo: e.target.value })} className="w-full bg-transparent text-lg font-bold outline-none" />
              <label className="text-[11px] text-gray-400">Resumo</label>
              <textarea value={work.resumo} onChange={(e) => setWork({ ...work, resumo: e.target.value })} rows={4} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-y" />
              <label className="text-[11px] text-gray-400">Palavras-chave (separadas por ;)</label>
              <input value={(work.palavras_chave || []).join("; ")} onChange={(e) => setWork({ ...work, palavras_chave: e.target.value.split(";").map((s) => s.trim()).filter(Boolean) })} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>

            {work.secoes.map((s, i) => (
              <div key={i} className="rounded-xl p-3 bg-black/20 border border-white/10 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={s.titulo} onChange={(e) => patchSecao(i, { titulo: e.target.value })} className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm font-semibold outline-none" />
                  <button onClick={() => removeSecao(i)} className="text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={14} /></button>
                </div>
                <textarea value={s.conteudo} onChange={(e) => patchSecao(i, { conteudo: e.target.value })} rows={8} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-y leading-relaxed" />
              </div>
            ))}
            <button onClick={addSecao} className="text-xs text-indigo-300 hover:text-indigo-200 cursor-pointer flex items-center gap-1"><Plus size={13} /> adicionar seção</button>

            <div className="rounded-xl p-3 bg-black/20 border border-white/10 space-y-2">
              <label className="text-[11px] text-gray-400 flex items-center gap-1"><FileText size={12} /> Referências (uma por linha)</label>
              <textarea value={(work.referencias || []).join("\n")} onChange={(e) => setWork({ ...work, referencias: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} rows={5} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-y" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
