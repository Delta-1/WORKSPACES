"use client";

import { useState } from "react";
import { ArrowDown, Clock, FolderSearch, Monitor, Server, Users, X } from "lucide-react";
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
  const [repeat, setRepeat] = useState(true);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [sourcePath, setSourcePath] = useState("");
  const [extraPaths, setExtraPaths] = useState<string[]>([]); // mais pastas/arquivos da mesma máquina
  const [dest, setDest] = useState(() => servers[0]?.id ?? "");
  const [scope, setScope] = useState<"one" | "all" | "some">("one");
  const [someIds, setSomeIds] = useState<string[]>([]);
  const [destPath, setDestPath] = useState("");
  const [graphFolderId, setGraphFolderId] = useState("");
  const [stage, setStage] = useState<Stage>("gatilho");
  const [picking, setPicking] = useState<"source" | "dest" | number | null>(null); // number = índice em extraPaths
  const [saving, setSaving] = useState(false);

  const factor = unit === "dias" ? 1440 : unit === "horas" ? 60 : 1;
  const originName = agents.find((a) => a.id === agentId)?.name ?? "—";
  const serverName = servers.find((s) => s.id === dest)?.name ?? "—";
  const destSummary =
    scope === "all"
      ? `Todos os servidores (${servers.length})`
      : scope === "some"
      ? `${someIds.length} servidor(es)`
      : `Servidor: ${serverName}`;
  const destValid = scope === "all" ? servers.length > 0 : scope === "some" ? someIds.length > 0 : Boolean(dest);
  // Servidor "representativo" p/ navegar pastas (o caminho é relativo, serve a todos).
  const pickAgent = scope === "one" ? dest : scope === "some" ? someIds[0] : servers[0]?.id;

  function toggleSome(id: string) {
    setSomeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!supabase || !name.trim() || !agentId || !sourcePath.trim() || !destValid) return;
    setSaving(true);
    // Várias pastas de origem = uma rotina por pasta (o agente processa cada uma
    // normalmente; todas com o mesmo gatilho e destino).
    const paths = [sourcePath.trim(), ...extraPaths.map((p) => p.trim()).filter(Boolean)];
    const rows = paths.map((p, i) => ({
      name: paths.length > 1 ? `${name.trim()} (${i + 1}/${paths.length})` : name.trim(),
      agent_id: agentId,
      source_path: p,
      interval_minutes: Math.max(1, Math.round(every * factor)),
      to_drive: false,
      repeat,
      dest_type: "server",
      dest_scope: scope,
      // dest_agent_id continua sendo o "principal" (usado no scope 'one').
      dest_agent_id: scope === "one" ? dest : scope === "some" ? someIds[0] ?? null : servers[0]?.id ?? null,
      dest_agent_ids: scope === "some" ? someIds : null,
      dest_path: destPath.trim() || null,
      graph_folder_id: graphFolderId || null,
      created_by: createdBy,
      next_run_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("automation_routines").insert(rows);
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl h-[85vh] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
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
            {stageCard("origem", <Monitor size={16} className="text-white" />, "Pegar (origem)", `${originName}${sourcePath ? " · " + sourcePath.split(/[\\/]/).pop() : ""}${extraPaths.filter((p) => p.trim()).length ? ` +${extraPaths.filter((p) => p.trim()).length} pasta(s)` : ""}`, "bg-emerald-600/70")}
            <div className="flex justify-center text-gray-600"><ArrowDown size={16} /></div>
            {stageCard("destino", <Server size={16} className="text-white" />, "Colocar (destino)", destSummary, "bg-sky-600/70")}
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
                <div className="pt-1 space-y-1.5">
                  <button
                    onClick={() => setRepeat(true)}
                    className={`w-full text-left rounded-lg p-2.5 border cursor-pointer transition-colors ${repeat ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                  >
                    <p className="text-xs font-semibold flex items-center gap-1.5">🔁 Repetir sempre</p>
                    <p className="text-[10px] text-gray-400">Faz a coleta a cada período. Ex.: pega o XML todo dia 1º do mês.</p>
                  </button>
                  <button
                    onClick={() => setRepeat(false)}
                    className={`w-full text-left rounded-lg p-2.5 border cursor-pointer transition-colors ${!repeat ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                  >
                    <p className="text-xs font-semibold flex items-center gap-1.5">✅ Rodar uma vez</p>
                    <p className="text-[10px] text-gray-400">Coleta uma única vez, conclui e pausa sozinha (sem loop).</p>
                  </button>
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
                {/* Mais pastas da mesma máquina (vira uma rotina por pasta) */}
                {extraPaths.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p} onChange={(e) => setExtraPaths((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Pasta/arquivo ${i + 2}`} className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none" />
                    <button onClick={() => setPicking(i)} disabled={!agentId} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0">
                      <FolderSearch size={14} />
                    </button>
                    <button onClick={() => setExtraPaths((cur) => cur.filter((_, j) => j !== i))} title="Tirar esta pasta" className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setExtraPaths((cur) => [...cur, ""])} className="text-[11px] text-emerald-300 hover:text-emerald-200 cursor-pointer">
                  + Quer adicionar mais uma pasta? Clique aqui
                </button>
                {extraPaths.filter((p) => p.trim()).length > 0 && (
                  <p className="text-[10px] text-gray-500">Cada pasta vira uma rotina própria (ex.: “{name.trim() || "Nome"} (1/{1 + extraPaths.filter((p) => p.trim()).length})”), todas com o mesmo gatilho e destino.</p>
                )}
              </div>
            )}

            {stage === "destino" && (
              <div className="space-y-3 max-w-sm">
                <h4 className="text-sm font-bold flex items-center gap-2"><Server size={15} className="text-sky-400" /> Onde colocar?</h4>
                {/* Nó de distribuição (estilo n8n): 1 / todos / alguns */}
                <div className="grid grid-cols-3 gap-1.5 bg-black/20 border border-white/10 rounded-lg p-1">
                  {([
                    ["one", "Um servidor", <Server key="1" size={13} />],
                    ["all", "Todos", <Users key="2" size={13} />],
                    ["some", "Alguns", <Users key="3" size={13} />],
                  ] as const).map(([id, lbl, ic]) => (
                    <button
                      key={id}
                      onClick={() => setScope(id)}
                      className={`flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-md cursor-pointer transition-colors ${
                        scope === id ? "bg-sky-600 text-white" : "text-gray-400 hover:bg-white/5"
                      }`}
                    >
                      {ic} {lbl}
                    </button>
                  ))}
                </div>
                {scope === "one" && (
                  <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                    {servers.length === 0 && <option value="">Nenhum servidor — crie um no Acesso Remoto</option>}
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>Servidor: {s.name}</option>
                    ))}
                  </select>
                )}
                {scope === "all" && (
                  <p className="text-[11px] text-gray-400 bg-sky-950/30 border border-sky-500/30 rounded-lg px-3 py-2">
                    Copia para <b>todos os {servers.length} servidor(es)</b> da empresa. Novos servidores entram automaticamente.
                  </p>
                )}
                {scope === "some" && (
                  <div className="space-y-1 max-h-44 overflow-y-auto custom-scroll">
                    {servers.length === 0 && <p className="text-[11px] text-gray-500">Nenhum servidor — crie um no Acesso Remoto.</p>}
                    {servers.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                        <input type="checkbox" checked={someIds.includes(s.id)} onChange={() => toggleSome(s.id)} className="accent-sky-500" />
                        <Server size={13} className="text-sky-400" /> {s.name}
                      </label>
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-gray-400">Pasta de destino no servidor</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input value={destPath} onChange={(e) => setDestPath(e.target.value)} placeholder="vazio = WorkspaceServer/Arquivos" className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none" />
                    <button onClick={() => setPicking("dest")} disabled={!pickAgent} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 shrink-0">
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
          <button onClick={save} disabled={saving || !name.trim() || !agentId || !sourcePath.trim() || !destValid} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
            {saving ? "Criando..." : "Criar automação"}
          </button>
        </div>
      </div>

      {picking === "source" && agentId && (
        <AgentFolderPicker agentId={agentId} onClose={() => setPicking(null)} onPick={(p) => { setSourcePath(p); setPicking(null); }} />
      )}
      {typeof picking === "number" && agentId && (
        <AgentFolderPicker agentId={agentId} onClose={() => setPicking(null)} onPick={(p) => { const idx = picking; setExtraPaths((cur) => cur.map((x, j) => (j === idx ? p : x))); setPicking(null); }} />
      )}
      {picking === "dest" && pickAgent && (
        <AgentFolderPicker agentId={pickAgent} onClose={() => setPicking(null)} onPick={(p) => { setDestPath(p); setPicking(null); }} />
      )}
    </div>
  );
}
