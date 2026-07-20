"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FolderTree, Pencil, Server, Unplug, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  return a.status === "online" && !!a.last_seen && Date.now() - new Date(a.last_seen).getTime() < 120000;
}

export default function ServersSection() {
  const [servers, setServers] = useState<RemoteAgent[]>([]);
  const [folders, setFolders] = useState<Map<string, string>>(new Map());
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    // Só os servidores DESTA empresa (a que criou o servidor). Máquinas apenas
    // compartilhadas por código aparecem como computador no Acesso Remoto, não aqui.
    const { data: myCo } = await supabase.rpc("my_company");
    const { data } = await supabase.from("remote_agents").select("*").eq("is_server", true).order("name");
    const list = ((data as RemoteAgent[]) ?? []).filter((s) => s.company_id === myCo);
    setServers(list);
    const ids = list.map((s) => s.graph_folder_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: f } = await supabase.from("files").select("id,name").in("id", ids);
      setFolders(new Map(((f as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])));
    } else {
      setFolders(new Map());
    }
  }, []);

  async function saveName(id: string) {
    if (!supabase || !editName.trim()) { setEditId(null); return; }
    await supabase.from("remote_agents").update({ name: editName.trim() }).eq("id", id);
    setEditId(null);
    load();
  }

  // "Desconectar" = tira o servidor (is_server=false). Os arquivos/sincronização
  // ficam salvos; a máquina volta a ser um computador comum no Acesso Remoto.
  async function disconnect(s: RemoteAgent) {
    if (!supabase) return;
    if (!confirm(`Desconectar "${s.name}" como servidor?\n\nOs arquivos já sincronizados continuam salvos — isso só para a sincronização e devolve a máquina para computador comum.`)) return;
    await supabase.from("remote_agents").update({ is_server: false }).eq("id", s.id);
    load();
  }

  // Muda a pasta/local (server_root) do servidor direto aqui na lista.
  async function editRoot(s: RemoteAgent) {
    if (!supabase) return;
    const val = prompt(`Pasta/local do servidor "${s.name}" (onde ele guarda os arquivos):`, s.server_root ?? "");
    if (val === null) return;
    await supabase.from("remote_agents").update({ server_root: val.trim() || null }).eq("id", s.id);
    load();
  }

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("servers-section")
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_agents" }, () => load())
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Server size={16} className="text-sky-400" /> Servidores de arquivos
        </h3>
        <p className="text-[11px] text-gray-500 mt-1">
          Máquinas suas que guardam os arquivos da empresa e o cérebro do robô — sem depender do Google Drive. Cada
          servidor ganha automaticamente a <b>sua pasta no grafo</b>. Você pode ter <b>quantos servidores quiser</b>.
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          Para adicionar: <b>Acesso Remoto</b> → sincronize a máquina → clique no ícone de servidor (pede senha).
        </p>
      </div>

      {servers.length === 0 ? (
        <p className="text-xs text-gray-500 italic">Nenhum servidor configurado ainda.</p>
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <div key={s.id} className="bg-black/20 rounded-lg p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-sky-950 text-sky-400 flex items-center justify-center shrink-0">
                  <Server size={16} />
                </div>
                <div className="min-w-0">
                  {editId === s.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveName(s.id); if (e.key === "Escape") setEditId(null); }}
                        className="bg-black/30 border border-white/10 rounded px-2 py-1 text-sm outline-none w-40"
                      />
                      <button onClick={() => saveName(s.id)} className="text-emerald-400 hover:text-emerald-300 cursor-pointer p-1"><Check size={14} /></button>
                      <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-300 cursor-pointer p-1"><X size={14} /></button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {s.name}
                      <button onClick={() => { setEditId(s.id); setEditName(s.name); }} title="Renomear servidor" className="text-gray-500 hover:text-sky-300 cursor-pointer shrink-0"><Pencil size={12} /></button>
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                    <FolderTree size={11} /> {s.graph_folder_id ? folders.get(s.graph_folder_id) ?? "pasta do servidor" : "criando pasta…"}
                  </p>
                  <button onClick={() => editRoot(s)} title="Mudar a pasta/local do servidor" className="text-[10px] text-gray-500 hover:text-sky-300 truncate font-mono flex items-center gap-1 cursor-pointer max-w-full">
                    <Pencil size={9} className="shrink-0" /> <span className="truncate">📁 {s.server_root || "definir pasta/local…"}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] ${isOnline(s) ? "text-emerald-400" : "text-gray-500"}`}>
                  {isOnline(s) ? "Online" : "Offline"}
                </span>
                <button onClick={() => disconnect(s)} title="Desconectar servidor (mantém os arquivos)" className="text-gray-500 hover:text-red-400 cursor-pointer p-1">
                  <Unplug size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
