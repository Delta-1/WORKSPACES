"use client";

import { useRef, useState } from "react";
import { Camera, LogOut, Moon, Pencil, Sun, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

// Reduz a foto escolhida para um quadrado pequeno (≤256px) e devolve como
// data URL — evita guardar imagens gigantes no perfil.
function resizeImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfileMenu({
  name,
  role,
  theme,
  profileId,
  avatarUrl,
  onToggleTheme,
  onLogout,
  onProfileUpdated,
}: {
  name: string;
  role: string;
  theme: "dark" | "light";
  profileId?: string | null;
  avatarUrl?: string | null;
  onToggleTheme: () => void;
  onLogout: () => void;
  onProfileUpdated?: (patch: { full_name?: string; avatar_url?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openEditor() {
    setDraftName(name);
    setDraftAvatar(avatarUrl ?? null);
    setEditing(true);
    setOpen(false);
  }

  async function pickPhoto(file: File) {
    try {
      setDraftAvatar(await resizeImage(file));
    } catch {
      /* ignore */
    }
  }

  async function save() {
    const newName = draftName.trim();
    if (!newName) return;
    setSaving(true);
    const patch: { full_name: string; avatar_url?: string } = { full_name: newName };
    if (draftAvatar !== (avatarUrl ?? null)) patch.avatar_url = draftAvatar ?? undefined;
    if (supabase && profileId) {
      await supabase.from("profiles").update(patch).eq("id", profileId);
    }
    onProfileUpdated?.({ full_name: newName, avatar_url: draftAvatar ?? undefined });
    setSaving(false);
    setEditing(false);
  }

  const Avatar = ({ size }: { size: number }) =>
    avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className="rounded-full object-cover border border-emerald-500" style={{ width: size, height: size }} />
    ) : (
      <div
        className="rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white border border-emerald-500"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full liquid-glass cursor-pointer"
      >
        <Avatar size={32} />
        <span className="text-sm font-medium hidden sm:block">{name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="drawer-anim absolute right-0 mt-2 w-64 liquid-glass rounded-xl p-3 z-40 shadow-2xl">
            <div className="px-2 py-2 border-b border-white/10 mb-2 flex items-center gap-2.5">
              <Avatar size={38} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{name}</p>
                <p className="text-xs text-gray-400">{role}</p>
              </div>
            </div>
            <button
              onClick={openEditor}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-white/10 cursor-pointer"
            >
              <Pencil size={16} /> Editar perfil
            </button>
            <button
              onClick={onToggleTheme}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-white/10 cursor-pointer"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(false)}>
          <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><User size={16} /> Editar perfil</h3>
              <button onClick={() => setEditing(false)} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="relative group cursor-pointer" title="Trocar foto">
                {draftAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draftAvatar} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-emerald-500" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-emerald-700 flex items-center justify-center text-3xl font-bold text-white border-2 border-emerald-500">
                    {draftName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera size={22} className="text-white" />
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
              {draftAvatar && (
                <button onClick={() => setDraftAvatar(null)} className="text-[11px] text-gray-400 hover:text-red-400 underline cursor-pointer">
                  Remover foto
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Seu nome</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Como você quer ser chamado"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEditing(false)} className="text-xs px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !draftName.trim()}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
