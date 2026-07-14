import express from "express";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
  proto,
} from "baileys";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const SERVICE_SECRET = process.env.WHATSAPP_SERVICE_SECRET || "";
const AUTH_ROOT = path.join(__dirname, "..", ".wa-session");

// service_role bypasses RLS — this process has no logged-in app user, so it
// needs full write access to the contacts/conversations/messages tables.
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Fallback env key used only if a chatbot has no key of its own.
const fallbackAnthropicKey = process.env.ANTHROPIC_API_KEY || null;

// One live Baileys socket per WhatsApp number id.
// sessions: Map<numberId, { sock, state, starting }>
const sessions = new Map();

function blankState(numberId) {
  return {
    numberId,
    status: "disconnected", // disconnected | connecting | qr_pending | connected
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
  };
}

function getSession(numberId) {
  let s = sessions.get(numberId);
  if (!s) {
    s = { sock: null, state: blankState(numberId), starting: false };
    sessions.set(numberId, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
async function companyName() {
  if (!supabase) return "a empresa";
  const { data } = await supabase.from("company_settings").select("name").eq("id", true).maybeSingle();
  return data?.name ?? "a empresa";
}

async function getNumberConfig(numberId) {
  if (!supabase || !numberId) return { number: null, chatbot: null };
  const { data: number } = await supabase.from("whatsapp_numbers").select("*").eq("id", numberId).maybeSingle();
  let chatbot = null;
  if (number?.chatbot_id) {
    const { data } = await supabase.from("chatbots").select("*").eq("id", number.chatbot_id).maybeSingle();
    chatbot = data;
  }
  return { number, chatbot };
}

const novoContatoTagByCompany = new Map();
async function ensureNovoContatoTag(companyId) {
  if (!supabase || !companyId) return null;
  if (novoContatoTagByCompany.has(companyId)) return novoContatoTagByCompany.get(companyId);
  let { data } = await supabase
    .from("tags")
    .select("id")
    .eq("name", "Novo contato")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) {
    const ins = await supabase
      .from("tags")
      .insert({ name: "Novo contato", color: "#f59e0b", company_id: companyId })
      .select("id")
      .maybeSingle();
    data = ins.data ?? null;
  }
  const id = data?.id ?? null;
  novoContatoTagByCompany.set(companyId, id);
  return id;
}

async function upsertContact(phone, name = null, companyId = null, jid = null) {
  if (!supabase) return null;
  // Dedup: casa pelo telefone OU pelo JID (mesma pessoa pode chegar como
  // telefone e como @lid). Assim NÃO cria contato/conversa duplicados.
  let existing = null;
  {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .maybeSingle();
    existing = data;
  }
  if (!existing && jid) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .eq("jid", jid)
      .maybeSingle();
    existing = data;
  }
  if (existing) {
    const patch = {};
    if (name && !existing.name) patch.name = name;
    if (jid && !existing.jid) patch.jid = jid; // guarda o JID real p/ envio confiável
    if (Object.keys(patch).length) {
      await supabase.from("contacts").update(patch).eq("id", existing.id);
      Object.assign(existing, patch);
    }
    return existing;
  }
  const { data } = await supabase
    .from("contacts")
    .insert({ phone, name, company_id: companyId, jid })
    .select("*")
    .single();
  // Auto-etiqueta o contato recém-criado.
  const tagId = await ensureNovoContatoTag(companyId);
  if (data && tagId) {
    await supabase.from("contact_tags").insert({ contact_id: data.id, tag_id: tagId, company_id: companyId }).then(
      () => {},
      () => {}
    );
  }
  return data;
}

// Sincroniza a agenda de contatos do WhatsApp para a tabela `contacts`,
// para o usuário ver seus contatos assim que conectar (como no WhatsApp Web).
async function syncContacts(list, companyId) {
  if (!supabase || !companyId || !Array.isArray(list) || list.length === 0) return;
  const withName = [];
  const phoneOnly = [];
  const seen = new Set();
  for (const c of list) {
    const id = c?.id || c?.jid;
    if (!id || !id.endsWith("@s.whatsapp.net")) continue;
    const phone = id.split("@")[0];
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const name = c.name || c.notify || c.verifiedName || null;
    if (name) withName.push({ phone, name, jid: id, company_id: companyId });
    else phoneOnly.push({ phone, jid: id, company_id: companyId });
  }
  try {
    for (let i = 0; i < withName.length; i += 200) {
      await supabase.from("contacts").upsert(withName.slice(i, i + 200), { onConflict: "company_id,phone" });
    }
    for (let i = 0; i < phoneOnly.length; i += 200) {
      await supabase
        .from("contacts")
        .upsert(phoneOnly.slice(i, i + 200), { onConflict: "company_id,phone", ignoreDuplicates: true });
    }
    if (withName.length || phoneOnly.length) {
      console.log(`Synced ${withName.length + phoneOnly.length} WhatsApp contacts`);
    }
  } catch (err) {
    console.error("Contact sync failed:", err);
  }
}

async function findOrCreateOpenConversation(contactId, numberId, sectorId, companyId) {
  if (!supabase) return { conversation: null, created: false };
  // Estilo WhatsApp: UMA conversa por pessoa. Reaproveita a conversa mais
  // recente do contato (qualquer status) em vez de abrir um novo "chamado".
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    // Se estava fechada, reabre a MESMA conversa (não duplica).
    if (existing.status === "fechado" || existing.status === "cancelado") {
      const { data: reopened } = await supabase
        .from("conversations")
        .update({ status: "espera", closed_at: null, number_id: numberId ?? existing.number_id })
        .eq("id", existing.id)
        .select("*")
        .single();
      return { conversation: reopened ?? existing, created: false };
    }
    return { conversation: existing, created: false };
  }
  const { data } = await supabase
    .from("conversations")
    .insert({
      contact_id: contactId,
      status: "espera",
      number_id: numberId ?? null,
      sector_id: sectorId ?? null,
      company_id: companyId ?? null,
    })
    .select("*")
    .single();
  return { conversation: data, created: true };
}

