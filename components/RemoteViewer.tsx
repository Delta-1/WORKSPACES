"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Download, File as FileIcon, Folder, FolderOpen, Monitor as MonitorIcon, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { RemoteAgent } from "@/lib/types";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

type Entry = { name: string; isDir: boolean; size: number };

export default function RemoteViewer({ agent, onClose }: { agent: RemoteAgent; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlRef = useRef<RTCDataChannel | null>(null);
  const filesRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const [status, setStatus] = useState("Conectando ao agente...");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [activeScreen, setActiveScreen] = useState<string>("");

  function selectScreen(sourceId: string) {
    setActiveScreen(sourceId);
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { to: "agent", type: "select-screen", sourceId } });
  }

  // Gerenciador de arquivos remoto
  const [showFiles, setShowFiles] = useState(false);
  const [dir, setDir] = useState<string>("");
  const [parent, setParent] = useState<string>("");
  const [sep, setSep] = useState<string>("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const downloadRef = useRef<{ name: string; parts: string[] } | null>(null);

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
    } else if (m.op === "get-result") {
      if (m.kind === "begin") downloadRef.current = { name: m.name as string, parts: [] };
      else if (m.kind === "chunk" && downloadRef.current) downloadRef.current.parts.push(m.data as string);
      else if (m.kind === "end" && downloadRef.current) {
        const b64 = downloadRef.current.parts.join("");
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes]));
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadRef.current.name;
        a.click();
        URL.revokeObjectURL(url);
        downloadRef.current = null;
        setBusy(false);
      }
    } else if (m.op === "put-done") {
      setBusy(false);
      listDir(dir);
    } else if (m.op === "error") {
      setBusy(false);
      alert("Erro no arquivo: " + (m.message as string));
    }
  }

  function download(name: string) {
    setBusy(true);
    fsSend({ op: "get", id: "get", path: dir + sep + name });
  }

  function uploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1] || "";
      const id = Math.random().toString(36).slice(2);
      const CHUNK = 12000;
      setBusy(true);
      fsSend({ op: "put-begin", id, dir, name: file.name });
      for (let i = 0; i < b64.length; i += CHUNK) fsSend({ op: "put-chunk", id, data: b64.slice(i, i + CHUNK) });
      fsSend({ op: "put-end", id });
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`remote-${agent.id}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    const send = (payload: unknown) => channel.send({ type: "broadcast", event: "signal", payload });

    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (videoRef.current) videoRef.current.srcObject = e.streams[0];
      setStatus("");
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ to: "agent", type: "ice", candidate: e.candidate });
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label === "control") controlRef.current = e.channel;
      if (e.channel.label === "files") {
        filesRef.current = e.channel;
        e.channel.onmessage = (ev) => onFilesMessage(ev.data);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("");
      if (["failed", "disconnected"].includes(pc.connectionState)) setStatus("Conexão perdida.");
    };

    channel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as { to?: string; type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; list?: { id: string; name: string }[] };
        if (msg.to !== "operator") return;
        if (msg.type === "screens" && msg.list) {
          setScreens(msg.list);
          setActiveScreen((prev) => prev || msg.list?.[0]?.id || "");
        } else if (msg.type === "offer" && msg.sdp) {
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
  }, [agent.id]);

  function openFiles() {
    setShowFiles(true);
    if (!dir) listDir("");
  }

  function sendInput(ev: object) {
    const ch = controlRef.current;
    if (ch && ch.readyState === "open") ch.send(JSON.stringify(ev));
  }

  function norm(e: React.MouseEvent) {
    const v = videoRef.current!;
    const r = v.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0b0f16] border-b border-white/10 shrink-0">
        <p className="text-sm font-bold">Acesso remoto — {agent.name}</p>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-amber-400">{status}</span>}
          {screens.length > 1 && (
            <div className="flex items-center gap-1.5">
              <MonitorIcon size={14} className="text-gray-400" />
              <select
                value={activeScreen}
                onChange={(e) => selectScreen(e.target.value)}
                className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 outline-none cursor-pointer"
                title="Trocar de monitor"
              >
                {screens.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {s.name || `Monitor ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => (showFiles ? setShowFiles(false) : openFiles())}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded cursor-pointer ${
              showFiles ? "bg-emerald-600 text-white" : "bg-white/5 hover:bg-white/10"
            }`}
          >
            <FolderOpen size={14} /> Arquivos
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div
          className="flex-1 flex items-center justify-center overflow-hidden"
          tabIndex={0}
          onKeyDown={(e) => {
            e.preventDefault();
            sendInput({ kind: "key", key: e.key, text: e.key.length === 1 ? e.key : "", down: true });
          }}
          onKeyUp={(e) => {
            e.preventDefault();
            sendInput({ kind: "key", key: e.key, down: false });
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="max-w-full max-h-full cursor-none"
            onMouseMove={(e) => sendInput({ kind: "move", ...norm(e) })}
            onMouseDown={(e) => sendInput({ kind: "down", button: e.button, ...norm(e) })}
            onMouseUp={(e) => sendInput({ kind: "up", button: e.button, ...norm(e) })}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => sendInput({ kind: "scroll", dy: e.deltaY })}
          />
        </div>

        {showFiles && (
          <div className="w-80 shrink-0 bg-[#0b0f16] border-l border-white/10 flex flex-col">
            <div className="p-3 border-b border-white/10 flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Folder size={14} className="text-emerald-400" /> Arquivos do cliente
              </p>
              <label className="flex items-center gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded cursor-pointer">
                <Upload size={12} /> Enviar
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                />
              </label>
            </div>
            <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2">
              <button
                onClick={() => listDir(parent)}
                disabled={busy || !parent || parent === dir}
                className="p-1 rounded hover:bg-white/10 cursor-pointer disabled:opacity-40"
                title="Subir um nível"
              >
                <ArrowUp size={14} />
              </button>
              <p className="text-[10px] text-gray-500 truncate flex-1" title={dir}>
                {dir || "…"}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll">
              {busy && <p className="text-[11px] text-gray-500 p-3">Carregando…</p>}
              {!busy &&
                entries.map((en) => (
                  <div
                    key={en.name}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-xs group"
                  >
                    {en.isDir ? (
                      <button
                        onClick={() => listDir(dir + sep + en.name)}
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                      >
                        <Folder size={14} className="text-emerald-400 shrink-0" />
                        <span className="truncate">{en.name}</span>
                      </button>
                    ) : (
                      <>
                        <FileIcon size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate flex-1">{en.name}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">
                          {en.size > 1e6 ? `${(en.size / 1e6).toFixed(1)}MB` : `${Math.ceil(en.size / 1024)}KB`}
                        </span>
                        <button
                          onClick={() => download(en.name)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-emerald-400 cursor-pointer shrink-0"
                          title="Baixar para o meu PC"
                        >
                          <Download size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              {!busy && entries.length === 0 && <p className="text-[11px] text-gray-600 p-3">Pasta vazia.</p>}
            </div>
            <p className="text-[10px] text-gray-600 p-2 border-t border-white/5">
              Navegue nas pastas, baixe arquivos do cliente ou envie do seu PC para ele.
            </p>
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-500 text-center py-1 bg-[#0b0f16] shrink-0">
        Clique no vídeo e use mouse/teclado para controlar a máquina remota.
      </div>
    </div>
  );
}
