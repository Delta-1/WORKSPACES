"use client";

import { useEffect, useState } from "react";
import { Package, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Tool } from "@/lib/types";

// Modal que lista as ferramentas/aplicativos cadastrados. Usado no "+" do
// WhatsApp (para MANDAR o link) e no menu do acesso remoto (para ABRIR/instalar
// na máquina do cliente). onPick recebe a ferramenta escolhida.
export default function ToolsPicker({ title = "Ferramentas", actionLabel, onPick, onClose }: { title?: string; actionLabel?: string; onPick: (t: Tool) => void; onClose: () => void }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("tools").select("*").order("name").then(({ data }) => {
      setTools((data as Tool[]) ?? []);
      setLoading(false);
    });
  }, []);

  const list = tools.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] flex flex-col bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold flex items-center gap-2"><Package size={15} className="text-indigo-400" /> {title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2.5 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ferramenta…" className="bg-transparent outline-none text-xs w-full" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
          {loading && <p className="text-[11px] text-gray-500 p-3 text-center">Carregando…</p>}
          {!loading && list.length === 0 && <p className="text-[11px] text-gray-500 p-3 text-center">Nenhuma ferramenta cadastrada. Cadastre em Configurações → Ferramentas.</p>}
          {list.map((t) => (
            <button key={t.id} onClick={() => onPick(t)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer text-left">
              {t.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.icon_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-lg bg-indigo-950/60 flex items-center justify-center shrink-0"><Package size={16} className="text-indigo-300" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{t.name}</span>
                {t.description && <span className="block text-[11px] text-gray-400 truncate">{t.description}</span>}
              </span>
              {actionLabel && <span className="text-[10px] px-2 py-1 rounded-md bg-indigo-600/30 text-indigo-200 shrink-0">{actionLabel}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
