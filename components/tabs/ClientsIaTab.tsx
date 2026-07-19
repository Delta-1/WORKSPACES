"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Monitor, RefreshCw, Search, User } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type WorkUser = {
  id: string;
  email: string;
  username: string | null;
  machine_name: string | null;
  agent_id: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

// Aba CLIENTES.IA — pessoas de fora que entraram pelo link público (Workspace.IA),
// separadas dos clientes convencionais. Cada uma com nome de usuário + a máquina
// (acesso remoto) vinculada, e quando entrou por último.
export default function ClientsIaTab({ profile }: { profile: Profile | null }) {
  const [users, setUsers] = useState<WorkUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("work_users").select("id,email,username,machine_name,agent_id,last_login_at,last_seen_at,created_at").order("last_login_at", { ascending: false, nullsFirst: false });
    setUsers((data as WorkUser[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = users.filter((u) => `${u.username || ""} ${u.email} ${u.machine_name || ""}`.toLowerCase().includes(q.toLowerCase()));
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold flex items-center gap-2"><Bot size={18} className="text-indigo-400" /> Clientes.IA</h2>
        <button onClick={load} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300" title="Atualizar"><RefreshCw size={15} /></button>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">Usuários que entraram pelo seu link público do Workspace.IA (com login próprio). Cada máquina aparece com o nome da pessoa + o nome do computador.</p>

      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 mb-3 max-w-sm">
        <Search size={14} className="text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou máquina…" className="bg-transparent outline-none text-sm w-full" />
      </div>

      {loading && <p className="text-sm text-gray-500">Carregando…</p>}
      {!loading && list.length === 0 && <p className="text-sm text-gray-500 py-10 text-center">Ninguém entrou pelo link ainda. Ative o Workspace.IA em Configurações e compartilhe o link.</p>}

      <div className="space-y-2">
        {list.map((u) => (
          <div key={u.id} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl p-3">
            <span className="w-10 h-10 rounded-full bg-indigo-950/60 flex items-center justify-center shrink-0"><User size={18} className="text-indigo-300" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{u.username || u.email.split("@")[0]}</p>
              <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
              {u.machine_name && <p className="text-[11px] text-gray-300 flex items-center gap-1 mt-0.5"><Monitor size={11} className="text-fuchsia-300" /> {u.machine_name}{u.agent_id ? "" : " (não conectada)"}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-gray-500">Última entrada</p>
              <p className="text-[11px] text-gray-300">{fmt(u.last_login_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
