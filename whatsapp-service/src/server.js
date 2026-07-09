import express from "express";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "baileys";
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

let novoContatoTagId = null;
async function ensureNovoContatoTag() {
  if (!supabase) return null;
  if (novoContatoTagId) return novoContatoTagId;
  const { data } = await supabase.from("tags").select("id").eq("name", "Novo contato").maybeSingle();
  novoContatoTagId = data?.id ?? null;
  return novoContatoTagId;
}

async function upsertContact(phone, name = null) {
  if (!supabase) return null;
  const { data: existing } = await supabase.from("contacts").select("*").eq("phone", phone).maybeSingle();
  if (existing) {
    if (name && !existing.name) {
      await supabase.from("contacts").update({ name }).eq("id", existing.id);
      existing.name = name;
    }
    return existing;
  }
  const { data } = await supabase.from("contacts").insert({ phone, name }).select("*").single();
  // Auto-etiqueta o contato recém-criado.
  const tagId = await ensureNovoContatoTag();
  if (data && tagId) {
    await supabase.from("contact_tags").insert({ contact_id: data.id, tag_id: tagId }).then(
      () => {},
      () => {}
    );
  }
  return data;
}

// Sincroniza a agenda de contatos do WhatsApp para a tabela `contacts`,
// para o usuário ver seus contatos assim que conectar (como no WhatsApp Web).
async function syncContacts(list) {
  if (!supabase || !Array.isArray(list) || list.length === 0) return;
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
    if (name) withName.push({ phone, name });
    else phoneOnly.push({ phone });
  }
  try {
    for (let i = 0; i < withName.length; i += 200) {
      await supabase.from("contacts").upsert(withName.slice(i, i + 200), { onConflict: "phone" });
    }
    for (let i = 0; i < phoneOnly.length; i += 200) {
      await supabase.from("contacts").upsert(phoneOnly.slice(i, i + 200), { onConflict: "phone", ignoreDuplicates: true });
    }
    if (withName.length || phoneOnly.length) {
      console.log(`Synced ${withName.length + phoneOnly.length} WhatsApp contacts`);
    }
  } catch (err) {
    console.error("Contact sync failed:", err);
  }
}

async function findOrCreateOpenConversation(contactId, numberId, sectorId) {
  if (!supabase) return { conversation: null, created: false };
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .in("status", ["espera", "atendendo"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { conversation: existing, created: false };
  const { data } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, status: "espera", number_id: numberId ?? null, sector_id: sectorId ?? null })
    .select("*")
    .single();
  return { conversation: data, created: true };
}

async function logMessage(conversationId, direction, text, senderId = null) {
  if (!supabase) return;
  await supabase
    .from("whatsapp_messages")
    .insert({ conversation_id: conversationId, direction, text, sender_id: senderId });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
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
async function runChatbotReply(chatbot, customerText) {
  const name = await companyName();
  const persona = chatbot?.persona ? `Você é ${chatbot.persona}.` : "";
  const instructions = chatbot?.instructions || "Responda de forma cordial, breve e humana.";
  const knowledge = chatbot?.knowledge ? `\n\nBase de conhecimento:\n${chatbot.knowledge}` : "";
  const system = `${persona}\nVocê atende clientes no WhatsApp da empresa ${name}.\n${instructions}${knowledge}`;

  const provider = chatbot?.provider || "anthropic";
  const key = chatbot?.api_key || (provider === "anthropic" ? fallbackAnthropicKey : null);
  if (!key) return null;

  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: key });
      const res = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: [{ type: "text", text: customerText }] }],
      });
      const block = res.content.find((b) => b.type === "text");
      return block && "text" in block ? block.text : null;
    }
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: customerText }] }],
          }),
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
// Baileys session lifecycle (per number)
// ---------------------------------------------------------------------------
async function startSession(numberId) {
  const s = getSession(numberId);
  if (s.starting || s.state.status === "connected") return s.state;
  s.starting = true;
  s.state.lastError = null;
  try {
    const authDir = path.join(AUTH_ROOT, numberId);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

    s.state.status = "connecting";
    await setNumberStatus(numberId, "connecting");
    const sock = makeWASocket({ auth: authState, printQRInTerminal: false });
    s.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    // Sincroniza a agenda de contatos do WhatsApp assim que conectar e a cada atualização.
    sock.ev.on("messaging-history.set", async ({ contacts }) => {
      await syncContacts(contacts);
    });
    sock.ev.on("contacts.upsert", async (contacts) => {
      await syncContacts(contacts);
    });
    sock.ev.on("contacts.update", async (contacts) => {
      await syncContacts(contacts);
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
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "";
        if (!text) continue;
        const phone = jid.split("@")[0];

        try {
          const { number, chatbot } = await getNumberConfig(numberId);
          const contact = await upsertContact(phone, msg.pushName || null);
          const { conversation, created } = await findOrCreateOpenConversation(
            contact.id,
            numberId,
            number?.sector_id ?? null
          );
          await logMessage(conversation.id, "in", text);

          const botOn = number?.auto_reply && chatbot?.enabled;
          if (botOn) {
            // Saudação apenas na abertura da conversa.
            if (created && chatbot?.greeting) {
              await sock.sendMessage(jid, { text: chatbot.greeting });
              await logMessage(conversation.id, "out", chatbot.greeting);
            }
            const reply = await runChatbotReply(chatbot, text);
            if (reply) {
              await sock.sendMessage(jid, { text: reply });
              await logMessage(conversation.id, "out", reply);
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
  // wipe stored creds so the next connect asks for a fresh QR
  try {
    const authDir = path.join(AUTH_ROOT, numberId);
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

async function sendMessage(numberId, to, text, senderId) {
  const s = getSession(numberId);
  if (!s.sock || s.state.status !== "connected") {
    throw new Error("WhatsApp não está conectado.");
  }
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  await s.sock.sendMessage(jid, { text });
  const phone = jid.split("@")[0];
  const { number } = await getNumberConfig(numberId);
  const contact = await upsertContact(phone);
  if (contact) {
    const { conversation } = await findOrCreateOpenConversation(contact.id, numberId, number?.sector_id ?? null);
    await logMessage(conversation.id, "out", text, senderId ?? null);
  }
}

// On boot, resume any number that was previously connected (creds on disk).
async function resumeSessions() {
  if (!supabase) return;
  const { data } = await supabase.from("whatsapp_numbers").select("id").eq("status", "connected");
  for (const row of data ?? []) {
    const authDir = path.join(AUTH_ROOT, row.id);
    if (fs.existsSync(authDir)) void startSession(row.id);
  }
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

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
  const { numberId, to, text, senderId } = req.body ?? {};
  if (!numberId || !to || !text) {
    return res.status(400).json({ error: "Campos 'numberId', 'to' e 'text' são obrigatórios." });
  }
  try {
    await sendMessage(String(numberId), to, text, senderId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp service listening on :${PORT}`);
  void resumeSessions();
});
