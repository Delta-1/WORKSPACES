"use client";
import { useEffect, useState } from "react";
import { durationLabel, elapsedSeconds } from "@/lib/attendance";
export default function AttendanceTimer({ start, end }: { start: string | null; end?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end || !start) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [start, end]);
  return start ? <span className="font-mono text-[11px] text-emerald-300" title="Tempo de atendimento">⏱ {durationLabel(elapsedSeconds(start, end ?? null, now))}</span> : null;
}
