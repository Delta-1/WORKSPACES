"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

// PKCE avoids a browser-side crash in the implicit flow's hash-based session
// recovery (`_getSessionFromURL` throws "String contains non ISO-8859-1 code
// point" when certain OAuth user metadata reaches a header) and is the flow
// Supabase recommends for browser apps anyway.
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { flowType: "pkce" } })
  : null;
