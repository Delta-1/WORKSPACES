"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase-client";

// Mantém o Google Drive sincronizado continuamente: sempre que uma rotina
// coleta um arquivo novo (novo automation_run), e também num intervalo fixo,
// dispara o "drain" (bucket -> Drive) em silêncio, enquanto o app está aberto.
export default function AutoDriveSync() {
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let stopped = false;

    async function drain() {
      if (busy.current || stopped || !supabase) return;
      busy.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        await fetch("/api/automation/drain", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          keepalive: true,
        });
      } catch {
        /* silencioso */
      } finally {
        busy.current = false;
      }
    }

    // Dispara pouco depois de um novo arquivo coletado (debounce de 4s p/ juntar vários).
    function scheduleSoon() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(drain, 4000);
    }

    const ch = supabase
      .channel("auto-drive-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_runs" }, () => scheduleSoon())
      .subscribe();

    // Rede de segurança: a cada 3 min drena o que tiver ficado pra trás.
    const interval = setInterval(drain, 180000);
    // Uma passada logo ao abrir o app.
    const kick = setTimeout(drain, 8000);

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      clearTimeout(kick);
      clearInterval(interval);
      if (supabase) supabase.removeChannel(ch);
    };
  }, []);

  return null;
}