// Traz as conversas que já existem no WhatsApp para o site poder mostrá-las
// (entrar e continuar). Cria conversas como "atendendo" — nunca "espera" —
// para NÃO disparar notificação de "novo cliente". Roda ao conectar.
async function ingestHistory(messages, numberId, companyId, sectorId) {
  if (!supabase || !Array.isArray(messages) || messages.length === 0) return;
  // Agrupa por chat 1:1 e guarda a mensagem mais recente de cada um.
  const latestByJid = new Map();
  for (const m of messages) {
    const jid = m?.key?.remoteJid;
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
    const ts = Number(m.messageTimestamp || 0);
    const prev = latestByJid.get(jid);
    if (!prev || ts > prev.ts) latestByJid.set(jid, { m, ts });
  }
  let done = 0;
  for (const [jid, { m }] of latestByJid) {
    if (done >= 200) break; // limite de segurança
    try {
      const inner = m.message?.documentWithCaptionMessage?.message ?? m.message ?? {};
      const preview =
        inner.conversation ||
        inner.extendedTextMessage?.text ||
        (inner.imageMessage ? "📷 Foto" : inner.audioMessage ? "🎵 Áudio" : inner.videoMessage ? "🎥 Vídeo" : inner.documentMessage ? "📄 Arquivo" : "");
      if (!preview) continue;
      const isLid = jid.endsWith("@lid");
      const altJid = m.key.remoteJidAlt || null;
      const phone = isLid && altJid ? altJid.split("@")[0] : jid.split("@")[0];
      const contact = await upsertContact(phone, m.pushName || null, companyId, jid);
      if (!contact) continue;
      // Já existe alguma conversa (qualquer status)? então não recria.
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contact.id)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      const { data: conv } = await supabase
        .from("conversations")
        .insert({
          contact_id: contact.id,
          status: "atendendo",
          number_id: numberId ?? null,
          sector_id: sectorId ?? null,
          company_id: companyId ?? null,
        })
        .select("id")
        .single();
      if (conv) {
        await logMessage(conv.id, m.key.fromMe ? "out" : "in", preview, null, null, companyId);
        done++;
      }
    } catch {
      /* pula esse chat */
    }
  }
  if (done) console.log(`Ingeridas ${done} conversas do histórico do WhatsApp`);
}

