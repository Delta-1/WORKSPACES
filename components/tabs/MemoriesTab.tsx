"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Globe, Lock, Trash2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type Memory = { id: string; title: string; task: string | null; steps: string[]; scope: string; created_by: string | null; created_at: string };

export default function MemoriesTab({ profile }: { profile: Profile | null }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [superAdmin, setSuperAdmin] = useState(false);

  useEffect(() => { supabase?.rpc("is_super_admin").then(({ data }) => setSuperAdmin(!!data)); }, []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("orb_memories").select("*").order("created_at", { ascending: false }).limit(300);
    setMemories(((data as Memory[]) ?? []).map((m) => ({ ...m, steps: Array.isArray(m.steps) ? m.steps : [] })));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel("orb-memories").on("postgres_changes", { event: "*", schema: "public", table: "orb_memories" }, () => load()).subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [load]);

  async function publish(m: Memory) {
    if (!supabase) return;
    if (!confirm(`Publicar "${m.title}" na memória dos Orbs de TODOS os usuários?`)) return;
    await supabase.from("orb_memories").update({ scope: "global" }).eq("id", m.id);
    load();
  }
  async function unpublish(m: Memory) {
    if (!supabase) return;
    await supabase.from("orb_memories").update({ scope: "private" }).eq("id", m.id);
    load();
  }
  async function remove(id: string) {
    if (!supabase || !confirm("Excluir esta memória?")) return;
    await supabase.from("orb_memories").delete().eq("id", id);
    load();
  }

  const filtered = memories.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (m.title || "").toLowerCase().includes(q) || (m.task || "").toLowerCase().includes(q) || m.steps.join(" ").toLowerCase().includes(q);
  });

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><Brain className="text-indigo-400" size={20} /> Memórias do Orb <span className="text-xs font-normal text-gray-500">({memories.length})</span></h3>
      </div>
      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        Cada tarefa que o Orb conclui vira uma memória com o passo a passo. Publicar uma memória a torna <b>global</b> — o Orb de todos os usuários aprende com ela, sem precisar reensinar.
      </p>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por tarefa ou passo…" className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-500" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
        {loading ? <p className="text-sm text-gray-500 p-2">Carregando…</p> : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 p-4 text-center">Nenhuma memória ainda. Use o Orb no acesso remoto para ele aprender — cada tarefa concluída vira uma memória aqui.</p>
        ) : filtered.map((m) => {
          const isOpen = !!open[m.id];
          const mine = m.created_by === profile?.id;
          return (
            <div key={m.id} className="rounded-xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-2 p-3">
                <button onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))} className="text-gray-400 hover:text-white cursor-pointer shrink-0">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                <button onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-sm font-medium truncate">{m.title}</p>
                  <p className="text-[10px] text-gray-500 truncate">{m.steps.length} passo(s) · {new Date(m.created_at).toLocaleDateString("pt-BR")}</p>
                </button>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${m.scope === "global" ? "bg-emerald-600/30 text-emerald-300" : "bg-white/10 text-gray-400"}`}>
                  {m.scope === "global" ? <><Globe size={10} /> Global</> : <><Lock size={10} /> Privada</>}
                </span>
                {(superAdmin || mine) && (
                  m.scope === "global"
                    ? <button onClick={() => unpublish(m)} title="Tornar privada" className="shrink-0 text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15 cursor-pointer">Despublicar</button>
                    : superAdmin && <button onClick={() => publish(m)} title="Publicar para todos os Orbs" className="shrink-0 text-[10px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1"><Globe size={10} /> Publicar</button>
                )}
                {(superAdmin || mine) && <button onClick={() => remove(m.id)} title="Excluir" className="shrink-0 text-gray-500 hover:text-red-400 cursor-pointer"><Trash2 size={13} /></button>}
              </div>
              {isOpen && (
                <div className="px-4 pb-3 pt-0 border-t border-white/5">
                  {m.task && <p className="text-[11px] text-gray-400 mt-2 mb-1">Quando: <span className="text-gray-300">{m.task}</span></p>}
                  <ol className="space-y-1 mt-1">
                    {m.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-gray-200">
                        <span className="shrink-0 w-5 h-5 rounded bg-indigo-600/30 text-indigo-200 text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                        <span className="min-w-0">{s}</span>
                      </li>
                    ))}
                    {m.steps.length === 0 && <li className="text-[11px] text-gray-500">Sem passos registrados.</li>}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
