"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderTree, Server } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  return a.status === "online" && !!a.last_seen && Date.now() - new Date(a.last_seen).getTime() < 60000;
}

export default function ServersSection() {
  const [servers, setServers] = useState<RemoteAgent[]>([]);
  const [folders, setFolders] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("remote_agents").select("*").eq("is_server", true).order("name");
    const list = (data as RemoteAgent[]) ?? [];
    setServers(list);
    const ids = list.map((s) => s.graph_folder_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: f } = await supabase.from("files").select("id,name").in("id", ids);
      setFolders(new Map(((f as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])));
    } else {
      setFolders(new Map());
    }
  }, []);

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
                  <p className="text-sm font-semibold truncate">{s.name}</p>
                  <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                    <FolderTree size={11} /> {s.graph_folder_id ? folders.get(s.graph_folder_id) ?? "pasta do servidor" : "criando pasta…"}
                  </p>
                </div>
              </div>
              <span className={`text-[11px] shrink-0 ${isOnline(s) ? "text-emerald-400" : "text-gray-500"}`}>
                {isOnline(s) ? "Online" : "Offline"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
