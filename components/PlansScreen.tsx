"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Company } from "@/lib/types";
import {
  CRIACAO_PRICE,
  FEATURES,
  PLAN_TIERS,
  RECOMMENDED_WA_LIMIT,
  TRIAL_DAYS,
  planPrice,
  tierPrice,
  whatsappPrice,
  type FeatureId,
  type PlanTierId,
} from "@/lib/plan";

// Tela de CADASTRO de plano. Mostra os três planos — Simples, Avançado
// (recomendado) e Customizado (monte o seu) — todos com 3 dias grátis. Ao
// confirmar, salva as ferramentas escolhidas e segue para o pagamento (ou libera
// na hora quando não há cobrança configurada).
export default function PlansScreen({ company, onDone, onLogout }: { company: Company; onDone: () => void; onLogout: () => void }) {
  const [tier, setTier] = useState<PlanTierId>("avancado");
  const [custom, setCustom] = useState<FeatureId[]>(["mensagens", "remoto", "labs", "clientes"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpConfigured, setMpConfigured] = useState<boolean | null>(null);
  const [criacaoDone, setCriacaoDone] = useState(false);
  const isCriacao = tier === "criacao";

  useEffect(() => {
    fetch("/api/billing/config").then((r) => r.json()).then((d) => setMpConfigured(!!d.configured)).catch(() => setMpConfigured(false));
  }, []);

  const activeFeatures: FeatureId[] = useMemo(() => {
    if (tier === "customizado") return custom;
    return PLAN_TIERS.find((t) => t.id === tier)?.features ?? [];
  }, [tier, custom]);

  const price = useMemo(() => {
    if (tier === "customizado") return planPrice(custom, RECOMMENDED_WA_LIMIT);
    return tierPrice(tier);
  }, [tier, custom]);

  function toggle(f: FeatureId) {
    setCustom((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  async function confirmPlan() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      // Plano Criação: sob medida. Registra a escolha (fica pendente, sem liberar
      // o site) e mostra o aviso — a equipe combina os R$2000 (parcelável) e o resto.
      if (isCriacao) {
        const { error } = await supabase.rpc("choose_plan", { p_features: [], p_wa_limit: RECOMMENDED_WA_LIMIT, p_activate: false });
        if (error) { setError(error.message); return; }
        setCriacaoDone(true);
        return;
      }
      const activate = mpConfigured === false; // sem cobrança configurada → libera na hora
      const { error } = await supabase.rpc("choose_plan", {
        p_features: activeFeatures,
        p_wa_limit: RECOMMENDED_WA_LIMIT,
        p_activate: activate,
      });
      if (error) { setError(error.message); return; }
      // Com cobrança: a empresa ficou "pending" → o gate leva para a tela de
      // pagamento. Sem cobrança: já está ativa com os 3 dias grátis.
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12] p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-8">
        <div className="text-center mb-5">
          <h1 className="text-2xl font-bold">Escolha seu plano</h1>
          <p className="text-gray-400 text-sm mt-1 inline-flex items-center gap-1.5">
            <Gift size={15} className="text-emerald-400" /> {TRIAL_DAYS} dias grátis para testar — cancele quando quiser.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAN_TIERS.map((t) => {
            const selected = tier === t.id;
            const tPrice = t.custom || t.bespoke ? price : tierPrice(t.id);
            return (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className={`text-left rounded-2xl p-5 border transition-colors cursor-pointer relative flex flex-col ${
                  selected ? "border-emerald-500 bg-emerald-950/25" : "border-white/10 bg-black/20 hover:border-white/25"
                }`}
              >
                {t.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1">
                    <Sparkles size={11} /> RECOMENDADO
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold">{t.name}</h3>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${selected ? "bg-emerald-600 border-emerald-600" : "border-gray-500"}`}>
                    {selected && <Check size={13} className="text-white" />}
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 min-h-[32px]">{t.tagline}</p>
                <div className="mt-2 mb-3">
                  {t.bespoke ? (
                    <p className="text-lg font-bold text-emerald-400">R$ {CRIACAO_PRICE}<span className="text-xs text-gray-400 font-normal"> entrada</span></p>
                  ) : t.custom ? (
                    <p className="text-lg font-bold text-emerald-400">Você monta</p>
                  ) : (
                    <p className="text-2xl font-bold">R$ {tPrice}<span className="text-xs text-gray-400 font-normal">/mês</span></p>
                  )}
                </div>
                <ul className="space-y-1 text-[12px] text-gray-300 mt-auto">
                  {(t.bespoke ? ["Projeto sob medida", "Auditoria do Victor", "Parcelável"] : t.custom ? ["Escolha cada ferramenta abaixo"] : t.features.map((f) => FEATURES.find((x) => x.id === f)?.label ?? f)).map((f) => (
                    <li key={f} className="flex items-center gap-1.5"><Check size={12} className="text-emerald-400 shrink-0" /> {f}</li>
                  ))}
                  {!t.custom && !t.bespoke && t.id === "simples" && <li className="text-[11px] text-amber-300/80 pl-4">Sem agentes de IA</li>}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Monte o seu — só aparece no Customizado */}
        {tier === "customizado" && (
          <div className="mt-4 liquid-glass rounded-2xl p-5">
            <p className="text-sm font-semibold mb-3">Monte seu plano</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {FEATURES.map((f) => {
                const on = custom.includes(f.id);
                const fPrice = f.id === "mensagens" ? whatsappPrice(RECOMMENDED_WA_LIMIT) : f.price;
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className={`text-left rounded-xl p-3 border transition-colors cursor-pointer ${on ? "border-emerald-500 bg-emerald-950/25" : "border-white/10 bg-black/20"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-emerald-600 border-emerald-600" : "border-gray-500"}`}>{on && <Check size={11} className="text-white" />}</span>
                        {f.label}
                      </span>
                      <span className="text-emerald-400 font-semibold text-xs">R$ {fPrice}{f.id === "mensagens" ? "" : "/mês"}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 ml-6">{f.desc}{f.id === "mensagens" ? ` (${RECOMMENDED_WA_LIMIT} números inclusos)` : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 liquid-glass rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            {isCriacao ? (
              <>
                <p className="text-sm text-gray-400">Entrada (parcelável)</p>
                <p className="text-3xl font-bold">R$ {CRIACAO_PRICE}<span className="text-sm text-gray-400 font-normal"> uma vez</span></p>
                <p className="text-[11px] text-gray-500 mt-1">Projeto sob medida com auditoria do Victor. Os pagamentos seguintes são combinados.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">Total mensal após o teste</p>
                <p className="text-3xl font-bold">R$ {price}<span className="text-sm text-gray-400 font-normal">/mês</span></p>
                <p className="text-[11px] text-gray-500 mt-1">Inclui {RECOMMENDED_WA_LIMIT} números de WhatsApp. Você pode mudar o plano depois.</p>
              </>
            )}
          </div>
          <div className="flex-1 min-w-[220px]">
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <button
              onClick={confirmPlan}
              disabled={loading || (!isCriacao && activeFeatures.length === 0) || mpConfigured === null}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? "Processando..." : isCriacao ? "Escolher o Plano Criação" : mpConfigured ? "Continuar para o pagamento" : `Começar ${TRIAL_DAYS} dias grátis`}
            </button>
            <p className="text-[11px] text-gray-500 text-center mt-2">
              {isCriacao
                ? "A equipe entra em contato para combinar os R$2000 (parcelável) e os próximos passos."
                : mpConfigured
                ? "Você escolhe pagar no Cartão (automático) ou Pix na próxima tela. O acesso libera assim que o pagamento for confirmado."
                : `Acesso liberado na hora para testar por ${TRIAL_DAYS} dias.`}
            </p>
          </div>
        </div>

        {criacaoDone && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onLogout}>
            <div className="liquid-glass rounded-2xl p-8 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-full bg-emerald-600/30 border border-emerald-500 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-emerald-300" /></div>
              <h3 className="text-lg font-bold">Plano Criação escolhido!</h3>
              <p className="text-sm text-gray-400 mt-2">Recebemos seu interesse. A equipe vai falar com você para combinar os <b className="text-gray-200">R$2000 (parcelável)</b> e desenhar seu projeto sob medida com a auditoria do Victor.</p>
              <button onClick={onLogout} className="mt-5 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer">Entendi</button>
            </div>
          </div>
        )}

        <button onClick={onLogout} className="w-full text-[11px] text-gray-500 hover:text-gray-300 mt-4 cursor-pointer">Sair</button>
      </div>
    </div>
  );
}
