// When WHATSAPP_SERVICE_URL is set, WhatsApp runs on a separate always-on
// service (see /whatsapp-service) instead of in-process — required for
// serverless hosts like Vercel where a Baileys socket can't survive between
// requests. Falls back to the in-process lib/whatsapp.ts otherwise, which
// works fine for local dev or a traditional persistent-process deployment.
export const whatsappServiceConfigured = Boolean(process.env.WHATSAPP_SERVICE_URL);

export async function callWhatsappService(path: string, init?: RequestInit) {
  const base = process.env.WHATSAPP_SERVICE_URL;
  const secret = process.env.WHATSAPP_SERVICE_SECRET ?? "";
  if (!base) throw new Error("WHATSAPP_SERVICE_URL não configurado.");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Service-Secret": secret, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  return { status: res.status, data };
}
