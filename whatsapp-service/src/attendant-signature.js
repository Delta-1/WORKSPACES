/** Keep a signature on one plain line; prevent WhatsApp formatting injection. */
export function cleanAttendantName(value) {
  return String(value || '').replace(/[\p{Cc}\p{Cf}*_~`]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 80).trim();
}
export function attendantName(profile) {
  return cleanAttendantName(profile?.attendance_name) || cleanAttendantName(profile?.full_name) || 'Atendente';
}
export function signedText(text, name) {
  if (!name) return text || '';
  return `${String(text || '').trimEnd()}\n\n*${cleanAttendantName(name)}*`.trimStart();
}
export function withoutSignature(text, name) {
  const suffix = name ? `\n\n*${cleanAttendantName(name)}*` : '';
  return suffix && text?.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
}

/** Resolve the authenticated operator under the connected number's company. */
export async function resolveAttendantSignature(db, senderId, companyId) {
  if (!senderId) return null;
  const { data: sender, error } = await db.from('profiles').select('full_name,attendance_name').eq('id', senderId).eq('company_id', companyId).maybeSingle();
  if (error || !sender) throw Error('Não foi possível confirmar o perfil do atendente. Tente novamente.');
  return attendantName(sender);
}
