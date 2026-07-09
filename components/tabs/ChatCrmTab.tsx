"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Send, User, Users, Clock, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Contact, Conversation, InternalMessage, Profile, WhatsappMessageRow } from "@/lib/types";

type SubTab = "atendendo" | "espera" | "contatos" | "interno";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Headphones }[] = [
  { id: "atendendo", label: "Atendendo", icon: Headphones },
  { id: "espera", label: "Espera", icon: Clock },
  { id: "contatos", label: "Contatos", icon: Users },
  { id: "interno", label: "Interno", icon: User },
];

export default function ChatCrmTab({ profile }: { profile: Profile | null }) {
  const [subTab, setSubTab] = useState<SubTab>("atendendo");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedColleagueId, setSelectedColleagueId] = useState<string | null>(null);

  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [internalMessages, setInternalMessages] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadLists() {
    if (!supabase) return;
    const [conv, cts, profs] = await Promise.all([
      supabase.from("conversations").select("*").order("updated_at", { ascending: false }),
      supabase.from("contacts").select("*").order("name"),
      supabase.from("profiles").select("*").neq("id", profile?.id ?? ""),
    ]);
    if (conv.data) setConversations(conv.data);
    if (cts.data) setContacts(cts.data);
    if (profs.data) setColleagues(profs.data);
  }

  useEffect(() => {
    loadLists();
    const interval = setInterval(loadLists, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const colleagueById = useMemo(() => new Map(colleagues.map((c) => [c.id, c])), [colleagues]);

  const atendendoList = useMemo(
    () => conversations.filter((c) => c.status === "atendendo" && (profile?.role === "gestor" || c.assignee_id === profile?.id)),
    [conversations, profile]
  );
  const esperaList = useMemo(() => conversations.filter((c) => c.status === "espera"), [conversations]);

  const filteredContacts = useMemo(() => {
    if (!query) return contacts;
    return contacts.filter((c) => (c.name ?? c.phone).toLowerCase().includes(query.toLowerCase()));
  }, [contacts, query]);

  function scrollToBottom() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function loadMessages(conversationId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("at");
    if (data) setMessages(data);
    scrollToBottom();
  }

  async function loadInternalMessages(colleagueId: string) {
    if (!supabase || !profile) return;
    const { data } = await supabase
      .from("internal_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.eq.${colleagueId}),and(sender_id.eq.${colleagueId},recipient_id.eq.${profile.id})`
      )
      .order("at");
    if (data) setInternalMessages(data);
    scrollToBottom();
  }

  function selectConversation(id: string) {
    setSelectedColleagueId(null);
    setSelectedConversationId(id);
    loadMessages(id);
  }

  function selectColleague(id: string) {
    setSelectedConversationId(null);
    setSelectedColleagueId(id);
    loadInternalMessages(id);
  }

  async function selectContact(contact: Contact) {
    if (!supabase) return;
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("contact_id", contact.id)
      .in("status", ["espera", "atendendo"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      setSubTab(existing.status === "espera" ? "espera" : "atendendo");
      selectConversation(existing.id);
      return;
    }
    const { data } = await supabase
      .from("conversations")
      .insert({ contact_id: contact.id, status: "atendendo", assignee_id: profile?.id ?? null })
      .select("*")
      .single();
    if (data) {
      setConversations((prev) => [data, ...prev]);
      setSubTab("atendendo");
      selectConversation(data.id);
    }
  }

  async function assumeConversation(id: string) {
    if (!supabase || !profile) return;
    await supabase.from("conversations").update({ status: "atendendo", assignee_id: profile.id }).eq("id", id);
    setSubTab("atendendo");
    loadLists();
    selectConversation(id);
  }

  async function closeConversation(id: string, status: "fechado" | "cancelado") {
    if (!supabase) return;
    await supabase.from("conversations").update({ status, closed_at: new Date().toISOString() }).eq("id", id);
    setSelectedConversationId(null);
    loadLists();
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function sendWhatsapp() {
    if (!input.trim() || !selectedConversationId || !supabase) return;
    const conversation = conversations.find((c) => c.id === selectedConversationId);
    const contact = conversation ? contactById.get(conversation.contact_id) : null;
    if (!contact) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ to: contact.phone, text: input.trim(), senderId: profile?.id }),
      });
      const data = await res.json();
      if (!data.success) alert(data.message ?? "Erro ao enviar.");
      setInput("");
      await loadMessages(selectedConversationId);
    } finally {
      setSending(false);
    }
  }

  async function sendInternal() {
    if (!input.trim() || !selectedColleagueId || !supabase || !profile) return;
    setSending(true);
    try {
      const { data } = await supabase
        .from("internal_messages")
        .insert({ sender_id: profile.id, recipient_id: selectedColleagueId, text: input.trim() })
        .select("*")
        .single();
      if (data) setInternalMessages((prev) => [...prev, data]);
      setInput("");
      scrollToBottom();
    } finally {
      setSending(false);
    }
  }

  const selectedConversation = selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : null;
  const selectedContact = selectedConversation ? contactById.get(selectedConversation.contact_id) : null;
  const selectedColleague = selectedColleagueId ? colleagueById.get(selectedColleagueId) : null;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 overflow-hidden">
      <div className="liquid-glass rounded-2xl flex flex-col overflow-hidden">
        <div className="grid grid-cols-4 border-b border-white/10 shrink-0">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] cursor-pointer ${
                subTab === t.id ? "text-emerald-400 border-b-2 border-emerald-500" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-2 border-b border-white/10 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          {subTab === "atendendo" &&
            (atendendoList.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-8">Nenhum atendimento em andamento.</p>
            ) : (
              atendendoList.map((c) => {
                const contact = contactById.get(c.contact_id);
                return (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer ${
                      selectedConversationId === c.id ? "bg-emerald-950/30" : ""
                    }`}
                  >
                    <p className="text-sm font-medium truncate">{contact?.name || contact?.phone || "Contato"}</p>
                    <p className="text-[11px] text-gray-500">#{c.protocol} · {c.problem || "sem assunto"}</p>
                  </button>
                );
              })
            ))}

          {subTab === "espera" &&
            (esperaList.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-8">Fila de espera vazia.</p>
            ) : (
              esperaList.map((c) => {
                const contact = contactById.get(c.contact_id);
                return (
                  <div key={c.id} className="px-3 py-2.5 border-b border-white/5">
                    <p className="text-sm font-medium truncate">{contact?.name || contact?.phone || "Contato"}</p>
                    <p className="text-[11px] text-gray-500 mb-2">#{c.protocol} · aguardando</p>
                    <button
                      onClick={() => assumeConversation(c.id)}
                      className="flex items-center gap-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-md cursor-pointer"
                    >
                      <UserCheck size={12} /> Assumir atendimento
                    </button>
                  </div>
                );
              })
            ))}

          {subTab === "contatos" &&
            filteredContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => selectContact(c)}
                className="w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs shrink-0">?</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name || c.phone}</p>
                  <p className="text-[11px] text-gray-500 truncate">{c.phone}</p>
                </div>
              </button>
            ))}

          {subTab === "interno" &&
            colleagues
              .filter((c) => (c.full_name ?? c.email).toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectColleague(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex items-center gap-2 ${
                    selectedColleagueId === c.id ? "bg-emerald-950/30" : ""
                  }`}
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-900 flex items-center justify-center text-xs shrink-0">
                      {(c.full_name ?? c.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-medium truncate">{c.full_name ?? c.email}</p>
                </button>
              ))}
        </div>
      </div>

      <div className="liquid-glass rounded-2xl flex flex-col overflow-hidden">
        {selectedConversation && selectedContact ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div>
                <p className="text-sm font-bold">{selectedContact.name || selectedContact.phone}</p>
                <p className="text-[11px] text-gray-500">Protocolo #{selectedConversation.protocol}</p>
              </div>
              {selectedConversation.status === "atendendo" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => closeConversation(selectedConversation.id, "fechado")}
                    className="text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1.5 rounded-md cursor-pointer"
                  >
                    Encerrar
                  </button>
                  <button
                    onClick={() => closeConversation(selectedConversation.id, "cancelado")}
                    className="text-[11px] bg-red-600/20 hover:bg-red-600/30 text-red-300 px-2.5 py-1.5 rounded-md cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === "out" ? "bg-emerald-600 text-white" : "bg-black/30"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens ainda.</p>}
            </div>
            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendWhatsapp()}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={sendWhatsapp}
                disabled={sending}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        ) : selectedColleague ? (
          <>
            <div className="px-4 py-3 border-b border-white/10 shrink-0">
              <p className="text-sm font-bold">{selectedColleague.full_name ?? selectedColleague.email}</p>
              <p className="text-[11px] text-gray-500">Conversa interna</p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
              {internalMessages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === profile?.id ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                      m.sender_id === profile?.id ? "bg-emerald-600 text-white" : "bg-black/30"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {internalMessages.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens ainda.</p>}
            </div>
            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInternal()}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={sendInternal}
                disabled={sending}
                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 italic">
            Selecione uma conversa ao lado.
          </div>
        )}
      </div>
    </div>
  );
}
