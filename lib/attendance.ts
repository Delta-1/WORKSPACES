export function durationLabel(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  const h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function elapsedSeconds(start: string | null, end: string | null, now = Date.now()): number {
  if (!start) return 0;
  return Math.max(0, ((end ? Date.parse(end) : now) - Date.parse(start)) / 1000) || 0;
}
export function contactDisplayName(c?: { saved_name?: string | null; name?: string | null; push_name?: string | null; phone?: string | null } | null): string {
  return c?.saved_name?.trim() || c?.name?.trim() || c?.push_name?.trim() || (c?.phone ? `+${c.phone}` : "Contato WhatsApp");
}
export type AttendanceSession = {
  id: string; conversation_id: string | null; assignee_id: string | null; sector_id: string | null;
  protocol: number; contact_name: string | null; contact_phone: string | null; employee_name: string | null;
  queued_at: string; started_at: string; first_response_at: string | null; ended_at: string | null;
  outcome: "resolved" | "unresolved" | "transferred" | "automatic" | null; note: string | null; outgoing_count: number;
};
export function attendanceMetrics(rows: AttendanceSession[], now = Date.now()) {
  const completed = rows.filter(r => r.outcome === "resolved" || r.outcome === "unresolved");
  const answered = rows.filter(r => r.first_response_at);
  const finished = rows.filter(r => r.ended_at);
  return {
    total: rows.length, completed: completed.length,
    resolved: completed.filter(r => r.outcome === "resolved").length,
    active: rows.filter(r => !r.ended_at).length,
    messages: rows.reduce((n, r) => n + r.outgoing_count, 0),
    resolutionRate: completed.length ? completed.filter(r => r.outcome === "resolved").length / completed.length * 100 : null,
    avgDuration: finished.length ? finished.reduce((n,r) => n + elapsedSeconds(r.started_at,r.ended_at,now),0) / finished.length : null,
    avgWait: rows.length ? rows.reduce((n,r) => n + elapsedSeconds(r.queued_at,r.started_at,now),0) / rows.length : null,
    avgFirstResponse: answered.length ? answered.reduce((n,r) => n + elapsedSeconds(r.queued_at,r.first_response_at,now),0) / answered.length : null,
  };
}
