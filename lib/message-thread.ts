import type { WhatsappMessageRow } from './types';

/** Retain messages received while a slower snapshot was in flight. */
export function mergeThreadMessages(previous: WhatsappMessageRow[], incoming: WhatsappMessageRow[]) {
  const rows = new Map(previous.filter(m => !m.id.startsWith('temp-')).map(m => [m.id, m]));
  for (const row of incoming) {
    const current = rows.get(row.id);
    if (current?.deleted_at && !row.deleted_at) continue;
    if (current?.edited_at && Date.parse(current.edited_at) > Date.parse(row.edited_at || '1970-01-01')) continue;
    rows.set(row.id, row);
  }
  const confirmed = [...rows.values()];
  const temps = previous.filter(t => t.id.startsWith('temp-') && !confirmed.some(d => d.direction === t.direction && (d.text || '') === (t.text || '') && (d.media_type || '') === (t.media_type || '')));
  return [...confirmed, ...temps].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
