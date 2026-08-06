"use client";

import { useEffect, useState } from "react";
import { Building2, Home, KeyRound, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { COMPANY_NICHES, PERSONAL_KINDS, nicheById } from "@/lib/niches";
import { FEATURES, whatsappPrice, type FeatureId } from "@/lib/plan";

const COMPANY_TYPES = ["MEI", "Microempresa (ME)", "Pequena empresa (EPP)", "Média empresa", "Grande empresa", "Outro"];

export default function OnboardingScreen({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [mode, setMode] = useState<"owner" | "home" | "employee">("owner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // dono
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [type, setType] = useState(COMPANY_TYPES[1]);
  const [employees, setEmployees] = useState("");
  const [nicheId, setNicheId] = useState(COMPANY_NICHES[0].id);

  // casa (home)
  const [homeName, setHomeName] = useState("");
  const [personalId, setPersonalId] = useState(PERSONAL_KINDS[0].id);

  // funcionário
  const [code, setCode] = useState("");

  useEffect(() => {
    const pending = localStorage.getItem("pendingCompanyCode");
    if (pending) {
      setMode("employee");
      setCode(pending);
    }
  }, []);

  const niche = nicheById(COMPANY_NICHES, nicheId) ?? COMPANY_NICHES[0];
  const personal = nicheById(PERSONAL_KINDS, personalId) ?? PERSONAL_KINDS[0];

  /**
   * Grava as ferramentas sugeridas pelo nicho na empresa recém-criada. Falhar
   * aqui não pode travar o cadastro — no pior caso a pessoa cai no plano padrão
   * e ajusta em Planos. Por isso o erro é engolido de propósito.
   */
  async function aplicarNicho(features: FeatureId[], waLimit: number, seg: string, kind: "empresa" | "casa") {
    try {
      const { data } = await supabase!.rpc("my_company");
      const companyId = data as string | null;
      if (!companyId) return;
      await supabase!
        .from("company_settings")
        .update({ enabled_features: features, wa_number_limit: waLimit, onboarding_niche: seg, onboarding_kind: kind })
        .eq("company_id", companyId);
    } catch {
      /* plano padrão assume */
    }
  }

  async function createCompany() {
    if (!supabase || !name.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("create_company", {
      p_name: name.trim(),
      p_cnpj: cnpj.trim() || null,
      p_razao: razao.trim() || null,
      p_type: type,
      p_employees: employees ? Number(employees) : null,
      p_segment: niche.label,
    });
    if (error) { setLoading(false); setError(error.message); return; }
    await aplicarNicho(niche.features, niche.waLimit, niche.id, "empresa");
    setLoading(false);
    localStorage.removeItem("pendingCompanyCode");
    onDone();
  }

  async function createHome() {
    if (!supabase || !homeName.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("create_home", { p_name: homeName.trim() });
    if (error) { setLoading(false); setError(error.message); return; }
    await aplicarNicho(personal.features, personal.waLimit, personal.id, "casa");
    setLoading(false);
    localStorage.removeItem("pendingCompanyCode");
    onDone();
  }

  async function joinCompany() {
    if (!supabase || !code.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("join_company", { p_code: code.trim().toUpperCase() });
    setLoading(false);
    if (error) setError("Código empresarial inválido. Confira com o administrador da empresa.");
    else { localStorage.removeItem("pendingCompanyCode"); onDone(); }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12] p-4 overflow-y-auto">
      <div className="liquid-glass rounded-2xl p-8 w-full max-w-lg shadow-2xl my-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-950 border border-emerald-500 rounded-2xl text-emerald-400 mb-3">
            <Layers size={26} />
          </div>
          <h1 className="text-xl font-bold">Vamos configurar seu acesso</h1>
          <p className="text-gray-400 text-sm mt-1">Conta empresarial, pessoal, ou entre com um código.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-black/20 rounded-lg p-1 mb-5">
          <button onClick={() => setMode("owner")} className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "owner" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>
            <Building2 size={14} /> Empresa
          </button>
          <button onClick={() => setMode("home")} className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "home" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>
            <Home size={14} /> Pessoal
          </button>
          <button onClick={() => setMode("employee")} className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "employee" ? "bg-emerald-600 text-white" : "text-gray-400"}`}>
            <KeyRound size={14} /> Código
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 text-center mb-3 bg-red-950/30 border border-red-800/50 rounded-lg py-2 px-3">{error}</p>
        )}

        {mode === "home" ? (
          <div className="space-y-4">
            <input
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
              placeholder="Um nome pra sua conta (ex.: Casa da Ana, Meus estudos) *"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <div>
              <label className="text-[11px] text-gray-400 block mb-1.5">Você vai usar pra quê?</label>
              <div className="grid gap-2">
                {PERSONAL_KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setPersonalId(k.id)}
                    className={`flex items-start gap-3 text-left rounded-xl border p-3 cursor-pointer transition ${personalId === k.id ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                  >
                    <span className="text-xl leading-none mt-0.5">{k.emoji}</span>
                    <span className="min-w-0">
                      <span className="text-[13px] font-semibold block">{k.label}</span>
                      <span className="text-[11px] text-gray-400">{k.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-gray-500">Conta pessoal é grátis nos apps de organização — sem CNPJ. Você ajusta o que quiser depois.</p>
            <button onClick={createHome} disabled={loading || !homeName.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {loading ? "Criando..." : "Criar e continuar"}
            </button>
          </div>
        ) : mode === "owner" ? (
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome comercial da empresa *" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            <input value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="Razão social" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            <div className="grid grid-cols-2 gap-3">
              <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="CNPJ" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
              <input type="number" value={employees} onChange={(e) => setEmployees(e.target.value)} placeholder="Nº de funcionários" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
            </div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none">
              {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1.5">Qual é o ramo da empresa? Já ligamos os apps certos pra ele.</label>
              <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {COMPANY_NICHES.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setNicheId(n.id)}
                    className={`flex flex-col items-start text-left rounded-xl border p-2.5 cursor-pointer transition ${nicheId === n.id ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                  >
                    <span className="text-lg leading-none mb-1">{n.emoji}</span>
                    <span className="text-[12px] font-semibold leading-tight">{n.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* O que o nicho liga — a pessoa vê o que vai receber antes de criar. */}
            <div className="rounded-xl bg-black/20 border border-white/10 p-3 text-[11px]">
              <p className="text-gray-400 mb-1.5">{niche.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {niche.features.map((f) => {
                  const meta = FEATURES.find((x) => x.id === f);
                  return <span key={f} className="bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 rounded-md px-1.5 py-0.5">{meta?.label ?? f}</span>;
                })}
              </div>
              <p className="text-gray-500 mt-2">
                Inclui <b className="text-gray-300">{niche.waLimit}</b> {niche.waLimit === 1 ? "número" : "números"} de WhatsApp
                {" "}(cada número custa {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(whatsappPrice(1))}/mês).
                Você ajusta tudo — inclusive quantos números — na tela de Planos, no próximo passo.
              </p>
            </div>

            <button onClick={createCompany} disabled={loading || !name.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {loading ? "Criando..." : "Criar empresa e continuar"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código empresarial" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-center text-lg font-mono tracking-widest outline-none" />
            <p className="text-[11px] text-gray-500 text-center">Peça o código ao administrador da sua empresa.</p>
            <button onClick={joinCompany} disabled={loading || !code.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {loading ? "Entrando..." : "Entrar na empresa"}
            </button>
          </div>
        )}

        <button onClick={onLogout} className="w-full text-[11px] text-gray-500 hover:text-gray-300 mt-5 cursor-pointer">Sair</button>
      </div>
    </div>
  );
}
