"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Flame, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { loadTeamMetrics, type EmployeeMetrics } from "@/lib/metrics";
import type { Profile } from "@/lib/types";

// DESEMPENHO DA EQUIPE — o dono vê todo mundo; o líder vê o pessoal do seu setor.
// Mostra quantos clientes cada um está atendendo AGORA (o que o líder pediu) e
// quantos atendimentos fechou na semana/mês, com destaque dourado quando bate a
// meta. Clique num card para abrir o perfil da pessoa.

type Emp = { id: string; full_name: string | null; email: string; avatar_url: string | null; role: string; sector_id: string | null };

export default function TeamMetricsPanel({ profile, onOpenProfile }: { profile: Profile | null; onOpenProfile: (id: string) => void }) {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [metrics, setMetrics] = useState<Map<string, EmployeeMetrics>>(new Map());
  const [goals, setGoals] = useState<{ week: number | null; month: number | null; on: boolean }>({ week: null, month: null, on: false });
  const [loading, setLoading] = useState(true);

  const isGestor = profile?.role === "gestor";

  const load = useCallback(async () => {
    if (!supabase || !profile?.company_id) return;
    setLoading(true);
    const cid = profile.company_id;
    // Dono vê todos; líder/gerente vê só o próprio setor.
    let q = supabase.from("profiles").select("id, full_name, email, avatar_url, role, sector_id").eq("company_id", cid).order("full_name");
    if (!isGestor && profile.sector_id) q = q.eq("sector_id", profile.sector_id);
    const [{ data: people }, { data: cs }, m] = await Promise.all([
      q,
      supabase.from("company_settings").select("metrics_enabled, attendance_goal_week, attendance_goal_month").eq("company_id", cid).maybeSingle(),
      loadTeamMetrics(cid),
    ]);
    setEmps((people as Emp[]) ?? []);
    setGoals({ week: cs?.attendance_goal_week ?? null, month: cs?.attendance_goal_month ?? null, on: !!cs?.metrics_enabled });
    setMetrics(m);
    setLoading(false);
  }, [profile?.company_id, profile?.sector_id, isGestor]);

  useEffect(() => { load(); }, [load]);

  if (!goals.on) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        As métricas de atendimento estão desligadas.{isGestor && " Ligue em Configurações → Atendimento."}
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto custom-scroll">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">{isGestor ? "Toda a equipe" : "Seu setor"} · atendimentos por pessoa</p>
        <button onClick={load} className="text-gray-500 hover:text-white cursor-pointer p-1"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {emps.map((e) => {
          const m = metrics.get(e.id) ?? { profileId: e.id, emAndamento: 0, semana: 0, mes: 0 };
          const goldWeek = goals.week != null && goals.week > 0 && m.semana >= goals.week;
          const goldMonth = goals.month != null && goals.month > 0 && m.mes >= goals.month;
          const anyGold = goldWeek || goldMonth;
          return (
            <button
              key={e.id}
              onClick={() => onOpenProfile(e.id)}
              className={`text-left rounded-xl border p-3 cursor-pointer transition hover:bg-white/5 ${anyGold ? "border-amber-400/60 bg-gradient-to-b from-amber-500/10 to-transparent shadow-[0_0_14px_rgba(251,191,36,0.25)]" : "border-white/10 bg-white/5"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-full bg-[#1c232e] overflow-hidden flex items-center justify-center text-sm font-bold text-gray-300 shrink-0">
                  {e.avatar_url ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={e.avatar_url} alt="" className="w-full h-full object-cover" />) : (e.full_name || e.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{e.full_name || e.email}</p>
                  <p className="text-[10px] text-gray-500">{e.role === "gestor" ? "Dono" : e.role === "gerente" ? "Líder" : "Atendente"}</p>
                </div>
                {anyGold && <Trophy size={16} className="text-amber-300 ml-auto animate-pulse drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />}
              </div>
              <div className="flex gap-1.5 text-center">
                <div className="flex-1 rounded-lg bg-black/20 py-1.5">
                  <div className="text-[9px] uppercase text-gray-500 flex items-center justify-center gap-0.5"><MessageCircle size={9} /> Agora</div>
                  <div className="text-base font-bold text-blue-300">{m.emAndamento}</div>
                </div>
                <div className={`flex-1 rounded-lg py-1.5 ${goldWeek ? "bg-amber-500/15" : "bg-black/20"}`}>
                  <div className={`text-[9px] uppercase flex items-center justify-center gap-0.5 ${goldWeek ? "text-amber-300" : "text-gray-500"}`}><Flame size={9} /> Semana</div>
                  <div className={`text-base font-bold ${goldWeek ? "text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "text-white"}`}>{m.semana}</div>
                </div>
                <div className={`flex-1 rounded-lg py-1.5 ${goldMonth ? "bg-amber-500/15" : "bg-black/20"}`}>
                  <div className={`text-[9px] uppercase flex items-center justify-center gap-0.5 ${goldMonth ? "text-amber-300" : "text-gray-500"}`}><Trophy size={9} /> Mês</div>
                  <div className={`text-base font-bold ${goldMonth ? "text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "text-white"}`}>{m.mes}</div>
                </div>
              </div>
            </button>
          );
        })}
        {emps.length === 0 && <p className="text-sm text-gray-500 col-span-2 text-center py-6">Ninguém para mostrar ainda.</p>}
      </div>
    </div>
  );
}
