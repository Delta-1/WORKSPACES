"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CloudUpload, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
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
};

export default function AutomationTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [adding, setAdding] = useState(false);
  const [draining, setDraining] = useState(false);
  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!supabase || !companyId) return;
    const [a, r] = await Promise.all([
      supabase.from("remote_agents").select("*").eq("company_id", companyId).order("name"),
      supabase.from("automation_routines").select("*").order("created_at", { ascending: false }),
    ]);
    setAgents((a.data as RemoteAgent[]) ?? []);
    setRoutines((r.data as Routine[]) ?? []);
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
  async function drain() {
    if (!supabase) return;
    setDraining(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/automation/drain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
      });
      const json = await res.json();
      alert(res.ok ? `Enviados ${json.sent ?? 0} arquivo(s) para o Drive.` : json.error || "Erro ao enviar.");
      load();
    } finally {
      setDraining(false);
    }
  }

  const agentName = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Bot className="text-emerald-400" size={20} /> Automação de acessos
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={drain}
            disabled={draining}
            className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <CloudUpload size={14} /> {draining ? "Enviando..." : "Enviar coletados p/ Drive"}
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
          >
            <Plus size={14} /> Nova rotina
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        O robô coleta um arquivo de uma máquina (quando ela está ligada, mesmo sem você conectar) e leva pro Google
        Drive automaticamente, na frequência escolhida. Requer o app instalado na máquina e o Drive configurado.
      </p>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {routines.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">
            Nenhuma rotina criada. Clique em “Nova rotina”.
          </p>
        )}
        {routines.map((r) => (
          <div key={r.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{r.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{agentName.get(r.agent_id) ?? "máquina removida"}</p>
              </div>
              <button onClick={() => remove(r.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 font-mono truncate bg-black/20 rounded px-2 py-1" title={r.source_path}>
              {r.source_path}
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-500 flex items-center gap-1">
                <RefreshCw size={11} /> a cada {r.interval_minutes >= 60 ? `${Math.round(r.interval_minutes / 60)}h` : `${r.interval_minutes}min`}
                {r.to_drive && " → Drive"}
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="accent-emerald-600 w-3.5 h-3.5" />
                <span className={r.enabled ? "text-emerald-400" : "text-gray-500"}>{r.enabled ? "Ativa" : "Pausada"}</span>
              </label>
            </div>
            {r.last_run_at && (
              <p className="text-[10px] text-gray-600">
                Última: {new Date(r.last_run_at).toLocaleString("pt-BR")} ·{" "}
                <span className={r.last_status === "error" ? "text-red-400" : "text-emerald-500"}>
                  {r.last_status === "error" ? `erro: ${r.last_error?.slice(0, 40)}` : r.last_status}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {adding && <AddRoutineModal agents={agents} createdBy={profile?.id ?? null} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}

function AddRoutineModal({
  agents,
  createdBy,
  onClose,
  onSaved,
}: {
  agents: RemoteAgent[];
  createdBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [sourcePath, setSourcePath] = useState("");
  const [everyHours, setEveryHours] = useState(24);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!supabase || !name.trim() || !agentId || !sourcePath.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("automation_routines").insert({
      name: name.trim(),
      agent_id: agentId,
      source_path: sourcePath.trim(),
      interval_minutes: Math.max(1, Math.round(everyHours * 60)),
      to_drive: true,
      created_by: createdBy,
    });
    setSaving(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="liquid-glass rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold">Nova rotina de automação</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da rotina (ex.: Backup do relatório)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Computador</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
            {agents.length === 0 && <option value="">Nenhuma máquina sincronizada</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Caminho do arquivo na máquina</label>
          <input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="C:\Users\cliente\Documentos\relatorio.xlsx" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none" />
          <p className="text-[11px] text-gray-500 mt-1">Caminho completo do arquivo (por enquanto, um arquivo por rotina).</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Frequência (horas)</label>
          <input type="number" min={0.1} step={0.5} value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <p className="text-[11px] text-gray-500 mt-1">A cada quantas horas coletar e enviar pro Drive (ex.: 24 = 1x por dia).</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || !agentId || !sourcePath.trim()} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-60">
            {saving ? "Salvando..." : "Criar rotina"}
          </button>
        </div>
      </div>
    </div>
  );
}
