"use client";

import { useCallback, useEffect, useState } from "react";
import { Gamepad2, Monitor, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { Profile, RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  return a.status === "online" && !!a.last_seen && Date.now() - new Date(a.last_seen).getTime() < 120000;
}

// APP GAME — biblioteca de "logins de jogo": as máquinas (PCs) que você registrou
// no Acesso Remoto aparecem aqui e abrem direto no modo jogo (controle na tela).
export default function GameTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [playing, setPlaying] = useState<RemoteAgent | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("my_remote_agents");
    if (data) setAgents(data as RemoteAgent[]);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("game-agents")
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_agents" }, () => load())
      .subscribe();
    const t = setInterval(() => setTick((v) => v + 1), 15000); // reavalia online/offline
    return () => { if (supabase) supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);

  return (
    <div className="h-full overflow-y-auto custom-scroll p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
          <Gamepad2 size={20} className="text-fuchsia-400" /> Game
        </h2>
        <p className="text-[12px] text-gray-400 mb-4">
          Suas máquinas de jogo. Toque numa que esteja <b>online</b> para jogar com o controle na tela do celular.
        </p>

        {agents.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Gamepad2 size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma máquina registrada ainda.</p>
            <p className="text-[12px] mt-1 flex items-center justify-center gap-1">
              Registre um PC no <b>Acesso Remoto</b> <Plus size={12} /> e ele aparece aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {agents.map((a) => {
              const online = isOnline(a);
              return (
                <button
                  key={a.id}
                  onClick={() => online && setPlaying(a)}
                  disabled={!online}
                  className={`rounded-2xl p-4 text-left border transition-colors ${online ? "border-fuchsia-500/40 bg-fuchsia-950/15 hover:bg-fuchsia-950/30 cursor-pointer" : "border-white/10 bg-black/20 opacity-60 cursor-not-allowed"}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${online ? "bg-fuchsia-900/50 text-fuchsia-300" : "bg-gray-800 text-gray-500"}`}>
                    <Monitor size={22} />
                  </div>
                  <p className="text-sm font-bold truncate">{a.name}</p>
                  <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${online ? "text-emerald-400" : "text-gray-500"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-gray-600"}`} />
                    {online ? "Pronto para jogar" : "Offline"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {playing && <RemoteViewer agent={playing} profile={profile} onClose={() => setPlaying(null)} initialGame />}
    </div>
  );
}
