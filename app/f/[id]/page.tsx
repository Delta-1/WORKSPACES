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

  const shellStyle = { ["--wf" as string]: color } as React.CSSProperties;
  const bg = (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="wf-orb wf-orb1" style={{ background: color }} />
      <div className="wf-orb wf-orb2" style={{ background: color }} />
    </div>
  );
  const styleTag = (
    <style>{`
      .wf-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:.6rem .85rem;font-size:.9rem;outline:none;transition:border-color .15s, box-shadow .15s, background .15s;color:#f1f5f9}
      .wf-input:focus{border-color:var(--wf);box-shadow:0 0 0 3px color-mix(in srgb, var(--wf) 30%, transparent);background:rgba(255,255,255,.06)}
      .wf-card{background:rgba(255,255,255,.035);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.08);border-radius:18px;transition:border-color .18s, transform .18s}
      .wf-card:focus-within{border-color:color-mix(in srgb, var(--wf) 55%, transparent)}
      .wf-opt{display:flex;align-items:center;gap:.6rem;font-size:.9rem;cursor:pointer;padding:.5rem .7rem;border-radius:11px;border:1px solid transparent;transition:background .15s,border-color .15s}
      .wf-opt:hover{background:rgba(255,255,255,.05)}
      .wf-orb{position:absolute;width:46vw;height:46vw;max-width:620px;max-height:620px;border-radius:50%;filter:blur(90px);opacity:.22}
      .wf-orb1{top:-14vw;left:-10vw;animation:wfFloat 14s ease-in-out infinite}
      .wf-orb2{bottom:-16vw;right:-12vw;opacity:.16;animation:wfFloat 18s ease-in-out infinite reverse}
      @keyframes wfFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(3vw,4vh) scale(1.08)}}
      .wf-fade{animation:wfUp .5s ease both}
      @keyframes wfUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    `}</style>
  );

  if (!form) return <div className="min-h-screen flex items-center justify-center bg-[#080b12] text-gray-400 text-sm">Carregando…</div>;
  if (!form.ok) return <div className="min-h-screen flex items-center justify-center bg-[#080b12] text-gray-300 p-4 text-center">Formulário não encontrado.</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-[#080b12] text-gray-100 p-4" style={shellStyle}>
      {styleTag}{bg}
      <div className="wf-fade text-center wf-card p-10 max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: `color-mix(in srgb, ${color} 30%, transparent)`, border: `1px solid ${color}` }}><Check size={32} style={{ color }} /></div>
        <p className="font-bold text-lg">Enviado! 🎉</p>
        <p className="text-sm text-gray-400 mt-1">Obrigado. Pode fechar esta página.</p>
      </div>
    </div>
  );

  const required = (form.fields ?? []).filter((f) => f.type !== "section" && f.required);
  const filled = required.filter((f) => { const v = values[f.id]; return !(v == null || v === "" || (Array.isArray(v) && v.length === 0)); }).length;
  const pct = required.length ? Math.round((filled / required.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#080b12] text-gray-100 py-10 px-4" style={shellStyle}>
      {styleTag}{bg}
      <div className="max-w-xl mx-auto">
        <div className="wf-fade rounded-3xl p-6 mb-5 relative overflow-hidden wf-card" style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 22%, transparent), rgba(255,255,255,.03))` }}>
          <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-40" style={{ background: color }} />
          <h1 className="text-2xl font-black tracking-tight relative">{form.title}</h1>
          {form.description && <p className="text-sm text-gray-300/90 mt-1.5 whitespace-pre-wrap relative">{form.description}</p>}
          {required.length > 0 && (
            <div className="mt-4 relative">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} /></div>
              <p className="text-[11px] text-gray-400 mt-1">{filled}/{required.length} obrigatórios</p>
            </div>
          )}
        </div>

        <div className="space-y-3.5">
          {(form.fields ?? []).map((f, i) => {
            if (f.type === "section") return <h2 key={f.id} className="text-base font-bold pt-4 pl-1 wf-fade" style={{ animationDelay: `${i * 30}ms` }}>{f.label}</h2>;
            const v = values[f.id];
            return (
              <div key={f.id} className="wf-card p-4 wf-fade" style={{ animationDelay: `${i * 30}ms` }}>
                <label className="block text-sm font-semibold mb-2.5">{f.label} {f.required && <span style={{ color }}>*</span>}</label>
                {f.type === "long_text" ? (
                  <textarea rows={3} value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)} className="wf-input resize-none" />
                ) : f.type === "choice" ? (
                  <div className="space-y-1">
                    {(f.options ?? []).map((op) => (
                      <label key={op} className="wf-opt" style={v === op ? { borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}><input type="radio" name={f.id} checked={v === op} onChange={() => set(f.id, op)} style={{ accentColor: color }} /> {op}</label>
                    ))}
                  </div>
                ) : f.type === "multichoice" ? (
                  <div className="space-y-1">
                    {(f.options ?? []).map((op) => {
                      const arr = Array.isArray(v) ? (v as string[]) : [];
                      const on = arr.includes(op);
                      return <label key={op} className="wf-opt" style={on ? { borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` } : undefined}><input type="checkbox" checked={on} onChange={(e) => set(f.id, e.target.checked ? [...arr, op] : arr.filter((x) => x !== op))} style={{ accentColor: color }} /> {op}</label>;
                    })}
                  </div>
                ) : f.type === "photo" || f.type === "file" ? (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl cursor-pointer text-white font-medium" style={{ background: `color-mix(in srgb, ${color} 85%, black)` }}>
                      {f.type === "photo" ? <Camera size={16} /> : <Upload size={16} />} {v ? "Trocar" : (f.type === "photo" ? "Tirar/enviar foto" : "Enviar arquivo")}
                      <input type="file" accept={f.type === "photo" ? "image/*" : undefined} capture={f.type === "photo" ? "environment" : undefined} className="hidden"
                        onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > MAX_FILE) { setError("Arquivo muito grande (máx 3 MB)."); return; } set(f.id, await fileToDataUrl(file)); }} />
                    </label>
                    {typeof v === "string" && v.startsWith("data:image") && <img src={v} alt="" className="w-14 h-14 rounded-lg object-cover ring-2 ring-white/10" />}
                    {typeof v === "string" && v.startsWith("data:") && !v.startsWith("data:image") && <span className="text-[12px]" style={{ color }}>arquivo anexado ✓</span>}
                  </div>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
                    value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)}
                    className="wf-input" />
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <button onClick={submit} disabled={saving} className="mt-5 w-full py-3.5 rounded-2xl text-white font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[.98]" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 60%, #000))`, boxShadow: `0 8px 24px -8px ${color}` }}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : "Enviar resposta"}
        </button>
        <p className="text-[10px] text-gray-600 text-center mt-5">feito com <span style={{ color }}>Workspace</span></p>
      </div>
    </div>
  );
}