function mediaLabel(media, fallbackText) {
  if (fallbackText) return fallbackText;
  if (!media) return null;
  return (
    { image: "📷 Foto", audio: "🎵 Áudio", video: "🎥 Vídeo", document: `📄 ${media.name || "Arquivo"}` }[media.type] ??
    "📎 Mídia"
  );
}

async function logMessage(conversationId, direction, text, senderId = null, media = null, companyId = null) {
  if (!supabase) return;
  const row = {
    conversation_id: conversationId,
    direction,
    text: mediaLabel(media, text) || null,
    sender_id: senderId,
    company_id: companyId,
  };
  if (media) {
    row.media_type = media.type;
    row.media_url = media.url;
    row.media_name = media.name || null;
    row.media_mime = media.mime || null;
  }
  await supabase.from("whatsapp_messages").insert(row);
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

// Logger silencioso para o downloadMediaMessage do Baileys.
const noopLogger = {
  level: "silent",
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return noopLogger;
  },
};

async function uploadMedia(buffer, mime, prefix) {
  if (!supabase) return null;
  const ext = ((mime || "application/octet-stream").split("/")[1] || "bin").split(";")[0].slice(0, 8);
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("wa-media")
    .upload(path, buffer, { contentType: mime || "application/octet-stream", upsert: false });
  if (error) {
    console.error("Media upload failed:", error);
    return null;
  }
  const { data } = supabase.storage.from("wa-media").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function firstConnectedNumberId() {
  for (const [id, s] of sessions) {
    if (s.state.status === "connected" && s.sock) return id;
  }
  return null;
}

async function setNumberStatus(numberId, status, phoneNumber) {
  if (!supabase || !numberId) return;
  const patch = { status, updated_at: new Date().toISOString() };
  if (phoneNumber !== undefined) patch.phone_number = phoneNumber;
  await supabase.from("whatsapp_numbers").update(patch).eq("id", numberId);
}

// ---------------------------------------------------------------------------
// AI providers (chatbot auto-reply)
// ---------------------------------------------------------------------------
// Monta o "cérebro" do robô a partir dos arquivos: a pasta do próprio chatbot
// (chatbot.folder_id e sua subárvore) + pastas liberadas pelo gestor
// (bot_share_status = 'approved'). Usa o texto dos arquivos e os nomes.
async function buildBotBrain(chatbot) {
  if (!supabase) return "";
  try {
    const { data: allFiles } = await supabase
      .from("files")
      .select("id,name,type,parent_id,text_content,chatbot_id,bot_share_status");
    if (!allFiles || allFiles.length === 0) return "";

    const byParent = new Map();
    for (const f of allFiles) {
      const list = byParent.get(f.parent_id) ?? [];
      list.push(f);
      byParent.set(f.parent_id, list);
    }
    const subtree = (rootId) => {
      const out = [];
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop();
        for (const child of byParent.get(cur) ?? []) {
          out.push(child);
          stack.push(child.id);
        }
      }
      return out;
    };

    // Pastas-raiz do cérebro: a pasta do chatbot + pastas aprovadas.
    const rootIds = new Set();
    if (chatbot?.folder_id) rootIds.add(chatbot.folder_id);
    for (const f of allFiles) {
      if (f.type === "folder" && f.bot_share_status === "approved") rootIds.add(f.id);
    }
    // Arquivos marcados diretamente com este chatbot também entram.
    const files = [];
    for (const f of allFiles) {
      if (f.type === "file" && chatbot?.id && f.chatbot_id === chatbot.id) files.push(f);
    }
    for (const rootId of rootIds) {
      for (const node of subtree(rootId)) {
        if (node.type === "file") files.push(node);
      }
    }

    const seen = new Set();
    const parts = [];
    let budget = 12000; // limite de caracteres para não estourar o contexto
    for (const f of files) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      if (f.text_content && budget > 0) {
        const snippet = f.text_content.slice(0, Math.min(3000, budget));
        parts.push(`### ${f.name}\n${snippet}`);
        budget -= snippet.length;
      } else {
        parts.push(`### ${f.name} (documento anexado)`);
      }
    }
    return parts.length ? `\n\nConhecimento das pastas da empresa (use como base de verdade):\n${parts.join("\n\n")}` : "";
  } catch (err) {
    console.error("buildBotBrain failed:", err);
    return "";
  }
}

