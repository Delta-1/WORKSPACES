"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Building2, ChevronLeft, ChevronRight, Home, Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { FinanceEntry, Profile } from "@/lib/types";

type Scope = "casa" | "empresa";

const CATEGORIES = ["Mercado", "Aluguel", "Contas", "Transporte", "Salários", "Impostos", "Fornecedores", "Lazer", "Saúde", "Outros"];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Avalia uma expressão de calculadora com segurança (só números e + - * / . ( )).
function calc(expr: string): number | null {
  const clean = expr.replace(/\s+/g, "").replace(/,/g, ".");
  if (!clean) return null;
  if (!/^[0-9+\-*/().]+$/.test(clean)) return null;
  try {
    const val = Function(`"use strict";return (${clean})`)();
    return typeof val === "number" && isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

export default function FinanceTab({ profile }: { profile: Profile | null }) {
  const canCompany = profile?.role === "gestor" || Boolean(profile?.finance_access);
  const [scope, setScope] = useState<Scope>("casa");
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // AAAA-MM
  const companyId = profile?.company_id ?? null;

  // Form
  const [kind, setKind] = useState<"despesa" | "receita">("despesa");
  const [amountExpr, setAmountExpr] = useState("");
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const preview = calc(amountExpr);

  const load = useCallback(async () => {
    if (!supabase) return;
    const start = `${month}-01`;
    const endD = new Date(`${month}-01T00:00:00`);
    endD.setMonth(endD.getMonth() + 1);
    const end = endD.toISOString().slice(0, 10);
    let q = supabase.from("finance_entries").select("*").eq("scope", scope).gte("entry_date", start).lt("entry_date", end).order("entry_date", { ascending: false });
    if (scope === "empresa" && companyId) q = q.eq("company_id", companyId);
    const { data } = await q;
    setEntries((data as FinanceEntry[]) ?? []);
  }, [scope, month, companyId]);

  useEffect(() => {
    if (scope === "empresa" && !canCompany) setScope("casa");
    load();
    if (!supabase) return;
    const ch = supabase.channel("finance").on("postgres_changes", { event: "*", schema: "public", table: "finance_entries" }, () => load()).subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const totals = useMemo(() => {
    let receitas = 0, despesas = 0;
    for (const e of entries) {
      if (e.kind === "receita") receitas += Number(e.amount);
      else despesas += Number(e.amount);
    }
    return { receitas, despesas, saldo: receitas - despesas };
  }, [entries]);

  async function add() {
    if (!supabase || saving) return;
    const amount = calc(amountExpr);
    if (amount == null || amount <= 0) { alert("Digite um valor válido (pode usar conta, ex.: 120+35)."); return; }
    setSaving(true);
    const row: Record<string, unknown> = {
      scope,
      kind,
      category: category.trim() || null,
      description: desc.trim() || null,
      amount,
      entry_date: date,
    };
    if (scope === "empresa") row.company_id = companyId;
    const { error } = await supabase.from("finance_entries").insert(row);
    setSaving(false);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setAmountExpr(""); setDesc(""); setCategory("");
    load();
  }

  async function remove(id: string) {
    if (!supabase) return;
    await supabase.from("finance_entries").delete().eq("id", id);
    load();
  }

  function shiftMonth(delta: number) {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  }
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Wallet className="text-emerald-400" size={20} /> Financeiro
        </h3>
        {/* Alterna entre a minha CASA e a EMPRESA (empresa só com permissão). */}
        <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg p-1">
          <button onClick={() => setScope("casa")} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer ${scope === "casa" ? "bg-emerald-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>
            <Home size={13} /> Minha casa
          </button>
          {canCompany && (
            <button onClick={() => setScope("empresa")} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer ${scope === "empresa" ? "bg-emerald-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>
              <Building2 size={13} /> Empresa
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        {scope === "casa"
          ? "Seu controle pessoal de gastos da casa — privado, só você vê."
          : "Controle financeiro da empresa — visível para o gestor e quem tem acesso financeiro."}
      </p>

      <div className="flex-1 overflow-y-auto custom-scroll flex flex-col lg:flex-row gap-4">
        {/* Coluna esquerda: resumo + calculadora/lançar */}
        <div className="lg:w-80 shrink-0 space-y-3">
          {/* Resumo do mês */}
          <div className="liquid-glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => shiftMonth(-1)} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"><ChevronLeft size={16} /></button>
              <span className="text-sm font-bold capitalize">{monthLabel}</span>
              <button onClick={() => shiftMonth(1)} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"><ChevronRight size={16} /></button>
            </div>
            <div className="text-center mb-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Saldo do mês</p>
              <p className={`text-3xl font-black ${totals.saldo >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(totals.saldo)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-emerald-950/30 rounded-lg py-2">
                <p className="text-[10px] text-emerald-300 flex items-center justify-center gap-1"><ArrowUpCircle size={11} /> Receitas</p>
                <p className="text-sm font-bold text-emerald-400">{brl(totals.receitas)}</p>
              </div>
              <div className="bg-red-950/30 rounded-lg py-2">
                <p className="text-[10px] text-red-300 flex items-center justify-center gap-1"><ArrowDownCircle size={11} /> Despesas</p>
                <p className="text-sm font-bold text-red-400">{brl(totals.despesas)}</p>
              </div>
            </div>
          </div>

          {/* Lançar com calculadora */}
          <div className="liquid-glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg p-1">
              <button onClick={() => setKind("despesa")} className={`flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer ${kind === "despesa" ? "bg-red-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>Despesa</button>
              <button onClick={() => setKind("receita")} className={`flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer ${kind === "receita" ? "bg-emerald-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>Receita</button>
            </div>
            <div>
              <input
                value={amountExpr}
                onChange={(e) => setAmountExpr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                placeholder="Valor — pode fazer conta: 120+35*2"
                inputMode="text"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-lg font-bold outline-none text-center"
              />
              <p className="text-[11px] text-center mt-1 text-gray-400">
                {amountExpr && preview != null ? <>= <span className="text-emerald-400 font-bold">{brl(preview)}</span></> : "Digite o valor (aceita conta)"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`text-[10px] px-2 py-1 rounded-full cursor-pointer ${category === c ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>{c}</button>
              ))}
            </div>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (opcional)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={add} disabled={saving || preview == null} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              <Plus size={15} /> {saving ? "Salvando…" : "Adicionar lançamento"}
            </button>
          </div>
        </div>

        {/* Coluna direita: lista de lançamentos */}
        <div className="flex-1 liquid-glass rounded-2xl p-4 overflow-hidden flex flex-col">
          <p className="text-xs text-gray-400 mb-2">{entries.length} lançamento(s) em {monthLabel}</p>
          <div className="flex-1 overflow-y-auto custom-scroll space-y-1.5">
            {entries.length === 0 && <p className="text-sm text-gray-500 italic text-center py-10">Nada lançado neste mês. Use a calculadora ao lado.</p>}
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 bg-black/20 rounded-lg px-3 py-2 group">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${e.kind === "receita" ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400"}`}>
                  {e.kind === "receita" ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{e.category || (e.kind === "receita" ? "Receita" : "Despesa")}</p>
                  <p className="text-[11px] text-gray-500 truncate">{[e.description, new Date(e.entry_date + "T00:00:00").toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${e.kind === "receita" ? "text-emerald-400" : "text-red-400"}`}>{e.kind === "receita" ? "+" : "−"}{brl(Number(e.amount))}</span>
                <button onClick={() => remove(e.id)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
