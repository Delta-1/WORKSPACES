/** Keep a signature on one plain line; prevent WhatsApp formatting injection. */
export function cleanAttendantName(value) {
  return String(value || '').replace(/[\p{Cc}\p{Cf}*_~`]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 80).trim();
}
export function attendantName(profile) {
  return cleanAttendantName(profile?.attendance_name) || cleanAttendantName(profile?.full_name) || 'Atendente';
}
export function attendancePosition(value) {
  return value === 'bottom' ? 'bottom' : 'top';
}
// Missing position identifies older messages that were sent with a footer.
export function signedText(text, name, position = 'bottom') {
  if (!name) return text || '';
  const signature = `*${cleanAttendantName(name)}*`;
  const body = String(text || '').trim();
  if (!body) return signature;
  return position === 'top' ? `${signature}\n\n${body}` : `${body}\n\n${signature}`;
}
export function withoutSignature(text, name, position = 'bottom') {
  if (!name || !text) return text;
  const signature = `*${cleanAttendantName(name)}*`;
  if (position === 'top') return text.startsWith(`${signature}\n\n`) ? text.slice(signature.length + 2) : text;
  return text.endsWith(`\n\n${signature}`) ? text.slice(0, -signature.length - 2) : text;
}

/** Resolve the authenticated operator under the connected number's company. */
export async function resolveAttendantSignature(db, senderId, companyId) {
  if (!senderId) return null;
  const { data: sender, error } = await db.from('profiles').select('full_name,attendance_name,attendance_position').eq('id', senderId).eq('company_id', companyId).maybeSingle();
  if (error || !sender) throw Error('Não foi possível confirmar o perfil do atendente. Tente novamente.');
  return { name: attendantName(sender), position: attendancePosition(sender.attendance_position) };
}