// history: array de { role: 'user'|'assistant', text } com as mensagens
// anteriores da conversa — dá contexto ao bot p/ responder no mesmo tom/padrão.
async function runChatbotReply(chatbot, customerText, history = []) {
  const name = await companyName();
  const persona = chatbot?.persona ? `Você é ${chatbot.persona}.` : "";
  const instructions = chatbot?.instructions || "Responda de forma cordial, breve e humana.";
  const knowledge = chatbot?.knowledge ? `\n\nBase de conhecimento:\n${chatbot.knowledge}` : "";
  const brain = await buildBotBrain(chatbot);
  const system = `${persona}\nVocê atende clientes no WhatsApp da empresa ${name}.\n${instructions}\nUse o histórico da conversa para manter contexto e coerência com o atendimento anterior.${knowledge}${brain}`;

  const provider = chatbot?.provider || "anthropic";
  const key = chatbot?.api_key || (provider === "anthropic" ? fallbackAnthropicKey : null);
  if (!key) return null;

  const hist = Array.isArray(history) ? history.filter((h) => h && h.text) : [];

  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: key });
      const messages = [
        ...hist.map((h) => ({ role: h.role, content: [{ type: "text", text: h.text }] })),
        { role: "user", content: [{ type: "text", text: customerText }] },
      ];
      const res = await client.messages.create({ model: "claude-sonnet-5", max_tokens: 512, system, messages });
      const block = res.content.find((b) => b.type === "text");
      return block && "text" in block ? block.text : null;
    }
    if (provider === "gemini") {
      const contents = [
        ...hist.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
        { role: "user", parts: [{ text: customerText }] },
      ];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
        }
      );
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            ...hist.map((h) => ({ role: h.role, content: h.text })),
            { role: "user", content: customerText },
          ],
        }),
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;
    }
  } catch (err) {
    console.error("Chatbot reply failed:", err);
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auth state persistido no Supabase (sobrevive a reinícios/deploys)
// ---------------------------------------------------------------------------
async function useSupabaseAuthState(numberId) {
  const readKey = async (key) => {
    const { data } = await supabase
      .from("wa_auth")
      .select("value")
      .eq("number_id", numberId)
      .eq("key", key)
      .maybeSingle();
    if (!data?.value) return null;
    return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
  };
  const writeKey = async (key, value) => {
    const stored = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await supabase
      .from("wa_auth")
      .upsert({ number_id: numberId, key, value: stored, updated_at: new Date().toISOString() }, { onConflict: "number_id,key" });
  };
  const removeKey = async (key) => {
    await supabase.from("wa_auth").delete().eq("number_id", numberId).eq("key", key);
  };

  const creds = (await readKey("creds")) || initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      const result = {};
      await Promise.all(
        ids.map(async (id) => {
          let value = await readKey(`${type}-${id}`);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          result[id] = value;
        })
      );
      return result;
    },
    set: async (data) => {
      const tasks = [];
      for (const category of Object.keys(data)) {
        for (const id of Object.keys(data[category])) {
          const value = data[category][id];
          const key = `${category}-${id}`;
          tasks.push(value ? writeKey(key, value) : removeKey(key));
        }
      }
      await Promise.all(tasks);
    },
  };

  return {
    state: { creds, keys: makeCacheableSignalKeyStore(keys, noopLogger) },
    saveCreds: () => writeKey("creds", creds),
  };
}

async function clearSupabaseAuthState(numberId) {
  if (!supabase) return;
  await supabase.from("wa_auth").delete().eq("number_id", numberId);
}

