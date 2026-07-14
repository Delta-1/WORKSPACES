"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronLeft, FileText, Mic, Paperclip, Plug, Search, Send, Square, Tag as TagIcon, User, UserCheck, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Contact, Conversation, InternalMessage, Profile, Tag, WhatsappMediaType, WhatsappMessageRow, WhatsappNumber } from "@/lib/types";
import WhatsappTab from "./WhatsappTab";

type ConvRow = Conversation & { contacts: Pick<Contact, "id" | "name" | "phone" | "jid" | "avatar_url"> | null };
type Mode = "espera" | "atendendo" | "todos" | "contatos" | "interno";

const MODES: { id: Mode; label: string }[] = [
  { id: "espera", label: "Espera" },
  { id: "atendendo", label: "Atendendo" },
  { id: "todos", label: "Todos" },
  { id: "contatos", label: "Contatos" },
  { id: "interno", label: "Interno" },
];

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  espera: { label: "Na fila", cls: "bg-amber-950/50 text-amber-400" },
  atendendo: { label: "Atendendo", cls: "bg-blue-950/50 text-blue-400" },
  fechado: { label: "Fechado", cls: "bg-emerald-950/50 text-emerald-400" },
  cancelado: { label: "Cancelado", cls: "bg-gray-800/60 text-gray-400" },
};

const READ_KEY = "whatsapphub:lastRead";
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

