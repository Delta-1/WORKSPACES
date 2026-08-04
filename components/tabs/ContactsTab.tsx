"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Search, Plus, MessageSquare, Trash2, Phone, X, UserPlus, DollarSign, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { applyMask } from "@/lib/mask";
import { nextDueDate, itemsTotal, type BillingItem } from "@/lib/billing";
import BillingItemsEditor from "@/components/BillingItemsEditor";
import BillingExtraFields from "@/components/BillingExtraFields";

type Contact = { id: string; phone: string; name: string | null; avatar_url: string | null; jid: string | null; company_id: string | null };

function fmtPhone(p: string) {
  return applyMask("phone", (p || "").startsWith("55") ? p.slice(2) : p);
}

export default function ContactsTab({ profile, onOpenMessages }: { profile: Profile | null; onOpenMessages?: (phone: string, name: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState<Contact | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const companyId = profile?.company_id ?? null;

  const load = useCallback(async () => {
    if (!supabase || !companyId) { setLoading(false); return; }
    const { data } = await supabase.from("contacts").select("id, phone, name, avatar_url, jid, company_id").eq("company_id", companyId).order("name", { nullsFirst: false });
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
    if (!supabase) return;
    const ch = supabase.channel("contacts-tab").on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => load()).subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [load]);

  async function addContact() {
    const digits = phone.replace(/\D/g, "");
    if (!supabase || !companyId || digits.length < 8 || saving) return;
    setSaving(true);
    try {
      const jid = `${digits.startsWith("55") ? digits : `55${digits}`}@s.whatsapp.net`;
      const finalPhone = digits.startsWith("55") ? digits : `55${digits}`;
      const { error } = await supabase.from("contacts").upsert(
        { company_id: companyId, phone: finalPhone, name: name.trim() || null, jid },
        { onConflict: "company_id,phone" }
      );
      if (error) { alert("Erro ao salvar: " + error.message); return; }
      setName(""); setPhone(""); setAdding(false);
      await load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!supabase || !confirm("Remover este contato?")) return;
    await supabase.from("contacts").delete().eq("id", id);
    load();
  }

  // Conta o que a limpeza levaria junto ANTES de perguntar. Apagar um contato
  // apaga em cascata a conversa dele, as mensagens, o saldo e as etiquetas — a
  // pessoa precisa ver esse número antes de decidir, não depois.
  const [limpando, setLimpando] = useState<null | {
    total: number; semConversa: number; comConversa: number; comSaldo: number;
  }>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagando, setApagando] = useState(false);

  async function abrirLimpeza() {
    if (!supabase || !companyId) return;
    const [convs, saldos] = await Promise.all([
      supabase.from("conversations").select("contact_id").eq("company_id", companyId),
      supabase.from("contact_credits").select("contact_id, balance_cents").eq("company_id", companyId).gt("balance_cents", 0),
    ]);
    const comConversa = new Set((convs.data ?? []).map((c) => c.contact_id as string));
    setConfirmacao("");
    setLimpando({
      total: contacts.length,
      semConversa: contacts.filter((c) => !comConversa.has(c.id)).length,
      comConversa: contacts.filter((c) => comConversa.has(c.id)).length,
      comSaldo: (saldos.data ?? []).length,
    });
  }

  async function limpar(modo: "sem-conversa" | "tudo") {
    if (!supabase || !companyId || apagando) return;
    setApagando(true);
    try {
      if (modo === "tudo") {
        await supabase.from("contacts").delete().eq("company_id", companyId);
      } else {
        const { data: convs } = await supabase.from("conversations").select("contact_id").eq("company_id", companyId);
        const comConversa = new Set((convs ?? []).map((c) => c.contact_id as string));
        const alvos = contacts.filter((c) => !comConversa.has(c.id)).map((c) => c.id);
        // Em blocos: uma lista de milhares de ids não cabe numa URL só.
        for (let i = 0; i < alvos.length; i += 200) {
          await supabase.from("contacts").delete().in("id", alvos.slice(i, i + 200));
        }
      }
      setLimpando(null);
      await load();
    } finally { setApagando(false); }
  }

  const filtered = contacts.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
  });

  function displayPhone(p: string) {
    return applyMask("phone", p.startsWith("55") ? p.slice(2) : p);
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><Users className="text-emerald-400" size={20} /> Contatos <span className="text-xs font-normal text-gray-500">({contacts.length})</span></h3>
        <div className="flex items-center gap-2">
          {profile?.role === "gestor" && contacts.length > 0 && (
            <button onClick={abrirLimpeza} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><Trash2 size={14} /> Limpar lista</button>
          )}
          <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"><UserPlus size={14} /> Novo contato</button>
        </div>
      </div>

      {limpando && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={() => setLimpando(null)}>
          <div className="w-full max-w-md bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-bold">Limpar lista de contatos</h3>
              <p className="text-[12px] text-gray-400 mt-1">
                São <b>{limpando.total}</b> contatos: {limpando.semConversa} nunca trocaram mensagem e {limpando.comConversa} têm conversa.
              </p>
            </div>

            <button
              onClick={() => limpar("sem-conversa")}
              disabled={apagando || limpando.semConversa === 0}
              className="w-full text-left rounded-xl border border-emerald-700/50 bg-emerald-950/25 p-3 cursor-pointer hover:bg-emerald-950/40 disabled:opacity-40"
            >
              <p className="text-sm font-semibold">Só os {limpando.semConversa} sem conversa</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Tira o entulho que veio da agenda do WhatsApp. Nenhuma conversa, mensagem ou saldo é perdido.
              </p>
            </button>

            <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-200">Apagar os {limpando.total}</p>
              <p className="text-[11px] text-red-100/80 leading-snug">
                Junto vão <b>{limpando.comConversa} conversas com todo o histórico de mensagens</b>
                {limpando.comSaldo > 0 && <> e o <b>saldo de {limpando.comSaldo} {limpando.comSaldo === 1 ? "cliente" : "clientes"}</b></>}.
                Isso não tem volta.
              </p>
              <input
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder="digite APAGAR TUDO"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none focus:border-red-500"
              />
              <button
                onClick={() => limpar("tudo")}
                disabled={apagando || confirmacao.trim().toUpperCase() !== "APAGAR TUDO"}
                className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {apagando ? "Apagando…" : "Apagar tudo"}
              </button>
            </div>

            <button onClick={() => setLimpando(null)} className="w-full text-xs py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-300 flex-1 min-w-[140px]">Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do contato" className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </label>
          <label className="text-xs text-gray-300 flex-1 min-w-[140px]">Telefone / WhatsApp
            <input value={phone} onChange={(e) => setPhone(applyMask("phone", e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </label>
          <button onClick={addContact} disabled={saving || phone.replace(/\D/g, "").length < 8} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
          <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-white px-2 py-2 cursor-pointer"><X size={16} /></button>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou telefone…" className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-500" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll">
        {loading ? <p className="text-sm text-gray-500 p-2">Carregando…</p> : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 p-4 text-center">{contacts.length === 0 ? "Nenhum contato ainda. Adicione um novo ou conecte o WhatsApp (a agenda entra sozinha)." : "Nenhum contato encontrado."}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:border-emerald-500/40 p-3 transition">
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-900/60 flex items-center justify-center text-sm font-bold shrink-0">{(c.name || "?").charAt(0).toUpperCase()}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name || displayPhone(c.phone)}</p>
                  <p className="text-[11px] text-gray-500 truncate flex items-center gap-1"><Phone size={10} /> {displayPhone(c.phone)}</p>
                </div>
                <button onClick={() => setEditing(c)} title="Editar dados" className="p-2 rounded-lg text-sky-300 hover:bg-sky-600/20 cursor-pointer shrink-0"><Pencil size={15} /></button>
                <button onClick={() => setCharging(c)} title="Criar cobrança" className="p-2 rounded-lg text-emerald-300 hover:bg-emerald-600/20 cursor-pointer shrink-0"><DollarSign size={16} /></button>
                {onOpenMessages && (
                  <button onClick={() => onOpenMessages(c.phone, c.name || displayPhone(c.phone))} title="Enviar mensagem" className="p-2 rounded-lg text-green-300 hover:bg-green-600/20 cursor-pointer shrink-0"><MessageSquare size={16} /></button>
                )}
                <button onClick={() => remove(c.id)} title="Remover" className="p-2 rounded-lg text-gray-500 hover:text-red-400 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {charging && <QuickChargeModal companyId={companyId} contact={charging} onClose={() => setCharging(null)} />}
      {editing && <EditContactModal contact={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// Editar os dados de um contato/cliente (nome e telefone). Reflete em todo o
// sistema (Mensagens, Cobrador, etc.), pois o contato é o mesmo em todo lugar.
function EditContactModal({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(contact.name || "");
  const [phone, setPhone] = useState(applyMask("phone", (contact.phone || "").startsWith("55") ? contact.phone.slice(2) : contact.phone));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!supabase) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) { setErr("Telefone inválido."); return; }
    setBusy(true); setErr(null);
    try {
      const finalPhone = digits.startsWith("55") ? digits : `55${digits}`;
      const patch: Record<string, string | null> = { name: name.trim() || null };
      // Só mexe no telefone/jid se realmente mudou (evita conflito de unicidade à toa).
      if (finalPhone !== contact.phone) { patch.phone = finalPhone; patch.jid = `${finalPhone}@s.whatsapp.net`; }
      const { error } = await supabase.from("contacts").update(patch).eq("id", contact.id);
      if (error) { setErr(error.message.includes("duplicate") ? "Já existe um contato com esse telefone." : error.message); return; }
      onSaved();
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm flex items-center gap-2"><Pencil size={15} className="text-sky-300" /> Editar contato</h3><button onClick={onClose}><X size={18} /></button></div>
        <div className="space-y-3">
          <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Nome</span><input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Telefone / WhatsApp</span><input value={phone} onChange={(e) => setPhone(applyMask("phone", e.target.value))} inputMode="tel" className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm" /></label>
          {err && <p className="text-[11px] text-red-400">{err}</p>}
          <button onClick={save} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// Cobrança rápida para um contato (cria uma cobrança avulsa + o alvo). Integra
// com o app Cobrador. O envio automático fica a cargo do agendador do Cobrador.
function QuickChargeModal({ companyId, contact, onClose }: { companyId: string | null; contact: Contact; onClose: () => void }) {
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState(String(new Date().getDate()));
  const [tipo, setTipo] = useState("pix");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [itens, setItens] = useState<BillingItem[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [followupMin, setFollowupMin] = useState("0");
  const [followupAudio, setFollowupAudio] = useState(false);
  const [multaStr, setMultaStr] = useState("");
  const hasItens = itens.some((i) => (i.descricao || "").trim() || Number(i.valor));
  const valorFinal = hasItens ? itemsTotal(itens) : Number(valor) || 0;
  async function save() {
    if (!supabase || !companyId || !valorFinal) return;
    setBusy(true);
    try {
      const cleanItens = itens.filter((i) => (i.descricao || "").trim() || Number(i.valor)).map((i) => ({ descricao: i.descricao, valor: Number(i.valor) || 0 }));
      const { data: charge } = await supabase.from("billing_charges").insert({
        company_id: companyId, name: `Cobrança — ${contact.name || fmtPhone(contact.phone)}`, tipo, valor: valorFinal,
        recorrencia: "avulsa", dia_vencimento: Number(dia) || 5, antecedencia_dias: 2, status: "ativa", itens: cleanItens, motivo: motivo || null,
        image_url: imageUrl || null, followup_minutes: Number(followupMin) || 0, followup_as_audio: followupAudio, multa_atraso: Number(multaStr) || 0,
      }).select("id").maybeSingle();
      if (charge?.id) {
        await supabase.from("billing_targets").insert({
          company_id: companyId, charge_id: charge.id, contact_id: contact.id, name: contact.name || null,
          phone: (contact.phone || "").replace(/\D/g, "") || null, tipo, valor: valorFinal, due_date: nextDueDate(Number(dia) || 5), status: "pendente", itens: cleanItens, motivo: motivo || null, image_url: imageUrl || null,
        });
      }
      setDone(true); setTimeout(onClose, 1200);
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm flex items-center gap-2"><DollarSign size={16} className="text-emerald-400" /> Cobrar {contact.name || fmtPhone(contact.phone)}</h3><button onClick={onClose}><X size={18} /></button></div>
        {done ? <p className="text-sm text-emerald-400 py-4 text-center">Cobrança criada! ✅</p> : (
          <div className="space-y-3">
            <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">{hasItens ? "Total (do extrato)" : "Valor (R$)"}</span><input type="number" value={hasItens ? String(itemsTotal(itens)) : valor} onChange={(e) => setValor(e.target.value)} disabled={hasItens} className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-60" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Dia do vencimento</span><input type="number" min={1} max={28} value={dia} onChange={(e) => setDia(e.target.value)} className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Forma</span><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-sm"><option value="pix">Pix</option><option value="api">Mercado Pago</option></select></label>
            </div>
            <BillingItemsEditor itens={itens} setItens={setItens} motivo={motivo} setMotivo={setMotivo} />
            <BillingExtraFields companyId={companyId} imageUrl={imageUrl} setImageUrl={setImageUrl} followupMin={followupMin} setFollowupMin={setFollowupMin} followupAudio={followupAudio} setFollowupAudio={setFollowupAudio} multa={multaStr} setMulta={setMultaStr} />
            <p className="text-[11px] text-gray-500">O Cobrador envia a mensagem automaticamente no vencimento (e o lembrete antes). Configure a chave Pix no app Cobrador.</p>
            <button onClick={save} disabled={busy || !valorFinal} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">{busy ? "Criando…" : "Criar cobrança"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
