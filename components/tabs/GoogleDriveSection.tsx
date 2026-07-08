"use client";

import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export default function GoogleDriveSection({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive_sync") !== "1") return;

    window.history.replaceState({}, "", window.location.pathname);
    supabase.auth.getSession().then(async ({ data }) => {
      const providerToken = data.session?.provider_token;
      if (!providerToken) {
        setStatus("Não recebi permissão do Google. Tente conectar de novo.");
        return;
      }
      await runSync(providerToken);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSync(providerToken: string) {
    if (!supabase) return;
    setSyncing(true);
    setStatus("Sincronizando pastas com o Google Drive...");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ providerToken }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`Sincronizado! ${data.created} pasta(s) criada(s) no Drive.`);
      } else {
        setStatus(data.error ?? "Erro ao sincronizar.");
      }
    } catch {
      setStatus("Erro ao sincronizar com o Google Drive.");
    } finally {
      setSyncing(false);
    }
  }

  async function connectAndSync() {
    if (!supabase) return;
    const redirectTo = `${window.location.origin}${window.location.pathname}?drive_sync=1`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { scopes: DRIVE_SCOPE, redirectTo, queryParams: { access_type: "offline", prompt: "consent" } },
    });
  }

  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-md">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
        <HardDrive size={16} className="text-blue-400" /> Google Drive
      </h3>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4 accent-emerald-600"
        />
        <span className="text-sm">Ativar sincronização das pastas do Grafo com o Google Drive</span>
      </label>
      {enabled && (
        <>
          <button
            onClick={connectAndSync}
            disabled={syncing}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {syncing ? "Sincronizando..." : "Conectar Google Drive e sincronizar agora"}
          </button>
          {status && <p className="text-xs text-gray-400">{status}</p>}
          <p className="text-[11px] text-gray-500">
            Cria no seu Google Drive uma pasta para cada pasta do módulo Arquivos. Como o Google só concede acesso
            temporário por sessão, clique em sincronizar sempre que criar pastas novas.
          </p>
        </>
      )}
    </div>
  );
}