export default function WhatsappHubTab({ profile }: { profile: Profile | null }) {
  const canTag = profile?.role === "gestor" || profile?.role === "gerente";
  const isGestor = profile?.role === "gestor";

  const [mode, setMode] = useState<Mode>("atendendo");
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contactTags, setContactTags] = useState<{ contact_id: string; tag_id: string }[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [query, setQuery] = useState("");

  const [selConvId, setSelConvId] = useState<string | null>(null);
  const [selColleagueId, setSelColleagueId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [internal, setInternal] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const selConvRef = useRef<string | null>(null);
  const selColleagueRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  useEffect(() => setReadMap(loadReadMap()), []);

  const loadConversations = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(id, name, phone, jid, avatar_url)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (data) setConversations(data as unknown as ConvRow[]);
  }, []);

  const loadSideData = useCallback(async () => {
    if (!supabase) return;
    const [c, p, t, ct, n] = await Promise.all([
      supabase.from("contacts").select("*").order("name"),
      supabase.from("profiles").select("*").neq("id", profile?.id ?? "").order("full_name"),
      supabase.from("tags").select("*").order("name"),
      supabase.from("contact_tags").select("contact_id, tag_id"),
      supabase.from("whatsapp_numbers").select("*").order("created_at"),
    ]);
    if (c.data) setContacts(c.data as Contact[]);
    if (p.data) setColleagues(p.data as Profile[]);
    if (t.data) setTags(t.data as Tag[]);
    if (ct.data) setContactTags(ct.data);
    if (n.data) setNumbers(n.data as WhatsappNumber[]);
  }, [profile?.id]);

  const scrollBottom = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  const loadMessages = useCallback(async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("whatsapp_messages").select("*").eq("conversation_id", id).order("at");
    if (data) setMessages(data);
    scrollBottom();
  }, []);

  const loadInternal = useCallback(
    async (colleagueId: string) => {
      if (!supabase || !profile) return;
      const { data } = await supabase
        .from("internal_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${profile.id},recipient_id.eq.${colleagueId}),and(sender_id.eq.${colleagueId},recipient_id.eq.${profile.id})`
        )
        .order("at");
      if (data) setInternal(data);
      scrollBottom();
    },
    [profile]
  );

  useEffect(() => {
    loadConversations();
    loadSideData();
  }, [loadConversations, loadSideData]);

  // Realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("whatsapphub-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const m = payload.new as WhatsappMessageRow;
        if (m.conversation_id === selConvRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollBottom();
        }
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_tags" }, () => loadSideData())
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_numbers" }, () => loadSideData())
      .subscribe();
    return () => {
      supabase!.removeChannel(ch);
    };
  }, [loadConversations, loadSideData]);

  // Poll internal thread while open (internal_messages isn't in realtime publication)
  useEffect(() => {
    if (!selColleagueId) return;
    const i = setInterval(() => loadInternal(selColleagueId), 3000);
    return () => clearInterval(i);
  }, [selColleagueId, loadInternal]);

  function markRead(id: string) {
    const next = { ...loadReadMap(), [id]: new Date().toISOString() };
    localStorage.setItem(READ_KEY, JSON.stringify(next));
    setReadMap(next);
  }

  function openConversation(id: string) {
    setSelColleagueId(null);
    selColleagueRef.current = null;
    setSelConvId(id);
    selConvRef.current = id;
    setShowTagMenu(false);
    loadMessages(id);
    markRead(id);
  }

  function openColleague(id: string) {
    setSelConvId(null);
    selConvRef.current = null;
    setSelColleagueId(id);
    selColleagueRef.current = id;
    loadInternal(id);
  }

  async function openContact(contact: Contact) {
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
      await loadConversations();
      setMode(existing.status === "espera" ? "espera" : "atendendo");
      openConversation(existing.id);
      return;
    }
    const connected = numbers.find((n) => n.status === "connected");
    const { data } = await supabase
      .from("conversations")
      .insert({
        contact_id: contact.id,
        status: "atendendo",
        assignee_id: profile?.id ?? null,
        number_id: connected?.id ?? null,
        sector_id: connected?.sector_id ?? null,
      })
      .select("*")
      .single();
    if (data) {
      await loadConversations();
      setMode("atendendo");
      openConversation(data.id);
    }
  }

  const tagsByContact = useMemo(() => {
    const map = new Map<string, Tag[]>();
    const byId = new Map(tags.map((t) => [t.id, t]));
    for (const ct of contactTags) {
      const t = byId.get(ct.tag_id);
      if (!t) continue;
      const arr = map.get(ct.contact_id) ?? [];
      arr.push(t);
      map.set(ct.contact_id, arr);
    }
    return map;
  }, [tags, contactTags]);

  const visibleConversations = useMemo(() => {
    let list = conversations;
    if (mode === "espera") list = list.filter((c) => c.status === "espera");
    else if (mode === "atendendo")
      list = list.filter((c) => c.status === "atendendo" && (isGestor || c.assignee_id === profile?.id));
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
  }, [conversations, mode, query, isGestor, profile?.id]);

  const filteredContacts = useMemo(() => {
    if (!query) return contacts;
    const q = query.toLowerCase();
    return contacts.filter((c) => (c.name ?? c.phone).toLowerCase().includes(q));
  }, [contacts, query]);

  const filteredColleagues = useMemo(() => {
    if (!query) return colleagues;
    const q = query.toLowerCase();
    return colleagues.filter((c) => (c.full_name ?? c.email).toLowerCase().includes(q));
  }, [colleagues, query]);

  const selConv = selConvId ? conversations.find((c) => c.id === selConvId) ?? null : null;
  const selColleague = selColleagueId ? colleagues.find((c) => c.id === selColleagueId) ?? null : null;
  // No celular: mostra a lista OU a conversa (master-detail), como no WhatsApp.
  const hasSelection = Boolean(selConvId || selColleagueId);

  function backToList() {
    setSelConvId(null);
    setSelColleagueId(null);
    selConvRef.current = null;
    selColleagueRef.current = null;
  }
  const selTags = selConv?.contacts ? tagsByContact.get(selConv.contacts.id) ?? [] : [];

  function isUnread(c: ConvRow) {
    if (!c.last_message_at) return false;
    const read = readMap[c.id];
    return !read || new Date(c.last_message_at) > new Date(read);
  }

  const connectedCount = numbers.filter((n) => n.status === "connected").length;
  const selNumber = selConv?.number_id ? numbers.find((n) => n.id === selConv.number_id) ?? null : null;
  const botOn = Boolean(selNumber?.auto_reply);

  async function toggleBot() {
    if (!supabase || !selNumber) return;
    const next = !selNumber.auto_reply;
    setNumbers((prev) => prev.map((n) => (n.id === selNumber.id ? { ...n, auto_reply: next } : n)));
    await supabase.from("whatsapp_numbers").update({ auto_reply: next }).eq("id", selNumber.id);
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  async function send() {
    if (!input.trim() || sending) return;
    if (selColleagueId && profile && supabase) {
      setSending(true);
      try {
        const { data } = await supabase
          .from("internal_messages")
          .insert({ sender_id: profile.id, recipient_id: selColleagueId, text: input.trim() })
          .select("*")
          .single();
        if (data) setInternal((prev) => [...prev, data]);
        setInput("");
        scrollBottom();
      } finally {
        setSending(false);
      }
      return;
    }
    if (!selConv?.contacts || !supabase) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          to: selConv.contacts.jid || selConv.contacts.phone,
          text: input.trim(),
          senderId: profile?.id,
          numberId: selConv.number_id,
        }),
      });
      const data = await res.json();
      if (!data.success) alert(data.message ?? "Erro ao enviar. Algum número está conectado?");
      setInput("");
      loadMessages(selConv.id);
    } finally {
      setSending(false);
    }
  }

  function mediaTypeFromMime(mime: string): WhatsappMediaType {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "document";
  }

  async function uploadMedia(blob: Blob, filename: string, mime: string) {
    if (!supabase) return null;
    const ext = (filename.split(".").pop() || mime.split("/")[1] || "bin").slice(0, 8);
    const path = `out/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("wa-media").upload(path, blob, { contentType: mime, upsert: false });
    if (error) {
      alert("Falha ao subir o arquivo: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("wa-media").getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl, name: filename, mime } : null;
  }

  async function sendWithMedia(media: { type: WhatsappMediaType; url: string; name: string; mime: string }, caption?: string) {
    if (!selConv?.contacts) return;
    const headers = await authHeaders();
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        to: selConv.contacts.jid || selConv.contacts.phone,
        senderId: profile?.id,
        numberId: selConv.number_id,
        media,
        text: caption || undefined,
      }),
    });
    const data = await res.json();
    if (!data.success) alert(data.message ?? "Erro ao enviar. Algum número está conectado?");
    loadMessages(selConv.id);
  }

  async function onPickFile(file: File) {
    if (!selConv?.contacts || !supabase) return;
    setSending(true);
    try {
      const mime = file.type || "application/octet-stream";
      const uploaded = await uploadMedia(file, file.name, mime);
      if (uploaded) await sendWithMedia({ type: mediaTypeFromMime(mime), ...uploaded }, input.trim());
      setInput("");
    } finally {
      setSending(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!selConv?.contacts) {
      alert("Selecione uma conversa de WhatsApp para gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mt = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "";
      const rec = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 500) return;
        setSending(true);
        try {
          const uploaded = await uploadMedia(blob, `audio.${mime.includes("ogg") ? "ogg" : "webm"}`, mime);
          if (uploaded) await sendWithMedia({ type: "audio", ...uploaded });
        } finally {
          setSending(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      alert("Não consegui acessar o microfone.");
    }
  }

  async function assume() {
    if (!supabase || !profile || !selConv) return;
    await supabase.from("conversations").update({ status: "atendendo", assignee_id: profile.id }).eq("id", selConv.id);
    loadConversations();
  }
  async function closeConv(status: "fechado" | "cancelado") {
    if (!supabase || !selConv) return;
    await supabase.from("conversations").update({ status, closed_at: new Date().toISOString() }).eq("id", selConv.id);
    loadConversations();
  }
  async function toggleTag(tagId: string) {
    if (!supabase || !selConv?.contacts) return;
    const cid = selConv.contacts.id;
    const exists = contactTags.some((ct) => ct.contact_id === cid && ct.tag_id === tagId);
    if (exists) await supabase.from("contact_tags").delete().eq("contact_id", cid).eq("tag_id", tagId);
    else await supabase.from("contact_tags").insert({ contact_id: cid, tag_id: tagId });
    loadSideData();
  }
  async function createTag() {
    if (!supabase) return;
    const name = prompt("Nome da nova etiqueta:");
    if (!name?.trim()) return;
    await supabase.from("tags").insert({ name: name.trim() });
    loadSideData();
  }

  let lastDay = "";

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Barra de conexão */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${connectedCount > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-gray-300">
            {connectedCount > 0
              ? `${connectedCount} número(s) conectado(s)`
              : "Nenhum número conectado"}
          </span>
        </div>
        {isGestor && (
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg cursor-pointer"
          >
            <Plug size={14} /> Conectar / Números
          </button>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 overflow-hidden rounded-2xl liquid-glass">
        {/* Sidebar */}
        <div className={`${hasSelection ? "hidden lg:flex" : "flex"} flex-col overflow-hidden border-r border-white/10`}>
          <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar..."
                className="bg-transparent outline-none text-xs w-full"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full cursor-pointer ${
                    mode === m.id ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll">
            {(mode === "espera" || mode === "atendendo" || mode === "todos") &&
              (visibleConversations.length === 0 ? (
                <p className="text-xs text-gray-500 italic text-center py-8">Nenhuma conversa.</p>
              ) : (
                visibleConversations.map((c) => {
                  const unread = isUnread(c);
                  const cts = c.contacts ? tagsByContact.get(c.contacts.id) ?? [] : [];
                  return (
                    <button
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex gap-3 ${
                        selConvId === c.id ? "bg-emerald-950/30" : ""
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
                          {mode !== "espera" && unread && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                          {c.status === "espera" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-950/50 text-amber-400 shrink-0">
                              fila
                            </span>
                          )}
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
                })
              ))}

            {mode === "contatos" &&
              filteredContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openContact(c)}
                  className="w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-xs shrink-0">
                    <User size={16} className="text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name || c.phone}</p>
                    <p className="text-[11px] text-gray-500 truncate">{c.phone}</p>
                  </div>
                </button>
              ))}

            {mode === "interno" &&
              filteredColleagues.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openColleague(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 cursor-pointer flex items-center gap-3 ${
                    selColleagueId === c.id ? "bg-emerald-950/30" : ""
                  }`}
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-900 flex items-center justify-center text-xs shrink-0">
                      {(c.full_name ?? c.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-medium truncate">{c.full_name ?? c.email}</p>
                </button>
              ))}
          </div>
        </div>

        {/* Painel de conversa */}
        <div className={`${hasSelection ? "flex" : "hidden lg:flex"} flex-col overflow-hidden bg-[#0b0f16]/40`}>
          {selColleague ? (
            <>
              <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-center gap-3">
                <button onClick={backToList} className="lg:hidden text-gray-400 hover:text-white cursor-pointer -ml-1">
                  <ChevronLeft size={20} />
                </button>
                <Users size={16} className="text-emerald-400" />
                <div>
                  <p className="text-sm font-bold">{selColleague.full_name ?? selColleague.email}</p>
                  <p className="text-[11px] text-gray-500">Conversa interna</p>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
                {internal.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_id === profile?.id ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                        m.sender_id === profile?.id ? "bg-emerald-600 text-white" : "bg-[#1c232e]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className="text-[9px] mt-0.5 text-right opacity-60">{fmtTime(m.at)}</p>
                    </div>
                  </div>
                ))}
                {internal.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens ainda.</p>}
              </div>
            </>
          ) : selConv ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={backToList} className="lg:hidden text-gray-400 hover:text-white cursor-pointer -ml-1 shrink-0">
                    <ChevronLeft size={20} />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-emerald-900/60 flex items-center justify-center text-sm font-bold shrink-0">
                    {(selConv.contacts?.name ?? selConv.contacts?.phone ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{selConv.contacts?.name || selConv.contacts?.phone}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_PILL[selConv.status]?.cls}`}>
                        {STATUS_PILL[selConv.status]?.label}
                      </span>
                      {selTags.map((t) => (
                        <span
                          key={t.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                          style={{ backgroundColor: `${t.color}22`, color: t.color }}
                        >
                          {t.name}
                          {canTag && <X size={9} className="cursor-pointer" onClick={() => toggleTag(t.id)} />}
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
                                const on = selTags.some((x) => x.id === t.id);
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
                <div className="flex gap-2 shrink-0 items-center">
                  {selNumber && (
                    <button
                      onClick={toggleBot}
                      title={botOn ? "Bot ligado — responde os clientes automaticamente. Clique para desligar." : "Bot desligado. Clique para o robô responder automaticamente."}
                      className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md cursor-pointer border ${
                        botOn
                          ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                          : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <Bot size={12} /> {botOn ? "Bot ON" : "Bot OFF"}
                    </button>
                  )}
                  {selConv.status === "espera" && (
                    <button
                      onClick={assume}
                      className="flex items-center gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-md cursor-pointer"
                    >
                      <UserCheck size={12} /> Assumir
                    </button>
                  )}
                  {selConv.status === "atendendo" && (
                    <>
                      <button
                        onClick={() => closeConv("fechado")}
                        className="text-[11px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1.5 rounded-md cursor-pointer"
                      >
                        Encerrar
                      </button>
                      <button
                        onClick={() => closeConv("cancelado")}
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
                          {m.media_url && m.media_type === "image" && (
                            <a href={m.media_url} target="_blank" rel="noreferrer">
                              <img src={m.media_url} alt="" className="rounded-lg max-w-full max-h-64 mb-1" />
                            </a>
                          )}
                          {m.media_url && m.media_type === "audio" && (
                            <audio controls src={m.media_url} className="mb-1 w-56 max-w-full" />
                          )}
                          {m.media_url && m.media_type === "video" && (
                            <video controls src={m.media_url} className="rounded-lg max-w-full max-h-64 mb-1" />
                          )}
                          {m.media_url && m.media_type === "document" && (
                            <a
                              href={m.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 underline mb-1"
                            >
                              <FileText size={14} /> {m.media_name || "Arquivo"}
                            </a>
                          )}
                          {m.text && !(m.media_type && /^(📷|🎵|🎥|📄|📎)/.test(m.text)) && (
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          )}
                          <p
                            className={`text-[9px] mt-0.5 text-right ${
                              m.direction === "out" ? "text-emerald-100/70" : "text-gray-500"
                            }`}
                          >
                            {fmtTime(m.at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens ainda.</p>}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500 italic">
              Selecione uma conversa, contato ou colega ao lado.
            </div>
          )}

          {(selConv || selColleague) && (
            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              {selConv && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title="Anexar arquivo, foto ou vídeo"
                    className="p-2.5 rounded-lg hover:bg-white/10 text-gray-300 cursor-pointer disabled:opacity-50"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button
                    onClick={toggleRecord}
                    disabled={sending}
                    title={recording ? "Parar e enviar áudio" : "Gravar áudio"}
                    className={`p-2.5 rounded-lg cursor-pointer disabled:opacity-50 ${
                      recording ? "bg-red-600 text-white animate-pulse" : "hover:bg-white/10 text-gray-300"
                    }`}
                  >
                    {recording ? <Square size={18} /> : <Mic size={18} />}
                  </button>
                </>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={recording ? "Gravando áudio..." : "Digite uma mensagem..."}
                disabled={recording}
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de conexão / gestão de números */}
      {showConnect && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowConnect(false)}>
          <div
            className="w-full max-w-5xl h-[80vh] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plug size={16} className="text-emerald-400" /> Números de WhatsApp
              </h3>
              <button onClick={() => setShowConnect(false)} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <WhatsappTab profile={profile} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
