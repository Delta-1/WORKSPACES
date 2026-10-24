import { mutationPatch, savedMessageKey, validateMessageMutation } from "./message-policy.js";

import { signedText, withoutSignature } from "./attendant-signature.js";

const join = value => Array.isArray(value) ? value[0] : value;
const jid = value => String(value || "").replace(/:\d+(?=@)/, "");
const active = new Set();
export const MESSAGE_MUTATIONS_VERSION = 1;

export async function updateMessageHistory(db, message, patch) {
  // A delayed edit must never restore a deleted message.
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await db.from("whatsapp_messages").update(patch).eq("id", message.id).is("deleted_at", null).select("*").maybeSingle();
    if (!result.error) break;
  }
  if (result.error) throw Error("A alteração foi enviada ao WhatsApp, mas o histórico não atualizou. Recarregue antes de repetir.");
  if (!result.data) {
    const current = await db.from("whatsapp_messages").select("*").eq("id", message.id).maybeSingle();
    if (current.error) throw current.error;
    return current.data;
  }
  // Do not reorder the conversation or rewrite its preview if a newer message arrived.
  const { data: latest } = await db.from("whatsapp_messages").select("id").eq("conversation_id", message.conversation_id).order("at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (latest?.id === message.id) await db.from("conversations").update({ last_message: patch.deleted_at ? "Mensagem apagada" : patch.text }).eq("id", message.conversation_id);
  return result.data;
}

export async function mutateWhatsappMessage({ db, sock, messageId, numberId, companyId, actorId, action, text, now = Date.now() }) {
  if (active.has(messageId)) throw Error("Esta mensagem já está sendo alterada. Aguarde.");
  active.add(messageId);
  try {
    const { data: actor } = await db.from("profiles").select("id,company_id").eq("id", actorId).maybeSingle();
    if (!actor || actor.company_id !== companyId) throw Error("Seu acesso à empresa mudou. Entre novamente.");
    const { data: message, error } = await db.from("whatsapp_messages").select("*,conversations!inner(id,company_id,number_id,contacts(jid,phone))").eq("id", messageId).eq("conversations.company_id", companyId).eq("conversations.number_id", numberId).maybeSingle();
    if (error) throw Error("Não foi possível consultar a mensagem.");
    const conversation = validateMessageMutation(message, { action, actorId, companyId, numberId, text, now });
    const contact = join(conversation.contacts);
    let key = savedMessageKey(message.wa_key);
    // Older 1:1 messages retain their WhatsApp ID and canonical chat JID.
    if (!key && contact?.jid && !contact.jid.endsWith("@g.us")) key = { id: message.wa_id, remoteJid: contact.jid, fromMe: true };
    if (!key || key.id !== message.wa_id || key.fromMe !== true) throw Error("A chave original desta mensagem não está disponível. Novos envios já guardam essa informação.");
    if (!sock) throw Error("Este número de WhatsApp não está conectado.");
    const sent = await sock.sendMessage(key.remoteJid, action === "delete" ? { delete: key } : { text: signedText(text.trim(), message.signature_name), edit: key });
    if (!sent?.key?.id) throw Error("O WhatsApp não confirmou a alteração. Confira a conversa antes de repetir.");
    // Nothing changes locally if WhatsApp refuses the request.
    const patch = mutationPatch(action, text, new Date(now).toISOString());
    const updated = await updateMessageHistory(db, message, patch);
    return { success: true, message: updated, waId: sent.key.id };
  } finally { active.delete(messageId); }
}

function editedText(update) {
  let content = update?.message?.editedMessage?.message;
  for (let depth = 0; content && depth < 4; depth++) {
    const wrapped = content.ephemeralMessage?.message || content.viewOnceMessage?.message || content.editedMessage?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  if (!content) return null;
  return content.conversation ?? content.extendedTextMessage?.text ?? content.imageMessage?.caption ?? content.videoMessage?.caption ?? content.documentMessage?.caption ?? null;
}

/** Reflect edits/revocations from other linked devices and customers in the same chat. */
export async function syncWhatsappMutation({ db, numberId, key, update, revokedStubType, now = Date.now() }) {
  const deleted = update?.message === null && update.messageStubType === revokedStubType;
  const text = editedText(update);
  if (!key?.id || !key.remoteJid || (!deleted && text === null)) return;
  const { data: rows, error } = await db.from("whatsapp_messages").select("*,conversations!inner(number_id,contacts(jid))").eq("wa_id", key.id).eq("conversations.number_id", numberId).limit(10);
  if (error) throw error;
  const targets = (rows || []).filter(row => {
    const contact = join(join(row.conversations)?.contacts);
    const chats = [row.wa_key?.remoteJid, row.wa_key?.remoteJidAlt, contact?.jid].filter(Boolean).map(jid);
    return chats.includes(jid(key.remoteJid)) || (key.remoteJidAlt && chats.includes(jid(key.remoteJidAlt)));
  });
  for (const row of targets) {
    if (row.deleted_at) continue;
    const timestamp = Number(update.messageTimestamp) * 1000;
    const at = !deleted && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : now;
    if (!deleted && row.edited_at && Date.parse(row.edited_at) > at) continue;
    await updateMessageHistory(db, row, mutationPatch(deleted ? "delete" : "edit", withoutSignature(text, row.signature_name), new Date(at).toISOString()));
  }
}
