"use client";

// ================================ Cobrador ================================
// Automação de cobranças (estilo Asaas), ligada a Contatos e Mensagens/WhatsApp.
// A empresa cria uma COBRANÇA (valor, recorrência, mensagem programada, Pix ou
// Mercado Pago) e adiciona clientes. O serviço de WhatsApp envia sozinho (com
// lembrete X dias antes), o cliente paga por Pix e manda o comprovante — o bot
// salva o comprovante e concilia. Não precisa de IA (mensagem programada), mas
// dá para vincular um agente ("Cobrador").

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock, DollarSign, FileImage, MessageSquare, Pencil, Plus, Send, Settings, Trash2, Users, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { BILLING_DEFAULT_TEMPLATE, BILLING_TEMPLATES, fillTemplate, nextDueDate, fmtDatePt, renderExtrato, itemsTotal, newBillingItem, withKeys, type BillingItem } from "@/lib/billing";

type Charge = { id: string; name: string; tipo: string; valor: number; recorrencia: string; dia_vencimento: number | null; antecedencia_dias: number | null; template: string | null; agent_id: string | null; number_id: string | null; status: string; itens?: BillingItem[] | null; motivo?: string | null; image_url?: string | null; followup_minutes?: number | null; followup_as_audio?: boolean | null; multa_atraso?: number | null };
type Target = { id: string; charge_id: string | null; contact_id: string | null; name: string | null; phone: string | null; tipo: string | null; valor: number; due_date: string | null; status: string; sent_at: string | null; reminder_sent_at: string | null; paid_at: string | null; comprovante_url: string | null; comprovante_data: string | null; itens?: BillingItem[] | null; motivo?: string | null; inadimplente?: boolean | null; multa?: number | null };
type Contact = { id: string; name: string | null; phone: string | null; jid: string | null };
type Agent = { id: string; name: string };
type WNumber = { id: string; label: string | null; phone_number: string | null };
type Settings = { pix_key: string; pix_name: string; agent_name: string; template: string };

