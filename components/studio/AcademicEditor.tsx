"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, FileDown, FileText, Image as ImageIcon, Loader2, Printer,
  RefreshCw, Save, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import {
  EMPTY_ACADEMIC, filledCount, normOf, renderAcademicHtml, type AcademicDoc,
} from "@/lib/doc-templates/academic";
import { COVER_FIELDS, NORM_TEMPLATES, normById } from "@/lib/doc-templates/norms";
import { PAPER, pageStyle } from "@/lib/doc-templates/types";
import { printDocument } from "@/lib/doc-templates/print";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Row = { id: string; title: string; content: string | null; template: string | null };
/** A progressão que o usuário percorre: norma → capa → seções → documento. */
type Step = "norma" | "capa" | "gerar" | "documento";

const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-purple-500";

export default function AcademicEditor({ row, modelLabel, authorName, onClose }: { row: Row; modelLabel: string; authorName: string; onClose: () => void }) {
  const [doc, setDoc] = useState<AcademicDoc>(() => {
    try {
      const saved = JSON.parse(row.content || "null");
      if (saved && Array.isArray(saved.secoes)) return saved as AcademicDoc;
    } catch { /* documento novo */ }
    return EMPTY_ACADEMIC(row.template && row.template !== "monografia" && row.template !== "trabalho" ? row.template : "abnt", { estudante: authorName });
  });
  // Documento já começado abre direto no conteúdo; novo começa escolhendo a norma.
  const [step, setStep] = useState<Step>(() => {
    try {
      const saved = JSON.parse(row.content || "null");
      if (saved && Array.isArray(saved.secoes) && saved.secoes.some((s: { html?: string }) => s.html?.trim())) return "documento";
    } catch { /* novo */ }
    return "norma";
  });
  const [title, setTitle] = useState(row.title);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // seção sendo escrita
  const [queue, setQueue] = useState<string[]>([]); // seções restantes na geração em série
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.68);
  const [exporting, setExporting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A norma que vale: a escolhida, já com os ajustes lidos de um arquivo-modelo
  // (quando o documento veio da Yumi). Prévia, PDF e .docx usam esta.
  const norma = normOf(doc);

  const doSave = useCallback(async (d: AcademicDoc, t: string) => {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("studio_documents")
      .update({ title: t.trim() || "Trabalho", content: JSON.stringify(d), meta: { modelo: row.template, norma: d.norma }, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("pt-BR"));
  }, [row.id, row.template]);

  function schedule(d: AcademicDoc, t: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(d, t), 1200);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function patch(up: Partial<AcademicDoc>) {
    setDoc((prev) => { const next = { ...prev, ...up }; schedule(next, title); return next; });
  }
  function setCapa(k: string, v: string) {
    setDoc((prev) => { const next = { ...prev, capa: { ...prev.capa, [k]: v } }; schedule(next, title); return next; });
  }
  // A logo vira data URL e fica dentro do próprio documento — assim ela sai
  // igual na prévia, no PDF e no .docx, sem depender de um link externo.
  function logoUpload(file: File) {
    const r = new FileReader();
    r.onload = () => setCapa("logo_url", String(r.result || ""));
    r.readAsDataURL(file);
  }
  function setSecaoHtml(id: string, html: string) {
    setDoc((prev) => { const next = { ...prev, secoes: prev.secoes.map((s) => (s.id === id ? { ...s, html } : s)) }; schedule(next, title); return next; });
  }

  /** Troca a norma: reformata o documento e troca a lista de seções pela da norma. */
  function applyNorma(id: string) {
    const n = normById(id);
    setDoc((prev) => {
      // Preserva o que já foi escrito nas seções que existem nas duas normas.
      const antes = new Map(prev.secoes.map((s) => [s.id, s.html]));
      const next: AcademicDoc = {
        ...prev,
        norma: n.id,
        // Escolher uma norma da lista descarta os ajustes vindos de um
        // arquivo-modelo — senão o documento sairia meio de uma, meio de outra.
        normaCustom: null,
        capa: { ...(n.capaDados ?? {}), ...prev.capa },
        secoes: n.secoes.map((s) => ({ id: s.id, label: s.label, html: antes.get(s.id) ?? "" })),
      };
      schedule(next, title);
      return next;
    });
  }

  // ── geração seção a seção ────────────────────────────────────────────────
  const generateSection = useCallback(async (sectionId: string, current: AcademicDoc): Promise<boolean> => {
    const secDef = normById(current.norma).secoes.find((s) => s.id === sectionId);
    const sec = current.secoes.find((s) => s.id === sectionId);
    if (!secDef || !sec) return false;
    // Referências/bibliografia não são "redigidas": ficam para o autor preencher.
    if (secDef.instructions === null) return true;
    setBusyId(sectionId);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/studio/section", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          titulo: current.capa.titulo || title,
          norma: current.norma,
          secao: { id: secDef.id, label: secDef.label, instructions: secDef.instructions },
          notas: current.notas,
          capa: current.capa,
          anteriores: current.secoes.filter((s) => s.id !== sectionId && s.html.trim()).map((s) => ({ label: s.label, trecho: s.html.replace(/<[^>]+>/g, " ").slice(0, 400) })),
        }),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); return false; }
      // Monta o próximo estado a partir do `current` recebido (sempre o mais
      // recente: a fila reexecuta o efeito a cada seção concluída) e SALVA na
      // hora — a seção levou minutos para ser escrita, não pode se perder.
      const html = String(data.html || "");
      const next: AcademicDoc = { ...current, secoes: current.secoes.map((s) => (s.id === sectionId ? { ...s, html } : s)) };
      setDoc(next);
      void doSave(next, title);
      return true;
    } catch {
      setErr("Falha de conexão ao escrever esta seção.");
      return false;
    } finally {
      setBusyId(null);
    }
  }, [title, doSave]);

  // Fila: escreve uma seção por vez, em ordem, mostrando o progresso.
  useEffect(() => {
    if (!queue.length || busyId) return;
    const [next, ...rest] = queue;
    let cancelled = false;
    (async () => {
      const ok = await generateSection(next, doc);
      if (cancelled) return;
      setQueue(ok ? rest : []); // erro interrompe a fila em vez de insistir
      if (ok && !rest.length) setStep("documento");
    })();
    return () => { cancelled = true; };
    // `doc` fora das dependências de propósito: a fila avança por si, e incluí-lo
    // reiniciaria a geração a cada tecla digitada no editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, busyId, generateSection]);

  function gerarTudo() {
    setErr(null);
    const ids = normById(doc.norma).secoes.filter((s) => s.instructions !== null).map((s) => s.id);
    setStep("gerar");
    setQueue(ids);
  }

  async function exportDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const { editorHtmlToDocxBlob } = await import("@/lib/studio-docx");
      const holder = document.createElement("div");
      holder.innerHTML = renderAcademicHtml(doc);
      const blob = await editorHtmlToDocxBlob(holder, title, norma.page);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(title || doc.capa.titulo || "trabalho").slice(0, 60)}.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setExporting(false); }
  }
  function exportPdf() {
    printDocument(renderAcademicHtml(doc), norma.page, title || doc.capa.titulo || "Trabalho");
  }

  const total = doc.secoes.filter((s) => normById(doc.norma).secoes.find((x) => x.id === s.id)?.instructions !== null).length;
  const feitas = filledCount(doc);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Topo */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10 flex-wrap shrink-0">
        <button onClick={async () => { await doSave(doc, title); onClose(); }} className="text-xs text-gray-400 hover:text-white cursor-pointer flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); schedule(doc, e.target.value); }} className="bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-white/20 px-1 min-w-[120px]" />
        <span className="text-[10px] text-gray-500">{saving ? "salvando…" : savedAt ? `salvo ${savedAt}` : ""}</span>
        {step === "documento" && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setStep("capa")} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><FileText size={13} /> Capa</button>
            <button onClick={exportDocx} disabled={exporting} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-50">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Word
            </button>
            <button onClick={exportPdf} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"><Printer size={13} /> PDF</button>
            <button onClick={() => doSave(doc, title)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Save size={13} /></button>
          </div>
        )}
      </div>

      {/* Trilha da progressão */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 text-[10px] shrink-0 overflow-x-auto no-scrollbar">
        {([["norma", "1. Modelo"], ["capa", "2. Capa"], ["gerar", "3. Escrever"], ["documento", "4. Documento"]] as [Step, string][]).map(([s, label], i) => (
          <span key={s} className="flex items-center gap-1.5 shrink-0">
            {i > 0 && <ArrowRight size={10} className="text-gray-700" />}
            <button
              onClick={() => setStep(s)}
              className={`px-2 py-1 rounded-full cursor-pointer font-semibold ${step === s ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              {label}
            </button>
          </span>
        ))}
        <span className="ml-auto text-gray-500 shrink-0">{modelLabel} · {norma.nome} · {PAPER[norma.page.paper].label}</span>
      </div>

      {err && <p className="text-[11px] text-red-300 bg-red-950/30 border-b border-red-500/20 px-3 py-1.5 shrink-0">{err}</p>}

      <div className="flex-1 overflow-y-auto custom-scroll">
        {/* 1 — escolher a norma/modelo */}
        {step === "norma" && (
          <div className="max-w-3xl mx-auto p-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold">Escolha o modelo de formatação</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">Cada modelo já vem com as margens, a fonte, o tamanho do papel e o estilo de citação exigidos. Dá para trocar depois — o documento inteiro se reformata.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {NORM_TEMPLATES.map((n) => (
                <button key={n.id} onClick={() => applyNorma(n.id)} className={`text-left rounded-xl border p-3 cursor-pointer transition ${doc.norma === n.id ? "border-purple-500 bg-purple-950/30" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{n.nome}</span>
                    {doc.norma === n.id && <Check size={14} className="text-purple-400 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">{n.descricao}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">{PAPER[n.page.paper].label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">margens {n.page.margins.mt}/{n.page.margins.mr}/{n.page.margins.mb}/{n.page.margins.ml} cm</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">citação {n.citacao}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">{n.secoes.length} seções</span>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep("capa")} className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-xl cursor-pointer text-sm">
              Continuar <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* 2 — capa + notas */}
        {step === "capa" && (
          <div className="max-w-2xl mx-auto p-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold">Dados da capa</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">O modelo <b>{norma.nome}</b> já preencheu o que sabia. Ajuste o que precisar.</p>
            </div>
            {/* Logo/brasão da instituição — vai no topo da capa, como os manuais pedem. */}
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 p-2.5">
              <span className="w-14 h-14 rounded-lg bg-black/40 border border-white/10 grid place-items-center overflow-hidden shrink-0">
                {doc.capa.logo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={doc.capa.logo_url} alt="" className="w-full h-full object-contain" />
                  : <ImageIcon size={16} className="text-gray-600" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Logo da instituição</p>
                <p className="text-[11px] text-gray-500">Aparece no topo da capa. Opcional.</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <label className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer">
                    {doc.capa.logo_url ? "Trocar" : "Enviar imagem"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && logoUpload(e.target.files[0])} />
                  </label>
                  {doc.capa.logo_url && (
                    <button onClick={() => setCapa("logo_url", "")} className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer">remover</button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {COVER_FIELDS.map((f) => (
                <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    {f.label}{f.required && <span className="text-purple-400"> *</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea value={doc.capa[f.id] ?? ""} onChange={(e) => setCapa(f.id, e.target.value)} rows={2} className={`${inputCls} resize-y`} />
                  ) : (
                    <input value={doc.capa[f.id] ?? f.default ?? ""} onChange={(e) => setCapa(f.id, e.target.value)} className={inputCls} />
                  )}
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notas e material de base</label>
              <textarea
                value={doc.notas}
                onChange={(e) => patch({ notas: e.target.value })}
                rows={6}
                placeholder="Cole aqui suas anotações, o enunciado do professor, trechos de referência… A IA lê tudo isso antes de escrever cada seção. Quanto mais material, mais o trabalho fica com a sua cara."
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("norma")} className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Voltar</button>
              <button
                onClick={gerarTudo}
                disabled={!doc.capa.titulo?.trim()}
                title={!doc.capa.titulo?.trim() ? "Preencha o título do trabalho" : ""}
                className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-xl cursor-pointer text-sm disabled:opacity-50"
              >
                <Wand2 size={15} /> Escrever o trabalho
              </button>
            </div>
            {feitas > 0 && (
              <button onClick={() => setStep("documento")} className="w-full text-[11px] py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">
                ou abrir o que já está escrito ({feitas} de {total} seções)
              </button>
            )}
          </div>
        )}

        {/* 3 — escrevendo, seção a seção */}
        {step === "gerar" && (
          <div className="max-w-xl mx-auto p-4 space-y-3">
            <div className="text-center py-2">
              <Sparkles size={22} className="text-purple-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold">Escrevendo seção por seção</h4>
              <p className="text-[11px] text-gray-400 mt-1">Cada seção é escrita numa passada própria — é assim que o marco teórico sai inteiro, sem cortar no meio. Pode demorar alguns minutos; deixe esta aba aberta.</p>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${total ? (feitas / total) * 100 : 0}%` }} />
            </div>
            <p className="text-[11px] text-center text-gray-400">{feitas} de {total} seções prontas</p>
            <div className="space-y-1.5">
              {doc.secoes.map((s) => {
                const semIa = normById(doc.norma).secoes.find((x) => x.id === s.id)?.instructions === null;
                const pronta = !!s.html.trim();
                const agora = busyId === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="w-4 shrink-0 grid place-items-center">
                      {agora ? <Loader2 size={13} className="animate-spin text-purple-400" />
                        : pronta ? <Check size={13} className="text-emerald-400" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />}
                    </span>
                    <span className={`text-xs flex-1 truncate ${pronta ? "text-gray-200" : "text-gray-500"}`}>{s.label}</span>
                    {semIa && <span className="text-[9px] text-gray-600 shrink-0">você preenche</span>}
                  </div>
                );
              })}
            </div>
            {!queue.length && !busyId && (
              <div className="flex items-center gap-2">
                <button onClick={gerarTudo} className="flex-1 text-xs py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1.5"><RefreshCw size={13} /> Escrever tudo de novo</button>
                <button onClick={() => setStep("documento")} className="flex-1 text-xs py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white cursor-pointer">Abrir documento</button>
              </div>
            )}
          </div>
        )}

        {/* 4 — documento: edição por seção + prévia da folha */}
        {step === "documento" && (
          <div className="flex flex-col lg:flex-row gap-4 p-3">
            <div className="flex-1 min-w-0 space-y-2.5">
              {doc.secoes.map((s) => {
                const semIa = normById(doc.norma).secoes.find((x) => x.id === s.id)?.instructions === null;
                return (
                  <div key={s.id} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold flex-1 truncate">{s.label}</span>
                      {!semIa && (
                        <button
                          onClick={() => { setErr(null); generateSection(s.id, doc); }}
                          disabled={!!busyId}
                          title="Reescrever só esta seção"
                          className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer disabled:opacity-40"
                        >
                          {busyId === s.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} reescrever
                        </button>
                      )}
                      {s.html.trim() && (
                        <button onClick={() => setSecaoHtml(s.id, "")} className="text-gray-500 hover:text-red-400 cursor-pointer" title="Limpar seção"><Trash2 size={12} /></button>
                      )}
                    </div>
                    <textarea
                      value={s.html}
                      onChange={(e) => setSecaoHtml(s.id, e.target.value)}
                      rows={s.html.trim() ? 10 : 3}
                      placeholder={semIa ? "Cole aqui suas referências, uma por linha (dentro de <p>…</p>)." : "Vazia — clique em reescrever."}
                      className={`${inputCls} resize-y font-mono text-[11px] leading-relaxed`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Prévia da folha real */}
            <div className="hidden lg:block w-[440px] shrink-0">
              <div className="sticky top-0">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <button onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">−</button>
                  <span className="text-[11px] text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.08).toFixed(2)))} className="w-6 h-6 grid place-items-center rounded hover:bg-white/10 text-xs cursor-pointer">+</button>
                </div>
                <div className="overflow-auto custom-scroll bg-[#20242c] rounded-xl p-4 max-h-[calc(100vh-190px)] flex justify-center">
                  <div className="shrink-0" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                    <div
                      className="doc-preview bg-white text-black"
                      style={{ ...pageStyle(norma.page), boxShadow: "0 10px 40px rgba(0,0,0,.5)", textAlign: "justify" }}
                      dangerouslySetInnerHTML={{ __html: renderAcademicHtml(doc) }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .doc-preview h1{font-size:1em;font-weight:bold;margin:16pt 0 8pt;text-align:left}
        .doc-preview h2{font-size:1em;font-weight:bold;margin:12pt 0 6pt;text-align:left}
        .doc-preview h3{font-size:1em;font-weight:bold;margin:10pt 0 5pt;text-align:left}
        .doc-preview p{margin:0 0 8pt;text-indent:${norma.page.indent}cm}
        .doc-preview .cover p{text-indent:0}
        .doc-preview ul,.doc-preview ol{margin:0 0 8pt 1.2cm}
        .doc-preview .pgbreak{border-top:1px dashed #bbb;margin:10pt 0;height:0}
      `}</style>
    </div>
  );
}
