/** Cached, bounded dependency probe. Socket connectivity alone is not readiness. */
export function createDatabaseHealth({ db, now = Date.now, ttlMs = 15000, timeoutMs = 3000 }) {
  let checked = null;
  let pending = null;
  return async () => {
    if (checked && now() - checked.time < ttlMs) return checked.result;
    if (pending) return pending;
    pending = (async () => {
      const start = now();
      let status = 'unavailable';
      try {
        if (db) {
          const { error } = await db.from('whatsapp_numbers').select('id').limit(1).retry(false).abortSignal(AbortSignal.timeout(timeoutMs));
          if (!error) status = 'healthy';
        }
      } catch { /* Health output must not disclose query data or credentials. */ }
      const result = { status, checkedAt: new Date(now()).toISOString(), latencyMs: Math.max(0, now() - start) };
      checked = { time: now(), result };
      return result;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
