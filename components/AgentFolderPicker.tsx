"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, File as FileIcon, Folder, FolderCheck, FolderPlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
type Entry = { name: string; isDir: boolean; size: number };

// Navega o disco da máquina (via o agente) para escolher uma PASTA ou ARQUIVO,
// sem precisar digitar o caminho. Reaproveita o canal de arquivos do WebRTC.
export default function AgentFolderPicker({
  agentId,
  onClose,
  onPick,
}: {
  agentId: string;
  onClose: () => void;
  onPick: (path: string, isDir: boolean) => void;
}) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const filesRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const [status, setStatus] = useState("Conectando à máquina…");
  const [dir, setDir] = useState("");
  const [parent, setParent] = useState("");
  const [sep, setSep] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  function fsSend(obj: unknown) {
    const ch = filesRef.current;
    if (ch && ch.readyState === "open") ch.send(JSON.stringify(obj));
  }
  function listDir(d?: string) {
    setBusy(true);
    fsSend({ op: "list", id: "list", dir: d ?? "" });
  }
  function onFilesMessage(raw: string) {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.op === "list-result") {
      setDir(m.dir as string);
      setParent(m.parent as string);
      setSep((m.sep as string) || "/");
      setEntries((m.entries as Entry[]) ?? []);
      setBusy(false);
      setStatus("");
    } else if (m.op === "mkdir-done" || m.op === "rename-done" || m.op === "delete-done") {
      listDir(dir); // recarrega a pasta atual após criar/renomear/apagar
    } else if (m.op === "error") {
      setBusy(false);
      setStatus("Erro: " + (m.message as string));
    }
  }

  function newFolder() {
    const name = prompt("Nome da nova pasta:")?.trim();
    if (!name) return;
    fsSend({ op: "mkdir", id: "mkdir", dir, name });
  }
  function renameEntry(name: string) {
    const novo = prompt("Novo nome:", name)?.trim();
    if (!novo || novo === name) return;
    fsSend({ op: "rename", id: "rename", path: dir + sep + name, name: novo });
  }
  function deleteEntry(name: string, isDir: boolean) {
    if (!confirm(`Apagar ${isDir ? "a pasta" : "o arquivo"} "${name}"${isDir ? " e todo o conteúdo" : ""}?`)) return;
    fsSend({ op: "delete", id: "delete", path: dir + sep + name });
  }

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`remote-${agentId}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    const send = (payload: unknown) => channel.send({ type: "broadcast", event: "signal", payload });
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ to: "agent", type: "ice", candidate: e.candidate });
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label === "files") {
        filesRef.current = e.channel;
        e.channel.onmessage = (ev) => onFilesMessage(ev.data);
        e.channel.onopen = () => listDir("");
      }
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) setStatus("Conexão perdida. A máquina está online?");
    };

    channel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as { to?: string; type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
        if (msg.to !== "operator") return;
        if (msg.type === "offer" && msg.sdp) {
          await pc.setRemoteDescription(msg.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ to: "agent", type: "answer", sdp: answer });
        } else if (msg.type === "ice" && msg.candidate) {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch {
            /* ignore */
          }
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") send({ to: "agent", type: "connect" });
      });

    return () => {
      try {
        send({ to: "agent", type: "stop" });
      } catch {
        /* ignore */
      }
      pc.close();
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md h-[70vh] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Folder size={16} className="text-emerald-400" /> Escolher pasta ou arquivo
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2 shrink-0">
          <button
            onClick={() => listDir(parent)}
            disabled={busy || !parent || parent === dir}
            className="p-1 rounded hover:bg-white/10 cursor-pointer disabled:opacity-40"
            title="Subir um nível"
          >
            <ArrowUp size={14} />
          </button>
          <p className="text-[10px] text-gray-500 truncate flex-1" title={dir}>{dir || "…"}</p>
          <button
            onClick={newFolder}
            disabled={!dir}
            title="Nova pasta aqui"
            className="flex items-center gap-1 text-[10px] bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded cursor-pointer disabled:opacity-40"
          >
            <FolderPlus size={12} /> Nova pasta
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          {status && (
            <p className="text-[11px] text-gray-400 p-3 flex items-center gap-2">
              {!status.startsWith("Erro") && <Loader2 size={13} className="animate-spin" />} {status}
            </p>
          )}
          {!busy &&
            entries.map((en) => (
              <div key={en.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-xs group">
                {en.isDir ? (
                  <button onClick={() => listDir(dir + sep + en.name)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left">
                    <Folder size={14} className="text-emerald-400 shrink-0" />
                    <span className="truncate">{en.name}</span>
                  </button>
                ) : (
                  <>
                    <FileIcon size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate flex-1">{en.name}</span>
                  </>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                  <button onClick={() => renameEntry(en.name)} title="Renomear" className="text-gray-400 hover:text-white cursor-pointer">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => deleteEntry(en.name, en.isDir)} title="Apagar" className="text-gray-400 hover:text-red-400 cursor-pointer">
                    <Trash2 size={11} />
                  </button>
                  <button
                    onClick={() => onPick(dir + sep + en.name, en.isDir)}
                    className="flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-1.5 py-0.5 rounded cursor-pointer"
                    title={en.isDir ? "Usar esta pasta" : "Usar este arquivo"}
                  >
                    <Check size={11} /> usar
                  </button>
                </div>
              </div>
            ))}
          {!busy && !status && entries.length === 0 && <p className="text-[11px] text-gray-600 p-3">Pasta vazia.</p>}
        </div>

        <div className="p-3 border-t border-white/10 shrink-0">
          <button
            onClick={() => dir && onPick(dir, true)}
            disabled={!dir}
            className="w-full flex items-center justify-center gap-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <FolderCheck size={14} /> Usar esta pasta inteira
          </button>
        </div>
      </div>
    </div>
  );
}
