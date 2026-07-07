import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import { runChat } from "./ai";
import { getCompany, logWhatsappMessage } from "./store";

type WaModule = typeof import("baileys");

type ConnectionState = "disconnected" | "connecting" | "qr_pending" | "connected";

type WaState = {
  status: ConnectionState;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  autoReply: boolean;
  lastError: string | null;
};

const AUTH_DIR = path.join(process.cwd(), ".data", "wa-session");

const state: WaState = {
  status: "disconnected",
  qrDataUrl: null,
  phoneNumber: null,
  autoReply: true,
  lastError: null,
};

let sock: ReturnType<WaModule["default"]> | null = null;
let starting = false;

export function getWaStatus() {
  return { ...state };
}

export function setAutoReply(value: boolean) {
  state.autoReply = value;
}

export async function startWhatsappSession() {
  if (starting || state.status === "connected") return getWaStatus();
  starting = true;
  state.lastError = null;
  try {
    const baileys: WaModule = await import("baileys");
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
    } = baileys;

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
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        state.status = "disconnected";
        state.qrDataUrl = null;
        if (!loggedOut) {
          starting = false;
          void startWhatsappSession();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const from = msg.key.remoteJid;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";
        if (!from || !text) continue;

        logWhatsappMessage({
          id: `${msg.key.id}-in`,
          from,
          text,
          direction: "in",
          at: new Date().toISOString(),
        });

        if (state.autoReply) {
          const company = getCompany();
          const reply = await runChat(
            [{ role: "user", text }],
            `Você é o assistente virtual da empresa ${company.name}. Responda clientes do WhatsApp de forma cordial, breve e humana, se apresentando como assistente virtual da empresa quando fizer sentido.`
          );
          if (reply && sock) {
            await sock.sendMessage(from, { text: reply });
            logWhatsappMessage({
              id: `${msg.key.id}-out`,
              from,
              text: reply,
              direction: "out",
              at: new Date().toISOString(),
            });
          }
        }
      }
    });
  } catch (err) {
    state.status = "disconnected";
    state.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    starting = false;
  }
  return getWaStatus();
}

export async function sendWhatsappMessage(to: string, text: string) {
  if (!sock || state.status !== "connected") {
    throw new Error("WhatsApp não está conectado.");
  }
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
  logWhatsappMessage({
    id: `manual-${Date.now()}`,
    from: jid,
    text,
    direction: "out",
    at: new Date().toISOString(),
  });
}

export async function disconnectWhatsapp() {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ignore logout errors, we're tearing down anyway
    }
    sock = null;
  }
  state.status = "disconnected";
  state.qrDataUrl = null;
  state.phoneNumber = null;
}
