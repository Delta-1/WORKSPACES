"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Attendance, Profile, Sector, WorkspaceTask } from "@/lib/types";

const CORNER_CLASS: Record<string, string> = {
  "top-left": "top-6 left-6",
  "top-right": "top-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "bottom-right": "bottom-6 right-6",
};

export default function TVModeOverlay({
  companyName,
  logoDataUrl,
  corner,
  onClose,
}: {
  companyName: string;
  logoDataUrl: string | null;
  corner: string;
  onClose: () => void;
}) {
  const [clock, setClock] = useState("");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [presence, setPresence] = useState<Attendance[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      supabase.from("sectors").select("*"),
      supabase.from("tasks").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("attendance").select("*").eq("work_date", today).is("check_out", null),
    ]).then(([s, t, p, a]) => {
      if (s.data) setSectors(s.data);
      if (t.data) setTasks(t.data);
      if (p.data) setProfiles(p.data);
      if (a.data) setPresence(a.data);
    });

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const presentProfiles = presence.map((a) => profileById.get(a.profile_id)).filter(Boolean) as Profile[];

  return (
    <div className="fixed inset-0 z-[90] bg-black text-white flex flex-col p-10">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-gray-500 hover:text-white cursor-pointer z-10"
        style={corner === "top-right" ? { right: "auto", left: 24 } : undefined}
      >
        <X size={22} />
      </button>

      <div className={`absolute ${CORNER_CLASS[corner] ?? CORNER_CLASS["top-left"]} flex items-center gap-3`}>
        {logoDataUrl ? (
          <img src={logoDataUrl} className="w-12 h-12 rounded-xl object-cover" alt="Logo" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400 font-bold">
            {companyName.charAt(0)}
          </div>
        )}
        <span className="text-lg font-bold tracking-wide">{companyName}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 mt-16">
        <p className="text-6xl font-mono font-black text-emerald-400">{clock}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {sectors.map((s) => {
            const sectorTasks = tasks.filter((t) => t.sector_id === s.id);
            const done = sectorTasks.filter((t) => t.column_name === "concluido").length;
            const total = sectorTasks.length;
            const sectorEmployees = presentProfiles.filter((p) => p.sector_id === s.id);
            return (
              <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold uppercase tracking-wider text-sm">{s.name}</h4>
                  <span className="text-emerald-400 font-mono font-bold text-sm">
                    {done}/{total}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {sectorEmployees.length === 0 && (
                    <p className="text-xs text-gray-600 italic">Sem presença registrada</p>
                  )}
                  {sectorEmployees.map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-1 w-14">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} className="w-10 h-10 rounded-full object-cover border border-emerald-600" alt="" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-xs font-bold">
                          {(p.full_name ?? p.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[10px] text-gray-400 truncate w-full text-center">
                        {(p.full_name ?? p.email).split(" ")[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {sectors.length === 0 && (
            <p className="text-sm text-gray-500 italic col-span-3 text-center">
              Configure o organograma para ver métricas por setor aqui.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
