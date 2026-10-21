export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Validate again on the trusted service, never trust browser-provided keys. */
export function validateMessageMutation(message, { action, actorId, companyId, numberId, text, now = Date.now() }) {
  const conversation = Array.isArray(message?.conversations) ? message.conversations[0] : message?.conversations;
  if (!message || !conversation || conversation.company_id !== companyId || conversation.number_id !== numberId) throw Error("Mensagem indisponível nesta empresa ou número.");
  if (!actorId || message.direction !== "out" || message.sender_id !== actorId) throw Error("Você só pode alterar mensagens enviadas por você.");
  if (!message.wa_id) throw Error("Esta mensagem não tem confirmação do WhatsApp e não pode ser alterada.");
  if (message.deleted_at) throw Error("Esta mensagem já foi apagada para todos.");
  if (action !== "edit" && action !== "delete") throw Error("Ação inválida.");
  const age = now - Date.parse(message.at);
  if (!Number.isFinite(age) || age < -60000) throw Error("Horário da mensagem inválido.");
  if (action === "edit") {
    if (age >= EDIT_WINDOW_MS) throw Error("O prazo de 15 minutos para editar esta mensagem terminou.");
    if (message.media_type || message.media_url) throw Error("A edição está disponível para mensagens de texto.");
    if (typeof text !== "string" || !text.trim() || text.length > 10000) throw Error("Escreva uma mensagem de 1 a 10.000 caracteres.");
  } else if (age >= DELETE_WINDOW_MS) throw Error("O prazo de dois dias para apagar para todos terminou.");
  return conversation;
}

export function savedMessageKey(key) {
  if (!key?.id || !key.remoteJid) return null;
  return Object.fromEntries(["id", "remoteJid", "remoteJidAlt", "fromMe", "participant", "participantAlt"].filter(k => key[k] !== undefined && key[k] !== null).map(k => [k, key[k]]));
}

export function mutationPatch(action, text, at = new Date().toISOString()) {
  return action === "delete"
    ? { text: null, media_url: null, media_type: null, media_name: null, media_mime: null, deleted_at: at }
    : { text: text.trim(), edited_at: at };
}
