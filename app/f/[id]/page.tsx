"use client";

import { use, useEffect, useState } from "react";
import { Camera, Check, Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type FieldType = "short_text" | "long_text" | "number" | "email" | "phone" | "date" | "choice" | "multichoice" | "photo" | "file" | "section";
type Field = { id: string; label: string; type: FieldType; required?: boolean; options?: string[]; category?: string };
type Form = { ok: boolean; id?: string; title?: string; description?: string | null; theme?: { color?: string } | null; fields?: Field[] };

const MAX_FILE = 3 * 1024 * 1024; // 3 MB por arquivo (guardado embutido na resposta)
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
}

// Página PÚBLICA de preenchimento de formulário. Renderiza os campos criados na
// ferramenta Formulários (inclui foto pela câmera e upload de arquivo).
export default function FillForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("get_public_form", { p_id: id }).then(({ data }) => setForm((data as Form) ?? { ok: false }));
  }, [id]);

  const color = form?.theme?.color || "#10b981";
  function set(fid: string, v: unknown) { setValues((s) => ({ ...s, [fid]: v })); }

  async function submit() {
    if (!supabase || !form?.fields) return;
    for (const f of form.fields) {
      if (f.type !== "section" && f.required) {
        const v = values[f.id];
        if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) { setError(`Preencha: ${f.label}`); return; }
      }
    }
    setSaving(true); setError(null);
    const { error } = await supabase.rpc("submit_form_response", { p_form_id: id, p_data: values });
    setSaving(false);
    if (error) setError(error.message); else setDone(true);
  }

  if (!form) return <div className="min-h-screen flex items-center justify-center bg-[#0b0f16] text-gray-400 text-sm">Carregando…</div>;
  if (!form.ok) return <div className="min-h-screen flex items-center justify-center bg-[#0b0f16] text-gray-300 p-4 text-center">Formulário não encontrado.</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f16] text-gray-100 p-4">
      <div className="text-center bg-emerald-950/30 border border-emerald-700/40 rounded-2xl p-8 max-w-sm">
        <div className="w-14 h-14 rounded-full bg-emerald-600/30 border border-emerald-500 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-emerald-300" /></div>
        <p className="font-semibold">Resposta enviada!</p>
        <p className="text-sm text-gray-400 mt-1">Obrigado. Pode fechar esta página.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0f16] text-gray-100 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="rounded-2xl p-5 bg-black/25 border-t-4 mb-4" style={{ borderTopColor: color }}>
          <h1 className="text-xl font-bold">{form.title}</h1>
          {form.description && <p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap">{form.description}</p>}
        </div>

        <div className="space-y-3">
          {(form.fields ?? []).map((f) => {
            if (f.type === "section") return <h2 key={f.id} className="text-base font-bold pt-3">{f.label}</h2>;
            const v = values[f.id];
            return (
              <div key={f.id} className="rounded-xl p-4 bg-black/25 border border-white/10">
                <label className="block text-sm font-medium mb-2">{f.label} {f.required && <span style={{ color }}>*</span>}</label>
                {f.type === "long_text" ? (
                  <textarea rows={3} value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
                ) : f.type === "choice" ? (
                  <div className="space-y-1.5">
                    {(f.options ?? []).map((op) => (
                      <label key={op} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name={f.id} checked={v === op} onChange={() => set(f.id, op)} className="accent-emerald-500" /> {op}</label>
                    ))}
                  </div>
                ) : f.type === "multichoice" ? (
                  <div className="space-y-1.5">
                    {(f.options ?? []).map((op) => {
                      const arr = Array.isArray(v) ? (v as string[]) : [];
                      return <label key={op} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={arr.includes(op)} onChange={(e) => set(f.id, e.target.checked ? [...arr, op] : arr.filter((x) => x !== op))} className="accent-emerald-500" /> {op}</label>;
                    })}
                  </div>
                ) : f.type === "photo" || f.type === "file" ? (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer">
                      {f.type === "photo" ? <Camera size={15} /> : <Upload size={15} />} {v ? "Trocar" : (f.type === "photo" ? "Tirar/enviar foto" : "Enviar arquivo")}
                      <input type="file" accept={f.type === "photo" ? "image/*" : undefined} capture={f.type === "photo" ? "environment" : undefined} className="hidden"
                        onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > MAX_FILE) { setError("Arquivo muito grande (máx 3 MB)."); return; } set(f.id, await fileToDataUrl(file)); }} />
                    </label>
                    {typeof v === "string" && v.startsWith("data:image") && <img src={v} alt="" className="w-12 h-12 rounded object-cover" />}
                    {typeof v === "string" && v.startsWith("data:") && !v.startsWith("data:image") && <span className="text-[11px] text-emerald-400">arquivo anexado ✓</span>}
                  </div>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
                    value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <button onClick={submit} disabled={saving} className="mt-4 w-full py-3 rounded-xl text-white font-medium cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2" style={{ backgroundColor: color }}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : "Enviar"}
        </button>
        <p className="text-[10px] text-gray-600 text-center mt-4">Formulário Workspace.</p>
      </div>
    </div>
  );
}
