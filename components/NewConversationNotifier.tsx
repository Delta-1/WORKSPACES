"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

// Toca um sino sintetizado (sem depender de arquivo de áudio) e dispara uma
// notificação do navegador sempre que entra um novo cliente na fila de espera.
const MUTE_KEY = "notif:muted";

export default function NewConversationNotifier({ onOpen }: { onOpen?: () => void }) {
  const [waiting, setWaiting] = useState(0);
  const [muted, setMuted] = useState(false);
  const prevCount = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);

  function applyMuted(v: boolean) {
    setMuted(v);
    mutedRef.current = v;
    try {
      localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        return false;
      }
    })();
    setMuted(saved);
    mutedRef.current = saved;
    // mantém sincronizado se a preferência mudar em outra aba/config
    const onStorage = (e: StorageEvent) => {
      if (e.key === MUTE_KEY) {
        const v = e.newValue === "1";
        setMuted(v);
        mutedRef.current = v;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  function chime() {
    try {
      if (!audioCtx.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx.current = new Ctx();
      }
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      [880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch {
      // áudio bloqueado até uma interação do usuário — sem problema
    }
  }

  const check = useCallback(async () => {
    if (!supabase) return;
    const { count } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "espera");
    const n = count ?? 0;
    setWaiting(n);
    // Toca/notifica só quando entra alguém novo (sem loop repetitivo).
    if (n > prevCount.current && !mutedRef.current) {
      chime();
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Novo cliente no WhatsApp", {
            body: `${n} atendimento(s) aguardando na fila.`,
          });
        } catch {
          // ignore
        }
      }
    }
    prevCount.current = n;
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 5000);
    let ch: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      ch = supabase
        .channel("new-conv-notify")
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => check())
        .subscribe();
    }
    return () => {
      clearInterval(interval);
      if (ch && supabase) supabase.removeChannel(ch);
    };
  }, [check]);

  if (waiting === 0) return null;

  return (
    <div className="fixed bottom-28 right-6 z-40 flex items-center gap-2 liquid-glass rounded-full pl-4 pr-2 py-2 shadow-xl border border-amber-500/40">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
      <button onClick={() => onOpen?.()} className="text-xs font-medium cursor-pointer">
        {waiting} cliente(s) aguardando
      </button>
      <button
        onClick={() => applyMuted(!muted)}
        title={muted ? "Reativar som das notificações" : "Silenciar notificações"}
        className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer text-gray-300"
      >
        {muted ? <BellOff size={14} /> : <Bell size={14} />}
      </button>
    </div>
  );
}
