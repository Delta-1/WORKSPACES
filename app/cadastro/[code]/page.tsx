"use client";

import { use, useEffect, useState } from "react";
import { Building2, Check, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

// Formulário PÚBLICO de cadastro de cliente. A empresa compartilha o link
// /cadastro/<CÓDIGO> e o cliente se cadastra sozinho — sem login. Cai direto na
// base de Clientes daquela empresa.
export default function CadastroPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [company, setCompany] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [theme, setTheme] = useState("#10b981");
  const [extra, setExtra] = useState<{ id: string; label: string; type: string; required?: boolean; options?: string[] }[]>([]);
  const [extraVals, setExtraVals] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("get_client_form", { p_code: code }).then(({ data }) => {
      const d = data as { ok: boolean; company?: string; theme?: string; extra?: typeof extra } | null;
      if (!d?.ok) { setInvalid(true); return; }
      setCompany(d.company ?? "");
      setTheme(d.theme || "#10b981");
      setExtra(Array.isArray(d.extra) ? d.extra : []);
    });
  }, [code]);

  async function submit() {
    if (!supabase || !name.trim()) return;
    for (const f of extra) { if (f.required && !extraVals[f.id]?.trim()) { setError(`Preencha: ${f.label}`); return; } }
    setSaving(true);
    setError(null);
    // Mapeia os extras por rótulo (fica legível nos dados do cliente).
    const extraByLabel: Record<string, string> = {};
    extra.forEach((f) => { if (extraVals[f.id]) extraByLabel[f.label] = extraVals[f.id]; });
    const { error } = await supabase.rpc("public_register_client", {
      p_code: code, p_name: name, p_phone: phone, p_document: document, p_email: email, p_notes: notes, p_extra: extraByLabel,
    });
    setSaving(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  const shellStyle = { ["--wf" as string]: theme } as React.CSSProperties;
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080b12] p-4 text-gray-100" style={shellStyle}>
      <style>{`
        .wf-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:.65rem .85rem;font-size:.9rem;outline:none;transition:border-color .15s,box-shadow .15s,background .15s;color:#f1f5f9}
        .wf-input:focus{border-color:var(--wf);box-shadow:0 0 0 3px color-mix(in srgb,var(--wf) 30%,transparent);background:rgba(255,255,255,.06)}
        .wf-orb{position:absolute;width:46vw;height:46vw;max-width:600px;max-height:600px;border-radius:50%;filter:blur(90px);opacity:.2}
        @keyframes wfFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(3vw,4vh) scale(1.08)}}
        .wf-fade{animation:wfUp .5s ease both}@keyframes wfUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      `}</style>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="wf-orb" style={{ background: theme, top: "-14vw", left: "-10vw", animation: "wfFloat 14s ease-in-out infinite" }} />
        <div className="wf-orb" style={{ background: theme, bottom: "-16vw", right: "-12vw", opacity: .14, animation: "wfFloat 18s ease-in-out infinite reverse" }} />
      </div>
      <div className="w-full max-w-md wf-fade">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl mb-3 shadow-lg" style={{ background: `linear-gradient(135deg, ${theme}, color-mix(in srgb, ${theme} 55%, #000))`, color: "#fff" }}>
            <Building2 size={28} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{company ? company : invalid ? "Link inválido" : "Carregando…"}</h1>
          {!invalid && company && <p className="text-gray-400 text-sm mt-1">Cadastro rápido — preencha seus dados abaixo.</p>}
        </div>

        {invalid ? (
          <p className="text-center text-sm text-gray-400 bg-white/5 border border-white/10 rounded-2xl p-6">Este link de cadastro não é válido. Peça um novo à empresa.</p>
        ) : done ? (
          <div className="text-center rounded-3xl p-10" style={{ background: `color-mix(in srgb, ${theme} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${theme} 40%, transparent)` }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `color-mix(in srgb, ${theme} 30%, transparent)`, border: `1px solid ${theme}` }}><Check size={32} style={{ color: theme }} /></div>
            <p className="font-bold text-lg">Enviado! 🎉</p>
            <p className="text-sm text-gray-400 mt-1">A empresa já recebeu seus dados. Pode fechar esta página.</p>
          </div>
        ) : (
          <div className="rounded-3xl p-6 space-y-3" style={{ background: "rgba(255,255,255,.035)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.08)" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome / Razão social *" className="wf-input" />
            <div className="grid grid-cols-2 gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone / WhatsApp" className="wf-input" />
              <input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="CNPJ / CPF" className="wf-input" />
            </div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="wf-input" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)" rows={2} className="wf-input resize-none" />

            {/* Campos extras que a empresa adicionou ao formulário */}
            {extra.map((f) => (
              <div key={f.id}>
                <label className="block text-xs font-medium mb-1 text-gray-300">{f.label} {f.required && <span style={{ color: theme }}>*</span>}</label>
                {f.type === "long_text" ? (
                  <textarea value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} rows={2} className="wf-input resize-none" />
                ) : f.type === "choice" ? (
                  <select value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} className="wf-input">
                    <option value="">Selecione…</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"} value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} className="wf-input" />
                )}
              </div>
            ))}

            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={submit} disabled={saving || !name.trim()} className="w-full text-white font-semibold py-3.5 rounded-2xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[.98]" style={{ background: `linear-gradient(135deg, ${theme}, color-mix(in srgb, ${theme} 60%, #000))`, boxShadow: `0 8px 24px -8px ${theme}` }}>
              {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><UserPlus size={16} /> Enviar cadastro</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
