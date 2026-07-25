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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060a12] p-4 text-gray-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ backgroundColor: `${theme}22`, border: `1px solid ${theme}`, color: theme }}>
            <Building2 size={26} />
          </div>
          <h1 className="text-xl font-bold">{company ? `Cadastro — ${company}` : invalid ? "Link inválido" : "Carregando…"}</h1>
          {!invalid && <p className="text-gray-400 text-sm mt-1">Preencha seus dados para se cadastrar. É rápido.</p>}
        </div>

        {invalid ? (
          <p className="text-center text-sm text-gray-400 bg-black/20 rounded-xl p-6">Este link de cadastro não é válido. Peça um novo à empresa.</p>
        ) : done ? (
          <div className="text-center bg-emerald-950/30 border border-emerald-700/40 rounded-2xl p-8">
            <div className="w-14 h-14 rounded-full bg-emerald-600/30 border border-emerald-500 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-emerald-300" /></div>
            <p className="font-semibold">Cadastro enviado!</p>
            <p className="text-sm text-gray-400 mt-1">A empresa já recebeu seus dados. Pode fechar esta página.</p>
          </div>
        ) : (
          <div className="liquid-glass rounded-2xl p-6 space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome / Razão social *" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone / WhatsApp" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
              <input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="CNPJ / CPF" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            </div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)" rows={2} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none resize-none" />

            {/* Campos extras que a empresa adicionou ao formulário */}
            {extra.map((f) => (
              <div key={f.id}>
                <label className="block text-xs font-medium mb-1 text-gray-300">{f.label} {f.required && <span style={{ color: theme }}>*</span>}</label>
                {f.type === "long_text" ? (
                  <textarea value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} rows={2} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none resize-none" />
                ) : f.type === "choice" ? (
                  <select value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none">
                    <option value="">Selecione…</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"} value={extraVals[f.id] ?? ""} onChange={(e) => setExtraVals((s) => ({ ...s, [f.id]: e.target.value }))} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
                )}
              </div>
            ))}

            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={submit} disabled={saving || !name.trim()} className="w-full text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2" style={{ backgroundColor: theme }}>
              {saving ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><UserPlus size={16} /> Enviar cadastro</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