// ---------------------------------------------------------------------------
// Baileys session lifecycle (per number)
// ---------------------------------------------------------------------------
async function startSession(numberId) {
  const s = getSession(numberId);
  if (s.starting || s.state.status === "connected") return s.state;
  s.starting = true;
  s.state.lastError = null;
  try {
    let authState, saveCreds;
    if (supabase) {
      ({ state: authState, saveCreds } = await useSupabaseAuthState(numberId));
    } else {
      const authDir = path.join(AUTH_ROOT, numberId);
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
      ({ state: authState, saveCreds } = await useMultiFileAuthState(authDir));
    }

    s.state.status = "connecting";
    await setNumberStatus(numberId, "connecting");
    const sock = makeWASocket({
      auth: authState,
      printQRInTerminal: false,
      // Traz o histórico recente das conversas ao conectar (para o site mostrar
      // as conversas que já existem no WhatsApp).
      syncFullHistory: true,
    });
    s.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    // Sincroniza a agenda de contatos do WhatsApp assim que conectar e a cada atualização.
    sock.ev.on("messaging-history.set", async ({ contacts, messages }) => {
      const { number } = await getNumberConfig(numberId);
      const cid = number?.company_id ?? null;
      await syncContacts(contacts, cid);
      await ingestHistory(messages, numberId, cid, number?.sector_id ?? null);
    });
    sock.ev.on("contacts.upsert", async (contacts) => {
      const { number } = await getNumberConfig(numberId);
      await syncContacts(contacts, number?.company_id ?? null);
    });
    sock.ev.on("contacts.update", async (contacts) => {
      const { number } = await getNumberConfig(numberId);
      await syncContacts(contacts, number?.company_id ?? null);
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        s.state.status = "qr_pending";
        s.state.qrDataUrl = await QRCode.toDataURL(qr);
        await setNumberStatus(numberId, "qr_pending");
      }
      if (connection === "open") {
        s.state.status = "connected";
        s.state.qrDataUrl = null;
        s.state.phoneNumber = sock?.user?.id?.split(":")[0] ?? null;
        await setNumberStatus(numberId, "connected", s.state.phoneNumber);
      }
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        s.state.status = "disconnected";
        s.state.qrDataUrl = null;
        await setNumberStatus(numberId, "disconnected", loggedOut ? null : undefined);
        if (!loggedOut) {
          s.starting = false;
          void startSession(numberId);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        // ignore groups / broadcasts — this is 1:1 customer support
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
        // Desembrulha documentos com legenda
        const inner = msg.message?.documentWithCaptionMessage?.message ?? msg.message ?? {};
        const mediaKind = inner.imageMessage
          ? "image"
          : inner.audioMessage
            ? "audio"
            : inner.videoMessage
              ? "video"
              : inner.documentMessage
                ? "document"
                : null;
        const node =
          inner.imageMessage || inner.audioMessage || inner.videoMessage || inner.documentMessage || null;
        const text =
          inner.conversation || inner.extendedTextMessage?.text || node?.caption || "";

        let media = null;
        if (mediaKind) {
          try {
            const buffer = await downloadMediaMessage(
              { key: msg.key, message: inner },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage, logger: noopLogger }
            );
            const url = await uploadMedia(buffer, node?.mimetype || null, "in");
            if (url) media = { type: mediaKind, url, name: node?.fileName || null, mime: node?.mimetype || null };
          } catch (err) {
            console.error("Failed to download incoming media:", err);
          }
        }

        if (!text && !media) continue;
        // No WhatsApp novo o remoteJid pode ser um LID (@lid). Guardamos o JID
        // real (para responder certo) e, quando dá, o telefone verdadeiro que
        // vem em remoteJidAlt.
        const isLid = jid.endsWith("@lid");
        const altJid = msg.key.remoteJidAlt || null;
        const phone = isLid && altJid ? altJid.split("@")[0] : jid.split("@")[0];
        const contactJid = jid; // responde pelo mesmo canal que recebeu

        try {
          const { number, chatbot } = await getNumberConfig(numberId);
          const cid = number?.company_id ?? null;
          const contact = await upsertContact(phone, msg.pushName || null, cid, contactJid);
          const { conversation, created } = await findOrCreateOpenConversation(
            contact.id,
            numberId,
            number?.sector_id ?? null,
            cid
          );
          await logMessage(conversation.id, "in", text, null, media, cid);

          const botOn = number?.auto_reply && chatbot?.enabled;
          if (botOn) {
            // Saudação apenas na abertura da conversa.
            if (created && chatbot?.greeting) {
              await sock.sendMessage(jid, { text: chatbot.greeting });
              await logMessage(conversation.id, "out", chatbot.greeting, null, null, cid);
            }
            // Puxa as últimas mensagens desta conversa p/ dar contexto ao bot.
            let history = [];
            try {
              const { data: prior } = await supabase
                .from("whatsapp_messages")
                .select("direction,text")
                .eq("conversation_id", conversation.id)
                .order("at", { ascending: false })
                .limit(12);
              history = (prior ?? [])
                .reverse()
                .filter((m) => m.text)
                .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", text: m.text }));
            } catch {
              /* sem histórico, segue sem contexto */
            }
            const reply = text ? await runChatbotReply(chatbot, text, history) : null;
            if (reply) {
              await sock.sendMessage(jid, { text: reply });
              await logMessage(conversation.id, "out", reply, null, null, cid);
            }
          }
        } catch (err) {
          console.error("Failed to process incoming message:", err);
        }
      }
    });
  } catch (err) {
    s.state.status = "disconnected";
    s.state.lastError = err instanceof Error ? err.message : String(err);
    await setNumberStatus(numberId, "disconnected");
  } finally {
    s.starting = false;
  }
  return s.state;
}

