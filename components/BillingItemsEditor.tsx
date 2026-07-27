"use client";

// Editor de EXTRATO reutilizável: motivo + itens (descrição + valor) com total.
// Usado nas cobranças rápidas (chat do Mensagens e Contatos).

import { Plus, X } from "lucide-react";
import { itemsTotal, type BillingItem } from "@/lib/billing";

export default function BillingItemsEditor({
  itens, setItens, motivo, setMotivo,
}: {
  itens: BillingItem[];
  setItens: (v: BillingItem[]) => void;
  motivo: string;
  setMotivo: (v: string) => void;
}) {
  const total = itemsTotal(itens);
  const hasItens = itens.some((i) => (i.descricao || "").trim() || Number(i.valor));
  const setItem = (i: number, k: keyof BillingItem, v: string) => setItens(itens.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  return (
    <div className="space-y-2">
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm" />
      <div className="bg-white/5 border border-white/10 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400">Extrato (o que está incluso)</span>
          <button type="button" onClick={() => setItens([...itens, { descricao: "", valor: "" }])} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15 flex items-center gap-1"><Plus size={12} /> item</button>
        </div>
        {itens.length === 0 && <p className="text-[11px] text-gray-500">Sem itens — cobra o valor único. Adicione itens para um extrato com total.</p>}
        <div className="space-y-1.5">
          {itens.map((it, i) => (
            <div key={i} className="flex gap-1.5">
              <input className="flex-1 bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" placeholder="Descrição" value={String(it.descricao)} onChange={(e) => setItem(i, "descricao", e.target.value)} />
              <input className="w-20 bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" type="number" placeholder="R$" value={String(it.valor)} onChange={(e) => setItem(i, "valor", e.target.value)} />
              <button type="button" onClick={() => setItens(itens.filter((_, idx) => idx !== i))} className="px-2 rounded bg-white/5 hover:bg-white/10 text-gray-400"><X size={14} /></button>
            </div>
          ))}
        </div>
        {hasItens && <div className="text-right text-xs mt-1.5 font-semibold text-emerald-400">Total: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
      </div>
    </div>
  );
}
