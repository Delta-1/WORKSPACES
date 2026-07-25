"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, Home } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import ProfilePicker, { type Env } from "@/components/ProfilePicker";

// Botão de AMBIENTE (canto superior direito). Mostra o ambiente ativo; ao clicar,
// abre a tela de perfis (estilo Netflix) para trocar de empresa/casa ou adicionar.
export default function EnvironmentSwitcher() {
  const [envs, setEnvs] = useState<Env[]>([]);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("my_environments").then(({ data }) => setEnvs((data as Env[]) ?? []));
  }, []);

  const active = envs.find((e) => e.is_active) ?? envs[0];
  if (!active) return null;
  const isHome = active.company_type === "Casa";

  return (
    <>
      <button
        onClick={() => setPicker(true)}
        title="Trocar de ambiente"
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg liquid-glass hover:bg-white/10 cursor-pointer max-w-[46vw]"
      >
        {isHome ? <Home size={14} className="text-emerald-400 shrink-0" /> : <Building2 size={14} className="text-emerald-400 shrink-0" />}
        <span className="truncate max-w-[120px] font-medium">{active.name}</span>
        <ChevronDown size={13} className="text-gray-400 shrink-0" />
      </button>
      {picker && <ProfilePicker envs={envs} onClose={() => setPicker(false)} />}
    </>
  );
}
