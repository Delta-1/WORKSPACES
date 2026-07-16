"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock, CloudUpload, FolderSearch, HardDrive, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import AgentFolderPicker from "@/components/AgentFolderPicker";
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
  const [adding, setAdding] = useState(false);
  const [draining, setDraining] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const companyId = profile?.company_id ?? null;

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
      if (res.ok) setSyncMsg({ ok: true, text: `Enviados ${json.sent ?? 0} arquivo(s) para o Google Drive.` });
      else setSyncMsg({ ok: false, text: json.error || "Erro ao enviar para o Drive." });
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
          <button onClick={drain} disabled={draining} className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50">
            <CloudUpload size={14} /> {draining ? "Enviando..." : "Enviar coletados p/ Drive"}
          </button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
            <Plus size={14} /> Nova rotina
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
        <HardDrive size={13} className="text-sky-400 shrink-0" />
        O robô coleta um arquivo <b>ou pasta inteira</b> da máquina (mesmo sem você conectar) e envia pro Google Drive na
        frequência escolhida. Precisa do app instalado na máquina e do <b>Drive conectado</b> (Configurações → Drive).
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

      {adding && <AddRoutineModal agents={agents} folders={folders} createdBy={profile?.id ?? null} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}

function AddRoutineModal({
  agents,
  folders,
  createdBy,
  onClose,
  onSaved,
}: {
  agents: RemoteAgent[];
  folders: GraphFolder[];
  createdBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [sourcePath, setSourcePath] = useState("");
  const [destPath, setDestPath] = useState("");
  const [graphFolderId, setGraphFolderId] = useState("");
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<"minutos" | "horas" | "dias">("dias");
  const [dest, setDest] = useState("drive"); // "drive" | <serverAgentId>
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<"source" | "dest" | null>(null);

  const factor = unit === "dias" ? 1440 : unit === "horas" ? 60 : 1;
  const servers = agents.filter((a) => a.is_server);
  const toServer = dest !== "drive";

  async function save() {
    if (!supabase || !name.trim() || !agentId || !sourcePath.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("automation_routines").insert({
      name: name.trim(),
      agent_id: agentId,
      source_path: sourcePath.trim(),
      interval_minutes: Math.max(1, Math.round(every * factor)),
      to_drive: !toServer,
      dest_type: toServer ? "server" : "drive",
      dest_agent_id: toServer ? dest : null,
      dest_path: toServer && destPath.trim() ? destPath.trim() : null,
      graph_folder_id: graphFolderId || null,
      created_by: createdBy,
      next_run_at: new Date().toISOString(), // já roda no próximo ciclo do agente
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
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Arquivo ou pasta</label>
          <div className="flex items-center gap-2">
            <input
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="Selecione na máquina (ou digite o caminho)"
              className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            />
            <button
              onClick={() => setPicking("source")}
              disabled={!agentId}
              title={agentId ? "Navegar na máquina e escolher" : "Escolha um computador primeiro"}
              className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0"
            >
              <FolderSearch size={14} /> Escolher
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">A máquina precisa estar ligada/online para navegar nas pastas.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Frequência</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} step={1} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="w-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
              <option value="minutos">minuto(s)</option>
              <option value="horas">hora(s)</option>
              <option value="dias">dia(s)</option>
            </select>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">A cada quanto tempo coletar e enviar. A rotina já roda a primeira vez ao ser criada.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Enviar para</label>
          <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
            <option value="drive">Google Drive</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>Servidor: {s.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            {servers.length === 0
              ? "Dica: marque uma máquina como servidor no Acesso Remoto para enviar sem depender do Drive."
              : "Drive (nuvem) ou um servidor (uma máquina sua guarda os arquivos, sem depender do Google)."}
          </p>
        </div>

        {toServer && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pasta de destino no servidor</label>
            <div className="flex items-center gap-2">
              <input
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                placeholder="Onde colar (vazio = WorkspaceServer/Arquivos)"
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
              />
              <button
                onClick={() => setPicking("dest")}
                title="Navegar no servidor e escolher/criar a pasta de destino"
                className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer shrink-0"
              >
                <FolderSearch size={14} /> Escolher
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mostrar no grafo (opcional)</label>
          <select value={graphFolderId} onChange={(e) => setGraphFolderId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
            <option value="">Não mostrar no grafo</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>Pasta: {f.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">Os arquivos coletados aparecem nessa pasta do grafo (atualiza sozinho).</p>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || !agentId || !sourcePath.trim()} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-60">
            {saving ? "Salvando..." : "Criar rotina"}
          </button>
        </div>
      </div>

      {picking === "source" && agentId && (
        <AgentFolderPicker
          agentId={agentId}
          onClose={() => setPicking(null)}
          onPick={(path) => {
            setSourcePath(path);
            setPicking(null);
          }}
        />
      )}
      {picking === "dest" && toServer && (
        <AgentFolderPicker
          agentId={dest}
          onClose={() => setPicking(null)}
          onPick={(path) => {
            setDestPath(path);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
