"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Download, FileText, Hash, MessageSquare, Mic, MoreVertical, Paperclip, Pencil, Phone, Plug, Plus, Search, Send, Smile, Square, Star, Trash2, UserPlus, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Contact, Conversation, InternalMessage, Profile, WhatsappMediaType, WhatsappMessageRow, WhatsappNumber } from "@/lib/types";
import WhatsappTab from "./WhatsappTab";

type Group = { id: string; name: string; position: number };
type ContactReport = {
  id: string;
  summary: string | null;
  rating: number | null;
  sentiment: string | null;
  handled_by: string | null;
  created_at: string;
};
type ConvRow = Conversation & {
  group_id: string | null;
  contacts: Pick<Contact, "id" | "name" | "phone" | "jid" | "avatar_url" | "copilot_access"> | null;
};

function contactLabel(c?: { name?: string | null; phone?: string | null } | null): string {
  if (!c) return "Contato";
  if (c.name && c.name.trim()) return c.name;
  const p = (c.phone || "").replace(/\D/g, "");
  if (p.length >= 8 && p.length <= 13) return "+" + p;
  return "Contato WhatsApp";
}
// Etiqueta de status do atendimento (aparece no chat e reflete no WhatsApp).
function StatusTag({ status, small }: { status?: string | null; small?: boolean }) {
  const base = `${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"} rounded-full font-semibold whitespace-nowrap`;
  if (status === "espera") return <span className={`${base} bg-amber-500/20 text-amber-300 border border-amber-500/40`}>Aguardando atendimento</span>;
  if (status === "atendendo") return <span className={`${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/40`}>Sendo atendido</span>;
  return null;
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

const EMOJIS = "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 😉 🙂 😢 😭 😡 👍 👎 🙏 👏 🙌 💪 🔥 ✅ ❌ ⚠️ 🎉 ❤️ 💚 💙 💛 ⭐ 💯 👀 🤝 🫡 😴 🥳 😱 🤦 🤷 👌 ✌️ 🤙 📌 📎 📞 💬 ⏰ 💰 🚀".split(" ");

export default function MessagesTab({ profile }: { profile: Profile | null }) {
  const [server, setServer] = useState<string>("whatsapp"); // "whatsapp" | "equipe" | <groupId>
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [query, setQuery] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showBotSetup, setShowBotSetup] = useState(false);
  const [chatMenu, setChatMenu] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [reports, setReports] = useState<ContactReport[]>([]);
  // Não-lidas por conversa (bolinha vermelha estilo Discord), salvo por navegador.
  const [unread, setUnread] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      setUnread(JSON.parse(localStorage.getItem("wa:unread") || "{}"));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("wa:unread", JSON.stringify(unread));
    } catch {
      /* ignore */
    }
  }, [unread]);

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
      .select("*, group_id, contacts(id, name, phone, jid, avatar_url, copilot_access)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data) setConversations(data as unknown as ConvRow[]);
  }, []);

  const loadSide = useCallback(async () => {
    if (!supabase) return;
    const [g, p, n] = await Promise.all([
      supabase.from("contact_groups").select("*").order("position"),
      supabase.from("profiles").select("*").neq("id", profile?.id ?? "").order("full_name"),
      supabase.from("whatsapp_numbers").select("*").order("created_at"),
    ]);
    setGroups((g.data as Group[]) ?? []);
    setColleagues((p.data as Profile[]) ?? []);
    setNumbers((n.data as WhatsappNumber[]) ?? []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_numbers" }, () => loadSide())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const m = payload.new as WhatsappMessageRow;
        if (m.conversation_id === selConvRef.current) {
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            // Substitui a bolha otimista (temp-) correspondente, se houver.
            const withoutTemp = prev.filter(
              (t) => !(t.id.startsWith("temp-") && t.direction === m.direction && (t.text || "") === (m.text || ""))
            );
            return [...withoutTemp, m];
          });
          scrollBottom();
        } else if (m.direction === "in") {
          // Mensagem nova de cliente numa conversa que não está aberta → não-lida.
          setUnread((prev) => ({ ...prev, [m.conversation_id]: (prev[m.conversation_id] || 0) + 1 }));
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
    setUnread((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev)); // zera as não-lidas ao abrir
    if (!supabase) return;
    const { data } = await supabase.from("whatsapp_messages").select("*").eq("conversation_id", id).order("at");
    setMessages(data ?? []);
    scrollBottom();
  }

  // Mescla o que veio do servidor com as bolhas otimistas (temp-) ainda não
  // confirmadas. Usado pela rede de segurança (polling) para NUNCA perder uma
  // mensagem — sua ou do bot — mesmo se o realtime falhar/atrasar.
  function mergeServerMessages(rows: WhatsappMessageRow[]) {
    setMessages((prev) => {
      const temps = prev.filter(
        (t) => t.id.startsWith("temp-") && !rows.some((d) => d.direction === t.direction && (d.text || "") === (t.text || ""))
      );
      const combined = [...rows, ...temps];
      combined.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      // Só re-renderiza/rola se algo mudou de fato.
      const changed = combined.length !== prev.length || combined.some((m, i) => prev[i]?.id !== m.id);
      if (changed) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
      return changed ? combined : prev;
    });
  }

  // Rede de segurança: enquanto uma conversa está aberta, revalida as mensagens
  // a cada 2s. Garante que mensagens enviadas (por mim ou pelo bot, incl. áudio)
  // apareçam rápido mesmo que o evento realtime não chegue.
  useEffect(() => {
    if (!supabase || !selConvId) return;
    const client = supabase;
    const poll = setInterval(async () => {
      const { data } = await client.from("whatsapp_messages").select("*").eq("conversation_id", selConvId).order("at");
      if (data) mergeServerMessages(data);
    }, 2000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selConvId]);
  // Salva a conversa aberta como arquivo de texto (backup/registro).
  // Log do contato: relatórios que o robô gerou dos atendimentos (bot e manual).
  async function openContactLog() {
    setChatMenu(false);
    if (!supabase || !selConv?.contacts) return;
    setShowLog(true);
    const { data } = await supabase
      .from("contact_reports")
      .select("id, summary, rating, sentiment, handled_by, created_at")
      .eq("contact_id", selConv.contacts.id)
      .order("created_at", { ascending: false });
    setReports((data as ContactReport[]) ?? []);
  }

  function saveConversation() {
    setChatMenu(false);
    if (!selConv) return;
    const who = contactLabel(selConv.contacts);
    const lines = messages.map((m) => {
      const at = new Date(m.at).toLocaleString("pt-BR");
      const from = m.direction === "in" ? who : "Nós";
      const body = m.text || (m.media_type ? `[${m.media_type}] ${m.media_name || ""}`.trim() : "");
      return `[${at}] ${from}: ${body}`;
    });
    const header = `Conversa com ${who}${selConv.contacts?.phone ? ` (${selConv.contacts.phone})` : ""}\nProtocolo #${selConv.protocol}\nExportado em ${new Date().toLocaleString("pt-BR")}\n${"-".repeat(40)}\n`;
    const blob = new Blob([header + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conversa-${who.replace(/[^\w]+/g, "_")}-${selConv.protocol}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Limpa (apaga) as mensagens da conversa aberta. Não apaga o contato.
  async function clearConversation() {
    setChatMenu(false);
    if (!supabase || !selConv) return;
    if (!confirm(`Limpar todas as mensagens desta conversa com ${contactLabel(selConv.contacts)}? Isso não pode ser desfeito.`)) return;
    await supabase.from("whatsapp_messages").delete().eq("conversation_id", selConv.id);
    await supabase.from("conversations").update({ last_message: null, last_message_at: null }).eq("id", selConv.id);
    setMessages([]);
    loadConversations();
  }

  // Finaliza o atendimento (a etiqueta some).
  async function finalizeConv() {
    if (!supabase || !selConv) return;
    await supabase.from("conversations").update({ status: "fechado", closed_at: new Date().toISOString() }).eq("id", selConv.id);
    loadConversations();
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

  // Inicia uma conversa a partir de um número de telefone (novo contato ou já existente).
  async function startChat(rawPhone: string, name: string, chosenNumberId?: string | null) {
    if (!supabase) return;
    let phone = rawPhone.replace(/\D/g, "");
    if (!phone) {
      alert("Digite um número de telefone válido.");
      return;
    }
    // Sem código do país e com cara de número BR → assume Brasil (55).
    if (phone.length <= 11 && !phone.startsWith("55")) phone = "55" + phone;

    const { data: found } = await supabase.from("contacts").select("*").eq("phone", phone).limit(1);
    let contactId = found?.[0]?.id as string | undefined;
    if (!contactId) {
      const { data: created, error } = await supabase.from("contacts").insert({ phone, name: name.trim() || null }).select("*").single();
      if (error || !created) {
        alert("Erro ao criar contato: " + (error?.message ?? "desconhecido"));
        return;
      }
      contactId = created.id;
    } else if (name.trim() && !found?.[0]?.name) {
      await supabase.from("contacts").update({ name: name.trim() }).eq("id", contactId);
    }

    const numberId =
      chosenNumberId ??
      (activeNumberId ? numbers.find((n) => n.id === activeNumberId) : numbers.find((n) => n.status === "connected"))?.id ??
      numbers[0]?.id ??
      null;

    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .neq("status", "fechado")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    let convId = existingConv?.[0]?.id as string | undefined;
    if (!convId) {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ contact_id: contactId, number_id: numberId, status: "atendendo" })
        .select("id")
        .single();
      if (error || !newConv) {
        alert("Erro ao abrir conversa: " + (error?.message ?? "desconhecido"));
        return;
      }
      convId = newConv.id;
    }
    await loadConversations();
    setShowNewChat(false);
    setServer(numberId ? `wa:${numberId}` : "whatsapp");
    if (convId) openConv(convId);
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  const selConv = selConvId ? conversations.find((c) => c.id === selConvId) ?? null : null;
  const selColleague = selColleagueId ? colleagues.find((c) => c.id === selColleagueId) ?? null : null;
  const connectedCount = numbers.filter((n) => n.status === "connected").length;
  const activeNumberId = server.startsWith("wa:") ? server.slice(3) : null;
  // Número desta conversa; senão o número do "servidor" ativo; senão o conectado.
  const selNumber = selConv?.number_id
    ? numbers.find((n) => n.id === selConv.number_id) ?? null
    : activeNumberId
    ? numbers.find((n) => n.id === activeNumberId) ?? null
    : numbers.find((n) => n.status === "connected") ?? numbers[0] ?? null;
  const botOn = Boolean(selNumber?.auto_reply);

  async function toggleBot() {
    if (!supabase || !selNumber) {
      alert("Conecte um número de WhatsApp primeiro (botão de engrenagem).");
      return;
    }
    const next = !selNumber.auto_reply;
    if (!next) {
      setNumbers((prev) => prev.map((n) => (n.id === selNumber.id ? { ...n, auto_reply: false } : n)));
      await supabase.from("whatsapp_numbers").update({ auto_reply: false }).eq("id", selNumber.id);
      return;
    }
    // Ligar: garante um chatbot vinculado e ATIVADO neste número.
    let chatbotId = selNumber.chatbot_id;
    let apiKeyOk = false;
    const { data: bots } = await supabase.from("chatbots").select("*").order("created_at");
    let bot = chatbotId ? bots?.find((b) => b.id === chatbotId) : bots?.[0];
    if (!bot) {
      const { data: created } = await supabase
        .from("chatbots")
        .insert({
          name: "Assistente",
          enabled: true,
          provider: "anthropic",
          persona: "assistente virtual de atendimento",
          greeting: "Olá! 👋 Sou o assistente virtual. Como posso te ajudar hoje?",
          instructions:
            "Fale em português do Brasil, simpático e natural. Mensagens CURTAS (1-2 frases), como no WhatsApp. Uma pergunta por vez. Entenda rápido o que a pessoa precisa e com quem quer falar (setor/assunto). Quando entender, confirme em uma frase e diga que vai encaminhar. Nunca invente; se não souber, chame um atendente humano.",
        })
        .select("*")
        .single();
      bot = created ?? undefined;
    }
    if (bot) {
      chatbotId = bot.id;
      apiKeyOk = Boolean(bot.api_key && bot.api_key.trim());
      if (!bot.enabled) await supabase.from("chatbots").update({ enabled: true }).eq("id", bot.id);
    }
    setNumbers((prev) => prev.map((n) => (n.id === selNumber.id ? { ...n, auto_reply: true, chatbot_id: chatbotId } : n)));
    await supabase.from("whatsapp_numbers").update({ auto_reply: true, chatbot_id: chatbotId }).eq("id", selNumber.id);
    if (!apiKeyOk) {
      alert("Bot ligado! Só falta a chave de IA: vá em Configurações → Chatbot e cole uma API key (Anthropic ou Gemini).");
    }
  }

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
    // Bolha otimista da mídia enviada — aparece na hora.
    const temp: WhatsappMessageRow = {
      id: `temp-${Date.now()}`,
      conversation_id: selConv.id,
      direction: "out",
      text: caption || null,
      media_type: media.type,
      media_url: media.url,
      media_name: media.name,
      media_mime: media.mime,
      sender_id: profile?.id ?? null,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    scrollBottom();
    const headers = await authHeaders();
    await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ to: selConv.contacts.jid || selConv.contacts.phone, senderId: profile?.id, numberId: selConv.number_id, media, text: caption || undefined }),
    });
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
    // Envio INSTANTÂNEO: limpa o campo já e manda em segundo plano; a mensagem
    // enviada aparece sozinha pelo realtime (sem esperar a resposta do servidor).
    const text = input.trim();
    const to = selConv.contacts.jid || selConv.contacts.phone;
    const numberId = selConv.number_id;
    setInput("");
    // Bolha otimista: aparece NA HORA (não espera o servidor nem o realtime).
    const temp: WhatsappMessageRow = {
      id: `temp-${Date.now()}`,
      conversation_id: selConv.id,
      direction: "out",
      text,
      media_type: null,
      media_url: null,
      media_name: null,
      media_mime: null,
      sender_id: profile?.id ?? null,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    scrollBottom();
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ to, text, senderId: profile?.id, numberId }),
        });
        const data = await res.json();
        if (!data.success) {
          alert(data.message ?? "Erro ao enviar. Algum número conectado?");
          setInput((cur) => cur || text); // devolve o texto se falhou
        }
      } catch {
        alert("Erro ao enviar a mensagem.");
        setInput((cur) => cur || text);
      }
    })();
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

  // Contagem de não-lidas por número (para a bolinha no rail) e total.
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + (b || 0), 0), [unread]);
  const unreadByNumber = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of conversations) {
      const u = unread[c.id] || 0;
      if (u && c.number_id) m[c.number_id] = (m[c.number_id] || 0) + u;
    }
    return m;
  }, [conversations, unread]);

  // "servidor" atual: "whatsapp" = todas; "wa:<numeroId>" = só desse número;
  // "<grupoId>" = só desse grupo. (activeNumberId definido acima)
  const visibleConvs = useMemo(() => {
    const q = query.toLowerCase();
    return conversations.filter((c) => {
      if (activeNumberId) {
        if (c.number_id !== activeNumberId) return false;
      } else if (server !== "whatsapp" && server !== "equipe" && c.group_id !== server) {
        return false;
      }
      return !q || contactLabel(c.contacts).toLowerCase().includes(q);
    });
  }, [conversations, query, server, activeNumberId]);

  const currentGroupName = activeNumberId
    ? numbers.find((n) => n.id === activeNumberId)?.label ?? "Número"
    : server === "whatsapp"
    ? "Conversas"
    : groups.find((g) => g.id === server)?.name ?? "Grupo";

  async function deleteGroup(id: string) {
    if (!supabase) return;
    if (!confirm("Excluir este grupo? As conversas voltam para 'sem grupo'.")) return;
    await supabase.from("contact_groups").delete().eq("id", id);
    if (server === id) setServer("whatsapp");
    loadSide();
    loadConversations();
  }

  const thread = selConv ? messages : selColleague ? internal : [];

  return (
    <div className="h-full flex overflow-hidden rounded-2xl liquid-glass">
      {/* Rail de servidores (grupos ficam separados aqui) */}
      <div className="w-16 shrink-0 bg-black/30 flex flex-col items-center py-3 gap-2 border-r border-white/10 overflow-y-auto custom-scroll">
        <ServerIcon active={server === "whatsapp"} onClick={() => setServer("whatsapp")} title="WhatsApp — todas as conversas" badge={totalUnread}>
          <MessageSquare size={20} />
        </ServerIcon>
        {/* Um ícone por número de WhatsApp: acesso múltiplo, todos no mesmo lugar */}
        {numbers.map((n) => (
          <ServerIcon
            key={n.id}
            active={server === `wa:${n.id}`}
            onClick={() => setServer(`wa:${n.id}`)}
            badge={unreadByNumber[n.id] || 0}
            title={`${n.label}${n.phone_number ? ` (${n.phone_number})` : ""} — ${n.status === "connected" ? "conectado" : "desconectado"}`}
          >
            <span className="relative">
              <span className="text-sm font-bold">{(n.label || "W").charAt(0).toUpperCase()}</span>
              <span
                className={`absolute -bottom-1 -right-1.5 w-2 h-2 rounded-full border border-black/40 ${
                  n.status === "connected" ? "bg-emerald-500" : "bg-gray-500"
                }`}
              />
            </span>
          </ServerIcon>
        ))}
        <ServerIcon active={showConnect} onClick={() => setShowConnect(true)} title="Adicionar / conectar número de WhatsApp">
          <Plug size={16} />
        </ServerIcon>
        <div className="w-8 h-px bg-white/10 my-1" />
        <ServerIcon active={server === "equipe"} onClick={() => setServer("equipe")} title="Equipe (interno)">
          <Users size={20} />
        </ServerIcon>
        <div className="w-8 h-px bg-white/10 my-1" />
        {groups.map((g) => (
          <ServerIcon key={g.id} active={server === g.id} onClick={() => setServer(g.id)} title={g.name}>
            <span className="text-sm font-bold">{g.name.charAt(0).toUpperCase()}</span>
          </ServerIcon>
        ))}
        <ServerIcon active={false} onClick={newGroup} title="Novo grupo">
          <Plus size={18} />
        </ServerIcon>
      </div>

      {/* Coluna de canais/contatos */}
      <div className="w-64 shrink-0 flex flex-col overflow-hidden border-r border-white/10 bg-black/10">
        <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold truncate">{server === "equipe" ? "Equipe" : currentGroupName}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {server !== "equipe" && (
                <button
                  onClick={() => setShowNewChat(true)}
                  title="Nova conversa (adicionar número de telefone)"
                  className="text-gray-400 hover:text-emerald-400 cursor-pointer"
                >
                  <UserPlus size={15} />
                </button>
              )}
              {server !== "equipe" && (
                <button
                  onClick={() => setShowConnect(true)}
                  title={connectedCount > 0 ? `${connectedCount} número(s) conectado(s) — configurar` : "Conectar o WhatsApp"}
                  className="flex items-center gap-1 text-gray-400 hover:text-emerald-400 cursor-pointer"
                >
                  <span className={`w-2 h-2 rounded-full ${connectedCount > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                  <Plug size={14} />
                </button>
              )}
              {server !== "whatsapp" && server !== "equipe" && !activeNumberId && (
                <button onClick={() => deleteGroup(server)} title="Excluir grupo" className="text-gray-500 hover:text-red-400 cursor-pointer">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
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

          {server !== "equipe" && visibleConvs.length === 0 && (
            <p className="text-[11px] text-gray-500 p-3 text-center">
              {server === "whatsapp"
                ? "Nenhuma conversa ainda."
                : activeNumberId
                ? "Nenhuma conversa neste número ainda."
                : "Nenhuma conversa neste grupo. Passe o mouse numa conversa (no WhatsApp) e escolha este grupo."}
            </p>
          )}
          {server !== "equipe" &&
            visibleConvs.map((c) => (
              <div key={c.id} className={`group flex items-center gap-2 px-2 mx-1 rounded-lg hover:bg-white/5 ${selConvId === c.id ? "bg-emerald-950/30" : ""}`}>
                <button onClick={() => openConv(c.id)} className="flex items-center gap-2 flex-1 min-w-0 py-1.5 text-left cursor-pointer">
                  {c.contacts?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.contacts.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-900/60 flex items-center justify-center text-[11px] font-bold shrink-0">
                      {contactLabel(c.contacts).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate leading-tight">{contactLabel(c.contacts)}</p>
                    {c.status === "espera" || c.status === "atendendo" ? (
                      <div className="mt-0.5"><StatusTag status={c.status} small /></div>
                    ) : (
                      <p className="text-[10px] text-gray-500 truncate">{c.last_message || "—"}</p>
                    )}
                  </div>
                  {(unread[c.id] || 0) > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unread[c.id] > 99 ? "99+" : unread[c.id]}
                    </span>
                  )}
                </button>
                {groups.length > 0 && (
                  <select
                    value={c.group_id ?? ""}
                    onChange={(e) => moveConv(c.id, e.target.value || null)}
                    title="Mover para grupo"
                    className="opacity-0 group-hover:opacity-100 bg-transparent text-[10px] text-gray-400 cursor-pointer outline-none max-w-[64px]"
                  >
                    <option value="">— sem grupo</option>
                    {groups.map((gr) => (
                      <option key={gr.id} value={gr.id}>{gr.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
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
              <button
                onClick={() => selConv && setShowProfile(true)}
                disabled={!selConv}
                title={selConv ? "Ver perfil do contato" : undefined}
                className={`flex items-center gap-2.5 min-w-0 flex-1 text-left ${selConv ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              >
                {selConv ? (
                  selConv.contacts?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selConv.contacts.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-900/60 flex items-center justify-center text-xs font-bold shrink-0">
                      {contactLabel(selConv.contacts).charAt(0).toUpperCase()}
                    </div>
                  )
                ) : (
                  <Users size={16} className="text-emerald-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{selConv ? contactLabel(selConv.contacts) : selColleague?.full_name ?? selColleague?.email}</p>
                  {selConv && (selConv.status === "espera" || selConv.status === "atendendo") && (
                    <div className="mt-0.5"><StatusTag status={selConv.status} small /></div>
                  )}
                </div>
              </button>
              {selConv && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {selConv.status !== "fechado" && (
                    <button
                      onClick={finalizeConv}
                      title="Finalizar atendimento (a etiqueta some)"
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg cursor-pointer bg-white/5 text-gray-300 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                      <Check size={12} /> Finalizar
                    </button>
                  )}
                  <button
                    onClick={toggleBot}
                    title={botOn ? "Bot ligado — responde os clientes sozinho. Clique para desligar." : "Bot desligado. Clique para o robô responder automaticamente."}
                    className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                      botOn ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <Bot size={12} /> {botOn ? "Bot ON" : "Bot OFF"}
                  </button>
                  <button
                    onClick={() => setShowBotSetup(true)}
                    title="Escolher tipo de automação do WhatsApp para este número"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-sky-300 cursor-pointer"
                  >
                    <Bot size={15} />
                  </button>
                  <button
                    onClick={() => setShowConnect(true)}
                    title="Configurar / conectar WhatsApp"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 cursor-pointer"
                  >
                    <Plug size={15} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setChatMenu((v) => !v)}
                      title="Opções da conversa"
                      className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 cursor-pointer"
                    >
                      <MoreVertical size={15} />
                    </button>
                    {chatMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setChatMenu(false)} />
                        <div className="absolute right-0 top-9 z-50 w-44 bg-[#0b0f16] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1">
                          <button onClick={openContactLog} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 cursor-pointer flex items-center gap-2">
                            <FileText size={13} className="text-sky-400" /> Histórico do contato
                          </button>
                          <button onClick={saveConversation} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 cursor-pointer flex items-center gap-2">
                            <Download size={13} className="text-emerald-400" /> Salvar conversa
                          </button>
                          <button onClick={clearConversation} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 cursor-pointer flex items-center gap-2 text-red-300">
                            <Trash2 size={13} /> Limpar conversa
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
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

            <div className="p-3 border-t border-white/10 flex items-center gap-2 shrink-0 relative">
              {showEmoji && (
                <div className="absolute bottom-full left-2 mb-2 w-72 max-h-52 overflow-y-auto custom-scroll bg-[#111826] border border-white/10 rounded-xl p-2 grid grid-cols-8 gap-0.5 shadow-2xl z-20">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { setInput((v) => v + e); setShowEmoji(false); }}
                      className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowEmoji((v) => !v)} className={`p-2.5 rounded-lg cursor-pointer ${showEmoji ? "bg-white/10 text-emerald-400" : "hover:bg-white/10 text-gray-300"}`}>
                <Smile size={18} />
              </button>
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

      {/* Configurações / conectar WhatsApp (mesmo gerenciador de números) */}
      {showConnect && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowConnect(false)}>
          <div
            className="w-full max-w-5xl h-[80vh] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plug size={16} className="text-emerald-400" /> Conectar / configurar WhatsApp
              </h3>
              <button onClick={() => setShowConnect(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <WhatsappTab profile={profile} />
            </div>
          </div>
        </div>
      )}

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onStart={startChat}
          numbers={numbers.filter((n) => n.status === "connected")}
          forcedNumberId={activeNumberId}
        />
      )}
      {showBotSetup && selNumber && (
        <BotAutomationModal
          number={selNumber}
          onClose={() => setShowBotSetup(false)}
          onSaved={(mode) => {
            setNumbers((prev) => prev.map((n) => (n.id === selNumber.id ? { ...n, bot_mode: mode, auto_reply: true } : n)));
            setShowBotSetup(false);
          }}
        />
      )}
      {showProfile && selConv?.contacts && (
        <ContactProfileModal
          contact={selConv.contacts}
          canManage={profile?.role === "gestor" || profile?.role === "gerente"}
          onClose={() => setShowProfile(false)}
          onSaved={() => {
            loadConversations();
            setShowProfile(false);
          }}
        />
      )}

      {showLog && selConv?.contacts && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowLog(false)}>
          <div className="w-full max-w-md bg-[#0b0f16] border border-white/10 rounded-2xl p-5 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileText size={16} className="text-sky-400" /> Histórico de {contactLabel(selConv.contacts)}
              </h3>
              <button onClick={() => setShowLog(false)} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">Relatórios que a IA gerou de cada atendimento (por bot ou manual).</p>
            <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
              {reports.length === 0 && <p className="text-xs text-gray-500 italic text-center py-8">Ainda não há relatórios para este contato. Aparecem quando um atendimento é encerrado.</p>}
              {reports.map((r) => (
                <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-500">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    <div className="flex items-center gap-2">
                      {r.handled_by && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${r.handled_by === "bot" ? "bg-indigo-950/60 text-indigo-300" : "bg-emerald-950/60 text-emerald-300"}`}>
                          {r.handled_by === "bot" ? "Bot" : "Humano"}
                        </span>
                      )}
                      {typeof r.rating === "number" && (
                        <span className="flex items-center gap-0.5 text-amber-400 text-[11px]">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={11} className={i < (r.rating ?? 0) ? "fill-amber-400" : "text-gray-600"} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.sentiment && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-2 ${r.sentiment === "positivo" ? "bg-emerald-950/60 text-emerald-300" : r.sentiment === "negativo" ? "bg-red-950/60 text-red-300" : "bg-gray-800 text-gray-300"}`}>
                      {r.sentiment}
                    </span>
                  )}
                  <p className="text-xs text-gray-200 mt-1 whitespace-pre-wrap">{r.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewChatModal({
  onClose,
  onStart,
  numbers,
  forcedNumberId,
}: {
  onClose: () => void;
  onStart: (phone: string, name: string, numberId?: string | null) => void | Promise<void>;
  numbers: WhatsappNumber[];
  forcedNumberId: string | null;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Se um número já está selecionado no painel, usa ele; senão pergunta.
  const [numberId, setNumberId] = useState<string>(forcedNumberId ?? numbers[0]?.id ?? "");
  const forcedNumber = forcedNumberId ? numbers.find((n) => n.id === forcedNumberId) ?? null : null;
  const needsPick = !forcedNumberId && numbers.length > 1;
  async function go() {
    if (!phone.trim() || busy) return;
    setBusy(true);
    try {
      await onStart(phone, name, forcedNumberId ?? (numberId || null));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <UserPlus size={16} className="text-emerald-400" /> Nova conversa
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">
            <X size={16} />
          </button>
        </div>
        {needsPick ? (
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-400">Salvar neste número</label>
            <select
              value={numberId}
              onChange={(e) => setNumberId(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
            >
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}{n.phone_number ? ` · ${n.phone_number}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : forcedNumber ? (
          <p className="text-[11px] text-gray-400">
            Salvando em <span className="text-emerald-400 font-semibold">{forcedNumber.label}</span>
          </p>
        ) : null}
        <div className="space-y-1.5">
          <label className="text-[11px] text-gray-400 flex items-center gap-1"><Phone size={11} /> Número de telefone (com DDD)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Ex.: 11 91234-5678"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] text-gray-400">Nome (opcional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Como salvar este contato"
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
        <p className="text-[10px] text-gray-500">Sem o código do país, assumimos Brasil (+55).</p>
        <button
          onClick={go}
          disabled={!phone.trim() || busy}
          className="w-full text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
        >
          {busy ? "Abrindo..." : "Iniciar conversa"}
        </button>
      </div>
    </div>
  );
}

// Tipos de automação de WhatsApp que o robô pode assumir por número.
const BOT_MODES: { id: string; title: string; desc: string; emoji: string }[] = [
  { id: "ai", title: "Atendimento inteligente (IA)", desc: "O robô lê a mensagem e responde sozinho usando a IA e o cérebro da empresa.", emoji: "🧠" },
  { id: "triage", title: "Triagem por setor", desc: "O robô recebe, descobre o assunto e encaminha para o setor certo — tudo no mesmo chat.", emoji: "🔀" },
  { id: "menu", title: "Menu de opções (URA)", desc: "Envia um menu (1, 2, 3…) e direciona o cliente conforme a escolha.", emoji: "🔢" },
  { id: "faq", title: "Perguntas frequentes", desc: "Responde automaticamente dúvidas comuns e só chama um humano quando não sabe.", emoji: "💬" },
  { id: "label", title: "Só etiquetar", desc: "Não responde: apenas classifica e etiqueta o contato para a equipe atender.", emoji: "🏷️" },
  { id: "off", title: "Desligado", desc: "Nenhuma automação. Todo atendimento é manual.", emoji: "✋" },
];

function BotAutomationModal({
  number,
  onClose,
  onSaved,
}: {
  number: WhatsappNumber;
  onClose: () => void;
  onSaved: (mode: string) => void;
}) {
  const [sel, setSel] = useState<string>(number.auto_reply ? number.bot_mode || "ai" : "off");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase || busy) return;
    setBusy(true);
    const autoReply = sel !== "off";
    const { error } = await supabase
      .from("whatsapp_numbers")
      .update({ bot_mode: sel === "off" ? null : sel, auto_reply: autoReply })
      .eq("id", number.id);
    setBusy(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    if (autoReply && (sel === "ai" || sel === "faq" || sel === "triage")) {
      // Esses modos usam IA — lembra de configurar a chave.
    }
    onSaved(sel === "off" ? "" : sel);
  }
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0b0f16] border border-white/10 rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto custom-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Bot size={16} className="text-sky-400" /> Automação do WhatsApp
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          Escolha como o robô atende no número <span className="text-white font-semibold">{number.label}</span>.
        </p>
        <div className="space-y-2">
          {BOT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setSel(m.id)}
              className={`w-full text-left rounded-xl p-3 border transition-all cursor-pointer flex items-start gap-3 ${
                sel === m.id ? "border-sky-500 bg-sky-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"
              }`}
            >
              <span className="text-xl leading-none shrink-0">{m.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{m.title}</p>
                <p className="text-[11px] text-gray-400">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500">
          Modos com IA precisam de uma chave em Configurações → Chatbot. Persona, saudação e conhecimento também ficam lá.
        </p>
        <button
          onClick={save}
          disabled={busy}
          className="w-full text-sm px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer disabled:opacity-50"
        >
          {busy ? "Salvando..." : "Aplicar automação"}
        </button>
      </div>
    </div>
  );
}

function ContactProfileModal({
  contact,
  canManage,
  onClose,
  onSaved,
}: {
  contact: Pick<Contact, "id" | "name" | "phone" | "jid" | "avatar_url" | "copilot_access">;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(contact.name ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copilot, setCopilot] = useState(Boolean(contact.copilot_access));
  const phoneDigits = (contact.phone || "").replace(/\D/g, "");
  const phonePretty = phoneDigits ? "+" + phoneDigits : "—";

  async function save() {
    if (!supabase) return;
    setSaving(true);
    await supabase.from("contacts").update({ name: name.trim() || null }).eq("id", contact.id);
    setSaving(false);
    onSaved();
  }

  async function toggleCopilot() {
    if (!supabase) return;
    const next = !copilot;
    // Ligar o copiloto pede senha (dá acesso da IA ao workspace por esse contato).
    if (next) {
      const pw = window.prompt("Digite a senha para liberar o Copiloto IA no WhatsApp deste contato:");
      if (pw !== "1qaz2wsx") {
        if (pw !== null) alert("Senha incorreta.");
        return;
      }
    }
    setCopilot(next);
    await supabase.from("contacts").update({ copilot_access: next }).eq("id", contact.id);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold">Perfil do contato</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 cursor-pointer text-gray-300">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col items-center gap-3">
          {contact.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-emerald-900/60 flex items-center justify-center text-2xl font-bold">
              {contactLabel(contact).charAt(0).toUpperCase()}
            </div>
          )}
          {editing ? (
            <div className="w-full flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none text-center"
                autoFocus
              />
              <button onClick={save} disabled={saving} className="text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
                {saving ? "..." : "Salvar"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-base font-bold cursor-pointer hover:opacity-80" title="Editar nome">
              {contactLabel(contact)} <Pencil size={13} className="text-gray-400" />
            </button>
          )}
        </div>
        <div className="px-5 pb-5 space-y-2">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
            <Phone size={14} className="text-emerald-400 shrink-0" />
            <span className="text-sm">{phonePretty}</span>
          </div>
          {canManage && (
            <button
              onClick={toggleCopilot}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 border cursor-pointer transition-colors ${
                copilot ? "border-indigo-500 bg-indigo-950/30" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
              title="Dá a este contato acesso ao Copiloto IA pelo WhatsApp (com acesso ao workspace e arquivos)"
            >
              <span className="flex items-center gap-2 text-sm">
                <Bot size={14} className={copilot ? "text-indigo-300" : "text-gray-400"} /> Copiloto IA no WhatsApp
              </span>
              <span className={`text-[11px] font-semibold ${copilot ? "text-indigo-300" : "text-gray-500"}`}>{copilot ? "LIGADO" : "desligado"}</span>
            </button>
          )}
          {phoneDigits && (
            <a
              href={`https://wa.me/${phoneDigits}`}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-[11px] text-gray-500 hover:text-emerald-400"
            >
              Abrir no WhatsApp (wa.me)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerIcon({ active, onClick, title, children, badge = 0 }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode; badge?: number }) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        title={title}
        className={`w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer transition-all ${
          active ? "bg-emerald-600 text-white rounded-xl" : "bg-white/5 text-gray-400 hover:bg-emerald-600/30 hover:text-white hover:rounded-xl"
        }`}
      >
        {children}
      </button>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0b0f16]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </div>
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