async function disconnectSession(numberId) {
  const s = getSession(numberId);
  if (s.sock) {
    try {
      await s.sock.logout();
    } catch {
      // tearing down anyway
    }
    s.sock = null;
  }
  s.state = blankState(numberId);
  await setNumberStatus(numberId, "disconnected", null);
  // apaga a sessão salva para o próximo connect pedir um novo QR
  await clearSupabaseAuthState(numberId);
  try {
    const authDir = path.join(AUTH_ROOT, numberId);
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

async function sendMessage(numberId, to, text, senderId, media) {
  // Se o número informado não estiver conectado, usa qualquer número conectado.
  let s = numberId ? getSession(numberId) : null;
  if (!s || !s.sock || s.state.status !== "connected") {
    const fid = firstConnectedNumberId();
    if (!fid) throw new Error("Nenhum número de WhatsApp conectado.");
    numberId = fid;
    s = getSession(fid);
  }

  // Resolve o JID de destino. O WhatsApp novo entrega/recebe por "@lid"
  // (identificador interno), não pelo telefone. Enviar um LID como
  // "<numero>@s.whatsapp.net" faz a mensagem "sumir" (aparece enviada, não chega).
  let jid;
  if (to.includes("@")) {
    // Já veio um JID completo (o app manda contact.jid) — usa como está.
    jid = to;
  } else {
    // Só dígitos: tenta confirmar como telefone real no WhatsApp.
    let resolved = null;
    try {
      const results = await s.sock.onWhatsApp(`${to}@s.whatsapp.net`);
      const hit = Array.isArray(results) ? results.find((r) => r?.exists) : null;
      if (hit) resolved = hit.jid; // JID canônico (corrige 9º dígito, etc.)
    } catch {
      /* verificação indisponível — cai no fallback abaixo */
    }
    // Se não é telefone válido e tem 14+ dígitos, é LID; senão assume telefone.
    jid = resolved || (to.replace(/\D/g, "").length >= 14 ? `${to}@lid` : `${to}@s.whatsapp.net`);
  }

  if (media?.url) {
    const resp = await fetch(media.url);
    if (!resp.ok) throw new Error("Não consegui baixar o arquivo para enviar.");
    const buf = Buffer.from(await resp.arrayBuffer());
    const mimetype = media.mime || undefined;
    let content;
    if (media.type === "image") content = { image: buf, caption: text || undefined, mimetype };
    else if (media.type === "audio") content = { audio: buf, mimetype: mimetype || "audio/mp4", ptt: true };
    else if (media.type === "video") content = { video: buf, caption: text || undefined, mimetype };
    else content = { document: buf, mimetype: mimetype || "application/octet-stream", fileName: media.name || "arquivo" };
    await s.sock.sendMessage(jid, content);
  } else {
    await s.sock.sendMessage(jid, { text });
  }

  const phone = jid.split("@")[0];
  const { number } = await getNumberConfig(numberId);
  const cid = number?.company_id ?? null;
  const contact = await upsertContact(phone, null, cid, jid);
  if (contact) {
    const { conversation } = await findOrCreateOpenConversation(contact.id, numberId, number?.sector_id ?? null, cid);
    await logMessage(conversation.id, "out", text || "", senderId ?? null, media ?? null, cid);
  }
}

// No boot, retoma automaticamente todo número que tem sessão salva no banco.
async function resumeSessions() {
  if (!supabase) return;
  const { data } = await supabase.from("wa_auth").select("number_id").eq("key", "creds");
  const ids = [...new Set((data ?? []).map((r) => r.number_id))];
  for (const id of ids) {
    console.log(`Resuming WhatsApp session for number ${id}`);
    void startSession(id);
  }
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Diagnóstico público (sem segredos): mostra se o serviço enxerga as variáveis
// de ambiente do Supabase em tempo de execução. Fica ANTES do middleware de
// segurança para poder ser aberto direto no navegador.
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: Boolean(supabase),
    hasUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSecret: Boolean(process.env.WHATSAPP_SERVICE_SECRET),
    serviceKeyRole: (() => {
      try {
        const k = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
        const payload = JSON.parse(Buffer.from(k.split(".")[1] || "", "base64").toString("utf8"));
        return payload?.role ?? null;
      } catch {
        return null;
      }
    })(),
    sessions: Array.from(sessions.values()).map((s) => ({ numberId: s.state.numberId, status: s.state.status })),
  });
});

