"use client";

import { useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Company } from "@/lib/types";

// Tela de acesso BLOQUEADO por falta de pagamento. O dono pode reativar
// (recomeça a assinatura no Mercado Pago); o funcionário só vê o aviso.
export default function BlockedScreen({ company, isOwner, onLogout }: { company: Company; isOwner: boolean; onLogout: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reactivate() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ plan: "base", aiAddon: company.ai_addon, companyId: company.id, companyName: company.name }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      if (data.error) setError(data.error);
      else if (data.activated) window.location.reload(); // MP não configurado → libera
    } catch {
      setError("Não consegui iniciar o pagamento. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12] p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
          <Lock size={30} className="text-red-400" />
        </div>
        <h1 className="text-2xl font-bold">Acesso suspenso</h1>
        <p className="text-gray-400 text-sm mt-2">
          A assinatura de <b className="text-gray-200">{company.name}</b> está{" "}
          {company.subscription_status === "past_due" ? "com pagamento atrasado" : "pausada ou cancelada"}.
        </p>

        {isOwner ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-gray-300">Regularize o pagamento para liberar tudo na hora.</p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={reactivate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {loading ? "Abrindo pagamento..." : "Reativar assinatura"}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-gray-400">
            Fale com o responsável pela empresa para regularizar o pagamento e liberar o acesso.
          </p>
        )}

        <button onClick={onLogout} className="w-full text-[11px] text-gray-500 hover:text-gray-300 mt-6 cursor-pointer">
          Sair
        </button>
      </div>
    </div>
  );
}
