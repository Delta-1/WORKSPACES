"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Pencil, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile, Role, Sector } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  gestor: "Gestor Geral",
  gerente: "Gerente",
  funcionario: "Funcionário",
};

const ROLE_STYLE: Record<Role, string> = {
  gestor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  gerente: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  funcionario: "bg-white/10 text-gray-300 border-white/15",
};

// Ferramentas que o dono pode liberar/bloquear por pessoa (id igual ao das abas).
const EDITABLE_TOOLS: { id: string; label: string }[] = [
  { id: "mensagens", label: "Mensagens" },
  { id: "atendimentos", label: "Atendimentos" },
  { id: "chat", label: "Copiloto IA" },
  { id: "arquivos", label: "Arquivos" },
  { id: "mural", label: "Mural" },
  { id: "kanban", label: "Kanban" },
  { id: "calendario", label: "Calendário" },
  { id: "organograma", label: "Organograma" },
  { id: "financeiro", label: "Financeiro" },
  { id: "clientes", label: "Clientes" },
  { id: "remoto", label: "Acesso Remoto" },
  { id: "automacao", label: "Automação" },
  { id: "labs", label: "Labs" },
  { id: "funcionarios", label: "Funcionários" },
];

export default function EmployeesTab({ profile }: { profile: Profile | null }) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === "gestor";

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const [pplRes, secRes] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name", { nullsFirst: false }),
      supabase.from("sectors").select("*").order("name"),
    ]);
    setPeople((pplRes.data as Profile[]) ?? []);
    setSectors((secRes.data as Sector[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase
      .channel("employees-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);

  const filtered = people.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.full_name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
  });

  async function saveEdit(role: Role, sectorId: string | null, financeAccess: boolean, toolAccess: Record<string, boolean> | null) {
    if (!supabase || !editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role, sector_id: sectorId, finance_access: financeAccess, tool_access: toolAccess })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }
    setPeople((prev) => prev.map((p) => (p.id === editing.id ? { ...p, role, sector_id: sectorId, finance_access: financeAccess, tool_access: toolAccess } : p)));
    setEditing(null);
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Users className="text-emerald-400" size={20} /> Funcionários
          <span className="text-xs font-normal text-gray-500">({people.length})</span>
        </h3>
        <div className="liquid-glass rounded-lg flex items-center gap-2 px-3 py-1.5">
          <Search size={14} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="bg-transparent outline-none text-xs w-56"
          />
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-gray-500 flex items-center gap-2">
          <ShieldCheck size={13} /> Somente o Gestor pode editar cargos e setores.
        </p>
      )}

      <div className="flex-1 overflow-y-auto custom-scroll">
        {loading ? (
          <p className="text-sm text-gray-500 p-4">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 p-4">Nenhum funcionário encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => {
              const role = (p.role ?? "funcionario") as Role;
              const isMe = p.id === profile?.id;
              return (
                <div
                  key={p.id}
                  className={`liquid-glass rounded-xl p-4 flex items-center gap-3 ${
                    isAdmin ? "cursor-pointer hover:border-emerald-500/40 border border-transparent transition-colors" : ""
                  }`}
                  onClick={() => isAdmin && setEditing(p)}
                  title={isAdmin ? "Clique para editar cargo e setor" : undefined}
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-800/60 flex items-center justify-center text-sm font-bold">
                      {(p.full_name ?? p.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {role === "gestor" && <Crown size={12} className="text-amber-400 shrink-0" />}
                      {p.full_name ?? p.email}
                      {isMe && <span className="text-[10px] text-gray-500">(você)</span>}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">{p.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ROLE_STYLE[role]}`}>
                        {ROLE_LABEL[role]}
                      </span>
                      {p.sector_id && sectorName.get(p.sector_id) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10 truncate">
                          {sectorName.get(p.sector_id)}
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && <Pencil size={14} className="text-gray-500 shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          person={editing}
          sectors={sectors}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function EditModal({
  person,
  sectors,
  saving,
  onClose,
  onSave,
}: {
  person: Profile;
  sectors: Sector[];
  saving: boolean;
  onClose: () => void;
  onSave: (role: Role, sectorId: string | null, financeAccess: boolean, toolAccess: Record<string, boolean> | null) => void;
}) {
  const [role, setRole] = useState<Role>((person.role ?? "funcionario") as Role);
  const [sectorId, setSectorId] = useState<string | null>(person.sector_id);
  const [financeAccess, setFinanceAccess] = useState<boolean>(Boolean(person.finance_access));
  // Permissão por ferramenta: null = usa o padrão do cargo. Objeto = escolha manual.
  const [customTools, setCustomTools] = useState<boolean>(person.tool_access != null);
  const [tools, setTools] = useState<Record<string, boolean>>(() => (person.tool_access as Record<string, boolean>) ?? {});
  const toggleTool = (id: string) => setTools((t) => ({ ...t, [id]: !t[id] }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="liquid-glass rounded-2xl p-6 w-full max-w-md space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold flex items-center gap-2">
            <UserRound size={18} className="text-emerald-400" /> Editar funcionário
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div>
          <p className="text-sm font-semibold">{person.full_name ?? person.email}</p>
          <p className="text-xs text-gray-500">{person.email}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cargo</label>
          <div className="grid grid-cols-3 gap-2">
            {(["funcionario", "gerente", "gestor"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`text-xs font-medium py-2 rounded-lg border cursor-pointer transition-colors ${
                  role === r ? ROLE_STYLE[r] : "bg-black/20 text-gray-400 border-white/10 hover:border-white/25"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            Gerentes podem criar/renomear/apagar pastas e aprovar compartilhamentos. Gestor controla tudo.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Setor</label>
          <select
            value={sectorId ?? ""}
            onChange={(e) => setSectorId(e.target.value || null)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          >
            <option value="">Sem setor</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Acesso ao financeiro da empresa (cargo de financeiro). */}
        <label className="flex items-start gap-2 text-xs cursor-pointer rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2">
          <input type="checkbox" checked={financeAccess} onChange={(e) => setFinanceAccess(e.target.checked)} className="accent-emerald-500 mt-0.5" />
          <span>
            <b className="text-emerald-300">Acesso ao Financeiro da empresa</b>
            <br /><span className="text-gray-500">Pode ver e lançar as despesas/receitas da empresa. (O controle da própria casa cada um já tem, privado.)</span>
          </span>
        </label>

        {/* Permissão por ferramenta (cargo estilo Discord): o dono libera o que cada um usa. */}
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={customTools} onChange={(e) => setCustomTools(e.target.checked)} className="accent-emerald-500" />
            <b>Escolher ferramentas manualmente</b>
          </label>
          <p className="text-[10px] text-gray-500 mt-0.5">Desmarcado = usa o padrão do cargo. Marcado = só as ferramentas ligadas abaixo aparecem para esta pessoa.</p>
          {customTools && (
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {EDITABLE_TOOLS.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-[11px] cursor-pointer rounded px-2 py-1 hover:bg-white/5">
                  <input type="checkbox" checked={!!tools[t.id]} onChange={() => toggleTool(t.id)} className="accent-emerald-500" />
                  {t.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(role, sectorId, financeAccess, customTools ? tools : null)}
            disabled={saving}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
