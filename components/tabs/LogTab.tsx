"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type LogRow = { id: string; at: string; actor: string | null; action: string };

function fmt(at: string) {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function line(r: LogRow) {
  return `[${fmt(r.at)}] ${r.actor || "Sistema"} — ${r.action}`;
}

export default function LogTab({ profile }: { profile: Profile | null }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  void profile;

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("activity_log").select("id,at,actor,action").order("at", { ascending: true }).limit(2000);
    setRows((data as LogRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("activity-log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        setRows((prev) => [...prev, payload.new as LogRow]);
      })
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  // Mantém rolado no fim (última linha), como um terminal de log.
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [rows]);

  function downloadTxt() {
    const content = rows.map(line).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "log.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ScrollText className="text-emerald-400" size={20} /> Log
          <span className="text-xs font-normal text-gray-500">({rows.length})</span>
        </h3>
        <button onClick={downloadTxt} className="flex items-center gap-2 liquid-glass text-xs font-medium px-3 py-2 rounded-lg cursor-pointer">
          <Download size={14} /> Baixar log.txt
        </button>
      </div>

      <p className="text-[11px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        Registro de alterações — <b>horário</b>, <b>quem</b> editou e a <b>ação</b>. Cada mudança nas pastas/arquivos entra aqui automaticamente.
      </p>

      <div ref={boxRef} className="flex-1 overflow-y-auto custom-scroll bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-[12px] leading-relaxed">
        {rows.length === 0 ? (
          <p className="text-gray-600 italic">— log vazio —</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="whitespace-pre-wrap break-words text-gray-300">
              <span className="text-gray-600">[{fmt(r.at)}]</span>{" "}
              <span className="text-emerald-400">{r.actor || "Sistema"}</span>{" "}
              <span className="text-gray-500">—</span> {r.action}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
