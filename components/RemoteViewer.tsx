"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { RemoteAgent } from "@/lib/types";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export default function RemoteViewer({ agent, onClose }: { agent: RemoteAgent; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlRef = useRef<RTCDataChannel | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const [status, setStatus] = useState("Conectando ao agente...");

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
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("");
      if (["failed", "disconnected"].includes(pc.connectionState)) setStatus("Conexão perdida.");
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
  }, [agent.id]);

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
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 cursor-pointer">
            <X size={18} />
          </button>
        </div>
      </div>
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
      <div className="text-[11px] text-gray-500 text-center py-1 bg-[#0b0f16] shrink-0">
        Clique no vídeo e use mouse/teclado para controlar a máquina remota.
      </div>
    </div>
  );
}
