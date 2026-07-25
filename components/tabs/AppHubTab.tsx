"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Package, Plus, Search, Store, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type App = { id: string; name: string; description: string | null; category: string | null; icon_url: string | null; link: string; keywords: string | null; created_at: string };

// APP HUB — a loja de aplicativos. Todo mundo navega/baixa; só o Administrador
// Geral adiciona apps. Cada app tem um link (download/instalador/página oficial).
export default function AppHubTab({ profile, superAdmin }: { profile: Profile | null; superAdmin: boolean }) {
  const [apps, setApps] = useState<App[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  void profile;

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("app_hub").select("*").order("name");
    setApps((data as App[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Remover este app da loja?")) return;
    await supabase.from("app_hub").delete().eq("id", id);
    load();
  }

  const cats = Array.from(new Set(apps.map((a) => a.category).filter(Boolean))) as string[];
  const list = apps.filter((a) => `${a.name} ${a.category ?? ""} ${a.keywords ?? ""} ${a.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><Store className="text-emerald-400" size={20} /> App Hub <span className="text-xs font-normal text-gray-500">({apps.length})</span></h3>
        <div className="flex items-center gap-2">
          <div className="liquid-glass rounded-lg flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar app…" className="bg-transparent outline-none text-xs w-48" />
          </div>
          {superAdmin && <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><Plus size={14} /> Adicionar app</button>}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">Baixe apps aprovados com um clique. A IA de acesso remoto também usa esta loja como biblioteca — quando você pede para instalar algo, ela procura aqui primeiro (link oficial, seguro).</p>

      <div className="flex-1 overflow-y-auto custom-scroll">
        {loading ? <p className="text-sm text-gray-500 p-4">Carregando…</p> : list.length === 0 ? (
          <p className="text-sm text-gray-500 p-4 text-center">{apps.length === 0 ? "Nenhum app na loja ainda." : "Nada encontrado."}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((a) => (
              <div key={a.id} className="liquid-glass rounded-2xl p-4 flex flex-col">
                <div className="flex items-start gap-3">
                  {a.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.icon_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  ) : <div className="w-12 h-12 rounded-xl bg-emerald-950/50 border border-white/10 flex items-center justify-center text-emerald-300 shrink-0"><Package size={22} /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{a.name}</p>
                    {a.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-300">{a.category}</span>}
                  </div>
                  {superAdmin && <button onClick={() => remove(a.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={14} /></button>}
                </div>
                {a.description && <p className="text-[12px] text-gray-400 mt-2 line-clamp-3 flex-1">{a.description}</p>}
                <a href={a.link} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 rounded-lg cursor-pointer">
                  <Download size={14} /> Baixar / abrir
                </a>
              </div>
            ))}
          </div>
        )}
        {cats.length > 0 && <p className="text-[10px] text-gray-600 mt-3">Categorias: {cats.join(" · ")}</p>}
      </div>

      {adding && <AddAppModal onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}

function AddAppModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!supabase || !name.trim() || !link.trim()) return;
    setSaving(true); setError(null);
    const { error } = await supabase.from("app_hub").insert({
      name: name.trim(), link: link.trim(), category: category.trim() || null,
      description: description.trim() || null, icon_url: icon.trim() || null, keywords: keywords.trim() || null,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="liquid-glass rounded-2xl p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold flex items-center gap-2"><Package size={18} className="text-emerald-400" /> Adicionar app</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do app *" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link de download / instalador / página *" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="URL do ícone" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        </div>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Palavras-chave p/ a IA achar (ex.: jogo, mojang)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" rows={2} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || !link.trim()} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-60">{saving ? "Salvando…" : "Adicionar"}</button>
        </div>
      </div>
    </div>
  );
}
