// Signal keys are critical: a failed read must never become a fresh identity,
// and cache writes only become visible after durable persistence succeeds.
export function createAuthStore({ db, numberId, serialize, revive, appStateKey, now = Date.now, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  const cache = new Map();
  let tail = Promise.resolve();
  async function request(task) {
    for (let attempt = 0; ; attempt++) {
      let result;
      try { result = await task(); } catch { result = { error: { status: 503 } }; }
      if (!result.error) return result.data;
      const status = Number(result.status || result.error.status || result.error.code);
      if (attempt >= 2 || (status && status < 500 && status !== 408 && status !== 429)) {
        throw Error('Não foi possível acessar a sessão do WhatsApp no banco. Tente novamente em instantes.');
      }
      await pause(200 * (attempt + 1));
    }
  }
  const enqueue = task => {
    const work = tail.catch(() => {}).then(task);
    tail = work;
    return work;
  };
  async function read(keys) {
    const result = {};
    const missing = [];
    for (const key of keys) {
      const hit = cache.get(key);
      if (hit && hit.expires > now()) result[key] = hit.value;
      else missing.push(key);
    }
    // One bounded batch instead of a database round trip per device/key.
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      const rows = await request(() => db.from('wa_auth').select('key,value').retry(false).eq('number_id', numberId).in('key', batch));
      const found = new Map((rows || []).map(row => [row.key, row.value]));
      for (const key of batch) {
        const value = found.get(key) == null ? null : revive(found.get(key));
        result[key] = value;
        cache.set(key, { value, expires: now() + 300000 });
      }
    }
    return result;
  }
  async function write(entries) {
    const rows = entries.filter(([, value]) => value != null).map(([key, value]) => ({ number_id: numberId, key, value: serialize(value), updated_at: new Date(now()).toISOString() }));
    const removed = entries.filter(([, value]) => value == null).map(([key]) => key);
    for (let i = 0; i < rows.length; i += 100) await request(() => db.from('wa_auth').upsert(rows.slice(i, i + 100), { onConflict: 'number_id,key' }));
    for (let i = 0; i < removed.length; i += 100) await request(() => db.from('wa_auth').delete().eq('number_id', numberId).in('key', removed.slice(i, i + 100)));
    for (const [key, value] of entries) cache.set(key, { value: value ?? null, expires: now() + 300000 });
    if (cache.size > 10000) { for (const [key, hit] of cache) if (hit.expires <= now()) cache.delete(key); }
  }
  return {
    readCreds: async () => (await read(['creds'])).creds,
    // Snapshot before enqueue: Baileys mutates creds between events.
    saveCreds: creds => { const copy = revive(serialize(creds)); return enqueue(() => write([['creds', copy]])); },
    keys: {
      get: (type, ids) => enqueue(async () => {
        const rows = await read(ids.map(id => `${type}-${id}`));
        return Object.fromEntries(ids.map(id => { const stored = rows[`${type}-${id}`]; const value = stored == null ? null : revive(serialize(stored)); return [id, type === 'app-state-sync-key' && value ? appStateKey(value) : value]; }));
      }),
      set: data => { const entries = Object.entries(data).flatMap(([type, values]) => Object.entries(values).map(([id, value]) => [`${type}-${id}`, value == null ? null : revive(serialize(value))])); return enqueue(() => write(entries)); },
    },
  };
}
