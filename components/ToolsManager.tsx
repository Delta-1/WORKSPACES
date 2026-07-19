"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, Tool } from "@/lib/types";

// Cadastro de FERRAMENTAS/aplicativos (o "download de ferramentas"): nome, foto,
// descrição e link. Esses itens aparecem no "+" do WhatsApp e no menu do acesso
// remoto para instalar rápido na máquina do cliente.
export default function ToolsManager({ profile: profileProp = null }: { profile?: Profile | null }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [editing, setEditing] = useState<Partial<Tool> | null>(null);
  const [profile, setProfile] = useState<Profile | null>(profileProp);
  // Se não veio o perfil por prop, busca sozinho (para company_id e o cargo).
  useEffect(() => {
    if (profileProp || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !supabase) return;
      supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle().then(({ data: p }) => setProfile((p as Profile) ?? null));
    });
  }, [profileProp]);
  const canManage = profile?.role === "gestor" || profile?.role === "gerente";

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("tools").select("*").order("name");
    setTools((data as Tool[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!supabase || !confirm("Remover esta ferramenta?")) return;
    await supabase.from("tools").delete().eq("id", id);
    load();
  }

  return (
    <div className="pt-3 border-t border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-2"><Package size={13} /> Download de ferramentas</p>
        {canManage && (
          <button onClick={() => setEditing({ name: "", url: "", description: "", icon_url: "" })} className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer">
            <Plus size={13} /> Nova
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400">Cadastre links de aplicativos/ferramentas. Eles aparecem no <b>+</b> do WhatsApp (mandar pro cliente) e no <b>menu de ferramentas do acesso remoto</b> (abrir/instalar na máquina).</p>
      <div className="grid grid-cols-1 gap-2">
        {tools.length === 0 && <p className="text-[11px] text-gray-500">Nenhuma ferramenta ainda.</p>}
        {tools.map((t) => (
          <div key={t.id} className="flex items-center gap-3 bg-black/20 rounded-lg p-2">
            {t.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.icon_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-indigo-950/60 flex items-center justify-center shrink-0"><Package size={16} className="text-indigo-300" /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{t.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{t.url}</p>
            </div>
            {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(t)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 cursor-pointer"><Pencil size={13} /></button>
                <button onClick={() => remove(t.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-300 cursor-pointer"><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editing && <ToolModal profile={profile} tool={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ToolModal({ profile, tool, onClose, onSaved }: { profile: Profile | null; tool: Partial<Tool>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Tool>>(tool);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Tool>) => setF((c) => ({ ...c, ...p }));

  async function uploadIcon(file: File) {
    if (!supabase) return;
    setUploading(true);
    try {
      const path = `tools/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage.from("agent-thumbs").upload(path, buf, { contentType: file.type || "image/png", upsert: true });
      if (!error) set({ icon_url: supabase.storage.from("agent-thumbs").getPublicUrl(path).data.publicUrl });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!supabase || !f.name?.trim() || !f.url?.trim() || saving) return;
    setSaving(true);
    const payload = { name: f.name.trim(), url: f.url.trim(), description: f.description?.trim() || null, icon_url: f.icon_url || null, company_id: profile?.company_id ?? null };
    if (f.id) await supabase.from("tools").update(payload).eq("id", f.id);
    else await supabase.from("tools").insert({ ...payload, created_by: profile?.id ?? null });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{f.id ? "Editar ferramenta" : "Nova ferramenta"}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-3">
          <label className="w-14 h-14 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center cursor-pointer overflow-hidden shrink-0">
            {f.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.icon_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={18} className="text-gray-500" />
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadIcon(file); }} />
          </label>
          <div className="flex-1">
            <input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Nome (ex.: CPU-Z)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <p className="text-[10px] text-gray-500 mt-1">{uploading ? "enviando ícone…" : "toque no quadrado p/ escolher o ícone"}</p>
          </div>
        </div>
        <input value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Descrição (o que faz)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <input value={f.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="Link direto (https://…)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none font-mono" />
        <button onClick={save} disabled={saving || !f.name?.trim() || !f.url?.trim()} className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm cursor-pointer disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}
