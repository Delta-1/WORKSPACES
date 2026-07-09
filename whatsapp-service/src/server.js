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
const AUTH_DIR = path.join(__dirname, "..", ".wa-session");

// service_role bypasses RLS — this process has no logged-in app user, so it
// needs full write access to the contacts/conversations/messages tables.
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const state = {
  status: "disconnected", // disconnected | connecting | qr_pending | connected
  qrDataUrl: null,
  phoneNumber: null,
  autoReply: true,
  lastError: null,
};

let sock = null;
let starting = false;

async function companyName() {
  if (!supabase) return "a empresa";
  const { data } = await supabase.from("company_settings").select("name").eq("id", true).maybeSingle();
  return data?.name ?? "a empresa";
}

async function upsertContact(phone) {
  if (!supabase) return null;
  const { data: existing } = await supabase.from("contacts").select("*").eq("phone", phone).maybeSingle();
  if (existing) return existing;
  const { data } = await supabase.from("contacts").insert({ phone }).select("*").single();
  return data;
}

async function findOrCreateOpenConversation(contactId) {
  if (!supabase) return null;
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .in("status", ["espera", "atendendo"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, status: "espera" })
    .select("*")
    .single();
  return data;
}

async function logMessage(conversationId, direction, text, senderId = null) {
  if (!supabase) return;
  await supabase
    .from("whatsapp_messages")
    .insert({ conversation_id: conversationId, direction, text, sender_id: senderId });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function autoReplyText(customerText) {
  if (!anthropic) return null; // no key configured on this service, skip auto-reply silently
  const name = await companyName();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system: `Você é o assistente virtual da empresa ${name}. Responda clientes do WhatsApp de forma cordial, breve e humana, se apresentando como assistente virtual da empresa quando fizer sentido.`,
    messages: [{ role: "user", content: [{ type: "text", text: customerText }] }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text : null;
}

async function startSession() {
  if (starting || state.status === "connected") return state;
  starting = true;
  state.lastError = null;
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    state.status = "connecting";
    sock = makeWASocket({ auth: authState, printQRInTerminal: false });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        state.status = "qr_pending";
        state.qrDataUrl = await QRCode.toDataURL(qr);
      }
      if (connection === "open") {
        state.status = "connected";
        state.qrDataUrl = null;
        state.phoneNumber = sock?.user?.id?.split(":")[0] ?? null;
      }
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        state.status = "disconnected";
        state.qrDataUrl = null;
        if (!loggedOut) {
          starting = false;
          void startSession();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!jid || !text) continue;
        const phone = jid.split("@")[0];

        try {
          const contact = await upsertContact(phone);
          const conversation = await findOrCreateOpenConversation(contact.id);
          await logMessage(conversation.id, "in", text);

          if (state.autoReply) {
            const reply = await autoReplyText(text);
            if (reply && sock) {
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
    state.status = "disconnected";
    state.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    starting = false;
  }
  return state;
}

async function disconnectSession() {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // tearing down anyway
    }
    sock = null;
  }
  state.status = "disconnected";
  state.qrDataUrl = null;
  state.phoneNumber = null;
}

async function sendMessage(to, text, senderId) {
  if (!sock || state.status !== "connected") {
    throw new Error("WhatsApp não está conectado.");
  }
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  const phone = jid.split("@")[0];
  const contact = await upsertContact(phone);
  if (contact) {
    const conversation = await findOrCreateOpenConversation(contact.id);
    await logMessage(conversation.id, "out", text, senderId ?? null);
  }
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (!SERVICE_SECRET || req.header("x-service-secret") !== SERVICE_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/status", (_req, res) => {
  res.json(state);
});

app.post("/connect", async (_req, res) => {
  res.json(await startSession());
});

app.post("/disconnect", async (_req, res) => {
  await disconnectSession();
  res.json(state);
});

app.post("/send", async (req, res) => {
  const { to, text, senderId } = req.body ?? {};
  if (!to || !text) return res.status(400).json({ error: "Campos 'to' e 'text' são obrigatórios." });
  try {
    await sendMessage(to, text, senderId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/auto-reply", (req, res) => {
  state.autoReply = Boolean(req.body?.enabled);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`WhatsApp service listening on :${PORT}`);
});
