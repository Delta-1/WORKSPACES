"use client";

import { useState } from "react";
import { ArrowDown, Clock, FolderSearch, Monitor, Server, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import AgentFolderPicker from "@/components/AgentFolderPicker";
import type { RemoteAgent } from "@/lib/types";

type GraphFolder = { id: string; name: string };
type Stage = "gatilho" | "origem" | "destino";

// Construtor visual de automação (fluxo): Gatilho -> Pegar -> Colocar.
export default function AutomationFlowBuilder({
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
  const servers = agents.filter((a) => a.is_server);
  const [name, setName] = useState("");
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<"minutos" | "horas" | "dias">("dias");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [sourcePath, setSourcePath] = useState("");
  const [dest, setDest] = useState(() => servers[0]?.id ?? "");
  const [destPath, setDestPath] = useState("");
  const [graphFolderId, setGraphFolderId] = useState("");
  const [stage, setStage] = useState<Stage>("gatilho");
  const [picking, setPicking] = useState<"source" | "dest" | null>(null);
  const [saving, setSaving] = useState(false);

  const factor = unit === "dias" ? 1440 : unit === "horas" ? 60 : 1;
  const originName = agents.find((a) => a.id === agentId)?.name ?? "—";
  const serverName = servers.find((s) => s.id === dest)?.name ?? "—";

  async function save() {
    if (!supabase || !name.trim() || !agentId || !sourcePath.trim() || !dest) return;
    setSaving(true);
    const { error } = await supabase.from("automation_routines").insert({
      name: name.trim(),
      agent_id: agentId,
      source_path: sourcePath.trim(),
      interval_minutes: Math.max(1, Math.round(every * factor)),
      to_drive: false,
      dest_type: "server",
      dest_agent_id: dest,
      dest_path: destPath.trim() || null,
      graph_folder_id: graphFolderId || null,
      created_by: createdBy,
      next_run_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    onSaved();
    onClose();
  }

  const stageCard = (id: Stage, icon: React.ReactNode, title: string, summary: string, tone: string) => (
    <button
      onClick={() => setStage(id)}
      className={`w-full text-left rounded-2xl p-3 border transition-all cursor-pointer ${
        stage === id ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-[11px] text-gray-400 truncate">{summary}</p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl h-[85vh] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-sm font-bold">Nova automação (fluxo)</h3>
            <p className="text-[11px] text-gray-500">Monte o caminho: o robô pega → e coloca no servidor.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          {/* Fluxo (esquerda) */}
          <div className="sm:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-white/10 p-4 space-y-2 overflow-y-auto custom-scroll">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da automação"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none mb-2"
            />
            {stageCard("gatilho", <Clock size={16} className="text-white" />, "Gatilho", `a cada ${every} ${unit}`, "bg-amber-600/70")}
            <div className="flex justify-center text-gray-600"><ArrowDown size={16} /></div>
            {stageCard("origem", <Monitor size={16} className="text-white" />, "Pegar (origem)", `${originName}${sourcePath ? " · " + sourcePath.split(/[\\/]/).pop() : ""}`, "bg-emerald-600/70")}
            <div className="flex justify-center text-gray-600"><ArrowDown size={16} /></div>
            {stageCard("destino", <Server size={16} className="text-white" />, "Colocar (destino)", `Servidor: ${serverName}`, "bg-sky-600/70")}
          </div>

          {/* Config da etapa (direita) */}
          <div className="flex-1 p-5 overflow-y-auto custom-scroll">
            {stage === "gatilho" && (
              <div className="space-y-3 max-w-sm">
                <h4 className="text-sm font-bold flex items-center gap-2"><Clock size={15} className="text-amber-400" /> Com que frequência rodar?</h4>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="w-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
                  <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                    <option value="minutos">minuto(s)</option>
                    <option value="horas">hora(s)</option>
                    <option value="dias">dia(s)</option>
                  </select>
                </div>
                <p className="text-[11px] text-gray-500">A automação já roda a primeira vez ao ser criada.</p>
              </div>
            )}

            {stage === "origem" && (
              <div className="space-y-3 max-w-sm">
                <h4 className="text-sm font-bold flex items-center gap-2"><Monitor size={15} className="text-emerald-400" /> De onde pegar?</h4>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                  {agents.length === 0 && <option value="">Nenhuma máquina</option>}
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="Arquivo ou pasta" className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none" />
                  <button onClick={() => setPicking("source")} disabled={!agentId} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0">
                    <FolderSearch size={14} /> Escolher
                  </button>
                </div>
              </div>
            )}

            {stage === "destino" && (
              <div className="space-y-3 max-w-sm">
                <h4 className="text-sm font-bold flex items-center gap-2"><Server size={15} className="text-sky-400" /> Onde colocar?</h4>
                <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                  {servers.length === 0 && <option value="">Nenhum servidor — crie um no Acesso Remoto</option>}
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>Servidor: {s.name}</option>
                  ))}
                </select>
                <div>
                  <label className="text-[11px] text-gray-400">Pasta de destino no servidor</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input value={destPath} onChange={(e) => setDestPath(e.target.value)} placeholder="vazio = WorkspaceServer/Arquivos" className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none" />
                    <button onClick={() => setPicking("dest")} disabled={!dest} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0">
                      <FolderSearch size={14} /> Escolher
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">Mostrar no grafo (opcional)</label>
                  <select value={graphFolderId} onChange={(e) => setGraphFolderId(e.target.value)} className="w-full mt-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                    <option value="">Pasta do próprio servidor</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>Pasta: {f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 shrink-0">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || !agentId || !sourcePath.trim() || !dest} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
            {saving ? "Criando..." : "Criar automação"}
          </button>
        </div>
      </div>

      {picking === "source" && agentId && (
        <AgentFolderPicker agentId={agentId} onClose={() => setPicking(null)} onPick={(p) => { setSourcePath(p); setPicking(null); }} />
      )}
      {picking === "dest" && dest && (
        <AgentFolderPicker agentId={dest} onClose={() => setPicking(null)} onPick={(p) => { setDestPath(p); setPicking(null); }} />
      )}
    </div>
  );
}
