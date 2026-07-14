import { createClient } from "@supabase/supabase-js";

// Cliente server-side com service role (ignora RLS) — usado só para ler/gravar
// o refresh_token do Drive, que o navegador nunca pode acessar.
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Cache curto do access token em memória (evita bater no Google a cada request).
let cached: { token: string; exp: number } | null = null;

/**
 * Devolve um access token válido do Google Drive, gerado a partir do
 * refresh_token guardado no servidor. Retorna null se o modo permanente não
 * estiver configurado (aí o chamador usa o token da sessão do usuário).
 */
export async function getDriveAccessToken(): Promise<string | null> {
  if (!googleOAuthConfigured()) return null;
  const svc = serviceClient();
  if (!svc) return null;

  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const { data } = await svc
    .from("company_settings")
    .select("google_drive_refresh_token")
    .eq("id", true)
    .maybeSingle();
  const refreshToken = data?.google_drive_refresh_token;
  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

// Guarda o refresh_token (chamado quando o usuário conecta o Drive com offline).
export async function storeDriveRefreshToken(refreshToken: string): Promise<boolean> {
  const svc = serviceClient();
  if (!svc) return false;
  const { error } = await svc
    .from("company_settings")
    .update({ google_drive_refresh_token: refreshToken })
    .eq("id", true);
  return !error;
}
