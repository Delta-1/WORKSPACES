"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Camera, Pencil, Check, Trophy, Flame, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { loadTeamMetrics, type EmployeeMetrics } from "@/lib/metrics";
import type { Profile } from "@/lib/types";

// PERFIL DO FUNCIONÁRIO — estilo Instagram: capa, foto, nome, cargo, bio, tudo
// editável rapidinho. Se as métricas estiverem ligadas, mostra o desempenho de
// atendimento; a métrica que bateu a meta aparece DOURADA e brilhando. 🏆

const ROLE_LABEL: Record<string, string> = { gestor: "Dono", gerente: "Líder", funcionario: "Atendente" };

// Redimensiona a imagem no navegador e devolve um data URL leve.
function fileToDataUrl(file: File, max: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileModal({
  profile, targetId, canEdit = true, onClose, onSaved,
}: {
  profile: Profile | null; // quem está logado
  targetId?: string; // perfil a mostrar (default: o próprio)
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: (p: Partial<Profile>) => void;
}) {
  const id = targetId || profile?.id || null;
  const isSelf = id === profile?.id;
  const [p, setP] = useState<Profile | null>(isSelf ? profile : null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState<EmployeeMetrics | null>(null);
  const [goals, setGoals] = useState<{ week: number | null; month: number | null; on: boolean }>({ week: null, month: null, on: false });
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase || !id) return;
    if (!isSelf) supabase.from("profiles").select("*").eq("id", id).maybeSingle().then(({ data }) => setP(data as Profile));
    const cid = profile?.company_id;
    if (cid) {
      supabase.from("company_settings").select("metrics_enabled, attendance_goal_week, attendance_goal_month").eq("company_id", cid).maybeSingle()
        .then(({ data }) => {
          setGoals({ week: data?.attendance_goal_week ?? null, month: data?.attendance_goal_month ?? null, on: !!data?.metrics_enabled });
          if (data?.metrics_enabled) loadTeamMetrics(cid).then((m) => setMetrics(m.get(id) ?? { profileId: id, emAndamento: 0, semana: 0, mes: 0 }));
        });
    }
  }, [id, isSelf, profile?.company_id]);

  async function pickAvatar(file: File) {
    const url = await fileToDataUrl(file, 600);
    setP((cur) => (cur ? { ...cur, avatar_url: url } : cur));
  }
  async function pickCover(file: File) {
    const url = await fileToDataUrl(file, 1400);
    setP((cur) => (cur ? { ...cur, cover_url: url } : cur));
  }
  async function save() {
    if (!supabase || !p || saving) return;
    setSaving(true);
    const patch = { full_name: p.full_name, job_title: p.job_title, bio: p.bio, avatar_url: p.avatar_url, cover_url: p.cover_url };
    await supabase.from("profiles").update(patch).eq("id", p.id);
    setSaving(false);
    setEditing(false);
    onSaved?.(patch);
  }

  if (!p) return null;
  const goldWeek = goals.on && goals.week != null && (metrics?.semana ?? 0) >= goals.week && goals.week > 0;
  const goldMonth = goals.on && goals.month != null && (metrics?.mes ?? 0) >= goals.month && goals.month > 0;

  const metricCard = (label: string, value: number, icon: ReactNode, gold: boolean, goal: number | null) => (
    <div className={`flex-1 rounded-xl border p-3 text-center ${gold ? "border-amber-400/70 bg-gradient-to-b from-amber-500/20 to-amber-600/5 shadow-[0_0_18px_rgba(251,191,36,0.35)]" : "border-white/10 bg-white/5"}`}>
      <div className={`flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide ${gold ? "text-amber-300" : "text-gray-400"}`}>{icon}{label}</div>
      <div className={`text-2xl font-extrabold mt-0.5 ${gold ? "text-amber-300 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "text-white"}`}>{value}</div>
      {goal != null && goal > 0 && <div className="text-[10px] text-gray-500 mt-0.5">meta {goal}{gold ? " ✓" : ""}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scroll" onClick={(e) => e.stopPropagation()}>
        {/* Capa */}
        <div className="relative h-28 bg-gradient-to-br from-emerald-700/40 to-sky-800/40">
          {p.cover_url && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={p.cover_url} alt="" className="w-full h-full object-cover" />)}
          <button onClick={onClose} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white cursor-pointer"><X size={16} /></button>
          {editing && (
            <button onClick={() => coverRef.current?.click()} className="absolute bottom-2 right-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-black/50 hover:bg-black/70 text-white cursor-pointer"><Camera size={12} /> Capa</button>
          )}
        </div>
        {/* Avatar + nome */}
        <div className="px-5 pb-5 -mt-10">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full border-4 border-[#0b0f16] bg-[#1c232e] overflow-hidden flex items-center justify-center text-2xl font-bold text-gray-300">
              {p.avatar_url ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />) : (p.full_name || p.email || "?").slice(0, 1).toUpperCase()}
            </div>
            {editing && (
              <button onClick={() => avatarRef.current?.click()} className="absolute bottom-0 right-0 p-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Camera size={13} /></button>
            )}
          </div>

          <div className="mt-3">
            {editing ? (
              <div className="space-y-2">
                <input value={p.full_name ?? ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} placeholder="Seu nome" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <input value={p.job_title ?? ""} onChange={(e) => setP({ ...p, job_title: e.target.value })} placeholder="Cargo (ex.: Atendente sênior)" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <textarea value={p.bio ?? ""} onChange={(e) => setP({ ...p, bio: e.target.value })} rows={2} placeholder="Bio — uma frase sobre você" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{p.full_name || p.email}</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{ROLE_LABEL[p.role] || p.role}</span>
                </div>
                {p.job_title && <p className="text-sm text-emerald-300">{p.job_title}</p>}
                {p.bio && <p className="text-sm text-gray-400 mt-1">{p.bio}</p>}
                <p className="text-[11px] text-gray-500 mt-1">{p.email}</p>
              </>
            )}
          </div>

          {/* Métricas */}
          {goals.on && metrics && !editing && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1"><Trophy size={12} className="text-amber-400" /> Desempenho de atendimento</p>
              <div className="flex gap-2">
                {metricCard("Atendendo", metrics.emAndamento, <MessageCircle size={11} />, false, null)}
                {metricCard("Semana", metrics.semana, <Flame size={11} />, goldWeek, goals.week)}
                {metricCard("Mês", metrics.mes, <Trophy size={11} />, goldMonth, goals.month)}
              </div>
              {(goldWeek || goldMonth) && <p className="text-[11px] text-amber-300 mt-2 text-center">🎉 Meta batida! Mandou bem demais.</p>}
            </div>
          )}

          {/* Ações */}
          {canEdit && isSelf && (
            <div className="mt-4 flex justify-end gap-2">
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} className="text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer">Cancelar</button>
                  <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1"><Check size={13} /> {saving ? "Salvando…" : "Salvar"}</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} className="text-xs px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer flex items-center gap-1"><Pencil size={13} /> Editar perfil</button>
              )}
            </div>
          )}
        </div>

        <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); e.currentTarget.value = ""; }} />
        <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickCover(f); e.currentTarget.value = ""; }} />
      </div>
    </div>
  );
}
