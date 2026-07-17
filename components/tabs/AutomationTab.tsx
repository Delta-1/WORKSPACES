"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Clock, Plus, RefreshCw, Send, Server, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import AutomationFlowBuilder from "@/components/AutomationFlowBuilder";
import type { Profile, RemoteAgent } from "@/lib/types";

type Routine = {
  id: string;
  agent_id: string;
  name: string;
  source_path: string;
  interval_minutes: number;
  to_drive: boolean;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  next_run_at: string;
  dest_type: string | null;
  dest_agent_id: string | null;
};

function fmtEvery(min: number): string {
  if (min % 1440 === 0) return `${min / 1440}d`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}min`;
}
function fmtRemaining(ms: number): string {
  if (ms <= 0) return "agora";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${sec}s`;
  return `${sec}s`;
}

type GraphFolder = { id: string; name: string };

export default function AutomationTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [folders, setFolders] = useState<GraphFolder[]>([]);
  const [flowOpen, setFlowOpen] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const bcastRef = useRef<HTMLInputElement>(null);
  const companyId = profile?.company_id ?? null;

  // Distribui um arquivo para TODOS os computadores (cai na pasta Download de cada um).
  async function broadcastFile(file: File) {
    if (!supabase || agents.length === 0) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let n = 0;
    for (const a of agents) {
      const path = `transfers/${a.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
      const { error: up } = await supabase.storage.from("automation").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: true });
      if (up) continue;
      const { error: ins } = await supabase.from("server_transfers").insert({ dest_agent_id: a.id, filename: file.name, storage_path: path, subfolder: "Download", created_by: profile?.id ?? null });
      if (!ins) n++;
    }
    setSyncMsg({ ok: true, text: `"${file.name}" enviado para ${n} computador(es) — chega na pasta Download de cada um.` });
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !companyId) return;
    const [a, r, f] = await Promise.all([
      supabase.from("remote_agents").select("*").eq("company_id", companyId).order("name"),
      supabase.from("automation_routines").select("*").order("created_at", { ascending: false }),
      supabase.from("files").select("id,name").eq("type", "folder").order("name"),
    ]);
    setAgents((a.data as RemoteAgent[]) ?? []);
    setRoutines((r.data as Routine[]) ?? []);
    setFolders((f.data as GraphFolder[]) ?? []);
  }, [companyId]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("automation")
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_routines" }, () => load())
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  async function toggle(r: Routine) {
    if (!supabase) return;
    await supabase.from("automation_routines").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  }
  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Remover esta rotina?")) return;
    await supabase.from("automation_routines").delete().eq("id", id);
    load();
  }
  // Roda a coleta+envio já, agora (adianta o next_run_at para o agente pegar no próximo ciclo).
  async function runNow(r: Routine) {
    if (!supabase) return;
    await supabase.from("automation_routines").update({ next_run_at: new Date().toISOString(), enabled: true }).eq("id", r.id);
    setSyncMsg({ ok: true, text: `"${r.name}" vai coletar no próximo ciclo do agente (até ~1 min).` });
    load();
  }
  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Bot className="text-emerald-400" size={20} /> Automação de acessos
        </h3>
        <div className="flex items-center gap-2">
          <input ref={bcastRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) broadcastFile(f); e.currentTarget.value = ""; }} />
          <button onClick={() => bcastRef.current?.click()} disabled={agents.length === 0} className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50" title="Enviar um arquivo para todos os computadores">
            <Send size={14} /> Enviar p/ todos os PCs
          </button>
          <button onClick={() => setFlowOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
            <Plus size={14} /> Nova automação
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
        <Server size={13} className="text-sky-400 shrink-0" />
        O robô coleta um arquivo <b>ou pasta inteira</b> da máquina (mesmo sem você conectar) e envia pro seu
        <b> servidor</b> na frequência escolhida. Os arquivos aparecem na <b>pasta do servidor no grafo</b>. Precisa do
        app instalado nas máquinas e de um servidor marcado no Acesso Remoto.
      </p>

      {syncMsg && (
        <p className={`text-[11px] rounded-lg px-3 py-2 border ${syncMsg.ok ? "text-emerald-300 border-emerald-500/30 bg-emerald-950/20" : "text-red-300 border-red-500/30 bg-red-950/20"}`}>
          {syncMsg.text}
        </p>
      )}

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {routines.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">Nenhuma rotina criada. Clique em “Nova rotina”.</p>
        )}
        {routines.map((r) => {
          const nextMs = new Date(r.next_run_at).getTime();
          const startMs = r.last_run_at ? new Date(r.last_run_at).getTime() : nextMs - r.interval_minutes * 60000;
          const totalMs = Math.max(1, nextMs - startMs);
          const pct = Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100));
          const remaining = nextMs - now;
          return (
            <div key={r.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{r.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{agentName.get(r.agent_id) ?? "máquina removida"}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => runNow(r)} title="Rodar agora" className="text-gray-400 hover:text-emerald-400 cursor-pointer">
                    <RefreshCw size={13} />
                  </button>
                  <button onClick={() => remove(r.id)} className="text-gray-500 hover:text-red-400 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 font-mono truncate bg-black/20 rounded px-2 py-1" title={r.source_path}>
                {r.source_path}
              </p>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500 flex items-center gap-1">
                  <RefreshCw size={11} /> a cada {fmtEvery(r.interval_minutes)}
                  {r.dest_type === "server"
                    ? ` → ${agentName.get(r.dest_agent_id ?? "") ?? "servidor"}`
                    : " → Drive"}
                </span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="accent-emerald-600 w-3.5 h-3.5" />
                  <span className={r.enabled ? "text-emerald-400" : "text-gray-500"}>{r.enabled ? "Ativa" : "Pausada"}</span>
                </label>
              </div>

              {/* Barrinha de contagem até a próxima ativação */}
              {r.enabled && (
                <div className="mt-0.5">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                    <Clock size={10} /> próxima coleta em {fmtRemaining(remaining)}
                  </p>
                </div>
              )}

              {r.last_run_at && (
                <p className="text-[10px] text-gray-600">
                  Última: {new Date(r.last_run_at).toLocaleString("pt-BR")} ·{" "}
                  <span className={r.last_status === "error" ? "text-red-400" : "text-emerald-500"}>
                    {r.last_status === "error" ? `erro: ${r.last_error?.slice(0, 40)}` : r.last_status}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {flowOpen && <AutomationFlowBuilder agents={agents} folders={folders} createdBy={profile?.id ?? null} onClose={() => setFlowOpen(false)} onSaved={load} />}
    </div>
  );
}
