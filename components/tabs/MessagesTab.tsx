"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Square,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Contact, Conversation, InternalMessage, Profile, WhatsappMediaType, WhatsappMessageRow } from "@/lib/types";

type Group = { id: string; name: string; position: number };
type ConvRow = Conversation & {
  group_id: string | null;
  contacts: Pick<Contact, "id" | "name" | "phone" | "jid" | "avatar_url"> | null;
};

function contactLabel(c?: { name?: string | null; phone?: string | null } | null): string {
  if (!c) return "Contato";
  if (c.name && c.name.trim()) return c.name;
  const p = (c.phone || "").replace(/\D/g, "");
  if (p.length >= 8 && p.length <= 13) return "+" + p;
  return "Contato WhatsApp";
}
function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function mediaTypeFromMime(mime: string): WhatsappMediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export default function MessagesTab({ profile }: { profile: Profile | null }) {
  const [server, setServer] = useState<"whatsapp" | "equipe">("whatsapp");
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const [selConvId, setSelConvId] = useState<string | null>(null);
  const [selColleagueId, setSelColleagueId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [internal, setInternal] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selConvRef = useRef<string | null>(null);
  const selColRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const scrollBottom = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  const loadConversations = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, group_id, contacts(id, name, phone, jid, avatar_url)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data) setConversations(data as unknown as ConvRow[]);
  }, []);

  const loadSide = useCallback(async () => {
    if (!supabase) return;
    const [g, p] = await Promise.all([
      supabase.from("contact_groups").select("*").order("position"),
      supabase.from("profiles").select("*").neq("id", profile?.id ?? "").order("full_name"),
    ]);
    setGroups((g.data as Group[]) ?? []);
    setColleagues((p.data as Profile[]) ?? []);
  }, [profile?.id]);

  useEffect(() => {
    loadConversations();
    loadSide();
  }, [loadConversations, loadSide]);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("messages-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_groups" }, () => loadSide())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const m = payload.new as WhatsappMessageRow;
        if (m.conversation_id === selConvRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollBottom();
        }
        loadConversations();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages" }, (payload) => {
        const m = payload.new as InternalMessage;
        const other = selColRef.current;
        if (other && ((m.sender_id === profile?.id && m.recipient_id === other) || (m.sender_id === other && m.recipient_id === profile?.id))) {
          setInternal((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollBottom();
        }
      })
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [loadConversations, loadSide, profile?.id]);

  async function openConv(id: string) {
    setSelColleagueId(null);
    selColRef.current = null;
    setSelConvId(id);
    selConvRef.current = id;
    if (!supabase) return;
    const { data } = await supabase.from("whatsapp_messages").select("*").eq("conversation_id", id).order("at");
    setMessages(data ?? []);
    scrollBottom();
  }
  async function openColleague(id: string) {
    setSelConvId(null);
    selConvRef.current = null;
    setSelColleagueId(id);
    selColRef.current = id;
    if (!supabase || !profile) return;
    const { data } = await supabase
      .from("internal_messages")
      .select("*")
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${profile.id})`)
      .order("at");
    setInternal(data ?? []);
    scrollBottom();
  }

  async function newGroup() {
    if (!supabase) return;
    const name = prompt("Nome do grupo/categoria:")?.trim();
    if (!name) return;
    await supabase.from("contact_groups").insert({ name, position: groups.length });
    loadSide();
  }
  async function moveConv(convId: string, groupId: string | null) {
    if (!supabase) return;
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, group_id: groupId } : c)));
    await supabase.from("conversations").update({ group_id: groupId }).eq("id", convId);
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  const selConv = selConvId ? conversations.find((c) => c.id === selConvId) ?? null : null;
  const selColleague = selColleagueId ? colleagues.find((c) => c.id === selColleagueId) ?? null : null;

  async function uploadMedia(blob: Blob, filename: string, mime: string) {
    if (!supabase) return null;
    const ext = (filename.split(".").pop() || mime.split("/")[1] || "bin").slice(0, 8);
    const path = `out/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("wa-media").upload(path, blob, { contentType: mime, upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("wa-media").getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl, name: filename, mime } : null;
  }

  async function sendMedia(media: { type: WhatsappMediaType; url: string; name: string; mime: string }, caption?: string) {
    if (!selConv?.contacts) return;
    const headers = await authHeaders();
    await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ to: selConv.contacts.jid || selConv.contacts.phone, senderId: profile?.id, numberId: selConv.number_id, media, text: caption || undefined }),
    });
    openConv(selConv.id);
  }

  async function send() {
    if (!input.trim() || sending) return;
    if (selColleagueId && profile && supabase) {
      setSending(true);
      try {
        const { data } = await supabase.from("internal_messages").insert({ sender_id: profile.id, recipient_id: selColleagueId, text: input.trim() }).select("*").single();
        if (data) setInternal((prev) => [...prev, data]);
        setInput("");
        scrollBottom();
      } finally {
        setSending(false);
      }
      return;
    }
    if (!selConv?.contacts) return;
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ to: selConv.contacts.jid || selConv.contacts.phone, text: input.trim(), senderId: profile?.id, numberId: selConv.number_id }),
      });
      const data = await res.json();
      if (!data.success) alert(data.message ?? "Erro ao enviar. Algum número conectado?");
      setInput("");
      openConv(selConv.id);
    } finally {
      setSending(false);
    }
  }

  async function onPickFile(file: File) {
    if (!selConv?.contacts) return;
    setSending(true);
    try {
      const mime = file.type || "application/octet-stream";
      const uploaded = await uploadMedia(file, file.name, mime);
      if (uploaded) await sendMedia({ type: mediaTypeFromMime(mime), ...uploaded }, input.trim());
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
    if (!selConv?.contacts) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const uploaded = await uploadMedia(blob, "audio.webm", "audio/webm");
        if (uploaded) await sendMedia({ type: "audio", ...uploaded });
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      alert("Não consegui acessar o microfone.");
    }
  }

  // Agrupa conversas por grupo.
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return conversations.filter((c) => !q || contactLabel(c.contacts).toLowerCase().includes(q));
  }, [conversations, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConvRow[]>();
    map.set("none", []);
    groups.forEach((g) => map.set(g.id, []));
    filtered.forEach((c) => {
      const key = c.group_id && map.has(c.group_id) ? c.group_id : "none";
      map.get(key)!.push(c);
    });
    return map;
  }, [filtered, groups]);

  const thread = selConv ? messages : selColleague ? internal : [];

  return (
    <div className="h-full flex overflow-hidden rounded-2xl liquid-glass">
      {/* Rail de servidores */}
      <div className="w-16 shrink-0 bg-black/30 flex flex-col items-center py-3 gap-2 border-r border-white/10">
        <ServerIcon active={server === "whatsapp"} onClick={() => setServer("whatsapp")} title="WhatsApp / Clientes">
          <MessageSquare size={20} />
        </ServerIcon>
        <ServerIcon active={server === "equipe"} onClick={() => setServer("equipe")} title="Equipe (interno)">
          <Users size={20} />
        </ServerIcon>
      </div>

      {/* Coluna de canais/contatos */}
      <div className="w-64 shrink-0 flex flex-col overflow-hidden border-r border-white/10 bg-black/10">
        <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{server === "whatsapp" ? "Conversas" : "Equipe"}</h3>
            {server === "whatsapp" && (
              <button onClick={newGroup} title="Novo grupo" className="text-gray-400 hover:text-emerald-400 cursor-pointer">
                <FolderPlus size={15} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." className="bg-transparent outline-none text-xs w-full" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll py-1">
          {server === "equipe" &&
            colleagues.map((c) => (
              <button
                key={c.id}
                onClick={() => openColleague(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 cursor-pointer ${selColleagueId === c.id ? "bg-emerald-950/30" : ""}`}
              >
                <Hash size={14} className="text-gray-500 shrink-0" />
                <span className="text-sm truncate">{c.full_name ?? c.email}</span>
              </button>
            ))}

          {server === "whatsapp" &&
            [{ id: "none", name: "Sem grupo" }, ...groups].map((g) => {
              const list = grouped.get(g.id) ?? [];
              if (g.id === "none" && list.length === 0) return null;
              const isCol = collapsed[g.id];
              return (
                <div key={g.id} className="mb-1">
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [g.id]: !p[g.id] }))}
                    className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 cursor-pointer"
                  >
                    {isCol ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    {g.name} <span className="text-gray-600">({list.length})</span>
                  </button>
                  {!isCol &&
                    list.map((c) => (
                      <div key={c.id} className={`group flex items-center gap-2 px-2 mx-1 rounded-lg hover:bg-white/5 ${selConvId === c.id ? "bg-emerald-950/30" : ""}`}>
                        <button onClick={() => openConv(c.id)} className="flex items-center gap-2 flex-1 min-w-0 py-1.5 text-left cursor-pointer">
                          {c.contacts?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.contacts.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-emerald-900/60 flex items-center justify-center text-[11px] font-bold shrink-0">
                              {contactLabel(c.contacts).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] truncate leading-tight">{contactLabel(c.contacts)}</p>
                            <p className="text-[10px] text-gray-500 truncate">{c.last_message || "—"}</p>
                          </div>
                        </button>
                        <select
                          value={c.group_id ?? ""}
                          onChange={(e) => moveConv(c.id, e.target.value || null)}
                          title="Mover para grupo"
                          className="opacity-0 group-hover:opacity-100 bg-transparent text-[10px] text-gray-400 cursor-pointer outline-none"
                        >
                          <option value="">— sem grupo</option>
                          {groups.map((gr) => (
                            <option key={gr.id} value={gr.id}>{gr.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                </div>
              );
            })}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0f16]/40">
        {!selConv && !selColleague ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
            <MessageSquare size={40} className="opacity-30" />
            <p className="text-sm">Selecione uma conversa.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5 shrink-0">
              {selConv ? (
                selConv.contacts?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selConv.contacts.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-900/60 flex items-center justify-center text-xs font-bold">
                    {contactLabel(selConv.contacts).charAt(0).toUpperCase()}
                  </div>
                )
              ) : (
                <Users size={16} className="text-emerald-400" />
              )}
              <p className="text-sm font-bold">{selConv ? contactLabel(selConv.contacts) : selColleague?.full_name ?? selColleague?.email}</p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
              {selConv &&
                messages.map((m) => (
                  <Bubble key={m.id} mine={m.direction === "out"} at={m.at} text={m.text} mediaUrl={m.media_url} mediaType={m.media_type} />
                ))}
              {selColleague &&
                internal.map((m) => <Bubble key={m.id} mine={m.sender_id === profile?.id} at={m.at} text={m.text} />)}
              {thread.length === 0 && <p className="text-xs text-gray-500 text-center py-8">Nenhuma mensagem ainda.</p>}
            </div>

            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0">
              {selConv && (
                <>
                  <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.currentTarget.value = ""; }} />
                  <button onClick={() => fileRef.current?.click()} disabled={sending} className="p-2.5 rounded-lg hover:bg-white/10 text-gray-300 cursor-pointer disabled:opacity-50">
                    <Paperclip size={18} />
                  </button>
                  <button onClick={toggleRecord} disabled={sending} className={`p-2.5 rounded-lg cursor-pointer disabled:opacity-50 ${recording ? "bg-red-600 text-white animate-pulse" : "hover:bg-white/10 text-gray-300"}`}>
                    {recording ? <Square size={18} /> : <Mic size={18} />}
                  </button>
                </>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={recording ? "Gravando áudio..." : "Mensagem..."}
                disabled={recording}
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none disabled:opacity-60"
              />
              <button onClick={send} disabled={sending || !input.trim()} className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ServerIcon({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer transition-all ${
        active ? "bg-emerald-600 text-white rounded-xl" : "bg-white/5 text-gray-400 hover:bg-emerald-600/30 hover:text-white hover:rounded-xl"
      }`}
    >
      {children}
    </button>
  );
}

function Bubble({ mine, at, text, mediaUrl, mediaType }: { mine: boolean; at: string; text: string | null; mediaUrl?: string | null; mediaType?: WhatsappMediaType | null }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-emerald-600 text-white" : "bg-[#1c232e]"}`}>
        {mediaUrl && mediaType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="" className="rounded-lg max-w-full mb-1 max-h-60 object-contain" />
        )}
        {mediaUrl && mediaType === "audio" && <audio src={mediaUrl} controls className="max-w-[220px] mb-1" />}
        {mediaUrl && (mediaType === "document" || mediaType === "video") && (
          <a href={mediaUrl} target="_blank" rel="noreferrer" className="underline text-xs block mb-1">
            {mediaType === "video" ? "🎥 Vídeo" : "📄 Arquivo"}
          </a>
        )}
        {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
        <p className={`text-[10px] mt-0.5 ${mine ? "text-emerald-100/70" : "text-gray-500"}`}>{fmtTime(at)}</p>
      </div>
    </div>
  );
}
