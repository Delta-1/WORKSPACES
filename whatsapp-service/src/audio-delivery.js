import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';

const TTL = 7 * 24 * 60 * 60 * 1000;
const normalizedJid = jid => String(jid || '').replace(/:\d+(?=@)/, '');

function cdnUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || !/(^|\.)(whatsapp\.net|whatsapp\.com|fbcdn\.net|fbsbx\.com)$/.test(url.hostname)) throw Error('Invalid WhatsApp media host');
  return url;
}
async function downloadCdnObject(value, fetcher) {
  let url = cdnUrl(value);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url, { headers: { Origin: 'https://web.whatsapp.com' }, redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw Error('WhatsApp media redirect without destination');
      await response.body?.cancel();
      url = cdnUrl(new URL(location, url));
      continue;
    }
    return response;
  }
  throw Error('Too many WhatsApp media redirects');
}

/** Validate the encrypted CDN object before Baileys relays its pointer to a recipient. */
export function verifiedAudioUpload(sock, { fetcher = fetch, health = {} } = {}) {
  return async (file, options) => {
    const { size } = await stat(file);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const uploaded = await sock.waUploadToServer(file, { ...options, timeoutMs: 30000 });
        const response = await downloadCdnObject(uploaded.mediaUrl || `https://mmg.whatsapp.net${uploaded.directPath || ''}`, fetcher);
        if (!response.ok || !response.body) throw Error(`WhatsApp media unavailable (${response.status})`);
        const hash = createHash('sha256');
        let length = 0;
        for await (const chunk of response.body) {
          length += chunk.length;
          if (length > size) throw Error('WhatsApp media size mismatch');
          hash.update(chunk);
        }
        if (length !== size || hash.digest('base64') !== options.fileEncSha256B64) throw Error('WhatsApp media checksum mismatch');
        health.verifiedUploads = (health.verifiedUploads || 0) + 1;
        health.lastUploadError = null;
        return uploaded;
      } catch (error) {
        health.rejectedUploads = (health.rejectedUploads || 0) + 1;
        health.lastUploadError = /^(WhatsApp media|Invalid WhatsApp media|Too many WhatsApp)/.test(error?.message || '') ? error.message : 'Network failure while verifying WhatsApp media';
        console.warn('WhatsApp audio upload verification failed:', error?.message || error);
        if (!attempt) { await sock.refreshMediaConn(true); continue; }
        throw Error('O WhatsApp não disponibilizou o arquivo de áudio corretamente. O envio foi interrompido; sua gravação pode ser reenviada.');
      }
    }
  };
}

/** Service-only wa_auth storage: never expose protobuf/media keys through the browser. */
export function createAudioRetryStore({ db, numberId, encode, decode, now = Date.now }) {
  const cache = new Map();
  let lastCleanup = 0;
  function valid(row, key) {
    return row && row.expiresAt > now() && [row.jid, row.alternateJid].filter(Boolean).map(normalizedJid).includes(normalizedJid(key.remoteJid));
  }
  return {
    async save(sent) {
      if (!sent?.key?.id || !sent.message) return;
      const row = { jid: sent.key.remoteJid, alternateJid: sent.key.remoteJidAlt, expiresAt: now() + TTL, content: encode(sent.message) };
      cache.set(sent.key.id, row);
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      if (!db) return;
      const { error } = await db.from('wa_auth').upsert({ number_id: numberId, key: `outgoing-audio-${sent.key.id}`, value: row, updated_at: new Date(now()).toISOString() }, { onConflict: 'number_id,key' });
      if (error) throw error;
      if (now() - lastCleanup > 6 * 60 * 60 * 1000) {
        lastCleanup = now();
        await db.from('wa_auth').delete().eq('number_id', numberId).like('key', 'outgoing-audio-%').lt('updated_at', new Date(now() - TTL).toISOString());
      }
    },
    async get(key) {
      if (!key?.id || !key.remoteJid) return undefined;
      let row = cache.get(key.id);
      if (!row && db) {
        const { data, error } = await db.from('wa_auth').select('value').eq('number_id', numberId).eq('key', `outgoing-audio-${key.id}`).maybeSingle();
        if (error) return undefined;
        row = data?.value;
      }
      if (!valid(row, key)) return undefined;
      return decode(row.content);
    },
  };
}

export function installAudioDelivery(sock, retryStore, options) {
  const send = sock.sendMessage.bind(sock);
  const upload = verifiedAudioUpload(sock, options);
  sock.sendMessage = async (jid, content, opts = {}) => {
    if (!content?.audio) return send(jid, content, opts);
    const sent = await send(jid, content, { ...opts, upload });
    if (!sent?.key?.id) throw Error('O WhatsApp não confirmou a submissão do áudio. Confira a conversa antes de reenviar.');
    // Persistence failure cannot turn an already-submitted message into a false failure.
    try { await retryStore.save(sent); } catch (error) { console.error('Audio retry persistence failed:', error?.message || error); }
    return sent;
  };
}
