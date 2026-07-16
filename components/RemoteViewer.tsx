"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
  Gauge,
  Home,
  Keyboard,
  ListTree,
  Monitor as MonitorIcon,
  MousePointerClick,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, RemoteAgent } from "@/lib/types";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

type Entry = { name: string; isDir: boolean; size: number };
type Quality = "alta" | "media" | "baixa";
type Progress = { label: string; pct: number } | null;

export default function RemoteViewer({ agent, profile, onClose }: { agent: RemoteAgent; profile?: Profile | null; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlRef = useRef<RTCDataChannel | null>(null);
  const filesRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const [status, setStatus] = useState("Conectando ao agente...");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [activeScreen, setActiveScreen] = useState<string>("");
  const [quality, setQuality] = useState<Quality>("alta");

  // No celular controlamos por trackpad (mexer o dedo move o mouse), não por toque direto.
  const [isTouch, setIsTouch] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const kbRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<{ x: number; y: number; moved: boolean; t: number } | null>(null);

  function selectScreen(sourceId: string) {
    setActiveScreen(sourceId);
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { to: "agent", type: "select-screen", sourceId } });
  }
  function changeQuality(level: Quality) {
    setQuality(level);
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { to: "agent", type: "set-quality", level } });
  }

  // Gerenciador de arquivos remoto
  const [showFiles, setShowFiles] = useState(false);
  const [dir, setDir] = useState<string>("");
  const [parent, setParent] = useState<string>("");
  const [sep, setSep] = useState<string>("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const downloadRef = useRef<{ name: string; parts: string[]; total: number; got: number } | null>(null);

  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

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
      if (m.kind === "begin") {
        downloadRef.current = { name: m.name as string, parts: [], total: (m.total as number) || 0, got: 0 };
        setProgress({ label: `Baixando ${m.name}…`, pct: 0 });
      } else if (m.kind === "chunk" && downloadRef.current) {
        const d = downloadRef.current;
        d.parts.push(m.data as string);
        d.got += (m.data as string).length;
        setProgress({ label: `Baixando ${d.name}…`, pct: d.total ? Math.min(100, Math.round((d.got / d.total) * 100)) : 0 });
      } else if (m.kind === "end" && downloadRef.current) {
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
        setProgress(null);
      }
    } else if (m.op === "put-done") {
      setBusy(false);
      setProgress(null);
      listDir(dir);
    } else if (m.op === "error") {
      setBusy(false);
      setProgress(null);
      alert("Erro no arquivo: " + (m.message as string));
    }
  }

  function download(name: string) {
    setBusy(true);
    fsSend({ op: "get", id: "get", path: dir + sep + name });
  }

  async function uploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = (reader.result as string).split(",")[1] || "";
      const id = Math.random().toString(36).slice(2);
      const CHUNK = 12000;
      setBusy(true);
      setProgress({ label: `Enviando ${file.name}…`, pct: 0 });
      fsSend({ op: "put-begin", id, dir, name: file.name });
      // Envia em lotes, cedendo o event loop para a barra de progresso atualizar.
      for (let i = 0; i < b64.length; i += CHUNK) {
        fsSend({ op: "put-chunk", id, data: b64.slice(i, i + CHUNK) });
        if ((i / CHUNK) % 20 === 0) {
          setProgress({ label: `Enviando ${file.name}…`, pct: Math.round((i / b64.length) * 100) });
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      setProgress({ label: `Enviando ${file.name}…`, pct: 100 });
      fsSend({ op: "put-end", id });
    };
    reader.readAsDataURL(file);
  }

  // Cria uma rotina de automação (arquivo/pasta -> Google Drive) direto daqui.
  async function automate(path: string, isDir: boolean) {
    if (!supabase) return;
    const hoursStr = prompt(
      `Automatizar o envio de "${path.split(sep).pop()}" para o Google Drive.\n\nA cada quantas HORAS coletar e enviar? (ex.: 24 = 1x por dia)`,
      "24"
    );
    if (hoursStr == null) return;
    const hours = Math.max(0.1, Number(hoursStr) || 24);
    const { error } = await supabase.from("automation_routines").insert({
      name: `${isDir ? "Pasta" : "Arquivo"}: ${path.split(sep).pop()}`,
      agent_id: agent.id,
      source_path: path,
      interval_minutes: Math.round(hours * 60),
      to_drive: true,
      created_by: profile?.id ?? null,
    });
    if (error) alert("Erro ao criar automação: " + error.message);
    else alert("Automação criada! Veja e gerencie na aba Automação.");
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
  function combo(name: string) {
    sendInput({ kind: "combo", name });
  }

  function norm(e: React.MouseEvent) {
    const v = videoRef.current!;
    const r = v.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  // --- Trackpad do celular (movimento relativo do cursor) ---
  function padStart(e: React.TouchEvent) {
    const t = e.touches[0];
    padRef.current = { x: t.clientX, y: t.clientY, moved: false, t: Date.now() };
  }
  function padMove(e: React.TouchEvent) {
    const p = padRef.current;
    if (!p) return;
    const t = e.touches[0];
    const dx = t.clientX - p.x;
    const dy = t.clientY - p.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) p.moved = true;
    sendInput({ kind: "move-rel", dx, dy });
    p.x = t.clientX;
    p.y = t.clientY;
  }
  function padEnd() {
    const p = padRef.current;
    // Toque curto sem arrastar = clique esquerdo.
    if (p && !p.moved && Date.now() - p.t < 300) sendInput({ kind: "click", button: 0 });
    padRef.current = null;
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0b0f16] border-b border-white/10 shrink-0 gap-2">
        <p className="text-sm font-bold truncate">Acesso remoto — {agent.name}</p>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
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
          <div className="flex items-center gap-1.5" title="Resolução / qualidade da imagem">
            <Gauge size={14} className="text-gray-400" />
            <select
              value={quality}
              onChange={(e) => changeQuality(e.target.value as Quality)}
              className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 outline-none cursor-pointer"
            >
              <option value="alta">Alta (nítida)</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa (menos lag)</option>
            </select>
          </div>
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
          className="flex-1 flex items-center justify-center overflow-hidden relative"
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
            className={`max-w-full max-h-full ${isTouch ? "" : "cursor-none"}`}
            onMouseMove={(e) => !isTouch && sendInput({ kind: "move", ...norm(e) })}
            onMouseDown={(e) => !isTouch && sendInput({ kind: "down", button: e.button, ...norm(e) })}
            onMouseUp={(e) => !isTouch && sendInput({ kind: "up", button: e.button, ...norm(e) })}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => sendInput({ kind: "scroll", dy: e.deltaY })}
          />

          {progress && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 rounded-lg px-3 py-2 w-64 max-w-[80%]">
              <p className="text-[11px] text-gray-200 truncate mb-1">{progress.label}</p>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>
          )}
        </div>

        {showFiles && (
          <div className="w-80 max-w-[85vw] shrink-0 bg-[#0b0f16] border-l border-white/10 flex flex-col">
            <div className="p-3 border-b border-white/10 flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Folder size={14} className="text-emerald-400" /> Arquivos do cliente
              </p>
              <label className="flex items-center gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded cursor-pointer">
                <Upload size={12} /> Enviar
                <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
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
                  <div key={en.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-xs group">
                    {en.isDir ? (
                      <>
                        <button
                          onClick={() => listDir(dir + sep + en.name)}
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                        >
                          <Folder size={14} className="text-emerald-400 shrink-0" />
                          <span className="truncate">{en.name}</span>
                        </button>
                        <button
                          onClick={() => automate(dir + sep + en.name, true)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-cyan-400 cursor-pointer shrink-0"
                          title="Automatizar envio desta pasta pro Drive"
                        >
                          <Bot size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <FileIcon size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate flex-1">{en.name}</span>
                        <span className="text-[10px] text-gray-600 shrink-0">
                          {en.size > 1e6 ? `${(en.size / 1e6).toFixed(1)}MB` : `${Math.ceil(en.size / 1024)}KB`}
                        </span>
                        <button
                          onClick={() => automate(dir + sep + en.name, false)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-cyan-400 cursor-pointer shrink-0"
                          title="Automatizar envio deste arquivo pro Drive"
                        >
                          <Bot size={13} />
                        </button>
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
            <p className="text-[10px] text-gray-600 p-2 border-t border-white/5 flex items-center gap-1">
              <ListTree size={11} /> Navegue nas pastas. O robô <Bot size={10} className="inline" /> cria uma automação pro Drive.
            </p>
          </div>
        )}
      </div>

      {/* Controles de celular: trackpad + botões de clique + comandos rápidos */}
      {isTouch && (
        <div className="bg-[#0b0f16] border-t border-white/10 shrink-0 p-2 space-y-2">
          <div
            className="h-32 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 text-xs select-none touch-none"
            onTouchStart={padStart}
            onTouchMove={padMove}
            onTouchEnd={padEnd}
          >
            Deslize aqui para mover o mouse · toque para clicar
          </div>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <button onClick={() => sendInput({ kind: "click", button: 0 })} className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer">
              <MousePointerClick size={14} /> Esquerdo
            </button>
            <button onClick={() => sendInput({ kind: "click", button: 2 })} className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer">
              <MousePointerClick size={14} /> Direito
            </button>
            <button
              onClick={() => {
                setShowKeyboard((v) => !v);
                setTimeout(() => kbRef.current?.focus(), 50);
              }}
              className={`flex items-center gap-1 text-xs px-3 py-2 rounded-lg cursor-pointer ${showKeyboard ? "bg-emerald-600 text-white" : "bg-white/10 hover:bg-white/20"}`}
            >
              <Keyboard size={14} /> Teclado
            </button>
            <button onClick={() => combo("home")} title="Tecla casa (menu iniciar)" className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer">
              <Home size={14} /> Início
            </button>
            <button onClick={() => combo("taskmanager")} title="Gerenciador de Tarefas" className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer">
              <ListTree size={14} /> Ger. Tarefas
            </button>
          </div>
          <input
            ref={kbRef}
            className={showKeyboard ? "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" : "sr-only"}
            placeholder="Digite aqui — o texto vai pra máquina"
            onKeyDown={(e) => {
              sendInput({ kind: "key", key: e.key, text: e.key.length === 1 ? e.key : "", down: true });
              sendInput({ kind: "key", key: e.key, down: false });
            }}
            onChange={(e) => (e.currentTarget.value = "")}
          />
        </div>
      )}

      {!isTouch && (
        <div className="text-[11px] text-gray-500 text-center py-1 bg-[#0b0f16] shrink-0">
          Clique no vídeo e use mouse/teclado para controlar a máquina remota.
        </div>
      )}
    </div>
  );
}
