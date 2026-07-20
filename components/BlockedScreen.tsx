"use client";

import { useState } from "react";
import { Check, Copy, CreditCard, Lock, QrCode } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Company } from "@/lib/types";

// Tela de acesso BLOQUEADO por falta de pagamento. O dono escolhe pagar no
// Cartão (assinatura automática) ou no Pix (cobrança do mês). O funcionário só
// vê o aviso.
export default function BlockedScreen({ company, isOwner, onLogout }: { company: Company; isOwner: boolean; onLogout: () => void }) {
  const [loading, setLoading] = useState<"pix" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reactivate(method: "pix" | "card") {
    if (!supabase) return;
    setLoading(method);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ plan: "base", aiAddon: company.ai_addon, companyId: company.id, companyName: company.name, method }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; } // cartão → checkout MP
      if (data.pixCode) { setPixCode(data.pixCode as string); return; } // pix → mostra copia-e-cola
      if (data.error) setError(data.error);
      else if (data.activated) window.location.reload(); // MP não configurado → libera
    } catch {
      setError("Não consegui iniciar o pagamento. Tente de novo.");
    } finally {
      setLoading(null);
    }
  }

  function copyPix() {
    if (!pixCode) return;
    navigator.clipboard?.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
            {pixCode ? (
              <div className="text-left bg-black/30 border border-white/10 rounded-xl p-4 space-y-3">
                <p className="text-sm text-gray-200 font-semibold flex items-center gap-2"><QrCode size={16} className="text-emerald-400" /> Pague com Pix (copia e cola)</p>
                <p className="text-[11px] text-gray-400">Abra o app do seu banco, escolha Pix → Copia e cola, e cole o código. O acesso libera sozinho assim que o pagamento cair.</p>
                <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-[10px] font-mono break-all text-gray-300 max-h-24 overflow-y-auto">{pixCode}</div>
                <button onClick={copyPix} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer">
                  {copied ? <><Check size={16} /> Código copiado</> : <><Copy size={16} /> Copiar código Pix</>}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-300">Regularize o pagamento para liberar tudo na hora. Escolha como pagar:</p>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={() => reactivate("card")}
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <CreditCard size={16} /> {loading === "card" ? "Abrindo…" : "Cartão — cobrança automática mensal"}
                </button>
                <button
                  onClick={() => reactivate("pix")}
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium py-3 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <QrCode size={16} /> {loading === "pix" ? "Gerando Pix…" : "Pix — pagar este mês"}
                </button>
                <p className="text-[11px] text-gray-500">No <b>cartão</b> a cobrança é automática todo mês. No <b>Pix</b> você paga a cada mês por aqui.</p>
              </>
            )}
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
