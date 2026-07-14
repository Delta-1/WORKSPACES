"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Search, Send, Users } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { InternalMessage, Profile } from "@/lib/types";

// Chat interno da equipe: conversas 1:1 entre membros da mesma empresa.
export default function TeamChatTab({ profile }: { profile: Profile | null }) {
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<string | null>(null);

  useEffect(() => {
    selRef.current = selId;
  }, [selId]);

  useEffect(() => {
    if (!supabase || !profile) return;
    supabase
      .from("profiles")
      .select("*")
      .neq("id", profile.id)
      .order("full_name", { nullsFirst: false })
      .then(({ data }) => setColleagues((data as Profile[]) ?? []));
  }, [profile]);

  const loadThread = useCallback(
    async (otherId: string) => {
      if (!supabase || !profile) return;
      const { data } = await supabase
        .from("internal_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${profile.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${profile.id})`
        )
        .order("at");
      setMessages((data as InternalMessage[]) ?? []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    [profile]
  );

  useEffect(() => {
    if (selId) loadThread(selId);
  }, [selId, loadThread]);

  // Realtime: recarrega a thread aberta quando chega/entra mensagem relevante.
  useEffect(() => {
    if (!supabase || !profile) return;
    const ch = supabase
      .channel("team-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_messages" },
        (payload) => {
          const m = payload.new as InternalMessage;
          const other = selRef.current;
          if (!other) return;
          const relevant =
            (m.sender_id === profile.id && m.recipient_id === other) ||
            (m.sender_id === other && m.recipient_id === profile.id);
          if (relevant) loadThread(other);
        }
      )
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [profile, loadThread]);

  async function send() {
    if (!supabase || !profile || !selId || !input.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await supabase
        .from("internal_messages")
        .insert({ sender_id: profile.id, recipient_id: selId, text: input.trim() })
        .select("*")
        .single();
      if (data) setMessages((prev) => [...prev, data as InternalMessage]);
      setInput("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } finally {
      setSending(false);
    }
  }

  const filtered = useMemo(() => {
    if (!query) return colleagues;
    const q = query.toLowerCase();
    return colleagues.filter((c) => (c.full_name ?? c.email).toLowerCase().includes(q));
  }, [colleagues, query]);

  const sel = selId ? colleagues.find((c) => c.id === selId) ?? null : null;

  return (
    <div className="h-full flex gap-3 overflow-hidden">
      {/* Lista de colegas */}
      <div className="w-64 shrink-0 liquid-glass rounded-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-white/10">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
            <Users size={16} className="text-emerald-400" /> Equipe
          </h3>
          <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar colega..."
              className="bg-transparent outline-none text-xs w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll">
          {filtered.length === 0 && <p className="text-xs text-gray-500 p-3">Nenhum colega encontrado.</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelId(c.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 cursor-pointer ${
                selId === c.id ? "bg-emerald-950/40" : ""
              }`}
            >
              {c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-800/60 flex items-center justify-center text-xs font-bold">
                  {(c.full_name ?? c.email).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.full_name ?? c.email}</p>
                <p className="text-[11px] text-gray-500 truncate capitalize">{c.role}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 liquid-glass rounded-2xl flex flex-col overflow-hidden">
        {!sel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
            <MessagesSquare size={40} className="opacity-30" />
            <p className="text-sm">Selecione um colega para conversar.</p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-white/10 flex items-center gap-2.5">
              {sel.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sel.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-800/60 flex items-center justify-center text-xs font-bold">
                  {(sel.full_name ?? sel.email).charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-bold">{sel.full_name ?? sel.email}</p>
                <p className="text-[11px] text-gray-500">Conversa interna · só a equipe vê</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-8">Nenhuma mensagem ainda. Diga um oi 👋</p>
              )}
              {messages.map((m) => {
                const mine = m.sender_id === profile?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                        mine ? "bg-emerald-600 text-white" : "bg-[#1c232e]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`text-[10px] mt-0.5 ${mine ? "text-emerald-100/70" : "text-gray-500"}`}>
                        {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-white/10 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Escreva uma mensagem para a equipe..."
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 rounded-lg cursor-pointer disabled:opacity-50"
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
