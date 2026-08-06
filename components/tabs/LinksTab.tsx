"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderKanban, Loader2, Plus, Server, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { openWorkspaceShortcut, shortcutChanged, type WorkspaceShortcut } from "@/lib/workspace-shortcuts";
import ShortcutIcon from "@/components/ShortcutIcon";

export default function LinksTab({ profile, onOpenApp, onCreate }: { profile: Profile | null; onOpenApp: (id: string) => void; onCreate: () => void }) {
  const [items, setItems] = useState<WorkspaceShortcut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !profile?.id) { setLoading(false); return; }
    const { data } = await supabase.from("workspace_shortcuts").select("*, groups(name)").order("updated_at", { ascending: false });
    setItems((data as WorkspaceShortcut[]) ?? []);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener("workspace-shortcuts-changed", changed);
    const channel = supabase?.channel(`workspace-shortcuts:${profile?.id ?? "guest"}`).on("postgres_changes", { event: "*", schema: "public", table: "workspace_shortcuts" }, changed).subscribe();
    return () => { window.removeEventListener("workspace-shortcuts-changed", changed); if (channel) void supabase?.removeChannel(channel); };
  }, [load, profile?.id]);

  async function remove(item: WorkspaceShortcut) {
    if (!supabase || !confirm(`Remover o atalho "${item.name}"?`)) return;
    const { error } = await supabase.from("workspace_shortcuts").delete().eq("id", item.id);
    if (error) { alert(error.message); return; }
    shortcutChanged();
  }

  const sections = useMemo(() => [
    ["group", "Compartilhados nos Groups", items.filter((item) => item.scope === "group")],
    ["company", "Empresa", items.filter((item) => item.scope === "company")],
    ["personal", "Meus atalhos", items.filter((item) => item.scope === "personal")],
  ] as const, [items]);

  return (
    <div className="h-full overflow-y-auto custom-scroll p-1 sm:p-3">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><ExternalLink className="text-cyan-300" /> Links</h2>
          <p className="mt-1 text-xs text-slate-400">Nuvens, ferramentas, aplicativos e atalhos organizados num só lugar.</p>
        </div>
        <button onClick={onCreate} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"><Plus size={15} /> Novo atalho</button>
      </div>

      {loading ? <div className="grid place-items-center py-20 text-slate-500"><Loader2 className="animate-spin" /></div> : items.length === 0 ? (
        <button onClick={onCreate} className="w-full rounded-3xl border border-dashed border-white/15 py-16 text-center hover:border-emerald-500/40 hover:bg-white/[0.02]">
          <Plus className="mx-auto mb-3 text-slate-500" size={30} />
          <span className="block text-sm font-semibold text-slate-300">Crie seu primeiro atalho</span>
          <span className="mt-1 block text-xs text-slate-500">Cole um link ou escolha um app do Workspaces.</span>
        </button>
      ) : (
        <div className="space-y-6">
          {sections.map(([id, title, list]) => list.length > 0 && (
            <section key={id}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">{id === "group" ? <FolderKanban size={14} /> : id === "company" ? <Server size={14} /> : null}{title}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((item) => (
                  <div key={item.id} className="group relative rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:-translate-y-0.5 hover:border-cyan-500/35 hover:bg-white/[0.055]">
                    <button onClick={() => openWorkspaceShortcut(item, onOpenApp)} className="w-full text-left">
                      <ShortcutIcon provider={item.provider} size={22} className="mb-3 h-11 w-11" />
                      <span className="block truncate text-sm font-semibold text-white">{item.name}</span>
                      <span className="mt-1 block truncate text-[10px] text-slate-500">{item.scope === "group" ? item.groups?.name ?? "Group" : item.description || item.target}</span>
                    </button>
                    {(item.scope !== "group" && (item.created_by === profile?.id || profile?.role === "gestor")) && (
                      <button onClick={() => remove(item)} className="absolute right-2 top-2 rounded-lg bg-black/40 p-1.5 text-slate-500 opacity-0 transition hover:bg-red-500/25 hover:text-red-300 group-hover:opacity-100" title="Remover"><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
