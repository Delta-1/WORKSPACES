import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Server-side Supabase client scoped to the calling user's access token, so
 * RLS policies apply exactly as they would for that user in the browser.
 * Returns null if Supabase isn't configured or no bearer token was sent.
 */
export function supabaseForRequest(request: Request) {
  if (!url || !anonKey) return null;
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

/**
 * Service-role client (bypasses RLS). Use only in trusted server contexts like
 * cron jobs. Returns null if the service key isn't configured.
 */
export function supabaseService() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
