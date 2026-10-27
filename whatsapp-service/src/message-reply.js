import { normalizeJid } from './chat-identity.js';
import { signedText } from './attendant-signature.js';
const labels = { image:'Foto', audio:'Áudio', video:'Vídeo', document:'Arquivo', sticker:'Figurinha' };
const join = value => Array.isArray(value) ? value[0] : value;

/** Resolve from a server-loaded row, never from a client-supplied WhatsApp key. */
export function prepareReply(row, { companyId, numberId, contactId, jid }) {
  const conversation = join(row?.conversations);
  if (!row || !conversation || conversation.company_id !== companyId || conversation.number_id !== numberId || conversation.contact_id !== contactId || row.company_id !== companyId) throw Error('A mensagem original não pertence a este contato e número.');
  if (!row.wa_id || row.deleted_at) throw Error('Esta mensagem não está disponível para responder.');
  if (row.wa_key?.id && row.wa_key.id !== row.wa_id) throw Error('A referência original da mensagem está inválida.');
  const key = { id: row.wa_id, remoteJid: normalizeJid(jid), fromMe: row.direction === 'out', ...(jid.endsWith("@g.us") && row.wa_key?.participant ? { participant: row.wa_key.participant } : {}) };
  const text = row.direction === 'out' ? signedText(row.text || '', row.signature_name, row.signature_position) : row.text || '';
  const mime = row.media_mime || undefined;
  let message;
  switch (row.media_type) {
    case 'image': message = { imageMessage: { caption: text, mimetype: mime } }; break;
    case 'video': message = { videoMessage: { caption: text, mimetype: mime } }; break;
    case 'audio': message = { audioMessage: { mimetype: mime || 'audio/ogg; codecs=opus', ptt: true } }; break;
    case 'sticker': message = { stickerMessage: { mimetype: 'image/webp' } }; break;
    case 'document': message = { documentMessage: { fileName: row.media_name || 'Arquivo', caption: text, mimetype: mime } }; break;
    default: message = { conversation: text };
  }
  return {
    quoted: { key, message },
    snapshot: { id: row.id, wa_id: row.wa_id, author: row.direction === 'out' ? row.signature_name || 'Equipe' : 'Cliente', text: (row.text || labels[row.media_type] || 'Mensagem').slice(0,2000), media_type: row.media_type || null },
  };
}

/** Preserve native quotes received from WhatsApp without another database query. */
export function incomingReply(content, ownJids = []) {
  const node = content?.extendedTextMessage || content?.imageMessage || content?.videoMessage || content?.audioMessage || content?.documentMessage || content?.stickerMessage;
  const ctx = node?.contextInfo;
  if (!ctx?.stanzaId || !ctx.quotedMessage) return null;
  let quoted = ctx.quotedMessage;
  for (let i=0;i<4;i++) { const inner=quoted.ephemeralMessage?.message || quoted.viewOnceMessage?.message || quoted.documentWithCaptionMessage?.message; if(!inner)break;quoted=inner; }
  const type = quoted.imageMessage ? 'image' : quoted.audioMessage ? 'audio' : quoted.videoMessage ? 'video' : quoted.documentMessage ? 'document' : quoted.stickerMessage ? 'sticker' : null;
  const media = quoted.imageMessage || quoted.videoMessage || quoted.documentMessage;
  const text = quoted.conversation || quoted.extendedTextMessage?.text || media?.caption || media?.fileName || labels[type] || 'Mensagem';
  return { id: null, wa_id: ctx.stanzaId, author: ownJids.filter(Boolean).map(normalizeJid).includes(normalizeJid(ctx.participant)) ? 'Equipe' : 'Cliente', text: String(text).slice(0,2000), media_type: type };
}
