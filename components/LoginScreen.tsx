"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase-client";

export default function LoginScreen({
  onLogin,
  externalError,
}: {
  onLogin: (name: string) => void;
  externalError?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? externalError ?? null;

  async function handleGoogleLogin() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12]">
      <div className="liquid-glass rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-950 border border-emerald-500 rounded-2xl text-emerald-400 mb-3">
            <Layers size={26} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
          <p className="text-gray-400 text-sm mt-1">Acesse com sua conta Google corporativa</p>
        </div>

        {shownError && (
          <p className="text-xs text-red-400 text-center mb-4 bg-red-950/30 border border-red-800/50 rounded-lg py-2 px-3">
            {shownError}
          </p>
        )}

        {supabaseConfigured ? (
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-100 text-gray-800 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.2-17 10.3z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.4 27 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 39.6 16.4 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.6 5.4C41.9 35.9 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5z"
              />
            </svg>
            {loading ? "Redirecionando..." : "Entrar com Google"}
          </button>
        ) : (
          <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-center space-y-2">
            <p>Login com Google não configurado.</p>
            <p className="text-gray-400">
              Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no ambiente.
            </p>
            <button
              onClick={() => onLogin("Desenvolvedor")}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg mt-2 cursor-pointer"
            >
              Entrar em modo demo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
