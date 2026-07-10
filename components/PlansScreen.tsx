"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Company } from "@/lib/types";

const BASE_PRICE = 50;
const AI_PRICE = 100;

export default function PlansScreen({ company, onDone, onLogout }: { company: Company; onDone: () => void; onLogout: () => void }) {
  const [ai, setAi] = useState(company.ai_addon);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = BASE_PRICE + (ai ? AI_PRICE : 0);

  async function subscribe() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ plan: "base", aiAddon: ai, amount: total, companyId: company.id, companyName: company.name }),
      });
      const data = await res.json();
      if (data.url) {
        // Mercado Pago configurado — redireciona para o checkout
        window.location.href = data.url;
        return;
      }
      // Cobrança ainda não ativada: libera o acesso e registra o plano
      const { error } = await supabase.rpc("set_company_plan", { p_plan: "base", p_ai: ai });
      if (error) setError(error.message);
      else onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12] p-4 overflow-y-auto">
      <div className="w-full max-w-md my-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Escolha seu plano</h1>
          <p className="text-gray-400 text-sm mt-1">Comece agora — cancele quando quiser.</p>
        </div>

        <div className="liquid-glass rounded-2xl p-6 space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-bold">Plano Base</h3>
              <p className="text-emerald-400 font-bold">
                R$ {BASE_PRICE}
                <span className="text-xs text-gray-400 font-normal">/mês</span>
              </p>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-300">
              {["WhatsApp multiatendimento", "Kanban, Organograma e Ponto", "Arquivos em grafo", "Mural e chat interno", "Modo TV"].map(
                (f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0" /> {f}
                  </li>
                )
              )}
            </ul>
          </div>

          <button
            onClick={() => setAi((v) => !v)}
            className={`w-full text-left rounded-xl p-4 border transition-colors cursor-pointer ${
              ai ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${ai ? "bg-emerald-600 border-emerald-600" : "border-gray-500"}`}>
                  {ai && <Check size={13} className="text-white" />}
                </div>
                <span className="font-semibold flex items-center gap-1.5">
                  <Sparkles size={15} className="text-amber-400" /> Complemento de IA
                </span>
              </div>
              <span className="text-amber-400 font-bold text-sm">
                + R$ {AI_PRICE}
                <span className="text-xs text-gray-400 font-normal">/mês</span>
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2 ml-7">
              Chatbot que responde os clientes automaticamente no WhatsApp e copiloto de IA para a equipe.
            </p>
          </button>

          <div className="border-t border-white/10 pt-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">Total mensal</span>
            <span className="text-2xl font-bold">R$ {total}</span>
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            onClick={subscribe}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {loading ? "Processando..." : "Assinar e começar"}
          </button>
          <p className="text-[11px] text-gray-500 text-center">
            Pagamento via Mercado Pago. Enquanto a cobrança não estiver ativada, o acesso é liberado para você testar.
          </p>
        </div>

        <button onClick={onLogout} className="w-full text-[11px] text-gray-500 hover:text-gray-300 mt-4 cursor-pointer">
          Sair
        </button>
      </div>
    </div>
  );
}
