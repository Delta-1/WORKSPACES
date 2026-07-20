"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { FEATURES, RECOMMENDED, RECOMMENDED_WA_LIMIT, planPrice, whatsappPrice, type FeatureId } from "@/lib/plan";

// Aba PLANOS (só o gestor/dono da empresa). Escolhe as ferramentas que quer, o
// limite de contatos do WhatsApp, e vê o valor mensal ao vivo. Salva no plano da
// empresa (o app passa a mostrar só as ferramentas ligadas).
export default function PlansTab() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureId[]>(RECOMMENDED);
  const [waLimit, setWaLimit] = useState(RECOMMENDED_WA_LIMIT);
  const [kind, setKind] = useState<"recomendado" | "personalizado">("recomendado");
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [savedPrice, setSavedPrice] = useState<number | null>(null); // valor já contratado (p/ detectar troca)

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!p?.company_id) return;
      setCompanyId(p.company_id);
      const { data: cs } = await supabase.from("company_settings").select("enabled_features, wa_number_limit, plan_kind").eq("company_id", p.company_id).maybeSingle();
      const feats = (cs?.enabled_features as FeatureId[] | null) ?? RECOMMENDED;
      const waNum = cs?.wa_number_limit ?? RECOMMENDED_WA_LIMIT;
      if (cs?.enabled_features) setFeatures(cs.enabled_features as FeatureId[]);
      if (cs?.wa_number_limit != null) setWaLimit(cs.wa_number_limit);
      if (cs?.plan_kind === "personalizado" || cs?.plan_kind === "recomendado") setKind(cs.plan_kind);
      setSavedPrice(planPrice(feats, waNum)); // valor atualmente contratado
      const { data: c } = await supabase.from("companies").select("subscription_status, license_until").eq("id", p.company_id).maybeSingle();
      if (c) setStatus(c.subscription_status || null);
    })();
  }, []);

  const price = planPrice(features, waLimit);
  const has = (f: FeatureId) => features.includes(f);
  const toggle = (f: FeatureId) => { setKind("personalizado"); setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f])); };
  function useRecommended() { setKind("recomendado"); setFeatures(RECOMMENDED); setWaLimit(RECOMMENDED_WA_LIMIT); }

  async function save() {
    if (!supabase || !companyId) return;
    await supabase.from("company_settings").update({ enabled_features: features, wa_number_limit: waLimit, plan_kind: kind, monthly_price: price }).eq("company_id", companyId);
    setSaved(true);

    // Se o VALOR mudou e a empresa paga no cartão, cancela a assinatura atual e
    // cria uma nova com o novo valor (o servidor decide; no Pix não faz nada).
    if (savedPrice !== null && price !== savedPrice) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/billing/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ amount: price, companyId, companyName: undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.url) { window.location.href = data.url as string; return; } // reautoriza o cartão
      } catch { /* segue o fluxo normal mesmo se a troca falhar */ }
    }
    setSavedPrice(price);
    setTimeout(() => { window.location.reload(); }, 700); // recarrega pra aplicar as abas
  }

  return (
    <div className="h-full overflow-y-auto custom-scroll">
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><Wallet size={18} className="text-emerald-400" /> Planos</h2>
      <p className="text-[12px] text-gray-400 mb-4">Monte o plano da sua empresa: ligue só as ferramentas que você quer usar. O valor é mensal.</p>

      {status && status !== "active" && (
        <div className="mb-4 text-[12px] rounded-lg px-3 py-2 bg-amber-950/40 border border-amber-800/40 text-amber-200">
          Situação da licença: <b>{status === "test" ? "Teste grátis" : status === "trial" ? "Avaliação" : status === "blocked" ? "Bloqueada" : status}</b>. A cobrança automática entra em breve.
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button onClick={useRecommended} className={`text-xs px-3 py-2 rounded-lg cursor-pointer border ${kind === "recomendado" ? "border-emerald-400 bg-emerald-950/30 text-emerald-300" : "border-white/10 text-gray-300"}`}>
          <Sparkles size={13} className="inline mr-1" /> Recomendado
        </button>
        <button onClick={() => setKind("personalizado")} className={`text-xs px-3 py-2 rounded-lg cursor-pointer border ${kind === "personalizado" ? "border-emerald-400 bg-emerald-950/30 text-emerald-300" : "border-white/10 text-gray-300"}`}>
          Personalizado
        </button>
      </div>

      <div className="space-y-2">
        {FEATURES.map((f) => (
          <div key={f.id} className={`rounded-xl border p-3 ${has(f.id) ? "border-emerald-500/40 bg-emerald-950/15" : "border-white/10 bg-black/20"}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={has(f.id)} onChange={() => toggle(f.id)} className="accent-emerald-500 w-4 h-4" />
              <span className="flex-1 min-w-0">
                <span className="text-sm font-semibold block">{f.label}</span>
                <span className="text-[11px] text-gray-400 block">{f.desc}</span>
              </span>
              <span className="text-sm font-bold text-emerald-300 shrink-0">
                {f.id === "mensagens" ? `R$ ${whatsappPrice(waLimit)}` : `R$ ${f.price}`}
              </span>
            </label>
            {f.id === "mensagens" && has("mensagens") && (
              <div className="mt-2 pl-7 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-gray-400">Números de WhatsApp:</span>
                <select value={waLimit} onChange={(e) => { setKind("personalizado"); setWaLimit(Number(e.target.value)); }} className="bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none">
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} {n === 1 ? "número" : "números"} — R$ {whatsappPrice(n)}</option>)}
                </select>
                <span className="text-[10px] text-gray-500">R$10 por número registrado (linha conectada por QR) • 3 inclusos</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 bg-black/30 border border-white/10 rounded-xl p-4">
        <div>
          <p className="text-[11px] text-gray-400">Valor mensal do seu plano</p>
          <p className="text-2xl font-bold text-emerald-300">R$ {price}<span className="text-sm text-gray-400 font-normal">/mês</span></p>
        </div>
        <button onClick={save} className="text-sm px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5">
          {saved ? <><Check size={15} /> Salvo</> : "Salvar plano"}
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mt-2">Ao salvar, o app passa a mostrar só as ferramentas ligadas. A cobrança (Mercado Pago) será ativada em breve — por enquanto seu acesso segue liberado.</p>
    </div>
    </div>
  );
}