const money = (n: number) => `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const STATUS: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-zinc-700/40 text-zinc-300" },
  lembrete: { label: "Lembrete enviado", cls: "bg-sky-500/15 text-sky-300" },
  enviado: { label: "Cobrança enviada", cls: "bg-amber-500/15 text-amber-300" },
  pago: { label: "Pago", cls: "bg-emerald-500/15 text-emerald-300" },
  atrasado: { label: "Atrasado", cls: "bg-red-500/15 text-red-300" },
  cancelado: { label: "Cancelado", cls: "bg-zinc-800 text-zinc-500" },
};

export default function BillingTab({ profile, onOpenMessages }: { profile: Profile | null; onOpenMessages?: (phone: string, name: string) => void }) {
  const cid = profile?.company_id ?? null;
  const [section, setSection] = useState<"cobrancas" | "situacao" | "config">("cobrancas");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<WNumber[]>([]);
  const [settings, setSettings] = useState<Settings>({ pix_key: "", pix_name: "", agent_name: "Cobrador", template: BILLING_DEFAULT_TEMPLATE });
  const [showNew, setShowNew] = useState(false);
  const [editCharge, setEditCharge] = useState<Charge | null>(null);
  const [comprovante, setComprovante] = useState<Target | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 3500); }, []);

  const load = useCallback(async () => {
    if (!supabase || !cid) return;
    const [c, t, ct, ag, nu, cs] = await Promise.all([
      supabase.from("billing_charges").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("billing_targets").select("*").eq("company_id", cid).order("due_date", { ascending: true }),
      supabase.from("contacts").select("id,name,phone,jid").eq("company_id", cid).order("name"),
      supabase.from("chatbots").select("id,name").eq("company_id", cid).neq("slot", "internal"),
      supabase.from("whatsapp_numbers").select("id,label,phone_number").eq("company_id", cid),
      supabase.from("company_settings").select("billing_pix_key,billing_pix_name,billing_agent_name,billing_default_template").eq("company_id", cid).maybeSingle(),
    ]);
    setCharges((c.data as Charge[]) ?? []);
    setTargets((t.data as Target[]) ?? []);
    setContacts((ct.data as Contact[]) ?? []);
    setAgents((ag.data as Agent[]) ?? []);
    setNumbers((nu.data as WNumber[]) ?? []);
    const d = cs.data as Record<string, string> | null;
    setSettings({
      pix_key: d?.billing_pix_key || "", pix_name: d?.billing_pix_name || "",
      agent_name: d?.billing_agent_name || "Cobrador", template: d?.billing_default_template || BILLING_DEFAULT_TEMPLATE,
    });
  }, [cid]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!supabase || !cid) return;
    const ch = supabase.channel("billing")
      .on("postgres_changes", { event: "*", schema: "public", table: "billing_targets", filter: `company_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [cid, load]);

  const pending = useMemo(() => targets.filter((t) => ["pendente", "lembrete", "enviado", "atrasado"].includes(t.status)), [targets]);
  const totalPend = pending.reduce((a, b) => a + (b.valor || 0), 0);
  const totalPago = targets.filter((t) => t.status === "pago").reduce((a, b) => a + (b.valor || 0), 0);

  // Envia a mensagem programada AGORA para um alvo (não espera o agendador).
  // Envia pelo JID/telefone REAL do contato → cai na conversa que já existe no
  // Mensagens (aparece lá) e NÃO duplica o chat.
  async function sendNow(t: Target) {
    const contact = contacts.find((c) => c.id === t.contact_id);
    const to = contact?.jid || contact?.phone || t.phone;
    if (!supabase || !to) { flash("Cliente sem telefone."); return; }
    const charge = charges.find((c) => c.id === t.charge_id);
    const itens = (t.itens && t.itens.length ? t.itens : charge?.itens) || [];
    // Com o Pix automático ligado na Carteira, esta cobrança tem um Pix PRÓPRIO.
    // Usa a mesma rota do agendador, então o cliente recebe o mesmo código aqui
    // e no envio automático — e a baixa continua sendo automática.
    let pix = settings.pix_key || "";
    try {
      const r = await fetch("/api/carteira/pix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: t.id }),
      });
      const j = await r.json();
      if (r.ok && j.pix_code) pix = j.pix_code;
    } catch { /* sem Carteira, segue com a chave fixa */ }
    const text = fillTemplate(charge?.template || settings.template, {
      nome: t.name || "", valor: t.valor, vencimento: fmtDatePt(t.due_date), pix, empresa: settings.pix_name || "",
      extrato: renderExtrato(itens, t.motivo || charge?.motivo), motivo: t.motivo || charge?.motivo || "",
    });
    await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, text, numberId: charge?.number_id || numbers[0]?.id || undefined }) });
    await supabase.from("billing_targets").update({ status: "enviado", sent_at: new Date().toISOString() }).eq("id", t.id);
    flash("Cobrança enviada no WhatsApp."); load();
  }
  async function markPaid(t: Target) { if (!supabase) return; await supabase.from("billing_targets").update({ status: "pago", paid_at: new Date().toISOString() }).eq("id", t.id); load(); }
  async function cancelT(t: Target) { if (!supabase) return; await supabase.from("billing_targets").update({ status: "cancelado" }).eq("id", t.id); load(); }
  // Exclui a cobrança inteira (a exclusão em cascata já remove os lançamentos
  // dos clientes ligados a ela, inclusive o histórico pago).
  async function deleteCharge(c: Charge) {
    if (!supabase) return;
    if (!confirm(`Excluir "${c.name}"? Remove também os lançamentos dos clientes ligados a ela (inclusive os já pagos). Não pode ser desfeito.`)) return;
    const { error } = await supabase.from("billing_charges").delete().eq("id", c.id);
    if (error) { flash("Não consegui excluir: " + error.message); return; }
    load(); flash("Cobrança excluída.");
  }

  return (
    <div className="h-full flex flex-col bg-[#0b0f16] text-gray-100 overflow-hidden">
      <div className="px-4 md:px-6 pt-4 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><DollarSign size={20} className="text-emerald-400" /> Cobrador</h2>
            <p className="text-xs text-gray-400">Cobranças automáticas por WhatsApp — Pix, Mercado Pago, lembretes e comprovantes.</p>
          </div>
          <button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"><Plus size={15} /> Criar cobrança</button>
        </div>
        <div className="flex gap-1 mt-3">
          {([["cobrancas", "Cobranças"], ["situacao", "Situação dos clientes"], ["config", "Configurações"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} className={`text-xs px-3 py-1.5 rounded-lg ${section === id ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Kpi label="A receber" value={money(totalPend)} sub={`${pending.length} cobranças`} tone="amber" />
          <Kpi label="Recebido" value={money(totalPago)} sub={`${targets.filter((t) => t.status === "pago").length} pagas`} tone="emerald" />
          <Kpi label="Cobranças ativas" value={String(charges.filter((c) => c.status === "ativa").length)} sub={`${charges.length} no total`} tone="sky" />
        </div>

        {section === "cobrancas" && (
          <div className="space-y-3">
            {charges.length === 0 && <Empty text="Nenhuma cobrança criada. Clique em “Criar cobrança”." />}
            {charges.map((c) => {
              const ct = targets.filter((t) => t.charge_id === c.id);
              const agent = agents.find((a) => a.id === c.agent_id);
              return (
                <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold flex items-center gap-2">{c.name}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.tipo === "pix" ? "bg-emerald-500/15 text-emerald-300" : c.tipo === "api" ? "bg-sky-500/15 text-sky-300" : "bg-zinc-700/40 text-zinc-300"}`}>{c.tipo === "api" ? "Mercado Pago" : c.tipo === "boleto" ? "Boleto" : "Pix"}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{money(c.valor)} · {c.recorrencia}{c.recorrencia !== "avulsa" ? ` (dia ${c.dia_vencimento})` : ""} · avisa {c.antecedencia_dias}d antes {agent ? `· agente: ${agent.name}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{ct.length} cliente(s)</span>
                      <button onClick={() => setEditCharge(c)} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 flex items-center gap-1"><Pencil size={12} /> Editar</button>
                      <button onClick={() => deleteCharge(c)} title="Excluir cobrança" className="p-1.5 rounded-lg bg-white/5 hover:bg-red-600/20 text-gray-400 hover:text-red-300"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ct.map((t) => <span key={t.id} className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS[t.status]?.cls || ""}`}>{t.name || t.phone} · {STATUS[t.status]?.label}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {section === "situacao" && (
          <div className="space-y-2">
            {targets.length === 0 && <Empty text="Nenhum cliente em cobrança ainda." />}
            {targets.map((t) => (
              <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold shrink-0">{(t.name || "?").slice(0, 1)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.name || t.phone}</div>
                  <div className="text-[11px] text-gray-400">{money(t.valor)}{Number(t.multa) > 0 ? ` (inclui multa ${money(Number(t.multa))})` : ""} · vence {fmtDatePt(t.due_date)} · {t.tipo === "api" ? "Mercado Pago" : "Pix"}</div>
                </div>
                {t.inadimplente && <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-red-500/20 text-red-300">inadimplente</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${STATUS[t.status]?.cls || ""}`}>{STATUS[t.status]?.label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {t.comprovante_url && <button onClick={() => setComprovante(t)} title="Ver comprovante" className="p-1.5 rounded-lg hover:bg-white/10 text-sky-400"><FileImage size={15} /></button>}
                  {t.status !== "pago" && t.status !== "cancelado" && <button onClick={() => sendNow(t)} title="Enviar cobrança agora" className="p-1.5 rounded-lg hover:bg-white/10 text-amber-400"><Send size={15} /></button>}
                  {t.status !== "pago" && <button onClick={() => markPaid(t)} title="Marcar como pago" className="p-1.5 rounded-lg hover:bg-white/10 text-emerald-400"><Check size={15} /></button>}
                  {onOpenMessages && t.phone && <button onClick={() => onOpenMessages(t.phone!, t.name || t.phone!)} title="Abrir no Mensagens" className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300"><MessageSquare size={15} /></button>}
                  {t.status !== "pago" && <button onClick={() => cancelT(t)} title="Cancelar" className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500"><X size={15} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {section === "config" && <ConfigSection cid={cid} settings={settings} setSettings={setSettings} numbers={numbers} flash={flash} />}
      </div>

      {showNew && <NewChargeModal cid={cid} contacts={contacts} agents={agents} numbers={numbers} settings={settings} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); flash("Cobrança criada."); }} onContactsChanged={load} />}
      {editCharge && <EditChargeModal cid={cid} charge={editCharge} targets={targets.filter((t) => t.charge_id === editCharge.id)} contacts={contacts} agents={agents} numbers={numbers} onClose={() => setEditCharge(null)} onSaved={() => { setEditCharge(null); load(); flash("Cobrança atualizada."); }} onContactsChanged={load} />}
      {comprovante && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={() => setComprovante(null)}>
          <div className="max-w-md w-full bg-[#0b0f16] border border-white/10 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-sm">Comprovante — {comprovante.name}</h3><button onClick={() => setComprovante(null)}><X size={18} /></button></div>
            {comprovante.comprovante_data && <p className="text-xs text-gray-400 mb-2">Data identificada: {fmtDatePt(comprovante.comprovante_data)}</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={comprovante.comprovante_url!} alt="comprovante" className="w-full rounded-lg" />
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 right-4 z-[100] bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm shadow-2xl">{toast}</div>}
    </div>
  );
}

// ------------------------------ Config ------------------------------
function ConfigSection({ cid, settings, setSettings, numbers, flash }: { cid: string | null; settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>>; numbers: WNumber[]; flash: (t: string) => void }) {
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase || !cid) return; setBusy(true);
    await supabase.from("company_settings").update({
      billing_pix_key: s.pix_key || null, billing_pix_name: s.pix_name || null,
      billing_agent_name: s.agent_name || "Cobrador", billing_default_template: s.template || null,
    }).eq("company_id", cid);
    setSettings(s); setBusy(false); flash("Configurações salvas.");
  }
  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Zap size={15} className="text-emerald-400" /> Pix (mensagem programada)</div>
        <p className="text-[11px] text-gray-400">Quando a cobrança é por Pix, a mensagem manda esta chave para o cliente pagar. Não precisa de IA.</p>
        <label className="block"><span className="lbl">Chave Pix</span><input className="in" value={s.pix_key} onChange={(e) => setS({ ...s, pix_key: e.target.value })} placeholder="CNPJ, e-mail, telefone ou aleatória" /></label>
        <label className="block"><span className="lbl">Nome do recebedor (opcional)</span><input className="in" value={s.pix_name} onChange={(e) => setS({ ...s, pix_name: e.target.value })} /></label>
      </div>
      {/* O token do Mercado Pago mudou de lugar: agora é a Carteira que cuida da
          conta da empresa, valida o token e mostra o que caiu. Aqui fica só o
          atalho, para ninguém procurar por ele nas duas telas. */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-2"><DollarSign size={15} className="text-sky-400" /> Mercado Pago</div>
        <p className="text-[11px] text-gray-400">
          O token da conta agora fica na <b>Carteira</b>, junto com o que entrou. Lá também se liga o
          <b> Pix automático</b>: cada cobrança sai com um Pix próprio e a baixa acontece sozinha, sem
          depender de alguém ler o comprovante que o cliente mandou.
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Users size={15} /> Agente & mensagem padrão</div>
        <label className="block"><span className="lbl">Nome do agente Cobrador</span><input className="in" value={s.agent_name} onChange={(e) => setS({ ...s, agent_name: e.target.value })} /></label>
        <label className="block"><span className="lbl">Mensagem padrão (use {"{nome} {valor} {vencimento} {pix} {empresa}"})</span>
          <textarea className="in" rows={6} value={s.template} onChange={(e) => setS({ ...s, template: e.target.value })} /></label>
      </div>
      <button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg">{busy ? "Salvando…" : "Salvar configurações"}</button>
      <style jsx>{`.in{width:100%;background:#09090b;border:1px solid #27272a;border-radius:8px;padding:8px 10px;font-size:13px;color:#fff}.in:focus{outline:none;border-color:#52525b}.lbl{font-size:11px;color:#a1a1aa;margin-bottom:4px;display:block}`}</style>
    </div>
  );
}

// ------------------------------ Nova cobrança ------------------------------
function NewChargeModal({ cid, contacts, agents, numbers, settings, onClose, onSaved, onContactsChanged }: {
  cid: string | null; contacts: Contact[]; agents: Agent[]; numbers: WNumber[]; settings: Settings;
  onClose: () => void; onSaved: () => void; onContactsChanged: () => void;
}) {
  const [f, setF] = useState({ name: "", tipo: "pix", valor: "", recorrencia: "mensal", dia_vencimento: "5", antecedencia_dias: "2", agent_id: "", number_id: numbers[0]?.id || "", followup_minutes: "0", multa_atraso: "" });
  const [template, setTemplate] = useState(settings.template || BILLING_DEFAULT_TEMPLATE);
  const [followupAudio, setFollowupAudio] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  async function uploadImage(file: File) {
    if (!supabase || !cid || !file.type.startsWith("image/")) return;
    setUploadingImg(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
      const path = `billing/${cid}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-files").upload(path, file, { contentType: file.type, upsert: true });
      if (!error) { const { data } = supabase.storage.from("company-files").getPublicUrl(path); setImageUrl(data?.publicUrl ?? null); }
    } finally { setUploadingImg(false); }
  }
  // Extrato: itens (descrição + valor) e o "porquê" da cobrança.
  const [motivo, setMotivo] = useState("");
  const [itens, setItens] = useState<BillingItem[]>([]);
  const hasItens = itens.some((i) => (i.descricao || "").trim() || Number(i.valor));
  const totalItens = itemsTotal(itens);
  const valorFinal = hasItens ? totalItens : Number(f.valor) || 0;
  const addItem = () => setItens((s) => [...s, newBillingItem()]);
  const setItem = (i: number, k: keyof BillingItem, v: string) => setItens((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const delItem = (i: number) => setItens((s) => s.filter((_, idx) => idx !== i));
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState(""); const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = contacts.filter((c) => !q || (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q));

  function toggle(id: string) { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }

  // Adiciona um cliente novo → cria também o CONTATO (integração com Contatos).
  // Normaliza o telefone e faz UPSERT (mesmo formato da aba Contatos) para REUSAR
  // um contato que já exista — nunca duplicar.
  async function addNewContact() {
    if (!supabase || !cid || !newName.trim() || !newPhone.trim()) return;
    const digits = newPhone.replace(/\D/g, "");
    const finalPhone = digits.startsWith("55") ? digits : `55${digits}`;
    const jid = `${finalPhone}@s.whatsapp.net`;
    const { data } = await supabase.from("contacts").upsert({ company_id: cid, name: newName.trim(), phone: finalPhone, jid }, { onConflict: "company_id,phone" }).select("id").maybeSingle();
    if (data?.id) { setSelected((s) => (s.includes(data.id) ? s : [...s, data.id])); setNewName(""); setNewPhone(""); onContactsChanged(); }
  }

  const previewText = fillTemplate(template, { nome: "Fulano", valor: valorFinal, vencimento: fmtDatePt(nextDueDate(Number(f.dia_vencimento) || 5)), pix: settings.pix_key || "sua-chave-pix", empresa: settings.pix_name || "", extrato: renderExtrato(itens, motivo), motivo });

  async function sendTest() {
    const num = numbers.find((n) => n.id === f.number_id);
    const to = num?.phone_number;
    if (!to) { alert("Nenhum número de WhatsApp conectado para o teste."); return; }
    await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, text: `🧪 (teste do Cobrador)\n\n${previewText}`, numberId: f.number_id, media: imageUrl ? { type: "image", url: imageUrl } : undefined }) });
    alert("Mensagem de teste enviada para o próprio número conectado.");
  }

  async function save() {
    if (!supabase || !cid || !f.name.trim() || selected.length === 0) { alert("Informe o nome e escolha ao menos um cliente."); return; }
    setBusy(true);
    const cleanItens = itens.filter((i) => (i.descricao || "").trim() || Number(i.valor)).map((i) => ({ descricao: i.descricao, valor: Number(i.valor) || 0 }));
    const { data: charge } = await supabase.from("billing_charges").insert({
      company_id: cid, name: f.name.trim(), tipo: f.tipo, valor: valorFinal, recorrencia: f.recorrencia,
      dia_vencimento: Number(f.dia_vencimento) || 5, antecedencia_dias: Number(f.antecedencia_dias) || 2,
      template, agent_id: f.agent_id || null, number_id: f.number_id || null, status: "ativa",
      itens: cleanItens, motivo: motivo || null, image_url: imageUrl || null,
      followup_minutes: Number(f.followup_minutes) || 0, followup_as_audio: followupAudio, multa_atraso: Number(f.multa_atraso) || 0,
    }).select("id").maybeSingle();
    if (charge?.id) {
      const due = nextDueDate(Number(f.dia_vencimento) || 5);
      const rows = selected.map((id) => {
        const c = contacts.find((x) => x.id === id);
        return { company_id: cid, charge_id: charge.id, contact_id: id, name: c?.name || null, phone: (c?.phone || c?.jid || "").replace(/@.*/, "") || null, tipo: f.tipo, valor: valorFinal, due_date: due, status: "pendente", itens: cleanItens, motivo: motivo || null, image_url: imageUrl || null };
      });
      await supabase.from("billing_targets").insert(rows);
    }
    setBusy(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0b0f16] border border-white/10 rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold">Nova cobrança</h3><button onClick={onClose}><X size={18} /></button></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block"><span className="lbl">Nome da cobrança</span><input className="in" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Mensalidade Plano Ouro" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="lbl">Forma</span><select className="in" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="pix">Pix (mensagem)</option><option value="api">Mercado Pago (API)</option><option value="boleto" disabled>Boleto (em breve)</option></select></label>
              <label className="block"><span className="lbl">{hasItens ? "Total (do extrato)" : "Valor (R$)"}</span><input className="in" type="number" value={hasItens ? String(totalItens) : f.valor} onChange={(e) => set("valor", e.target.value)} disabled={hasItens} /></label>
            </div>
            <label className="block"><span className="lbl">Motivo / referência (opcional)</span><input className="in" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Mensalidade + taxa de matrícula" /></label>
            {/* Extrato: itens que compõem o valor. Se houver itens, o total é a soma. */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1.5"><span className="lbl" style={{ margin: 0 }}>Extrato (o que está incluso)</span><button type="button" onClick={addItem} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15 flex items-center gap-1"><Plus size={12} /> item</button></div>
              {itens.length === 0 && <p className="text-[11px] text-gray-500">Sem itens — cobra o valor único acima. Adicione itens para mostrar um extrato com total.</p>}
              <div className="space-y-1.5">
                {itens.map((it, i) => (
                  <div key={it._key ?? i} className="flex gap-1.5">
                    <input className="in min-w-0" placeholder="Descrição" value={String(it.descricao)} onChange={(e) => setItem(i, "descricao", e.target.value)} />
                    <input className="in shrink-0" style={{ width: 90 }} type="number" placeholder="R$" value={String(it.valor)} onChange={(e) => setItem(i, "valor", e.target.value)} />
                    <button type="button" onClick={() => delItem(i)} className="px-2 rounded bg-white/5 hover:bg-white/10 text-gray-400 cursor-pointer shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
              {hasItens && <div className="text-right text-xs mt-1.5 font-semibold text-emerald-400">Total: R$ {totalItens.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block"><span className="lbl">Recorrência</span><select className="in" value={f.recorrencia} onChange={(e) => set("recorrencia", e.target.value)}><option value="mensal">Mensal</option><option value="semanal">Semanal</option><option value="avulsa">Avulsa</option></select></label>
              <label className="block"><span className="lbl">Dia venc.</span><input className="in" type="number" min={1} max={28} value={f.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} /></label>
              <label className="block"><span className="lbl">Avisar (dias antes)</span><input className="in" type="number" value={f.antecedencia_dias} onChange={(e) => set("antecedencia_dias", e.target.value)} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="lbl">Agente (opcional)</span><select className="in" value={f.agent_id} onChange={(e) => set("agent_id", e.target.value)}><option value="">Sem IA (mensagem programada)</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label className="block"><span className="lbl">Número de envio</span><select className="in" value={f.number_id} onChange={(e) => set("number_id", e.target.value)}>{numbers.map((n) => <option key={n.id} value={n.id}>{n.label || n.phone_number || "WhatsApp"}</option>)}</select></label>
            </div>
            <label className="block"><span className="lbl">Modelito de mensagem</span>
              <select className="in" onChange={(e) => { const m = BILLING_TEMPLATES.find((x) => x.id === e.target.value); if (m) setTemplate(m.template); }} defaultValue="">
                <option value="" disabled>Escolher um modelo…</option>
                {BILLING_TEMPLATES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="lbl">Mensagem programada (edite à vontade)</span><textarea className="in" rows={6} value={template} onChange={(e) => setTemplate(e.target.value)} /></label>
            {/* Imagem opcional que o bot envia (em vez do texto ou junto com ele). */}
            <div className="flex items-center gap-2">
              <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer ${uploadingImg ? "bg-white/5 text-gray-500" : "bg-white/10 hover:bg-white/15"}`}>
                {uploadingImg ? "Enviando…" : imageUrl ? "Trocar imagem" : "Anexar imagem"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const fi = e.target.files?.[0]; if (fi) uploadImage(fi); e.currentTarget.value = ""; }} />
              </label>
              {imageUrl && <><span className="text-[11px] text-emerald-400">imagem anexada</span><button onClick={() => setImageUrl(null)} className="text-[11px] text-gray-500 hover:text-red-400">remover</button></>}
              <button onClick={sendTest} className="ml-auto text-xs px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 flex items-center gap-1"><Send size={13} /> Enviar teste</button>
            </div>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="cobrança" className="max-h-32 rounded-lg border border-white/10" />
            )}
            {/* Follow-up automático + multa por inadimplência. */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 space-y-2">
              <div className="text-[11px] text-gray-400 font-semibold">Se o cliente não responder</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="lbl">Reforçar após (min, 0 = não)</span><input className="in" type="number" value={f.followup_minutes} onChange={(e) => set("followup_minutes", e.target.value)} /></label>
                <label className="block"><span className="lbl">Multa se ficar inadimplente (R$)</span><input className="in" type="number" value={f.multa_atraso} onChange={(e) => set("multa_atraso", e.target.value)} /></label>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={followupAudio} onChange={(e) => setFollowupAudio(e.target.checked)} /> Mandar o reforço por áudio (precisa de agente com voz)</label>
              <p className="text-[10px] text-gray-500">O reforço é 1x por dia. Persistindo o silêncio, o bot para de insistir, marca como inadimplente e soma a multa na próxima cobrança. Ao pagar a inadimplência (comprovante), volta a “em dia” e não cobra a mais.</p>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-2.5 text-[12px] text-gray-300 whitespace-pre-wrap">{previewText}</div>
          </div>

          <div className="space-y-2">
            <span className="lbl">Clientes nesta cobrança ({selected.length})</span>
            <input className="in" placeholder="Buscar contato…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="border border-white/10 rounded-lg max-h-48 overflow-y-auto divide-y divide-white/5">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => toggle(c.id)} className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm ${selected.includes(c.id) ? "bg-emerald-950/30" : "hover:bg-white/5"}`}>
                  <span>{c.name || c.phone}</span>
                  {selected.includes(c.id) && <Check size={15} className="text-emerald-400" />}
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-4 text-xs text-gray-500 text-center">Nenhum contato.</div>}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5">
              <div className="text-[11px] text-gray-400 mb-1.5">Adicionar cliente novo (entra também em Contatos)</div>
              <div className="flex gap-2">
                <input className="in" placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className="in" placeholder="Telefone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <button onClick={addNewContact} className="px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm shrink-0">+</button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10">Cancelar</button>
          <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">{busy ? "Criando…" : "Criar cobrança"}</button>
        </div>
        <style jsx>{`.in{width:100%;background:#09090b;border:1px solid #27272a;border-radius:8px;padding:8px 10px;font-size:13px;color:#fff}.in:focus{outline:none;border-color:#52525b}.lbl{font-size:11px;color:#a1a1aa;margin-bottom:4px;display:block}`}</style>
      </div>
    </div>
  );
}

// ------------------------------ Editar cobrança ------------------------------
function EditChargeModal({ cid, charge, targets, contacts, agents, numbers, onClose, onSaved, onContactsChanged }: {
  cid: string | null; charge: Charge; targets: Target[]; contacts: Contact[]; agents: Agent[]; numbers: WNumber[];
  onClose: () => void; onSaved: () => void; onContactsChanged: () => void;
}) {
  const [f, setF] = useState({
    name: charge.name, tipo: charge.tipo, valor: String(charge.valor || ""), recorrencia: charge.recorrencia,
    dia_vencimento: String(charge.dia_vencimento ?? 5), antecedencia_dias: String(charge.antecedencia_dias ?? 2),
    agent_id: charge.agent_id || "", number_id: charge.number_id || "",
    followup_minutes: String(charge.followup_minutes ?? 0),
    multa_atraso: String(charge.multa_atraso ?? ""),
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const [template, setTemplate] = useState(charge.template || BILLING_DEFAULT_TEMPLATE);
  const [motivo, setMotivo] = useState(charge.motivo || "");
  const [itens, setItens] = useState<BillingItem[]>(() => withKeys((charge.itens as BillingItem[]) || []));
  const [imageUrl, setImageUrl] = useState<string | null>(charge.image_url ?? null);
  const [followupAudio, setFollowupAudio] = useState(!!charge.followup_as_audio);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState(""); const [newPhone, setNewPhone] = useState("");
  const hasItens = itens.some((i) => (i.descricao || "").trim() || Number(i.valor));
  const valorFinal = hasItens ? itemsTotal(itens) : Number(f.valor) || 0;

  async function uploadImage(file: File) {
    if (!supabase || !cid || !file.type.startsWith("image/")) return;
    setUploadingImg(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
      const path = `billing/${cid}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-files").upload(path, file, { contentType: file.type, upsert: true });
      if (!error) { const { data } = supabase.storage.from("company-files").getPublicUrl(path); setImageUrl(data?.publicUrl ?? null); }
    } finally { setUploadingImg(false); }
  }

  const inCharge = new Set(targets.map((t) => t.contact_id));
  const available = contacts.filter((c) => !inCharge.has(c.id) && (!q || (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)));
  const cleanItens = () => itens.filter((i) => (i.descricao || "").trim() || Number(i.valor)).map((i) => ({ descricao: i.descricao, valor: Number(i.valor) || 0 }));

  // Adiciona um cliente à cobrança (cria o alvo pendente com os valores atuais).
  async function addTarget(contactId: string, name: string | null, phone: string | null) {
    if (!supabase || !cid) return;
    await supabase.from("billing_targets").insert({
      company_id: cid, charge_id: charge.id, contact_id: contactId, name, phone: (phone || "").replace(/\D|@.*/g, "") || null,
      tipo: f.tipo, valor: valorFinal, due_date: nextDueDate(Number(f.dia_vencimento) || 5), status: "pendente", itens: cleanItens(), motivo: motivo || null, image_url: imageUrl || null,
    });
    onContactsChanged();
  }
  async function addNewContact() {
    if (!supabase || !cid || !newName.trim() || !newPhone.trim()) return;
    const digits = newPhone.replace(/\D/g, "");
    const finalPhone = digits.startsWith("55") ? digits : `55${digits}`;
    const jid = `${finalPhone}@s.whatsapp.net`;
    const { data } = await supabase.from("contacts").upsert({ company_id: cid, name: newName.trim(), phone: finalPhone, jid }, { onConflict: "company_id,phone" }).select("id").maybeSingle();
    if (data?.id) { await addTarget(data.id, newName.trim(), finalPhone); setNewName(""); setNewPhone(""); }
  }
  async function removeTarget(t: Target) {
    if (!supabase) return;
    // Não enviado ainda → remove; já enviado → cancela (mantém histórico).
    if (t.status === "pendente") await supabase.from("billing_targets").delete().eq("id", t.id);
    else await supabase.from("billing_targets").update({ status: "cancelado" }).eq("id", t.id);
    onContactsChanged();
  }

  async function save() {
    if (!supabase || !cid) return;
    setBusy(true);
    try {
      const ci = cleanItens();
      await supabase.from("billing_charges").update({
        name: f.name.trim(), tipo: f.tipo, valor: valorFinal, recorrencia: f.recorrencia,
        dia_vencimento: Number(f.dia_vencimento) || 5, antecedencia_dias: Number(f.antecedencia_dias) || 2,
        template, agent_id: f.agent_id || null, number_id: f.number_id || null, motivo: motivo || null, itens: ci,
        image_url: imageUrl || null, followup_minutes: Number(f.followup_minutes) || 0, followup_as_audio: followupAudio, multa_atraso: Number(f.multa_atraso) || 0,
      }).eq("id", charge.id);
      // Sincroniza os alvos ainda EM ABERTO (não pagos/cancelados) com os novos dados.
      const openIds = targets.filter((t) => t.status !== "pago" && t.status !== "cancelado").map((t) => t.id);
      if (openIds.length) {
        await supabase.from("billing_targets").update({ valor: valorFinal, itens: ci, motivo: motivo || null, image_url: imageUrl || null, tipo: f.tipo }).in("id", openIds);
        // due_date só nos que ainda não foram enviados (pendente).
        const pendIds = targets.filter((t) => t.status === "pendente").map((t) => t.id);
        if (pendIds.length) await supabase.from("billing_targets").update({ due_date: nextDueDate(Number(f.dia_vencimento) || 5) }).in("id", pendIds);
      }
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0b0f16] border border-white/10 rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold flex items-center gap-2"><Pencil size={16} /> Editar cobrança</h3><button onClick={onClose}><X size={18} /></button></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block"><span className="lbl">Nome da cobrança</span><input className="in" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="lbl">Forma</span><select className="in" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="pix">Pix (mensagem)</option><option value="api">Mercado Pago (API)</option><option value="boleto" disabled>Boleto (em breve)</option></select></label>
              <label className="block"><span className="lbl">{hasItens ? "Total (do extrato)" : "Valor (R$)"}</span><input className="in" type="number" value={hasItens ? String(itemsTotal(itens)) : f.valor} onChange={(e) => set("valor", e.target.value)} disabled={hasItens} /></label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block"><span className="lbl">Recorrência</span><select className="in" value={f.recorrencia} onChange={(e) => set("recorrencia", e.target.value)}><option value="mensal">Mensal</option><option value="semanal">Semanal</option><option value="avulsa">Avulsa</option></select></label>
              <label className="block"><span className="lbl">Dia venc.</span><input className="in" type="number" min={1} max={28} value={f.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} /></label>
              <label className="block"><span className="lbl">Avisar (dias)</span><input className="in" type="number" value={f.antecedencia_dias} onChange={(e) => set("antecedencia_dias", e.target.value)} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="lbl">Agente (opcional)</span><select className="in" value={f.agent_id} onChange={(e) => set("agent_id", e.target.value)}><option value="">Sem IA</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label className="block"><span className="lbl">Número de envio</span><select className="in" value={f.number_id} onChange={(e) => set("number_id", e.target.value)}><option value="">—</option>{numbers.map((n) => <option key={n.id} value={n.id}>{n.label || n.phone_number || "WhatsApp"}</option>)}</select></label>
            </div>
            <label className="block"><span className="lbl">Motivo (opcional)</span><input className="in" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
            <BillingItemsEditorInline itens={itens} setItens={setItens} />
            <label className="block"><span className="lbl">Mensagem programada</span><textarea className="in" rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} /></label>
            <div className="flex items-center gap-2">
              <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer ${uploadingImg ? "bg-white/5 text-gray-500" : "bg-white/10 hover:bg-white/15"}`}>{uploadingImg ? "Enviando…" : imageUrl ? "Trocar imagem" : "Anexar imagem"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const fi = e.target.files?.[0]; if (fi) uploadImage(fi); e.currentTarget.value = ""; }} /></label>
              {imageUrl && <><span className="text-[11px] text-emerald-400">imagem</span><button onClick={() => setImageUrl(null)} className="text-[11px] text-gray-500 hover:text-red-400">remover</button></>}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 space-y-2">
              <div className="text-[11px] text-gray-400 font-semibold">Se o cliente não responder</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="lbl">Reforçar após (min)</span><input className="in" type="number" value={f.followup_minutes} onChange={(e) => set("followup_minutes", e.target.value)} /></label>
                <label className="block"><span className="lbl">Multa inadimplente (R$)</span><input className="in" type="number" value={f.multa_atraso} onChange={(e) => set("multa_atraso", e.target.value)} /></label>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={followupAudio} onChange={(e) => setFollowupAudio(e.target.checked)} /> Reforço por áudio</label>
            </div>
          </div>

          <div className="space-y-2">
            <span className="lbl">Clientes nesta cobrança ({targets.length})</span>
            <div className="border border-white/10 rounded-lg divide-y divide-white/5 max-h-40 overflow-y-auto">
              {targets.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="truncate">{t.name || t.phone} <span className={`text-[9px] px-1 rounded ${STATUS[t.status]?.cls || ""}`}>{STATUS[t.status]?.label}</span></span>
                  <button onClick={() => removeTarget(t)} className="text-gray-500 hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
              {targets.length === 0 && <div className="px-3 py-3 text-xs text-gray-500 text-center">Nenhum cliente.</div>}
            </div>
            <span className="lbl">Adicionar cliente</span>
            <input className="in" placeholder="Buscar contato…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="border border-white/10 rounded-lg max-h-32 overflow-y-auto divide-y divide-white/5">
              {available.map((c) => (
                <button key={c.id} onClick={() => addTarget(c.id, c.name, c.phone)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"><span>{c.name || c.phone}</span><Plus size={14} className="text-emerald-400" /></button>
              ))}
              {available.length === 0 && <div className="px-3 py-3 text-xs text-gray-500 text-center">Nenhum contato disponível.</div>}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2.5">
              <div className="text-[11px] text-gray-400 mb-1.5">Ou adicionar cliente novo</div>
              <div className="flex gap-2">
                <input className="in" placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className="in" placeholder="Telefone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <button onClick={addNewContact} className="px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm shrink-0">+</button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10">Cancelar</button>
          <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">{busy ? "Salvando…" : "Salvar alterações"}</button>
        </div>
        <style jsx>{`.in{width:100%;background:#09090b;border:1px solid #27272a;border-radius:8px;padding:8px 10px;font-size:13px;color:#fff}.in:focus{outline:none;border-color:#52525b}.lbl{font-size:11px;color:#a1a1aa;margin-bottom:4px;display:block}`}</style>
      </div>
    </div>
  );
}

// Editor de itens simples (sem motivo, que já tem campo próprio no editar).
function BillingItemsEditorInline({ itens, setItens }: { itens: BillingItem[]; setItens: (v: BillingItem[]) => void }) {
  const total = itemsTotal(itens);
  const has = itens.some((i) => (i.descricao || "").trim() || Number(i.valor));
  const setItem = (i: number, k: keyof BillingItem, v: string) => setItens(itens.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const removeItem = (i: number) => setItens(itens.filter((_, idx) => idx !== i));
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] text-gray-400">Extrato (itens)</span><button type="button" onClick={() => setItens([...itens, newBillingItem()])} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/15 flex items-center gap-1"><Plus size={12} /> item</button></div>
      <div className="space-y-1.5">
        {itens.map((it, i) => (
          <div key={it._key ?? i} className="flex gap-1.5">
            <input className="flex-1 min-w-0 bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" placeholder="Descrição" value={String(it.descricao)} onChange={(e) => setItem(i, "descricao", e.target.value)} />
            <input className="w-20 shrink-0 bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" type="number" placeholder="R$" value={String(it.valor)} onChange={(e) => setItem(i, "valor", e.target.value)} />
            <button type="button" onClick={() => removeItem(i)} className="px-2 rounded bg-white/5 hover:bg-white/10 text-gray-400 cursor-pointer shrink-0"><X size={14} /></button>
          </div>
        ))}
      </div>
      {has && <div className="text-right text-xs mt-1.5 font-semibold text-emerald-400">Total: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
    </div>
  );
}

// ------------------------------ UI bits ------------------------------
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const c = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-sky-400";
  return <div className="bg-white/5 border border-white/10 rounded-xl p-3"><div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div><div className={`text-xl font-bold mt-0.5 ${c}`}>{value}</div><div className="text-[11px] text-gray-500">{sub}</div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-white/10 rounded-xl flex flex-col items-center gap-2"><AlertCircle size={20} className="text-gray-600" />{text}</div>;
}