app.use((req, res, next) => {
  if (!SERVICE_SECRET || req.header("x-service-secret") !== SERVICE_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

function stateOf(numberId) {
  return getSession(numberId).state;
}

app.get("/status", (req, res) => {
  const numberId = req.query.numberId;
  if (numberId) return res.json(stateOf(String(numberId)));
  // no id: return the map of all live sessions
  res.json({ sessions: Array.from(sessions.values()).map((s) => s.state) });
});

app.post("/connect", async (req, res) => {
  const numberId = req.body?.numberId;
  if (!numberId) return res.status(400).json({ error: "numberId é obrigatório." });
  res.json(await startSession(String(numberId)));
});

app.post("/disconnect", async (req, res) => {
  const numberId = req.body?.numberId;
  if (!numberId) return res.status(400).json({ error: "numberId é obrigatório." });
  await disconnectSession(String(numberId));
  res.json(stateOf(String(numberId)));
});

app.post("/send", async (req, res) => {
  const { numberId, to, text, senderId, media } = req.body ?? {};
  if (!to || (!text && !media?.url)) {
    return res.status(400).json({ error: "Informe 'to' e 'text' ou 'media'." });
  }
  try {
    await sendMessage(numberId ? String(numberId) : null, to, text, senderId, media);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// Vigia: a cada 60s, garante que todo número com sessão salva esteja conectado.
// Se a conexão caiu por qualquer motivo, reconecta sozinho (fica "sempre ligado").
async function watchdog() {
  if (!supabase) return;
  try {
    const { data } = await supabase.from("wa_auth").select("number_id").eq("key", "creds");
    const ids = [...new Set((data ?? []).map((r) => r.number_id))];
    for (const id of ids) {
      const s = sessions.get(id);
      const st = s?.state?.status;
      const busy = s?.starting || st === "connecting" || st === "qr_pending";
      if (st !== "connected" && !busy) {
        console.log(`Watchdog: reconnecting ${id}`);
        void startSession(id);
      }
    }
  } catch (err) {
    console.error("Watchdog error:", err);
  }
}

app.listen(PORT, () => {
  console.log(`WhatsApp service listening on :${PORT}`);
  void resumeSessions();
  setInterval(watchdog, 60000);
});
