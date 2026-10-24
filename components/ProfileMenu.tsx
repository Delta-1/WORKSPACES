"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile } from "@/lib/types";
import { attendancePosition as normalizedPosition, cleanAttendantName } from "@/whatsapp-service/src/attendant-signature";
import { Camera, Languages, LogOut, Moon, Pencil, Sun, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { APP_LANGUAGES, type AppLanguage } from "@/lib/language";

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
  language,
  attendanceName, attendancePosition, jobTitle, bio,
  onToggleTheme,
  onLogout,
  onProfileUpdated,
}: {
  name: string;
  role: string;
  theme: "dark" | "light";
  profileId?: string | null;
  avatarUrl?: string | null;
  language: AppLanguage;
  attendanceName?: string | null;
  attendancePosition?: "top" | "bottom";
  jobTitle?: string | null;
  bio?: string | null;
  onToggleTheme: () => void;
  onLogout: () => void;
  onProfileUpdated?: (patch: Partial<Pick<Profile, "full_name" | "avatar_url" | "language" | "attendance_name" | "attendance_position" | "job_title" | "bio">>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatarUrl ?? null);
  const [draftLanguage, setDraftLanguage] = useState<AppLanguage>(language);
  const [draftAttendance, setDraftAttendance] = useState(attendanceName ?? "");
  const [draftPosition, setDraftPosition] = useState<"top" | "bottom">(normalizedPosition(attendancePosition));
  const [draftJob, setDraftJob] = useState(jobTitle ?? "");
  const [draftBio, setDraftBio] = useState(bio ?? "");
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!editing) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, [editing]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openEditor() {
    setDraftName(name);
    setDraftAvatar(avatarUrl ?? null);
    setDraftLanguage(language);
    setDraftPosition(normalizedPosition(attendancePosition));
    setDraftAttendance(attendanceName ?? ""); setDraftJob(jobTitle ?? ""); setDraftBio(bio ?? ""); setError("");
    setEditing(true);
    setOpen(false);
  }

  async function pickPhoto(file: File) {
    setPhotoBusy(true); setError("");
    try {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw Error("Escolha uma imagem de até 5 MB.");
      setDraftAvatar(await resizeImage(file));
    } catch (e) { setError(e instanceof Error ? e.message : "Não consegui abrir esta foto."); }
    finally { setPhotoBusy(false); }
  }

  async function save() {
    const newName = draftName.replace(/\s+/g, " ").trim();
    if (saving || photoBusy || !newName) return;
    setSaving(true); setError("");
    try {
      if (!supabase || !profileId) throw Error("Entre na sua conta para salvar o perfil.");
      const patch = { full_name: newName, avatar_url: draftAvatar, language: draftLanguage, attendance_name: cleanAttendantName(draftAttendance) || null, attendance_position: draftPosition, job_title: draftJob.trim() || null, bio: draftBio.trim() || null };
      const { data, error: saveError } = await supabase.from("profiles").update(patch).eq("id", profileId).select("full_name,avatar_url,language,attendance_name,attendance_position,job_title,bio").single();
      if (saveError || !data) throw Error("Não foi possível salvar seu perfil. Tente novamente.");
      onProfileUpdated?.(data);
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  }


  return (
    <div className="relative">
      <button
        aria-label="Abrir menu da conta" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full liquid-glass cursor-pointer"
      >
        <Avatar size={32} avatarUrl={avatarUrl} name={name} />
        <span className="text-sm font-medium hidden sm:block">{name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="drawer-anim absolute right-0 mt-2 w-64 liquid-glass rounded-xl p-3 z-40 shadow-2xl">
            <div className="px-2 py-2 border-b border-white/10 mb-2 flex items-center gap-2.5">
              <Avatar size={38} avatarUrl={avatarUrl} name={name} />
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

      {editing && createPortal(
          <dialog ref={dialogRef} aria-label="Editar perfil da conta" onCancel={event => { event.preventDefault(); if (!saving && !photoBusy) setEditing(false); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f16] p-5 text-slate-100 space-y-4 backdrop:bg-black/70">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><User size={16} /> Editar perfil</h3>
              <button aria-label="Fechar edição do perfil" disabled={saving || photoBusy} onClick={() => setEditing(false)} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button disabled={saving || photoBusy} onClick={() => fileRef.current?.click()} className="relative group cursor-pointer" title="Trocar foto">
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
                <button disabled={saving || photoBusy} onClick={() => setDraftAvatar(null)} className="text-[11px] text-gray-400 hover:text-red-400 underline cursor-pointer">
                  Remover foto
                </button>
              )}
            </div>
            <div>
              <label htmlFor="profile-name" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Nome da conta</label>
              <input
                id="profile-name" maxLength={120} autoComplete="name" disabled={saving}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Como você quer ser chamado"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label htmlFor="profile-attendance" className="block text-xs font-semibold text-gray-400 mb-1.5">Nome de atendimento no WhatsApp</label>
              <input id="profile-attendance" value={draftAttendance} onChange={e => setDraftAttendance(e.target.value)} disabled={saving} maxLength={80} placeholder={draftName || "Ex.: Vanessa • Suporte"} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base outline-none" />
              <p className="text-xs text-gray-400 mt-1">Deixe em branco para usar o nome da conta. Textos e legendas recebem este nome em negrito na posição escolhida.</p>
              <label htmlFor="profile-signature-position" className="block text-xs font-semibold text-gray-400 mt-3 mb-1.5">Posição da identificação</label>
              <select id="profile-signature-position" value={draftPosition} onChange={e => setDraftPosition(e.target.value as "top" | "bottom")} disabled={saving} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base outline-none">
                <option value="top" className="bg-[#0b1019]">Acima da mensagem (padrão)</option>
                <option value="bottom" className="bg-[#0b1019]">Abaixo da mensagem</option>
              </select>
              <div aria-label="Prévia da assinatura" className="mt-3 rounded-xl bg-emerald-800 p-3 text-sm text-white">{draftPosition === "bottom" && <p>Olá! Como posso ajudar?</p>}<strong className={`block break-words ${draftPosition === "top" ? "mb-3" : "mt-3"}`}>{cleanAttendantName(draftAttendance) || cleanAttendantName(draftName) || "Seu nome"}</strong>{draftPosition === "top" && <p>Olá! Como posso ajudar?</p>}</div>
            </div>
            <div>
              <label htmlFor="profile-job" className="block text-xs font-semibold text-gray-400 mb-1.5">Cargo ou função (opcional)</label>
              <input id="profile-job" value={draftJob} onChange={e => setDraftJob(e.target.value)} maxLength={100} disabled={saving} placeholder="Ex.: Suporte técnico" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base outline-none" />
            </div>
            <div>
              <label htmlFor="profile-bio" className="block text-xs font-semibold text-gray-400 mb-1.5">Sobre mim (opcional)</label>
              <textarea id="profile-bio" value={draftBio} onChange={e => setDraftBio(e.target.value)} maxLength={500} rows={3} disabled={saving} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-base outline-none" />
            </div>
            <div>
              <label htmlFor="profile-language" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Languages size={13} /> Idioma do sistema e das notícias
              </label>
              <select
                id="profile-language" disabled={saving}
                value={draftLanguage}
                onChange={(event) => setDraftLanguage(event.target.value as AppLanguage)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none cursor-pointer"
              >
                {APP_LANGUAGES.map((item) => <option key={item.code} value={item.code} className="bg-[#0b1019]">{item.flag} {item.label}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-gray-500">As manchetes do Mundo serão entregues neste idioma.</p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button disabled={saving || photoBusy} onClick={() => setEditing(false)} className="text-xs px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || photoBusy || !draftName.trim()}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </dialog>, document.body
      )}
    </div>
  );
}

function Avatar({ size, avatarUrl, name }: { size: number; avatarUrl?: string | null; name: string }) { return avatarUrl ? (
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
}
