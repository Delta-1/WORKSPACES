"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

type Row = {
  id: string;
  protocol: number;
  problem: string | null;
  status: string;
  contacts: { name: string | null; phone: string } | null;
  profiles: { full_name: string | null; email: string } | null;
  sectors: { name: string } | null;
};

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  espera: { label: "Na fila", cls: "bg-amber-950/40 text-amber-400 border-amber-800" },
  atendendo: { label: "Atendendo", cls: "bg-blue-950/40 text-blue-400 border-blue-800" },
  fechado: { label: "Fechado", cls: "bg-emerald-950/40 text-emerald-400 border-emerald-800" },
  cancelado: { label: "Cancelado", cls: "bg-gray-900/60 text-gray-400 border-gray-700" },
};

export default function AtendimentosTab({ profile }: { profile: Profile | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const isGestor = profile?.role === "gestor";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function load() {
    if (!supabase) return;
    let q = supabase
      .from("conversations")
      .select("id, protocol, problem, status, contacts(name, phone), profiles:assignee_id(full_name, email), sectors(name)", {
        count: "exact",
      })
      .order("protocol", { ascending: false });

    if (statusFilter) q = q.eq("status", statusFilter);
    if (query.trim()) {
      const asNumber = Number(query.trim());
      if (!Number.isNaN(asNumber)) q = q.eq("protocol", asNumber);
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
    if (data) setRows(data as unknown as Row[]);
    if (count !== null) setTotal(count ?? 0);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  function search() {
    setPage(1);
    load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    if (!confirm("Excluir este atendimento?")) return;
    await supabase.from("conversations").delete().eq("id", id);
    load();
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ClipboardList className="text-emerald-400" size={20} /> Atendimentos
        </h3>
        <div className="flex items-center gap-2">
          <div className="liquid-glass rounded-lg flex items-center gap-2 px-3 py-1.5">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Pesquisar pelo protocolo..."
              className="bg-transparent outline-none text-xs w-40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none"
          >
            <option value="">Todos os status</option>
            <option value="espera">Na fila</option>
            <option value="atendendo">Atendendo</option>
            <option value="fechado">Fechado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      <div className="flex-1 liquid-glass rounded-2xl overflow-hidden flex flex-col">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-black/20 border-b border-white/10 text-gray-400 text-xs uppercase font-medium">
              <th className="p-3">Protocolo</th>
              <th className="p-3">Contato</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Atendente</th>
              <th className="p-3">Setor</th>
              <th className="p-3">Problema</th>
              <th className="p-3">Status</th>
              {isGestor && <th className="p-3 text-center">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => {
              const status = STATUS_LABEL[r.status] ?? STATUS_LABEL.espera;
              return (
                <tr key={r.id} className="text-xs hover:bg-white/5">
                  <td className="p-3 font-mono text-emerald-500">#{r.protocol}</td>
                  <td className="p-3">{r.contacts?.name || r.contacts?.phone || "—"}</td>
                  <td className="p-3 text-gray-400">{r.contacts?.phone ?? "—"}</td>
                  <td className="p-3">{r.profiles?.full_name || r.profiles?.email || "—"}</td>
                  <td className="p-3">{r.sectors?.name ?? "—"}</td>
                  <td className="p-3 text-gray-400 max-w-[200px] truncate">{r.problem || "—"}</td>
                  <td className="p-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
                  </td>
                  {isGestor && (
                    <td className="p-3 text-center">
                      <button onClick={() => remove(r.id)} className="text-gray-500 hover:text-red-400 cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 italic text-sm">
                  Nenhum atendimento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-auto flex items-center justify-between p-3 border-t border-white/10 text-xs text-gray-400">
          <span>
            {total} atendimento(s) — página {page} de {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-1 rounded liquid-glass disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="px-2 py-1 rounded liquid-glass disabled:opacity-40 cursor-pointer"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
