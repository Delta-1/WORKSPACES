"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Crown, RefreshCw, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import AdminCompaniesTab from "@/components/tabs/AdminCompaniesTab";

type AdminUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  is_super: boolean;
  last_check_in: string | null;
  created_at: string;
};

const ROLES = [
  { id: "gestor", label: "Gestor Geral" },
  { id: "gerente", label: "Administrador de Setor" },
  { id: "funcionario", label: "Funcionário" },
];

// VISÃOADM — central de poder do Administrador Geral. Reúne o controle de todas
// as empresas (licenças, chaves de IA, acessos) e de todos os usuários (cargo,
// atividade). Só aparece para o super admin, em qualquer ambiente.
export default function VisaoAdmTab() {
  const [view, setView] = useState<"empresas" | "usuarios">("empresas");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 pt-4 shrink-0">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
          <Crown size={18} className="text-amber-400" /> VisãoADM
        </h2>
        <p className="text-[12px] text-gray-400 mb-3">
          Central do Administrador Geral: controle total de empresas e usuários. Só você vê isto.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("empresas")}
            className={`text-xs px-3 py-2 rounded-lg cursor-pointer border flex items-center gap-1.5 ${view === "empresas" ? "border-amber-400 bg-amber-950/30 text-amber-300" : "border-white/10 text-gray-300"}`}
          >
            <Building2 size={13} /> Empresas
          </button>
          <button
            onClick={() => setView("usuarios")}
            className={`text-xs px-3 py-2 rounded-lg cursor-pointer border flex items-center gap-1.5 ${view === "usuarios" ? "border-amber-400 bg-amber-950/30 text-amber-300" : "border-white/10 text-gray-300"}`}
          >
            <Users size={13} /> Usuários
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden mt-2">
        {view === "empresas" ? (
          <div className="h-full overflow-y-auto custom-scroll">
            <AdminCompaniesTab />
          </div>
        ) : (
          <UsersManager />
        )}
      </div>
    </div>
  );
}

function isActiveToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function UsersManager() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.rpc("admin_list_users");
    setRows((data as AdminUser[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function changeRole(u: AdminUser, role: string) {
    if (!supabase || role === u.role) return;
    setSavingId(u.user_id);
    await supabase.rpc("admin_set_user_role", { p_user: u.user_id, p_role: role });
    setRows((cur) => cur.map((r) => (r.user_id === u.user_id ? { ...r, role } : r)));
    setSavingId(null);
  }

  const list = rows.filter((r) =>
    `${r.full_name ?? ""} ${r.email ?? ""} ${r.company_name ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto custom-scroll px-4 md:px-6 pb-6">
      <div className="flex items-center justify-between mb-3 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search size={14} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou empresa…" className="bg-transparent outline-none text-sm w-full" />
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300 shrink-0" title="Atualizar"><RefreshCw size={15} /></button>
      </div>

      {loading && <p className="text-sm text-gray-500 text-center py-6">Carregando…</p>}
      {!loading && list.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Nenhum usuário encontrado.</p>}

      <div className="space-y-2 max-w-3xl mx-auto">
        {list.map((u) => {
          const active = isActiveToday(u.last_check_in);
          return (
            <div key={u.user_id} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl p-3">
              <span className="w-9 h-9 rounded-full bg-indigo-950/50 flex items-center justify-center shrink-0 relative">
                <UserCog size={16} className="text-indigo-300" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0b0f16] ${active ? "bg-emerald-400" : "bg-gray-600"}`} title={active ? "Ativo hoje" : "Sem atividade hoje"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                  {u.full_name || u.email || "Usuário"}
                  {u.is_super && <span title="Administrador Geral"><ShieldCheck size={13} className="text-amber-400 inline" /></span>}
                </p>
                <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                <p className="text-[10px] text-gray-500 flex items-center gap-1 truncate"><Building2 size={10} /> {u.company_name || "Sem empresa"}</p>
              </div>
              <select
                value={u.role}
                disabled={u.is_super || savingId === u.user_id}
                onChange={(e) => changeRole(u, e.target.value)}
                className="bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs outline-none shrink-0 disabled:opacity-50 cursor-pointer"
                title={u.is_super ? "O Administrador Geral não muda de cargo por aqui" : "Trocar cargo"}
              >
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-500 mt-3 text-center max-w-3xl mx-auto">
        A bolinha verde indica quem registrou atividade (ponto) hoje. Trocar o cargo vale no ambiente atual do usuário.
      </p>
    </div>
  );
}
