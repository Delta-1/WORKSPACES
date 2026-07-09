"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Send, Tag as TagIcon, UserCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Contact, Conversation, Profile, Tag, WhatsappMessageRow } from "@/lib/types";

type ConvRow = Conversation & { contacts: Pick<Contact, "id" | "name" | "phone" | "avatar_url"> | null };

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  espera: { label: "Na fila", cls: "bg-amber-950/50 text-amber-400" },
  atendendo: { label: "Atendendo", cls: "bg-blue-950/50 text-blue-400" },
  fechado: { label: "Fechado", cls: "bg-emerald-950/50 text-emerald-400" },
  cancelado: { label: "Cancelado", cls: "bg-gray-800/60 text-gray-400" },
};

const READ_KEY = "whatsweb:lastRead";

function loadReadMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || "{}");
  } catch {
    return {};
  }
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yst = new Date();
  yst.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yst.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

export default function WhatsWebTab({ profile }: { profile: Profile | null }) {
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contactTags, setContactTags] = useState<{ contact_id: string; tag_id: string }[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "espera" | "atendendo">("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);

  const canTag = profile?.role === "gestor" || profile?.role === "gerente";

  useEffect(() => {
    setReadMap(loadReadMap());
  }, []);

  const loadConversations = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(id, name, phone, avatar_url)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (data) setConversations(data as unknown as ConvRow[]);
  }, []);

  const loadTags = useCallback(async () => {
    if (!supabase) return;
    const [t, ct] = await Promise.all([
      supabase.from("tags").select("*").order("name"),
      supabase.from("contact_tags").select("contact_id, tag_id"),
    ]);
    if (t.data) setTags(t.data as Tag[]);
    if (ct.data) setContactTags(ct.data);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("at");
    if (data) setMessages(data);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    );
  }, []);

  useEffect(() => {
    loadConversations();
    loadTags();
  }, [loadConversations, loadTags]);

  // Sincronia em tempo real (Supabase Realtime)
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("whatsweb-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const m = payload.new as WhatsappMessageRow;
        if (m.conversation_id === selectedRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          requestAnimationFrame(() =>
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
          );
        }
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_tags" }, () => loadTags())
      .subscribe();
    return () => {
      supabase!.removeChannel(ch);
    };
  }, [loadConversations, loadMessages, loadTags]);

  function markRead(id: string) {
    const next = { ...loadReadMap(), [id]: new Date().toISOString() };
    localStorage.setItem(READ_KEY, JSON.stringify(next));
    setReadMap(next);
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    selectedRef.current = id;
    setShowTagMenu(false);
    loadMessages(id);
    markRead(id);
  }

  const tagsByContact = useMemo(() => {
    const map = new Map<string, Tag[]>();
    const tagById = new Map(tags.map((t) => [t.id, t]));
    for (const ct of contactTags) {
      const t = tagById.get(ct.tag_id);
      if (!t) continue;
      const arr = map.get(ct.contact_id) ?? [];
      arr.push(t);
      map.set(ct.contact_id, arr);
    }
    return map;
  }, [tags, contactTags]);

  const visible = useMemo(() => {
    let list = conversations;
    if (filter !== "todos") list = list.filter((c) => c.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          (c.contacts?.name ?? "").toLowerCase().includes(q) ||
          (c.contacts?.phone ?? "").includes(q) ||
          String(c.protocol).includes(q)
      );
    }
    return list;
  }, [conversations, filter, query]);

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null;
  const selectedTags = selected?.contacts ? tagsByContact.get(selected.contacts.id) ?? [] : [];

  function isUnread(c: ConvRow) {
    if (!c.last_message_at) return false;
    const read = readMap[c.id];
    return !read || new Date(c.last_message_at) > new Date(read);
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function send() {
    if (!input.trim() || !selected?.contacts || !supabase) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          to: selected.contacts.phone,
          text: input.trim(),
          senderId: profile?.id,
          numberId: selected.number_id,
        }),
      });
      const data = await res.json();
      if (!data.success) alert(data.message ?? "Erro ao enviar. O número está conectado?");
      setInput("");
      loadMessages(selected.id);
    } finally {
      setSending(false);
    }
  }

  async function assume() {
    if (!supabase || !profile || !selected) return;
    await supabase.from("conversations").update({ status: "atendendo", assignee_id: profile.id }).eq("id", selected.id);
    loadConversations();
  }

  async function close(status: "fechado" | "cancelado") {
    if (!supabase || !selected) return;
    await supabase.from("conversations").update({ status, closed_at: new Date().toISOString() }).eq("id", selected.id);
    loadConversations();
  }

  async function toggleTag(tagId: string) {
    if (!supabase || !selected?.contacts) return;
    const contactId = selected.contacts.id;
    const exists = contactTags.some((ct) => ct.contact_id === contactId && ct.tag_id === tagId);
    if (exists) {
      await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
    } else {
      await supabase.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId });
    }
    loadTags();
  }

  async function createTag() {
    if (!supabase) return;
    const name = prompt("Nome da nova etiqueta:");
    if (!name?.trim()) return;
    await supabase.from("tags").insert({ name: name.trim() });
    loadTags();
  }

  let lastDay = "";

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 overflow-hidden rounded-2xl liquid-glass">
      {/* Sidebar */}
      <div className="flex flex-col overflow-hidden border-r border-white/10">
        <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
          <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar conversa, contato, protocolo..."
              className="bg-transparent outline-none text-xs w-full"
            />
          </div>
          <div className="flex gap-1">
            {(["todos", "espera", "atendendo"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[11px] px-2.5 py-1 rounded-full cursor-pointer capitalize ${
                  filter === f ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll">
          {visible.length === 0 && (
            <p className="text-xs text-gray-500 italic text-center py-8">Nenhuma conversa.</p>
          )}
          {visible.map((c) => {
            const unread = isUnread(c);
            const cts = c.contacts ? tagsByContact.get(c.contacts.id) ?? [] : [];
            return (
              <button
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex gap-3 ${
                  selectedId === c.id ? "bg-emerald-950/30" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-900/60 flex items-center justify-center text-sm font-bold shrink-0">
                  {(c.contacts?.name ?? c.contacts?.phone ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread ? "font-bold" : "font-medium"}`}>
                      {c.contacts?.name || c.contacts?.phone || "Contato"}
                    </p>
                    <span className="text-[10px] text-gray-500 shrink-0">{fmtTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[11px] truncate ${unread ? "text-gray-200" : "text-gray-500"}`}>
                      {c.last_message || "—"}
                    </p>
                    {unread && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <span className="text-[9px] text-gray-600 font-mono">#{c.protocol}</span>
                    {cts.map((t) => (
                      <span
                        key={t.id}
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${t.color}22`, color: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversa */}
      <div className="flex flex-col overflow-hidden bg-[#0b0f16]/40">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 italic">
            Selecione uma conversa para começar.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-900/60 flex items-center justify-center text-sm font-bold shrink-0">
                  {(selected.contacts?.name ?? selected.contacts?.phone ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    {selected.contacts?.name || selected.contacts?.phone}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_PILL[selected.status]?.cls}`}>
                      {STATUS_PILL[selected.status]?.label}
                    </span>
                    {selectedTags.map((t) => (
                      <span
                        key={t.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                        style={{ backgroundColor: `${t.color}22`, color: t.color }}
                      >
                        {t.name}
                        {canTag && (
                          <X size={9} className="cursor-pointer" onClick={() => toggleTag(t.id)} />
                        )}
                      </span>
                    ))}
                    {canTag && (
                      <div className="relative">
                        <button
                          onClick={() => setShowTagMenu((v) => !v)}
                          className="text-[10px] text-gray-400 hover:text-emerald-400 flex items-center gap-0.5 cursor-pointer"
                        >
                          <TagIcon size={10} /> etiqueta
                        </button>
                        {showTagMenu && (
                          <div className="absolute z-10 top-5 left-0 w-44 bg-[#11161f] border border-white/10 rounded-lg p-1.5 shadow-xl">
                            {tags.map((t) => {
                              const on = selectedTags.some((x) => x.id === t.id);
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => toggleTag(t.id)}
                                  className="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                                >
                                  <span style={{ color: t.color }}>{t.name}</span>
                                  {on && <Check size={11} className="text-emerald-400" />}
                                </button>
                              );
                            })}
                            <button
                              onClick={createTag}
                              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-white/5 text-gray-400 cursor-pointer border-t border-white/10 mt-1"
                            >
                              + nova etiqueta
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {selected.status === "espera" && (
                  <button
                    onClick={assume}
                    className="flex items-center gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-md cursor-pointer"
                  >
                    <UserCheck size={12} /> Assumir
                  </button>
                )}
                {selected.status === "atendendo" && (
                  <>
                    <button
                      onClick={() => close("fechado")}
                      className="text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1.5 rounded-md cursor-pointer"
                    >
                      Encerrar
                    </button>
                    <button
                      onClick={() => close("cancelado")}
                      className="text-[11px] bg-red-600/20 hover:bg-red-600/30 text-red-300 px-2.5 py-1.5 rounded-md cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-4 space-y-1.5">
              {messages.map((m) => {
                const day = fmtDay(m.at);
                const showDay = day !== lastDay;
                lastDay = day;
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] text-gray-500 bg-black/30 px-2 py-0.5 rounded-full">{day}</span>
                      </div>
                    )}
                    <div className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                          m.direction === "out" ? "bg-emerald-600 text-white" : "bg-[#1c232e]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className={`text-[9px] mt-0.5 text-right ${m.direction === "out" ? "text-emerald-100/70" : "text-gray-500"}`}>
                          {fmtTime(m.at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens ainda.</p>}
            </div>

            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
