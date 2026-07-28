"use client";

import { useEffect, useState } from "react";
import { Command, Mic, Sparkles, X } from "lucide-react";
import Orb from "@/components/Orb";
import { supabase } from "@/lib/supabase-client";

export default function AgentModeOverlay({
  companyName,
  logoDataUrl,
  pushToTalkActive,
  onPushToTalkStart,
  onPushToTalkEnd,
  onClose,
}: {
  companyName: string;
  logoDataUrl: string | null;
  pushToTalkActive: boolean;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onClose: () => void;
}) {
  const [agentName, setAgentName] = useState("Copilot");
  const [accent, setAccent] = useState("#10b981");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const load = async () => {
      const { data } = await client
        .from("chatbots")
        .select("name,accent")
        .eq("slot", "internal")
        .maybeSingle();
      if (!active || !data) return;
      if (data.name) setAgentName(data.name);
      if (data.accent) setAccent(data.accent);
    };
    void load();
    const channel = client
      .channel("agent-mode-copilot")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chatbots" }, () => void load())
      .subscribe();
    return () => {
      active = false;
      try { client.removeChannel(channel); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="agent-mode fixed inset-0 z-[90] overflow-hidden bg-[#03060b] text-white"
      style={{ "--agent-accent": accent } as React.CSSProperties}
    >
      <div className="agent-mode-grid absolute inset-0" />
      <div className="agent-mode-aurora absolute inset-0" />
      <div className="agent-mode-noise absolute inset-0" />

      <header className="absolute inset-x-0 top-0 z-[110] flex items-center justify-between p-4 sm:p-7">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUrl || "/icon.png"} alt="" className="h-10 w-10 rounded-xl border border-white/10 object-cover" />
          <div>
            <p className="text-sm font-bold">{companyName}</p>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-white/45">
              <Sparkles size={10} /> Modo Agente
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Sair do Modo Agente"
          title="Sair do Modo Agente (Esc)"
        >
          <X size={18} />
        </button>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-[110] flex justify-center px-4">
        <div className="flex max-w-full items-center gap-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-2.5 text-[11px] text-white/55 backdrop-blur-xl">
          <span className="flex items-center gap-1.5">
            <Mic size={13} style={{ color: accent }} />
            Chame <strong className="text-white/90">“{agentName}”</strong>
          </span>
          <span className="h-4 w-px bg-white/10" />
          <span className="hidden items-center gap-1.5 sm:flex">
            <Command size={13} />
            Segure <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-white">V</kbd> para falar direto
          </span>
        </div>
      </div>

      <button
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onPushToTalkStart();
        }}
        onPointerUp={onPushToTalkEnd}
        onPointerCancel={onPushToTalkEnd}
        className={`fixed bottom-20 right-4 z-[120] flex h-12 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold text-white shadow-2xl backdrop-blur touch-none select-none sm:hidden ${
          pushToTalkActive
            ? "scale-95 border-emerald-200/70 bg-emerald-500/35"
            : "border-white/15 bg-black/45"
        }`}
        aria-label="Segure para falar e solte para enviar"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-white/10 font-mono font-black">V</span>
        <Mic size={15} />
        Segure
      </button>

      <Orb
        slot="internal"
        title={agentName}
        variant="agent"
        alwaysListening
        requireWakeWord
        pushToTalkActive={pushToTalkActive}
        voicePrompt="Estou ouvindo"
        onClose={onClose}
      />
    </div>
  );
}
