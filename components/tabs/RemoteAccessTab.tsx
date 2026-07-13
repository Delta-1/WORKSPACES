"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Monitor, MonitorSmartphone, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, RemoteAgent } from "@/lib/types";

export default function RemoteAccessTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const canManage = profile?.role === "gestor" || profile?.role === "gerente";

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("remote_agents").select("*").order("created_at", { ascending: false });
    if (data) setAgents(data as RemoteAgent[]);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("remote-agents")
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_agents" }, () => load())
      .subscribe();
    return () => {
      supabase!.removeChannel(ch);
    };
  }, [load]);

  async function createAgent() {
    if (!supabase || !name.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_remote_agent", { p_name: name.trim(), p_pin: null });
      if (error) alert(error.message);
      else if (data) {
        setName("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  function downloadFile(agent: RemoteAgent) {
    const config = {
      agentId: agent.id,
      name: agent.name,
      accessCode: agent.access_code,
      signaling: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      instrucoes:
        "Instale o Agente de Acesso Remoto e importe este arquivo, ou informe o código de acesso quando solicitado.",
      criadoEm: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${agent.name.replace(/[^\w-]+/g, "_")}-acesso-remoto.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Remover esta máquina do acesso remoto?")) return;
    await supabase.from("remote_agents").delete().eq("id", id);
    load();
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MonitorSmartphone className="text-emerald-400" size={20} /> Acesso Remoto
        </h3>
        {canManage && (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAgent()}
              placeholder="Nome do cliente / máquina"
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none w-56"
            />
            <button
              onClick={createAgent}
              disabled={creating || !name.trim()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Plus size={14} /> Gerar acesso
            </button>
          </div>
        )}
      </div>

      <div className="text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-800/30 rounded-lg px-3 py-2">
        Fase 1: aqui você cadastra as máquinas e gera o arquivo de acesso por cliente. O <b>agente instalável</b> (que
        captura e controla a tela) e o <b>visualizador ao vivo</b> entram na próxima etapa.
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {agents.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">
            Nenhuma máquina cadastrada. Gere um acesso para um cliente acima.
          </p>
        )}
        {agents.map((a) => {
          const online = a.status === "online";
          return (
            <div key={a.id} className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${online ? "bg-emerald-950 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                    <Monitor size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{a.name}</p>
                    <p className={`text-[11px] ${online ? "text-emerald-400" : "text-gray-500"}`}>
                      {online ? "Online" : "Offline"}
                      {a.os ? ` · ${a.os}` : ""}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button onClick={() => remove(a.id)} className="text-gray-500 hover:text-red-400 cursor-pointer shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="bg-black/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Código de acesso</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono tracking-widest text-emerald-400">
                    {a.access_code.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  </code>
                  <button
                    onClick={() => navigator.clipboard?.writeText(a.access_code)}
                    className="text-gray-400 hover:text-white cursor-pointer"
                    title="Copiar código"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => downloadFile(a)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 py-2 rounded-lg cursor-pointer"
                >
                  <Download size={13} /> Baixar arquivo
                </button>
                <button
                  disabled={!online}
                  title={online ? "Conectar" : "A máquina precisa estar online (agente instalado)"}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Monitor size={13} /> Conectar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
