/** Realtime remains primary. Reconciliation slows down during outages instead
 * of keeping every open chat on a fixed request interval. */
export function startMessagePolling(run: () => Promise<void>, hidden: () => boolean, options: {
  baseDelay?: number;
  maxDelay?: number;
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
} = {}) {
  const base = options.baseDelay ?? 1500;
  const max = options.maxDelay ?? 60000;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  const queue = (delay: number) => { if (!stopped) timer = schedule(() => { void tick(); }, delay); };
  async function tick() {
    if (stopped) return;
    if (hidden()) { queue(15000); return; }
    try { await run(); failures = 0; }
    catch { failures = Math.min(failures + 1, 10); }
    queue(Math.min(max, base * 2 ** failures));
  }
  queue(base);
  return () => { stopped = true; cancel(timer); };
}
