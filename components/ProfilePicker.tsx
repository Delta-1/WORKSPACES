"use client";

import { useEffect, useState } from "react";
import { Building2, Home, KeyRound, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

export type Env = { company_id: string; name: string; role: string; is_active: boolean; company_type: string | null; logo_url: string | null; theme_color: string | null };

// Paletas de gradiente por ambiente (bonito e variado, estilo "perfis").
const GRADIENTS = [
  ["#10b981", "#0ea5e9"], ["#8b5cf6", "#ec4899"], ["#f59e0b", "#ef4444"],
  ["#0ea5e9", "#6366f1"], ["#22c55e", "#14b8a6"], ["#f43f5e", "#8b5cf6"],
  ["#eab308", "#f97316"], ["#06b6d4", "#3b82f6"],
];
function gradientFor(seed: string) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

// Tela de seleção de perfis/ambientes — estilo Netflix, porém mais bonito. Mostra
// todos os ambientes da pessoa (empresa/casa) como cartões grandes, com um "+"
// para adicionar outro. Escolher entra e passa a ser o ambiente lembrado.
export default function ProfilePicker({ envs: initial, onClose }: { envs?: Env[]; onClose?: () => void }) {
  const [envs, setEnvs] = useState<Env[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (initial || !supabase) return;
    supabase.rpc("my_environments").then(({ data }) => { setEnvs((data as Env[]) ?? []); setLoading(false); });
  }, [initial]);

  async function enter(e: Env) {
    if (!supabase || busy) return;
    setBusy(e.company_id);
    if (!e.is_active) {
      const { error } = await supabase.rpc("switch_environment", { p_company: e.company_id });
      if (error) { alert(error.message); setBusy(null); return; }
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#05070d]">
      {/* brilho de fundo */}
      <div className="pointer-events-none fixed inset-0 opacity-40" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.18), transparent 70%), radial-gradient(50% 40% at 80% 100%, rgba(139,92,246,0.15), transparent 70%)" }} />
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {onClose && (
          <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-white cursor-pointer p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
        )}
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-1">Quem está entrando?</h1>
        <p className="text-gray-400 text-sm mb-10">Escolha o ambiente que você quer usar agora.</p>

        {loading ? <Loader2 className="animate-spin text-emerald-400" /> : (
          <div className="flex flex-wrap items-start justify-center gap-6 max-w-4xl">
            {envs.map((e) => {
              const [c1, c2] = e.theme_color ? [e.theme_color, e.theme_color] : gradientFor(e.name);
              const isHome = e.company_type === "Casa";
              return (
                <button key={e.company_id} onClick={() => enter(e)} disabled={!!busy} className="group flex flex-col items-center gap-3 cursor-pointer">
                  <div
                    className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden ring-2 ring-transparent group-hover:ring-white/80 transition-all duration-200 group-hover:scale-105 shadow-2xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                  >
                    {e.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white/95 drop-shadow-lg">{isHome ? <Home size={54} /> : <Building2 size={54} />}</span>
                    )}
                    {busy === e.company_id && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={26} className="animate-spin text-white" /></div>}
                    {e.is_active && <span className="absolute top-2 right-2 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-black/40" title="Último usado" />}
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm sm:text-base max-w-[10rem] truncate group-hover:text-white">{e.name}</p>
                    <p className="text-[11px] text-gray-500 capitalize">{isHome ? "Casa" : e.role}</p>
                  </div>
                </button>
              );
            })}

            {/* Cartão "+" para adicionar outro ambiente/plano */}
            <button onClick={() => setAdding(true)} className="group flex flex-col items-center gap-3 cursor-pointer">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl border-2 border-dashed border-white/20 group-hover:border-emerald-400/70 flex items-center justify-center transition-all duration-200 group-hover:scale-105 bg-white/[0.02]">
                <Plus size={46} className="text-gray-500 group-hover:text-emerald-300" />
              </div>
              <p className="text-gray-400 group-hover:text-white text-sm">Adicionar</p>
            </button>
          </div>
        )}
      </div>

      {adding && <AddEnvModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddEnvModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"code" | "home">("code");
  const [code, setCode] = useState("");
  const [homeName, setHomeName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!supabase) return;
    setBusy(true); setError(null);
    if (mode === "code") {
      const { error } = await supabase.rpc("join_company", { p_code: code.trim().toUpperCase() });
      if (error) { setError("Código inválido."); setBusy(false); return; }
    } else {
      const { error } = await supabase.rpc("create_home", { p_name: homeName.trim() });
      if (error) { setError(error.message); setBusy(false); return; }
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Adicionar ambiente</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-black/30 rounded-lg p-1 mb-4">
          <button onClick={() => setMode("code")} className={`flex items-center justify-center gap-1.5 text-xs py-2 rounded-md cursor-pointer ${mode === "code" ? "bg-emerald-600 text-white" : "text-gray-400"}`}><KeyRound size={13} /> Código</button>
          <button onClick={() => setMode("home")} className={`flex items-center justify-center gap-1.5 text-xs py-2 rounded-md cursor-pointer ${mode === "home" ? "bg-emerald-600 text-white" : "text-gray-400"}`}><Home size={13} /> Criar casa</button>
        </div>
        {mode === "code" ? (
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código do ambiente" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-center font-mono tracking-widest outline-none" />
        ) : (
          <input value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="Nome da sua casa" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none" />
        )}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        <button onClick={go} disabled={busy || (mode === "code" ? !code.trim() : !homeName.trim())} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" /> : mode === "code" ? "Entrar" : "Criar casa"}
        </button>
        <p className="text-[11px] text-gray-500 text-center mt-3">Para criar uma nova empresa, saia e escolha “Criar empresa” no cadastro.</p>
      </div>
    </div>
  );
}
