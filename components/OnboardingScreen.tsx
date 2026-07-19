"use client";

import { useEffect, useState } from "react";
import { Building2, Home, KeyRound, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

const COMPANY_TYPES = ["MEI", "Microempresa (ME)", "Pequena empresa (EPP)", "Média empresa", "Grande empresa", "Outro"];
const SEGMENTS = ["Suporte técnico / TI", "Escritório / Administrativo", "Comércio / Loja", "Serviços", "Saúde", "Educação", "Restaurante / Food", "Contabilidade", "Imobiliária", "Outro"];

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
  const [segment, setSegment] = useState(SEGMENTS[0]);

  // casa (home) — só o nome
  const [homeName, setHomeName] = useState("");

  // funcionário
  const [code, setCode] = useState("");

  useEffect(() => {
    const pending = localStorage.getItem("pendingCompanyCode");
    if (pending) {
      setMode("employee");
      setCode(pending);
    }
  }, []);

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
      p_segment: segment,
    });
    setLoading(false);
    if (error) setError(error.message);
    else {
      localStorage.removeItem("pendingCompanyCode");
      onDone();
    }
  }

  async function createHome() {
    if (!supabase || !homeName.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("create_home", { p_name: homeName.trim() });
    setLoading(false);
    if (error) setError(error.message);
    else { localStorage.removeItem("pendingCompanyCode"); onDone(); }
  }

  async function joinCompany() {
    if (!supabase || !code.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("join_company", { p_code: code.trim().toUpperCase() });
    setLoading(false);
    if (error) setError("Código empresarial inválido. Confira com o administrador da empresa.");
    else {
      localStorage.removeItem("pendingCompanyCode");
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#060a12] p-4 overflow-y-auto">
      <div className="liquid-glass rounded-2xl p-8 w-full max-w-lg shadow-2xl my-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-950 border border-emerald-500 rounded-2xl text-emerald-400 mb-3">
            <Layers size={26} />
          </div>
          <h1 className="text-xl font-bold">Vamos configurar seu acesso</h1>
          <p className="text-gray-400 text-sm mt-1">Crie uma empresa, sua casa, ou entre com um código.</p>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-black/20 rounded-lg p-1 mb-5">
          <button
            onClick={() => setMode("owner")}
            className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "owner" ? "bg-emerald-600 text-white" : "text-gray-400"}`}
          >
            <Building2 size={14} /> Empresa
          </button>
          <button
            onClick={() => setMode("home")}
            className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "home" ? "bg-emerald-600 text-white" : "text-gray-400"}`}
          >
            <Home size={14} /> Casa
          </button>
          <button
            onClick={() => setMode("employee")}
            className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md cursor-pointer ${mode === "employee" ? "bg-emerald-600 text-white" : "text-gray-400"}`}
          >
            <KeyRound size={14} /> Código
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 text-center mb-3 bg-red-950/30 border border-red-800/50 rounded-lg py-2 px-3">
            {error}
          </p>
        )}

        {mode === "home" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 text-sm bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
              <Home size={15} /> Um espaço só seu, pra coisas de casa. Sem CNPJ — só o nome.
            </div>
            <input
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
              placeholder="Nome da sua casa (ex.: Casa da Ana, Família Silva) *"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <p className="text-[11px] text-gray-500">Depois você recebe um código pra convidar a família — e some no canto superior direito pra trocar entre casa e empresa.</p>
            <button
              onClick={createHome}
              disabled={loading || !homeName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar minha casa e continuar"}
            </button>
          </div>
        ) : mode === "owner" ? (
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome comercial da empresa *"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
              placeholder="Razão social"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="CNPJ"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
              <input
                type="number"
                value={employees}
                onChange={(e) => setEmployees(e.target.value)}
                placeholder="Nº de funcionários"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
            >
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">O que a empresa faz?</label>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
              >
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={createCompany}
              disabled={loading || !name.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar empresa e continuar"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Código empresarial"
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-center text-lg font-mono tracking-widest outline-none"
            />
            <p className="text-[11px] text-gray-500 text-center">Peça o código ao administrador da sua empresa.</p>
            <button
              onClick={joinCompany}
              disabled={loading || !code.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar na empresa"}
            </button>
          </div>
        )}

        <button onClick={onLogout} className="w-full text-[11px] text-gray-500 hover:text-gray-300 mt-5 cursor-pointer">
          Sair
        </button>
      </div>
    </div>
  );
}
