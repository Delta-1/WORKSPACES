"use client";

import { useEffect, useState } from "react";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Announcement, Profile } from "@/lib/types";

type Row = Announcement & { profiles: { full_name: string | null; email: string } | null };

export default function AnnouncementsTab({ profile }: { profile: Profile | null }) {
  const [announcements, setAnnouncements] = useState<Row[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  const canManage = profile?.role === "gestor" || profile?.role === "gerente";

  async function load() {
    if (!supabase) return;
    const { data } = await supabase
      .from("announcements")
      .select("*, profiles:author_id(full_name, email)")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data as unknown as Row[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publish() {
    if (!supabase || !title.trim() || !body.trim()) return;
    await supabase
      .from("announcements")
      .insert({ title: title.trim(), body: body.trim(), pinned, author_id: profile?.id ?? null });
    setTitle("");
    setBody("");
    setPinned(false);
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Remover este aviso?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    load();
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Megaphone className="text-amber-400" size={20} /> Mural de Avisos
        </h3>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
          >
            <Plus size={14} /> Novo aviso
          </button>
        )}
      </div>

      {showForm && (
        <div className="liquid-glass rounded-2xl p-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do aviso"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mensagem..."
            rows={3}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="accent-emerald-600"
              />
              Fixar no topo
            </label>
            <button
              onClick={publish}
              disabled={!title.trim() || !body.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
            >
              Publicar
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
        {announcements.length === 0 && (
          <p className="text-sm text-gray-500 italic text-center py-8">Nenhum aviso publicado ainda.</p>
        )}
        {announcements.map((a) => (
          <div key={a.id} className="liquid-glass rounded-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {a.pinned && <Pin size={13} className="text-amber-400 shrink-0" />}
                <h4 className="text-sm font-bold">{a.title}</h4>
              </div>
              {canManage && (
                <button onClick={() => remove(a.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-300 mt-1.5 whitespace-pre-wrap">{a.body}</p>
            <p className="text-[11px] text-gray-500 mt-2">
              {a.profiles?.full_name ?? a.profiles?.email ?? "Equipe"} · {new Date(a.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
