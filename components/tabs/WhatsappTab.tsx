"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Power, QrCode, RefreshCcw, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Chatbot, Profile, Sector, WhatsappNumber, WhatsappNumberAccess } from "@/lib/types";

type LiveState = {
  status: "disconnected" | "connecting" | "qr_pending" | "connected";
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

const BADGE: Record<string, { label: string; cls: string }> = {
  disconnected: { label: "Desconectado", cls: "border-gray-700 text-gray-400 bg-gray-900/40" },
  connecting: { label: "Conectando...", cls: "border-amber-700 text-amber-400 bg-amber-950/40" },
  qr_pending: { label: "Aguardando QR", cls: "border-amber-700 text-amber-400 bg-amber-950/40" },
  connected: { label: "Conectado", cls: "border-emerald-700 text-emerald-400 bg-emerald-950/40" },
};

export default function WhatsappTab({ profile }: { profile: Profile | null }) {
  const isGestor = profile?.role === "gestor";
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [access, setAccess] = useState<WhatsappNumberAccess[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [connectingLong, setConnectingLong] = useState(false);
  const [numberLimit, setNumberLimit] = useState<number>(3); // números de WhatsApp do plano
  const [showUpgrade, setShowUpgrade] = useState(false); // aviso "atualize o plano p/ mais números"
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    const [n, s, c, p, a, cs] = await Promise.all([
      supabase.from("whatsapp_numbers").select("*").order("created_at"),
      supabase.from("sectors").select("*").order("name"),
      supabase.from("chatbots").select("*").order("created_at"),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("whatsapp_number_access").select("*"),
      supabase.from("company_settings").select("wa_number_limit").maybeSingle(),
    ]);
    if (n.data) setNumbers(n.data as WhatsappNumber[]);
    if (s.data) setSectors(s.data as Sector[]);
    if (c.data) setChatbots(c.data as Chatbot[]);
    if (p.data) setColleagues(p.data as Profile[]);
    if (a.data) setAccess(a.data as WhatsappNumberAccess[]);
    if (cs.data?.wa_number_limit != null) setNumberLimit(cs.data.wa_number_limit as number);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selected = numbers.find((n) => n.id === selectedId) ?? null;

  const refreshLive = useCallback(async (numberId: string) => {
    const res = await fetch(`/api/whatsapp/status?numberId=${encodeURIComponent(numberId)}`, { cache: "no-store" });
    const data = await res.json();
    setLive(data);
    if (data.status !== "connecting") setConnectingLong(false);
  }, []);

  // Poll the live connection state of the selected number.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setLive(null);
    if (!selectedId) return;
    refreshLive(selectedId);
    pollRef.current = setInterval(() => refreshLive(selectedId), 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, refreshLive]);

  async function addNumber() {
    if (!supabase || !newLabel.trim()) return;
    // Trava por plano: R$10 por número registrado. Ao bater o limite, o gestor
    // precisa atualizar o plano (aba Planos) para registrar mais números.
    if (numbers.length >= numberLimit) {
      setShowUpgrade(true);
      return;
    }
    const { data } = await supabase.from("whatsapp_numbers").insert({ label: newLabel.trim() }).select("*").single();
    setNewLabel("");
    await loadAll();
    if (data) setSelectedId(data.id as string);
  }

  async function removeNumber(id: string) {
    if (!supabase) return;
    if (!confirm("Remover este número? As conversas ficam no histórico.")) return;
    await fetch("/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numberId: id }),
    }).catch(() => {});
    await supabase.from("whatsapp_numbers").delete().eq("id", id);
    if (selectedId === id) setSelectedId(null);
    loadAll();
  }

  async function connect() {
    if (!selectedId) return;
    setConnectingLong(false);
    await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numberId: selectedId }),
    });
    refreshLive(selectedId);
    setTimeout(() => setConnectingLong(true), 15000);
  }

  async function disconnect() {
    if (!selectedId) return;
    await fetch("/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numberId: selectedId }),
    });
    refreshLive(selectedId);
    loadAll();
  }

  async function updateNumber(update: Partial<WhatsappNumber>) {
    if (!supabase || !selected) return;
    await supabase.from("whatsapp_numbers").update(update).eq("id", selected.id);
    loadAll();
  }

  async function toggleAccess(kind: "sector" | "profile", refId: string) {
    if (!supabase || !selected) return;
    const existing = access.find(
      (a) => a.number_id === selected.id && (kind === "sector" ? a.sector_id === refId : a.profile_id === refId)
    );
    if (existing) {
      await supabase.from("whatsapp_number_access").delete().eq("id", existing.id);
    } else {
      await supabase.from("whatsapp_number_access").insert({
        number_id: selected.id,
        sector_id: kind === "sector" ? refId : null,
        profile_id: kind === "profile" ? refId : null,
      });
    }
    loadAll();
  }

  const selectedAccess = access.filter((a) => a.number_id === selectedId);
  const status = live?.status ?? (selected?.status as LiveState["status"]) ?? "disconnected";
  const badge = BADGE[status] ?? BADGE.disconnected;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 overflow-hidden">
      {/* Lista de números */}
      <div className="liquid-glass rounded-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <MessageCircle className="text-emerald-400" size={18} />
          <h3 className="text-sm font-bold">Números conectados</h3>
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll">
          {numbers.length === 0 && (
            <p className="text-xs text-gray-500 italic text-center py-8 px-4">
              Nenhum número. {isGestor ? "Adicione um abaixo." : "Peça ao gestor para conectar um número."}
            </p>
          )}
          {numbers.map((n) => {
            const b = BADGE[n.status] ?? BADGE.disconnected;
            return (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer ${
                  selectedId === n.id ? "bg-emerald-950/30" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{n.label}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${b.cls}`}>{b.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 font-mono">{n.phone_number ?? "sem número"}</p>
              </button>
            );
          })}
        </div>
        {isGestor && (
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNumber()}
                placeholder="Ex: Vendas"
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none"
              />
              <button
                onClick={addNumber}
                disabled={!newLabel.trim()}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">
              {numbers.length} de {numberLimit} {numberLimit === 1 ? "número" : "números"} registrados
              {numbers.length >= numberLimit && " — limite do plano atingido"}
            </p>
          </div>
        )}
      </div>

      {showUpgrade && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowUpgrade(false)}>
          <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-amber-950/50 flex items-center justify-center mx-auto mb-3">
              <QrCode size={22} className="text-amber-300" />
            </div>
            <h3 className="text-base font-bold mb-1">Limite de números atingido</h3>
            <p className="text-[13px] text-gray-400 mb-4">
              Seu plano permite registrar <b>{numberLimit}</b> {numberLimit === 1 ? "número" : "números"} de WhatsApp.
              Para registrar mais, atualize seu plano — cada número registrado custa <b>R$10/mês</b>.
            </p>
            <button
              onClick={() => setShowUpgrade(false)}
              className="text-sm px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer w-full"
            >
              Entendi — vou em Planos
            </button>
          </div>
        </div>
      )}

      {/* Detalhe do número selecionado */}
      <div className="liquid-glass rounded-2xl overflow-y-auto custom-scroll">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 italic p-8">
            Selecione um número à esquerda para conectar e configurar.
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{selected.label}</h3>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
              </div>
              {isGestor && (
                <button
                  onClick={() => removeNumber(selected.id)}
                  className="flex items-center gap-1.5 text-xs bg-red-600/15 hover:bg-red-600/25 text-red-300 px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Trash2 size={13} /> Remover
                </button>
              )}
            </div>

            {/* Conexão / QR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
              <div className="flex flex-col items-center gap-3 text-center">
                {status === "connected" ? (
                  <>
                    <div className="w-40 h-40 rounded-xl bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400">
                      <MessageCircle size={40} />
                    </div>
                    <p className="text-sm">
                      Conectado: <span className="font-mono text-emerald-400">{live?.phoneNumber ?? selected.phone_number}</span>
                    </p>
                    {isGestor && (
                      <button
                        onClick={disconnect}
                        className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 text-sm px-4 py-2 rounded-lg cursor-pointer"
                      >
                        <Power size={14} /> Desconectar
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {live?.qrDataUrl ? (
                      <img src={live.qrDataUrl} alt="QR Code" className="w-40 h-40 rounded-xl bg-white p-2" />
                    ) : (
                      <div className="w-40 h-40 rounded-xl border border-dashed border-gray-700 flex items-center justify-center text-gray-500">
                        <QrCode size={40} />
                      </div>
                    )}
                    {isGestor && (
                      <button
                        onClick={connect}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg cursor-pointer"
                      >
                        <RefreshCcw size={14} /> {status === "connecting" ? "Gerando QR..." : "Gerar QR Code"}
                      </button>
                    )}
                    {live?.lastError && <p className="text-xs text-red-400">{live.lastError}</p>}
                    {connectingLong && status === "connecting" && (
                      <p className="text-[11px] text-amber-400">
                        Ainda conectando. Verifique se o serviço tem acesso à internet.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="text-xs text-gray-400 space-y-1">
                <p>1. Abra o WhatsApp no celular deste número.</p>
                <p>2. Toque em <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.</p>
                <p>3. Escaneie o QR Code ao lado.</p>
                <p className="text-gray-500 pt-2">Cada número roda de forma independente, com sua própria sessão.</p>
              </div>
            </div>

            {/* Configuração do número */}
            {isGestor && (
              <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Setor responsável
                  </label>
                  <select
                    value={selected.sector_id ?? ""}
                    onChange={(e) => updateNumber({ sector_id: e.target.value || null })}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-2 py-2 text-xs outline-none"
                  >
                    <option value="">Nenhum</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Chatbot
                  </label>
                  <select
                    value={selected.chatbot_id ?? ""}
                    onChange={(e) => updateNumber({ chatbot_id: e.target.value || null })}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-2 py-2 text-xs outline-none"
                  >
                    <option value="">Nenhum</option>
                    {chatbots.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={selected.auto_reply}
                      onChange={(e) => updateNumber({ auto_reply: e.target.checked })}
                      className="accent-emerald-600"
                    />
                    Auto-resposta da IA
                  </label>
                </div>
              </div>
            )}

            {/* Permissões */}
            {isGestor && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Shield size={13} /> Quem pode atender este número
                </p>
                <p className="text-[11px] text-gray-500 mb-3">
                  Sem nada marcado, todos os funcionários veem as conversas. Marque setores e/ou pessoas para restringir.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1.5">Setores</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto custom-scroll">
                      {sectors.map((s) => {
                        const on = selectedAccess.some((a) => a.sector_id === s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleAccess("sector", s.id)}
                              className="accent-emerald-600"
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1.5">Funcionários</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto custom-scroll">
                      {colleagues.map((c) => {
                        const on = selectedAccess.some((a) => a.profile_id === c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleAccess("profile", c.id)}
                              className="accent-emerald-600"
                            />
                            {c.full_name ?? c.email}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
