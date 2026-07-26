"use client";

import { use, useEffect, useState } from "react";
import { AlignLeft, AtSign, Calendar, Camera, Check, Hash, Loader2, Paperclip, Phone, Type, Upload, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type FieldType = "short_text" | "long_text" | "number" | "email" | "phone" | "date" | "choice" | "multichoice" | "photo" | "file" | "section";
type Field = { id: string; label: string; type: FieldType; required?: boolean; options?: string[]; category?: string };

// Ícone por tipo/rótulo do campo (estilo do design de referência).
function iconFor(f: Field) {
  const l = f.label.toLowerCase();
  if (f.type === "email" || l.includes("e-mail") || l.includes("email")) return AtSign;
  if (f.type === "phone" || l.includes("telefone") || l.includes("whats") || l.includes("celular")) return Phone;
  if (f.type === "number" || l.includes("cnpj") || l.includes("cpf")) return Hash;
  if (f.type === "date" || l.includes("data") || l.includes("nascimento")) return Calendar;
  if (f.type === "long_text") return AlignLeft;
  if (l.includes("nome")) return User;
  return Type;
}
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
      .wf-optcard{display:flex;align-items:center;gap:.55rem;width:100%;text-align:left;font-size:.86rem;color:#e2e8f0;cursor:pointer;padding:.65rem .8rem;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);transition:all .2s cubic-bezier(.4,0,.2,1)}
      .wf-optcard:hover{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.06)}
      .wf-dot{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
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
                    <div className="grid grid-cols-2 gap-2">
                      {(f.options ?? []).map((op) => (
                        <button key={op} type="button" onClick={() => set(f.id, op)} className="wf-optcard" style={v === op ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)`, transform: "translateY(-2px)", boxShadow: `0 0 18px -4px ${color}` } : undefined}>
                          <span className="wf-dot" style={v === op ? { borderColor: color, background: color } : undefined}>{v === op && <Check size={11} className="text-white" />}</span>
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : f.type === "multichoice" ? (
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-2">
                      {(f.options ?? []).map((op) => {
                        const arr = Array.isArray(v) ? (v as string[]) : [];
                        const on = arr.includes(op);
                        return <button key={op} type="button" onClick={() => set(f.id, on ? arr.filter((x) => x !== op) : [...arr, op])} className="wf-optcard" style={on ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)`, transform: "translateY(-2px)", boxShadow: `0 0 18px -4px ${color}` } : undefined}>
                          <span className="wf-dot" style={{ borderRadius: 6, ...(on ? { borderColor: color, background: color } : {}) }}>{on && <Check size={11} className="text-white" />}</span>
                          {op}
                        </button>;
                      })}
                    </div>
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
                  (() => { const Ic = iconFor(f); return (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic size={16} /></span>
                      <input
                        type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
                        value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)}
                        className="wf-input" style={{ paddingLeft: "2.4rem" }} />
                    </div>
                  ); })()
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
