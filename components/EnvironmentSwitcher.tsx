"use client";

import { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, Home, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase-client";

type Env = { company_id: string; name: string; role: string; is_active: boolean };

// Troca de AMBIENTE (canto superior direito): a mesma pessoa pode pertencer a
// várias empresas/casas. Aqui ela vê os ambientes que pode acessar e troca o
// ativo — nada se mistura porque cada ambiente tem seus próprios dados.
export default function EnvironmentSwitcher() {
  const [envs, setEnvs] = useState<Env[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("my_environments").then(({ data }) => setEnvs((data as Env[]) ?? []));
  }, []);

  const active = envs.find((e) => e.is_active) ?? envs[0];

  async function switchTo(id: string) {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("switch_environment", { p_company: id });
    if (error) { alert(error.message); setBusy(false); return; }
    window.location.reload(); // recarrega tudo já no novo ambiente
  }

  async function joinAnother() {
    if (!supabase) return;
    const code = prompt("Cole o código do outro ambiente (empresa ou casa):")?.trim();
    if (!code) return;
    setBusy(true);
    const { error } = await supabase.rpc("join_company", { p_code: code });
    if (error) { alert(error.message); setBusy(false); return; }
    window.location.reload();
  }

  async function createHome() {
    if (!supabase) return;
    const name = prompt("Nome da sua casa (ex.: Casa da Ana, Família Silva):")?.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_home", { p_name: name });
    if (error) { alert(error.message); setBusy(false); return; }
    window.location.reload();
  }

  // Só faz sentido mostrar se a pessoa está em algum ambiente.
  if (!active) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Trocar de ambiente"
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg liquid-glass hover:bg-white/10 cursor-pointer max-w-[46vw]"
      >
        <Building2 size={14} className="text-emerald-400 shrink-0" />
        <span className="truncate max-w-[120px] font-medium">{active.name}</span>
        <ChevronDown size={13} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-60 bg-[#0b0f16] border border-white/10 rounded-xl shadow-2xl py-1.5">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">Seus ambientes</p>
            <div className="max-h-64 overflow-y-auto custom-scroll">
              {envs.map((e) => (
                <button
                  key={e.company_id}
                  onClick={() => (e.is_active ? setOpen(false) : switchTo(e.company_id))}
                  disabled={busy}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 cursor-pointer ${e.is_active ? "bg-emerald-950/30" : ""}`}
                >
                  <Building2 size={14} className="text-gray-400 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{e.name}</span>
                    <span className="block text-[10px] text-gray-500 capitalize">{e.role}</span>
                  </span>
                  {e.is_active && <Check size={14} className="text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 mt-1 pt-1">
              <button onClick={joinAnother} disabled={busy} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 cursor-pointer text-emerald-300">
                <LogIn size={13} /> Entrar em outro ambiente
              </button>
              <button onClick={createHome} disabled={busy} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 cursor-pointer text-gray-300">
                <Home size={13} /> Criar minha casa
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
