"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Monitor, MonitorSmartphone, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { Profile, RemoteAgent } from "@/lib/types";

function isOnline(a: RemoteAgent) {
  if (a.status !== "online" || !a.last_seen) return false;
  return Date.now() - new Date(a.last_seen).getTime() < 60000;
}

export default function RemoteAccessTab({ profile }: { profile: Profile | null }) {
  const [agents, setAgents] = useState<RemoteAgent[]>([]);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewing, setViewing] = useState<RemoteAgent | null>(null);
  const [tick, setTick] = useState(0);

  const canManage = profile?.role === "gestor" || profile?.role === "gerente";
  const companyId = profile?.company_id ?? null;
  const thumbBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/agent-thumbs`;

  // Atualiza as prévias ao vivo a cada 6s (o agente sobe um print nesse ritmo).
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(i);
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !companyId) return;
    // Só as máquinas já sincronizadas com esta empresa (não as pendentes de terceiros).
    const { data } = await supabase
      .from("remote_agents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (data) setAgents(data as RemoteAgent[]);
  }, [companyId]);

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

  async function syncAgent() {
    const clean = code.replace(/\D/g, "");
    if (!supabase || clean.length < 6) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.rpc("claim_agent", {
        p_code: clean,
        p_name: label.trim() || null,
      });
      if (error) alert(error.message);
      else if (data) {
        setCode("");
        setLabel("");
        await load();
      }
    } finally {
      setSyncing(false);
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none w-44"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && syncAgent()}
              placeholder="Código do cliente"
              inputMode="numeric"
              className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none w-40 tracking-widest font-mono"
            />
            <button
              onClick={syncAgent}
              disabled={syncing || code.replace(/\D/g, "").length < 6}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Link2 size={14} /> Sincronizar
            </button>
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        O cliente abre o <b>Workspace Acesso Remoto</b> (.exe) na máquina dele e te informa o <b>código de suporte</b>{" "}
        que aparece na tela. Digite o código acima e clique em <b>Sincronizar</b>. A máquina entra na lista e, sempre que
        estiver <b>Online</b>, você clica em <b>Conectar</b> para ver e controlar a tela — sem pedir permissão, pela mesma
        VPN. O app do cliente fica rodando em segundo plano e sobe junto com o Windows.
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
        {agents.length === 0 && (
          <p className="text-sm text-gray-500 italic col-span-full text-center py-8">
            Nenhuma máquina sincronizada. Peça o código de suporte ao cliente e sincronize acima.
          </p>
        )}
        {agents.map((a) => {
          const online = isOnline(a);
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

              {/* Prévia ao vivo da tela */}
              <button
                onClick={() => online && setViewing(a)}
                disabled={!online}
                className={`relative aspect-video w-full rounded-lg overflow-hidden bg-black/40 border border-white/10 ${
                  online ? "cursor-pointer group" : "cursor-default"
                }`}
                title={online ? "Clique para conectar" : "Offline"}
              >
                {online ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${thumbBase}/${a.id}.jpg?v=${tick}`}
                      alt="Tela ao vivo"
                      className="w-full h-full object-cover"
                      onError={(e) => ((e.currentTarget.style.visibility = "hidden"))}
                    />
                    <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] font-medium bg-black/60 text-red-300 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> AO VIVO
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <Monitor size={22} className="text-white" />
                    </span>
                  </>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-600">
                    Sem prévia (offline)
                  </span>
                )}
              </button>

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

              <button
                onClick={() => setViewing(a)}
                disabled={!online}
                title={online ? "Conectar" : "A máquina precisa estar online (app aberto)"}
                className="w-full flex items-center justify-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Monitor size={13} /> Conectar
              </button>
            </div>
          );
        })}
      </div>

      {viewing && <RemoteViewer agent={viewing} profile={profile} onClose={() => setViewing(null)} />}
    </div>
  );
}
