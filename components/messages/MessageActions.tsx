"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Trash2, X } from "lucide-react";

export default function MessageActions({ at, text, onEdit, onDelete }: {
  at: string; text: string | null;
  onEdit?: (text: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"options" | "edit" | "delete" | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState({ edit: false, delete: false });
  const dialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!mode) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    if (mode === "edit") requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(editor.current.value.length, editor.current.value.length); });
    return () => element?.close();
  }, [mode]);
  function open() {
    const age = Date.now() - Date.parse(at);
    setLimits({ edit: age < 15 * 60 * 1000, delete: age < 48 * 60 * 60 * 1000 });
    setDraft(text ?? ""); setError(""); setMode("options");
  }
  async function submit() {
    if (busy || (mode === "edit" && (!draft.trim() || draft === text))) return;
    setBusy(true); setError("");
    try {
      if (mode === "edit") await onEdit?.(draft);
      else await onDelete?.();
      setMode(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar a mensagem."); }
    finally { setBusy(false); }
  }
  return <>
    <button aria-label="Opções da mensagem enviada" onClick={open} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg hover:bg-white/15"><MoreVertical size={16} /></button>
    {mode && createPortal(<dialog ref={dialog} aria-label={mode === "edit" ? "Editar mensagem" : mode === "delete" ? "Apagar mensagem para todos" : "Opções da mensagem enviada"}
      onCancel={event => { event.preventDefault(); if (!busy) setMode(null); }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-2xl border border-white/15 bg-[#111826] p-5 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-semibold">{mode === "edit" ? "Editar mensagem" : mode === "delete" ? "Apagar para todos?" : "Mensagem enviada"}</h2><button disabled={busy} aria-label="Fechar opções da mensagem" onClick={() => setMode(null)} className="min-h-11 min-w-11 grid place-items-center rounded-lg hover:bg-white/10 disabled:opacity-40"><X size={20} /></button></div>
      {mode === "options" ? <div className="space-y-2">
        {onEdit && <button disabled={!limits.edit} onClick={() => setMode("edit")} className="flex w-full min-h-12 items-center gap-3 rounded-xl bg-white/5 px-4 text-left disabled:opacity-40"><Pencil size={18} /> Editar mensagem</button>}
        {onDelete && <button disabled={!limits.delete} onClick={() => setMode("delete")} className="flex w-full min-h-12 items-center gap-3 rounded-xl bg-red-500/10 px-4 text-left text-red-300 disabled:opacity-40"><Trash2 size={18} /> Apagar para todos</button>}
        <p className="pt-2 text-sm leading-6 text-slate-400">Texto pode ser editado por até 15 minutos. Você pode solicitar apagar para todos por até dois dias após o envio.</p>
      </div> : <>
        {mode === "edit" ? <label className="block text-sm">Mensagem<textarea ref={editor} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} aria-label="Novo texto da mensagem" value={draft} onChange={e => setDraft(e.target.value)} maxLength={10000} rows={5} disabled={busy} className="mt-2 w-full min-w-0 resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-base outline-none focus:border-emerald-500" /></label>
          : <p className="text-sm leading-7 text-slate-300">A solicitação será enviada ao WhatsApp. A mensagem será substituída por um aviso de exclusão no histórico. Arquivos já salvos pelo destinatário podem permanecer no aparelho dele.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-xl border border-white/15 px-4 disabled:opacity-40">Cancelar</button><button disabled={busy || (mode === "edit" && (!draft.trim() || draft === text))} onClick={() => void submit()} className={`min-h-11 rounded-xl px-4 font-semibold disabled:opacity-40 ${mode === "delete" ? "bg-red-700" : "bg-emerald-600"}`}>{busy ? "Confirmando no WhatsApp…" : mode === "edit" ? "Salvar edição" : "Apagar para todos"}</button></div>
      </>}
    </dialog>, document.body)}
  </>;
}
