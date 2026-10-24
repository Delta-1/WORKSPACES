// Adapted from STARSIS: phone and LID are aliases of the same WhatsApp chat.
export const normalizeJid = value => String(value || '').replace(/:\d+(?=@)/, '');
export async function resolveIncomingIdentity(key, sock) {
  const aliases = [...new Set([key?.remoteJid, key?.remoteJidAlt].map(normalizeJid).filter(Boolean))];
  let phoneJid = aliases.find(jid => jid.endsWith('@s.whatsapp.net'));
  const lid = aliases.find(jid => jid.endsWith('@lid'));
  if (!phoneJid && lid) {
    try {
      const mapped = normalizeJid(await sock?.signalRepository?.lidMapping?.getPNForLID(lid));
      if (mapped.endsWith('@s.whatsapp.net')) { phoneJid = mapped; aliases.push(mapped); }
    } catch { /* The saved LID still identifies this chat when mapping is unavailable. */ }
  }
  return { phone: (phoneJid || aliases[0] || '').split('@')[0], aliases };
}
