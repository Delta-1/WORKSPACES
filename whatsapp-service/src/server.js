import express from "express";
import QRCode from "qrcode";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import ffmpegPath from "ffmpeg-static";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
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
const fallbackGeminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
const fallbackOpenaiKey = process.env.OPENAI_API_KEY || null;

// Resolve a chave de IA de um agente. Se o agente NÃO tiver chave própria, usa:
// (1) a chave de env do provedor; senão (2) a chave de OUTRO chatbot da empresa
// com o MESMO provedor (a "já fornecida"). Assim nenhum agente fica sem IA.
const companyKeyCache = new Map();
async function resolveAgentKey(companyId, provider) {
  const env = provider === "anthropic" ? fallbackAnthropicKey : provider === "gemini" ? fallbackGeminiKey : provider === "openai" ? fallbackOpenaiKey : null;
  if (env) return env;
  if (!companyId || !supabase) return null;
  const ck = `${companyId}:${provider}`;
  const cached = companyKeyCache.get(ck);
  if (cached && Date.now() - cached.at < 60000) return cached.key;
  const { data } = await supabase.from("chatbots").select("api_key").eq("company_id", companyId).eq("provider", provider).not("api_key", "is", null).limit(1).maybeSingle();
  const key = data?.api_key || null;
  companyKeyCache.set(ck, { key, at: Date.now() });
  return key;
}
// ElevenLabs: transcrição de áudio (STT) + voz do robô (TTS). Opcional.
const elevenKey = process.env.ELEVENLABS_API_KEY || null;
const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // voz padrão

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
async function companyName(companyId = null) {
  if (!supabase) return "a empresa";
  let q = supabase.from("company_settings").select("name");
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q.limit(1).maybeSingle();
  return data?.name ?? "a empresa";
}

// Dados de contato da empresa (endereço, telefone, site, avaliação) — o robô
// usa para responder "qual o endereço/telefone", convidar para o site e pedir
// avaliação. Cache de 1 min.
const companyInfoCache = new Map(); // companyId -> { at, info }
async function getCompanyInfo(companyId = null) {
  if (!supabase) return null;
  const key = companyId || "_";
  const cached = companyInfoCache.get(key);
  if (cached && Date.now() - cached.at < 60000) return cached.info;
  let q = supabase
    .from("company_settings")
    .select("name, address, address_link, phone, email, website, review_link, auto_close_minutes");
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q.limit(1).maybeSingle();
  companyInfoCache.set(key, { at: Date.now(), info: data ?? null });
  return data ?? null;
}

// Monta um bloco de contexto com os dados da empresa para o prompt do robô.
function companyContextBlock(info) {
  if (!info) return "";
  const lines = [];
  if (info.address) lines.push(`- Endereço: ${info.address}`);
  if (info.address_link) lines.push(`- Link do mapa: ${info.address_link}`);
  if (info.phone) lines.push(`- Telefone: ${info.phone}`);
  if (info.email) lines.push(`- E-mail: ${info.email}`);
  if (info.website) lines.push(`- Site: ${info.website}`);
  if (info.review_link) lines.push(`- Link de avaliação: ${info.review_link}`);
  if (!lines.length) return "";
  return (
    `\n\nDADOS DA EMPRESA (use quando o cliente pedir ou fizer sentido):\n${lines.join("\n")}\n` +
    `Quando perguntarem endereço, ofereça o endereço escrito E o link do mapa. Convide para o site quando fizer sentido. ` +
    `Ao encerrar um atendimento bem-sucedido, agradeça e, se houver link de avaliação, peça gentilmente uma avaliação.`
  );
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

// Agente COPILOTO (adm do sistema) da empresa — slot 'internal', com TODAS as
// capacidades. É ele quem responde os contatos marcados como "copilot ativado",
// no lugar do bot de atendimento do número (ex.: "Vitor"). Cache de 1 min.
const copilotAgentByCompany = new Map();
async function getCopilotAgent(companyId) {
  if (!supabase || !companyId) return null;
  const cached = copilotAgentByCompany.get(companyId);
  if (cached && Date.now() - cached.at < 60000) return cached.agent;
  const { data } = await supabase
    .from("chatbots")
    .select("*")
    .eq("company_id", companyId)
    .eq("slot", "internal")
    .limit(1)
    .maybeSingle();
  const agent = data ?? null;
  copilotAgentByCompany.set(companyId, { agent, at: Date.now() });
  return agent;
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

// Busca a foto de perfil do contato no WhatsApp e salva (uma vez).
async function fetchAvatar(sock, jid, contact) {
  if (!supabase || !sock || !jid || !contact || contact.avatar_url) return;
  try {
    const url = await sock.profilePictureUrl(jid, "image").catch(() => null);
    if (url) await supabase.from("contacts").update({ avatar_url: url }).eq("id", contact.id);
  } catch {
    /* sem foto / privado */
  }
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
        // Novo chamado: o bot volta a responder (tira o silêncio e o atendente antigo).
        .update({ status: "espera", closed_at: null, bot_paused: false, assignee_id: null, closing_sent: false, number_id: numberId ?? existing.number_id })
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
function historyPreview(m) {
  const inner = m.message?.documentWithCaptionMessage?.message ?? m.message ?? {};
  return (
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    (inner.imageMessage ? "📷 Foto" : inner.audioMessage ? "🎵 Áudio" : inner.videoMessage ? "🎥 Vídeo" : inner.documentMessage ? "📄 Arquivo" : "")
  );
}

async function ingestHistory(messages, numberId, companyId, sectorId) {
  if (!supabase || !Array.isArray(messages) || messages.length === 0) return;
  // Agrupa TODAS as mensagens por chat 1:1 (para carregar o histórico completo,
  // os dois lados) e ordena por tempo.
  const byJid = new Map();
  for (const m of messages) {
    const jid = m?.key?.remoteJid;
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
    const list = byJid.get(jid) ?? [];
    list.push(m);
    byJid.set(jid, list);
  }
  let done = 0;
  for (const [jid, msgs] of byJid) {
    if (done >= 120) break; // limite de segurança
    try {
      msgs.sort((a, b) => Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0));
      const last = msgs[msgs.length - 1];
      const isLid = jid.endsWith("@lid");
      const altJid = last.key.remoteJidAlt || null;
      const phone = isLid && altJid ? altJid.split("@")[0] : jid.split("@")[0];
      const name = last.pushName || null;
      const digits = phone.replace(/\D/g, "");
      // Pula o "lixo" do histórico: chat LID sem telefone real e sem nome vira
      // só "Contato WhatsApp". Só ingerimos chats com NOME ou TELEFONE plausível.
      const plausiblePhone = digits.length >= 8 && digits.length <= 15 && !(isLid && !altJid);
      if (!name && !plausiblePhone) continue;

      // Monta as últimas ~40 mensagens; se não houver conteúdo, NÃO cria conversa vazia.
      const recent = msgs.slice(-40);
      const rows0 = recent
        .map((m) => {
          const text = historyPreview(m);
          if (!text) return null;
          const ts = Number(m.messageTimestamp || 0);
          return {
            direction: m.key.fromMe ? "out" : "in",
            text,
            company_id: companyId,
            at: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
          };
        })
        .filter(Boolean);
      if (rows0.length === 0) continue;

      const contact = await upsertContact(phone, name, companyId, jid);
      if (!contact) continue;
      // Já existe conversa? então não recria (evita duplicar histórico).
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
      if (!conv) continue;
      const rows = rows0.map((r) => ({ ...r, conversation_id: conv.id }));
      await supabase.from("whatsapp_messages").insert(rows);
      const lastRow = rows[rows.length - 1];
      await supabase
        .from("conversations")
        .update({ last_message: lastRow.text, last_message_at: lastRow.at })
        .eq("id", conv.id);
      done++;
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

async function logMessage(conversationId, direction, text, senderId = null, media = null, companyId = null, waId = null) {
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
  if (waId) {
    // wa_id dedup: evita registrar duas vezes a mesma mensagem (envio pelo site
    // + eco do messages.upsert, ou a mesma mensagem chegando por vários eventos).
    row.wa_id = waId;
    const { data: inserted } = await supabase
      .from("whatsapp_messages")
      .upsert(row, { onConflict: "wa_id", ignoreDuplicates: true })
      .select("id");
    if (!inserted || inserted.length === 0) return; // já existia → não duplica
  } else {
    await supabase.from("whatsapp_messages").insert(row);
  }
  // Mantém a conversa "no topo" (mais recente) e com a última mensagem/hora.
  const now = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({ last_message: row.text ?? "", last_message_at: now, updated_at: now })
    .eq("id", conversationId);
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

// Guarda o último erro do ElevenLabs para diagnóstico via /health.
let lastElevenError = null;

// ElevenLabs Speech-to-Text (transcreve o áudio do cliente).
async function transcribeAudio(buffer, mime, key) {
  const apiKey = key || elevenKey;
  if (!apiKey || !buffer) return null;
  try {
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("file", new Blob([buffer], { type: mime || "audio/ogg" }), "audio.ogg");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: fd,
    });
    if (!res.ok) {
      lastElevenError = `STT ${res.status}: ${(await res.text()).slice(0, 200)}`;
      console.error("ElevenLabs STT error:", lastElevenError);
      return null;
    }
    const json = await res.json();
    return json?.text?.trim() || null;
  } catch (err) {
    lastElevenError = "STT exception: " + (err?.message || String(err));
    console.error("transcribeAudio failed:", err);
    return null;
  }
}

// Limpa o texto antes de virar voz: tira rótulos/rubricas que o TTS leria
// literalmente ("áudio", "(risada)", "(rindo)", "[pausa]"...) e transforma
// risadas descritas em risada de verdade ("hahaha").
function sanitizeForSpeech(text) {
  let t = String(text || "");
  // "áudio"/"audio" no comecinho (rótulo) — remove.
  t = t.replace(/^\s*[áa]udio[:\-–.\s]+/i, "");
  // Risadas descritas -> som de risada real.
  t = t.replace(/[([]\s*(risada[s]?|rindo|risos|gargalhada[s]?|kk+|haha[ha]*)\s*[)\]]/gi, "hahaha");
  // Outras rubricas entre parênteses/colchetes (pausa, suspiro, tom, voz...) — remove.
  t = t.replace(/[([]\s*(pausa|suspiro|silêncio|silencio|tom\b[^)\]]*|voz\b[^)\]]*|sussurr[^)\]]*|em voz[^)\]]*|com [^)\]]*)\s*[)\]]/gi, "");
  // Colchetes remanescentes (quase sempre rubrica) — remove.
  t = t.replace(/\[[^\]]*\]/g, "");
  // Espaços/limpeza final.
  return t.replace(/\s{2,}/g, " ").trim();
}

// ElevenLabs Text-to-Speech (gera a resposta do robô em áudio). Retorna Buffer mp3.
async function synthesizeSpeech(text, key, voiceId) {
  const apiKey = key || elevenKey;
  const voice = voiceId || elevenVoiceId;
  if (!apiKey || !text) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) {
      lastElevenError = `TTS ${res.status}: ${(await res.text()).slice(0, 250)}`;
      console.error("ElevenLabs TTS error:", lastElevenError);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    lastElevenError = "TTS exception: " + (err?.message || String(err));
    console.error("synthesizeSpeech failed:", err);
    return null;
  }
}

// Converte o MP3 do ElevenLabs em OGG/Opus (formato que o WhatsApp toca como
// nota de voz). Sem isto, o WhatsApp diz "problema com o arquivo de áudio".
async function mp3ToOpusOgg(mp3Buffer) {
  if (!ffmpegPath) return null;
  const tmp = os.tmpdir();
  const inFile = path.join(tmp, `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  const outFile = inFile.replace(/\.mp3$/, ".ogg");
  try {
    fs.writeFileSync(inFile, mp3Buffer);
    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        "-y",
        "-i", inFile,
        "-c:a", "libopus",
        "-b:a", "32k",
        "-ar", "48000",
        "-ac", "1",
        outFile,
      ]);
      let err = "";
      ff.stderr.on("data", (d) => (err += d.toString()));
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code + ": " + err.slice(-200)))));
    });
    return fs.readFileSync(outFile);
  } catch (err) {
    lastElevenError = "ffmpeg: " + (err?.message || String(err));
    console.error("mp3ToOpusOgg failed:", err);
    return null;
  } finally {
    try { fs.unlinkSync(inFile); } catch { /* */ }
    try { fs.unlinkSync(outFile); } catch { /* */ }
  }
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
    // Pastas conectadas (file_links) à pasta do robô também entram no cérebro.
    if (chatbot?.folder_id) {
      const { data: linkRows } = await supabase.from("file_links").select("source_id,target_id");
      for (const l of linkRows ?? []) {
        if (l.source_id === chatbot.folder_id) rootIds.add(l.target_id);
        if (l.target_id === chatbot.folder_id) rootIds.add(l.source_id);
      }
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
// Orientação extra conforme o tipo de automação escolhido para o número.
function modeGuidance(mode) {
  switch (mode) {
    case "triage":
      return "\nSeu objetivo principal é TRIAGEM: descubra com poucas perguntas qual o assunto/setor do cliente (ex.: financeiro, suporte, vendas) e confirme antes de encaminhar. Seja objetivo.";
    case "menu":
      return "\nApresente um MENU numerado de opções (1, 2, 3…) e conduza o cliente conforme o número que ele escolher. Repita o menu se a resposta não corresponder a uma opção.";
    case "faq":
      return "\nResponda apenas dúvidas frequentes de forma direta. Se a pergunta fugir do que você sabe, diga que vai chamar um atendente humano.";
    default:
      return "";
  }
}

async function runChatbotReply(chatbot, customerText, history = [], mode = "ai", companyId = null, image = null) {
  const name = await companyName(companyId);
  const persona = chatbot?.persona ? `Você é ${chatbot.persona}.` : "";
  const instructions = chatbot?.instructions || "Responda de forma cordial, breve e humana.";
  const knowledge = chatbot?.knowledge ? `\n\nBase de conhecimento:\n${chatbot.knowledge}` : "";
  const brain = await buildBotBrain(chatbot);
  const companyBlock = companyContextBlock(await getCompanyInfo(companyId));
  const system = `${persona}\nVocê atende clientes no WhatsApp da empresa ${name}.\n${instructions}${modeGuidance(mode)}\nIMPORTANTE: esta é uma conversa CONTÍNUA e em andamento. Use o histórico para manter contexto — NÃO cumprimente de novo nem recomece o atendimento a cada mensagem, e NÃO esqueça o que a pessoa já respondeu (nome, data, etc.). Continue de onde parou.${knowledge}${brain}${companyBlock}`;

  const provider = chatbot?.provider || "anthropic";
  const key = chatbot?.api_key || (await resolveAgentKey(companyId, provider));
  if (!key) return null;

  const hist = Array.isArray(history) ? history.filter((h) => h && h.text) : [];

  try {
    // Imagem recebida do cliente → visão (todos os bots "enxergam" a foto).
    const imgB64 = image?.buffer ? image.buffer.toString("base64") : null;
    const imgMime = image?.mime || "image/jpeg";
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: key });
      const userContent = [];
      if (imgB64) userContent.push({ type: "image", source: { type: "base64", media_type: imgMime, data: imgB64 } });
      userContent.push({ type: "text", text: customerText || "(o cliente enviou esta imagem)" });
      const messages = [
        ...hist.map((h) => ({ role: h.role, content: [{ type: "text", text: h.text }] })),
        { role: "user", content: userContent },
      ];
      const res = await client.messages.create({ model: "claude-sonnet-5", max_tokens: 512, system, messages });
      const block = res.content.find((b) => b.type === "text");
      return block && "text" in block ? block.text : null;
    }
    if (provider === "gemini") {
      const userParts = [{ text: customerText || "(o cliente enviou esta imagem)" }];
      if (imgB64) userParts.push({ inline_data: { mime_type: imgMime, data: imgB64 } });
      const contents = [
        ...hist.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
        { role: "user", parts: userParts },
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
      const userContent = imgB64
        ? [
            { type: "text", text: customerText || "(o cliente enviou esta imagem)" },
            { type: "image_url", image_url: { url: `data:${imgMime};base64,${imgB64}` } },
          ]
        : customerText;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            ...hist.map((h) => ({ role: h.role, content: h.text })),
            { role: "user", content: userContent },
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
// MOTOR DO FLUXOGRAMA — executa o fluxo visual montado no Labs (chatbots.flow).
// Blocos "automáticos" (message/ai/action) são executados em sequência; blocos
// de ENTRADA (ask/buttons) enviam algo e ESPERAM a próxima mensagem do cliente;
// condition desvia por palavras-chave. Se o fluxo não estiver montado ou der
// pau, devolve false e o bot cai no comportamento normal (IA).
// ---------------------------------------------------------------------------
function flowKeywordHit(text, keywords) {
  const t = (text || "").toLowerCase();
  return String(keywords || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .some((k) => t.includes(k));
}

async function runBotFlow(sock, jid, conversation, chatbot, customerText, cid, history) {
  const flow = chatbot?.flow;
  if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) return false;
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  const nextFrom = (nodeId, handle = "out") => {
    const e = edges.find((x) => x.from === nodeId && x.handle === handle);
    return e ? nodes.get(e.to) : null;
  };
  const send = async (text) => {
    if (!text) return;
    const g = await sock.sendMessage(jid, { text });
    await logMessage(conversation.id, "out", text, null, null, cid, g?.key?.id ?? null);
  };
  const info = await getCompanyInfo(conversation.company_id);

  // Ponto de partida: se estávamos esperando num nó de entrada, processa a
  // resposta; senão começa do "start".
  let current = null;
  const waiting = conversation.flow_node ? nodes.get(conversation.flow_node) : null;
  if (waiting) {
    if (waiting.type === "buttons") {
      const opts = waiting.data?.options ?? [];
      let idx = -1;
      const num = parseInt((customerText || "").trim(), 10);
      if (Number.isInteger(num) && num >= 1 && num <= opts.length) idx = num - 1;
      if (idx < 0) idx = opts.findIndex((o) => (customerText || "").toLowerCase().includes(String(o).toLowerCase()));
      if (idx < 0) {
        // Não entendeu a opção → repete as opções.
        await send(`${waiting.data?.text || "Escolha uma opção:"}\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`);
        return true;
      }
      current = nextFrom(waiting.id, `opt${idx}`);
    } else {
      // ask (ou qualquer nó de espera): segue adiante.
      current = nextFrom(waiting.id);
    }
  } else {
    const start = flow.nodes.find((n) => n.type === "start") || flow.nodes[0];
    current = nextFrom(start.id);
  }

  // Caminha executando os blocos até parar num de entrada / fim / sem saída.
  let guard = 0;
  let sentAnything = false;
  while (current && guard++ < 40) {
    const n = current;
    if (n.type === "message") {
      await send(n.data?.text || "");
      sentAnything = true;
      current = nextFrom(n.id);
    } else if (n.type === "condition") {
      const hit = flowKeywordHit(customerText, n.data?.keywords);
      current = nextFrom(n.id, hit ? "sim" : "nao");
    } else if (n.type === "action") {
      const a = n.data?.action;
      if (a === "send_address") await send(info?.address ? `📍 ${info.address}${info.address_link ? `\n${info.address_link}` : ""}` : "Ainda não temos o endereço cadastrado.");
      else if (a === "send_phone") await send(info?.phone ? `📞 ${info.phone}` : "Ainda não temos telefone cadastrado.");
      else if (a === "send_website") await send(info?.website ? `🌐 ${info.website}` : "Ainda não temos site cadastrado.");
      else if (a === "handoff") {
        await send("Um momento, vou te transferir para um atendente. 🙋");
        // Espera humana + bot em silêncio (evita loop por cima do atendente).
        await supabase.from("conversations").update({ status: "espera", bot_paused: true, flow_node: null }).eq("id", conversation.id);
        return true;
      } else if (a === "close") {
        let msg = "Atendimento encerrado. Obrigado pelo contato! 😊";
        if (info?.review_link) msg += `\n\nAvalie nosso atendimento: ${info.review_link}`;
        await send(msg);
        await supabase.from("conversations").update({ status: "fechado", closed_at: new Date().toISOString(), flow_node: null, bot_paused: true }).eq("id", conversation.id);
        void generateContactReport({ ...conversation, status: "fechado" });
        return true;
      }
      sentAnything = true;
      current = nextFrom(n.id);
    } else if (n.type === "ai") {
      const reply = await runChatbotReply(chatbot, customerText, history, "ai", conversation.company_id);
      if (reply) { await send(reply); sentAnything = true; }
      // Se a IA tem continuação no fluxo, segue; senão fica na IA (conversa livre).
      const nx = nextFrom(n.id);
      await supabase.from("conversations").update({ flow_node: nx ? null : n.id }).eq("id", conversation.id);
      if (!nx) return true;
      current = nx;
    } else if (n.type === "ask" || n.type === "buttons") {
      // Nó de ENTRADA: envia e espera a próxima mensagem.
      if (n.type === "buttons") {
        const opts = n.data?.options ?? [];
        await send(`${n.data?.text || "Escolha:"}\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`);
      } else {
        await send(n.data?.text || "");
      }
      await supabase.from("conversations").update({ flow_node: n.id }).eq("id", conversation.id);
      return true;
    } else if (n.type === "end") {
      await supabase.from("conversations").update({ flow_node: null }).eq("id", conversation.id);
      return sentAnything;
    } else {
      current = nextFrom(n.id);
    }
  }
  // Chegou ao fim do caminho sem nó de entrada: limpa o estado.
  await supabase.from("conversations").update({ flow_node: null }).eq("id", conversation.id);
  return sentAnything;
}

// ---------------------------------------------------------------------------
// COPILOTO via WhatsApp (só para contatos liberados pelo gestor). Tem acesso
// aos arquivos da empresa: procura pelo nome e ENTREGA o arquivo/imagem.
// ---------------------------------------------------------------------------
const COPILOT_TOOLS = [
  {
    name: "search_files",
    description: "Busca arquivos/pastas da empresa pelo nome. Use quando pedirem um arquivo/imagem/documento.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "send_file",
    description: "Entrega um arquivo específico (pelo id de search_files) para a pessoa no WhatsApp.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_sectors",
    description: "Lista os setores da empresa (id e nome). Use antes de criar uma tarefa.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_employees",
    description: "Lista funcionários (id, nome, cargo). Use para escolher responsável de tarefa.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_task",
    description: "Cria tarefa no Kanban. Requer sector_id (use list_sectors); assignee_id opcional.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, sector_id: { type: "string" }, assignee_id: { type: "string" }, due_date: { type: "string" } },
      required: ["title", "sector_id"],
    },
  },
  {
    name: "lookup_client",
    description: "Busca clientes cadastrados pelo nome.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "create_client",
    description: "Cadastra um cliente no CRM.",
    input_schema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } }, required: ["name"] },
  },
  {
    name: "post_announcement",
    description: "Publica um aviso no mural da empresa.",
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] },
  },
  {
    name: "list_tasks",
    description: "Lista tarefas recentes (id, título, coluna).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "move_task",
    description: "Move tarefa de coluna. column: a_fazer | em_andamento | concluido.",
    input_schema: { type: "object", properties: { task_id: { type: "string" }, column: { type: "string" } }, required: ["task_id", "column"] },
  },
  {
    name: "set_attendance",
    description: "Abre/encerra atendimento de um contato pelo nome. status: espera | atendendo | fechado.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, status: { type: "string" } }, required: ["contact", "status"] },
  },
  {
    name: "send_whatsapp",
    description:
      "Envia uma mensagem de WhatsApp para OUTRO contato (pelo nome ou telefone) em nome do gestor. Passe as_audio=true para enviar como ÁUDIO (nota de voz). " +
      "Se o nome tiver vários contatos, a ferramenta devolve as opções com os telefones — pergunte qual e reenvie com o telefone certo.",
    input_schema: {
      type: "object",
      properties: { contact: { type: "string" }, text: { type: "string" }, as_audio: { type: "boolean" } },
      required: ["contact", "text"],
    },
  },
  {
    name: "send_file_to_contact",
    description:
      "Encaminha um ARQUIVO para outro contato pelo WhatsApp. Primeiro ache o arquivo com search_files (pegue o id) e CONFIRME com o gestor que é esse arquivo e esse contato antes de enviar.",
    input_schema: { type: "object", properties: { contact: { type: "string" }, file_id: { type: "string" } }, required: ["contact", "file_id"] },
  },
  {
    name: "forward_media",
    description:
      "Pega a última mídia (áudio/imagem/documento) que CHEGOU na conversa de um contato e repassa para OUTRO contato. Ex.: 'pega o áudio que a Maria mandou e manda pro financeiro'. Confirme antes.",
    input_schema: {
      type: "object",
      properties: { from_contact: { type: "string" }, to_contact: { type: "string" }, kind: { type: "string", description: "audio|image|document (opcional)" } },
      required: ["from_contact", "to_contact"],
    },
  },
  {
    name: "finance_summary",
    description:
      "Panorama financeiro da EMPRESA num período. Use quando pedirem 'como está o financeiro', 'quais os gastos', 'quanto gastei esse mês', saldo, etc. month opcional no formato AAAA-MM (padrão: mês atual). Retorna receitas, despesas, saldo e gastos por categoria.",
    input_schema: { type: "object", properties: { month: { type: "string", description: "AAAA-MM (opcional)" } } },
  },
  {
    name: "add_finance_entry",
    description:
      "Lança uma DESPESA ou RECEITA no financeiro da EMPRESA. kind: 'despesa' | 'receita'. amount em reais (número). category e description opcionais. date opcional (AAAA-MM-DD, padrão hoje). Confirme o valor antes de lançar.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string" }, amount: { type: "number" }, category: { type: "string" }, description: { type: "string" }, date: { type: "string" } },
      required: ["kind", "amount"],
    },
  },
  {
    name: "list_folder",
    description:
      "Lista, EM TEXTO, o que tem dentro de uma pasta pelo nome (subpastas e arquivos). Use quando perguntarem 'o que tem na pasta X', 'quais arquivos tem em Y', 'quantas pastas tem em Z'. Retorna a lista organizada.",
    input_schema: { type: "object", properties: { folder: { type: "string", description: "Nome (ou parte) da pasta" } }, required: ["folder"] },
  },
  {
    name: "screenshot_client",
    description:
      "Tira um PRINT da tela do computador de um CLIENTE e anexa aqui no chat. Use quando o cliente reportar um erro e quiser mostrar a tela dele. SEMPRE identifique o cliente; se o cliente tiver mais de um computador, PERGUNTE qual (a ferramenta devolve as opções). Passe 'computer' com o nome da máquina quando souber.",
    input_schema: { type: "object", properties: { client: { type: "string" }, computer: { type: "string" } }, required: ["client"] },
  },
  {
    name: "graph_overview",
    description:
      "Panorama do GRAFO da empresa: as pastas de topo (raízes) e um resumo de quantos itens tem. Use quando perguntarem 'o que temos', 'quais pastas/servidores existem', 'me mostra tudo'. Depois use list_folder para entrar numa pasta.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_servers",
    description:
      "Lista os SERVIDORES/computadores da empresa (nome, online/offline, e a pasta do grafo de cada um). Use para saber quais máquinas existem e o que cada uma guarda.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_agents",
    description: "Lista os OUTROS agentes/bots da empresa (nome e função). Use antes de perguntar a um deles.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "ask_agent",
    description:
      "Pergunta a OUTRO agente/bot da empresa (pelo nome) e recebe a resposta dele. Use para consultar um especialista — ex.: perguntar ao bot Financeiro, ou repassar uma dúvida a outro atendente. Assim os bots conversam entre si.",
    input_schema: { type: "object", properties: { agent: { type: "string", description: "nome do agente/bot" }, message: { type: "string" } }, required: ["agent", "message"] },
  },
];

// Executa uma ação do copiloto no workspace (escopo da empresa).
async function copilotAction(companyId, name, input) {
  input = input || {};
  try {
    if (name === "list_agents") {
      const { data } = await supabase.from("chatbots").select("name,persona,slot").eq("company_id", companyId).order("name");
      return (data ?? []).filter((b) => b.slot !== "internal").map((b) => ({ name: b.name, funcao: b.persona || "" }));
    }
    if (name === "ask_agent") {
      // ECOSSISTEMA: um bot pergunta a outro bot da empresa e devolve a resposta.
      const { data: bots } = await supabase.from("chatbots").select("*").eq("company_id", companyId);
      const q = String(input.agent || "").toLowerCase();
      const target = (bots || []).find((b) => (b.name || "").toLowerCase().includes(q));
      if (!target) return { ok: false, message: `Não achei um agente chamado "${input.agent}".` };
      const reply = await runChatbotReply(target, String(input.message || ""), [], "ai", companyId);
      return { ok: true, agent: target.name, reply: reply || "(o agente não respondeu)" };
    }
    if (name === "list_sectors") {
      const { data } = await supabase.from("sectors").select("id,name").eq("company_id", companyId).order("name");
      return data ?? [];
    }
    if (name === "list_employees") {
      const { data } = await supabase.from("profiles").select("id,full_name,role").eq("company_id", companyId).order("full_name");
      return (data ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role }));
    }
    if (name === "create_task") {
      const { error } = await supabase.from("tasks").insert({
        title: input.title, description: input.description ?? null, sector_id: input.sector_id,
        assignee_id: input.assignee_id ?? null, column_name: "a_fazer", due_date: input.due_date ?? null, company_id: companyId,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: `Tarefa "${input.title}" criada.` };
    }
    if (name === "lookup_client") {
      const { data } = await supabase.from("clients").select("id,name,phone,email").eq("company_id", companyId).ilike("name", `%${input.query}%`).limit(10);
      return data ?? [];
    }
    if (name === "create_client") {
      const { error } = await supabase.from("clients").insert({ name: input.name, phone: input.phone ?? null, email: input.email ?? null, notes: input.notes ?? null, company_id: companyId });
      return error ? { ok: false, message: error.message } : { ok: true, message: `Cliente "${input.name}" cadastrado.` };
    }
    if (name === "post_announcement") {
      const { error } = await supabase.from("announcements").insert({ title: input.title, body: input.body, company_id: companyId, pinned: false });
      return error ? { ok: false, message: error.message } : { ok: true, message: "Aviso publicado no mural." };
    }
    if (name === "list_tasks") {
      const { data } = await supabase.from("tasks").select("id,title,column_name").eq("company_id", companyId).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    }
    if (name === "move_task") {
      if (!["a_fazer", "em_andamento", "concluido"].includes(input.column)) return { ok: false, message: "Coluna inválida." };
      const { error } = await supabase.from("tasks").update({ column_name: input.column }).eq("id", input.task_id).eq("company_id", companyId);
      return error ? { ok: false, message: error.message } : { ok: true, message: "Tarefa movida." };
    }
    if (name === "set_attendance") {
      if (!["espera", "atendendo", "fechado"].includes(input.status)) return { ok: false, message: "Status inválido." };
      const { data: c } = await supabase.from("contacts").select("id,name").eq("company_id", companyId).ilike("name", `%${input.contact}%`).limit(1).maybeSingle();
      if (!c) return { ok: false, message: "Contato não encontrado." };
      const { data: conv } = await supabase.from("conversations").select("id").eq("contact_id", c.id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (!conv) return { ok: false, message: "Sem conversa para este contato." };
      const patch = { status: input.status };
      if (input.status === "fechado") patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from("conversations").update(patch).eq("id", conv.id);
      return error ? { ok: false, message: error.message } : { ok: true, message: `Atendimento → ${input.status}.` };
    }
    if (name === "finance_summary") {
      const month = /^\d{4}-\d{2}$/.test(input.month || "") ? input.month : new Date().toISOString().slice(0, 7);
      const start = `${month}-01`;
      const endD = new Date(`${month}-01T00:00:00`);
      endD.setMonth(endD.getMonth() + 1);
      const end = endD.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("finance_entries")
        .select("kind,amount,category")
        .eq("scope", "empresa")
        .eq("company_id", companyId)
        .gte("entry_date", start)
        .lt("entry_date", end);
      let receitas = 0, despesas = 0;
      const byCat = {};
      for (const e of data || []) {
        const v = Number(e.amount) || 0;
        if (e.kind === "receita") receitas += v;
        else { despesas += v; byCat[e.category || "Outros"] = (byCat[e.category || "Outros"] || 0) + v; }
      }
      const categorias = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ categoria: c, total: v }));
      return { mes: month, receitas, despesas, saldo: receitas - despesas, lancamentos: (data || []).length, gastos_por_categoria: categorias };
    }
    if (name === "add_finance_entry") {
      const kind = input.kind === "receita" ? "receita" : "despesa";
      const amount = Number(input.amount);
      if (!isFinite(amount) || amount <= 0) return { ok: false, message: "Valor inválido." };
      const entry_date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("finance_entries").insert({
        scope: "empresa",
        company_id: companyId,
        kind,
        amount,
        category: input.category || null,
        description: input.description || null,
        entry_date,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: `${kind === "receita" ? "Receita" : "Despesa"} de R$ ${amount.toFixed(2)} lançada${input.category ? ` (${input.category})` : ""}.` };
    }
    if (name === "list_folder") {
      const q = String(input.folder || "").trim();
      if (!q) return { ok: false, message: "Diga o nome da pasta." };
      const { data: folder } = await supabase
        .from("files")
        .select("id,name")
        .eq("company_id", companyId)
        .eq("type", "folder")
        .ilike("name", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!folder) return { ok: false, message: `Não achei a pasta "${q}".` };
      const { data: kids } = await supabase
        .from("files")
        .select("name,type")
        .eq("company_id", companyId)
        .eq("parent_id", folder.id)
        .order("type")
        .order("name");
      const pastas = (kids || []).filter((k) => k.type === "folder").map((k) => k.name);
      const arquivos = (kids || []).filter((k) => k.type === "file").map((k) => k.name);
      return { pasta: folder.name, subpastas: pastas, arquivos, total_subpastas: pastas.length, total_arquivos: arquivos.length };
    }
    if (name === "graph_overview") {
      const { data: roots } = await supabase.from("files").select("id,name").eq("company_id", companyId).eq("type", "folder").is("parent_id", null).order("name");
      const out = [];
      for (const r of roots || []) {
        const { count: subFolders } = await supabase.from("files").select("id", { count: "exact", head: true }).eq("parent_id", r.id).eq("type", "folder");
        const { count: files } = await supabase.from("files").select("id", { count: "exact", head: true }).eq("parent_id", r.id).eq("type", "file");
        out.push({ pasta: r.name, subpastas: subFolders || 0, arquivos: files || 0 });
      }
      return { pastas_de_topo: out, total: out.length };
    }
    if (name === "list_servers") {
      const { data: servers } = await supabase.from("remote_agents").select("name,status,last_seen,is_server,graph_folder_id").eq("company_id", companyId).order("name");
      const list = [];
      for (const s of servers || []) {
        let folder = null;
        if (s.graph_folder_id) {
          const { data: f } = await supabase.from("files").select("name").eq("id", s.graph_folder_id).maybeSingle();
          folder = f?.name || null;
        }
        const online = s.status === "online" && s.last_seen && Date.now() - new Date(s.last_seen).getTime() < 60000;
        list.push({ nome: s.name, online, servidor: s.is_server === true, pasta_no_grafo: folder });
      }
      return { computadores: list, total: list.length };
    }
    return { error: "ferramenta desconhecida" };
  } catch (e) {
    return { ok: false, message: String(e?.message || e) };
  }
}

// Resolve um contato para envio (nome ou telefone). Devolve { contact } OU
// { choice } com as opções quando o nome bate em vários contatos.
async function resolveSendContact(companyId, q) {
  q = String(q || "").trim();
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 8) {
    const { data } = await supabase.from("contacts").select("id,name,phone,jid").eq("company_id", companyId).eq("phone", digits).maybeSingle();
    return { contact: data || { id: null, name: q, phone: digits, jid: null } };
  }
  const { data: matches } = await supabase.from("contacts").select("id,name,phone,jid").eq("company_id", companyId).ilike("name", `%${q}%`).limit(6);
  if (!matches || matches.length === 0) return { error: "Não achei esse contato. Passe o nome exato ou o telefone." };
  if (matches.length > 1) return { choice: matches.map((m) => ({ name: m.name || "(sem nome)", phone: m.phone })) };
  return { contact: matches[0] };
}

// Dispatch comum das ferramentas do copiloto (arquivos + ações + relay).
async function copilotDispatch(companyId, name, input, files, sends) {
  if (name === "search_files") return await copilotSearchFiles(companyId, input.query);
  if (name === "send_file") {
    const file = await copilotLoadFile(companyId, input.id);
    if (file) { files.push(file); return { ok: true, message: `Enviado: ${file.name}` }; }
    return { ok: false, message: "Arquivo sem conteúdo ou não encontrado." };
  }
  if (name === "send_whatsapp") {
    const asAudio = input.as_audio === true || input.as_audio === "true";
    const r = await resolveSendContact(companyId, input.contact);
    if (r.error) return { ok: false, message: r.error };
    if (r.choice) return { ok: false, needs_choice: true, message: "Há mais de um contato com esse nome. Pergunte para qual enviar e reenvie com o telefone.", options: r.choice };
    const to = r.contact.jid || r.contact.phone;
    if (!to) return { ok: false, message: "Contato sem telefone/JID." };
    sends.push({ to, text: input.text, asAudio, name: r.contact.name || r.contact.phone });
    return { ok: true, message: `Mensagem${asAudio ? " (áudio)" : ""} enfileirada para ${r.contact.name || r.contact.phone}.` };
  }
  if (name === "send_file_to_contact") {
    // Encaminha um ARQUIVO (achado com search_files) para outro contato.
    const r = await resolveSendContact(companyId, input.contact);
    if (r.error) return { ok: false, message: r.error };
    if (r.choice) return { ok: false, needs_choice: true, message: "Há mais de um contato com esse nome. Pergunte para qual enviar e reenvie com o telefone.", options: r.choice };
    const to = r.contact.jid || r.contact.phone;
    if (!to) return { ok: false, message: "Contato sem telefone/JID." };
    const file = await copilotLoadFile(companyId, input.file_id);
    if (!file) return { ok: false, message: "Arquivo sem conteúdo ou não encontrado." };
    sends.push({ to, file, name: r.contact.name || r.contact.phone });
    return { ok: true, message: `Arquivo "${file.name}" enfileirado para ${r.contact.name || r.contact.phone}.` };
  }
  if (name === "forward_media") {
    // Acha a última mídia que CHEGOU na conversa de from_contact e repassa.
    const from = await resolveSendContact(companyId, input.from_contact);
    if (from.error) return { ok: false, message: "Origem: " + from.error };
    if (from.choice) return { ok: false, needs_choice: true, message: "Vários contatos com esse nome (origem). Qual é?", options: from.choice };
    const { data: conv } = await supabase.from("conversations").select("id").eq("contact_id", from.contact.id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (!conv) return { ok: false, message: "Não achei conversa com esse contato." };
    let q = supabase.from("whatsapp_messages").select("media_url,media_type,media_name,media_mime").eq("conversation_id", conv.id).eq("direction", "in").not("media_url", "is", null).order("at", { ascending: false }).limit(1);
    if (input.kind) q = supabase.from("whatsapp_messages").select("media_url,media_type,media_name,media_mime").eq("conversation_id", conv.id).eq("direction", "in").eq("media_type", input.kind).not("media_url", "is", null).order("at", { ascending: false }).limit(1);
    const { data: m } = await q.maybeSingle();
    if (!m?.media_url) return { ok: false, message: "Não achei mídia recebida nessa conversa." };
    const dest = await resolveSendContact(companyId, input.to_contact);
    if (dest.error) return { ok: false, message: "Destino: " + dest.error };
    if (dest.choice) return { ok: false, needs_choice: true, message: "Vários contatos com esse nome (destino). Qual é?", options: dest.choice };
    const to = dest.contact.jid || dest.contact.phone;
    let buffer = null;
    try { const resp = await fetch(m.media_url); if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer()); } catch { /* ignore */ }
    if (!buffer) return { ok: false, message: "Não consegui baixar a mídia para repassar." };
    sends.push({ to, file: { name: m.media_name || `${m.media_type || "midia"}`, mime: m.media_mime || "application/octet-stream", buffer } });
    return { ok: true, message: `Mídia (${m.media_type}) de ${from.contact.name || "contato"} enfileirada para ${dest.contact.name || dest.contact.phone}.` };
  }
  if (name === "screenshot_client") {
    // Acha o cliente e o computador dele, pede um print pro agente e anexa aqui.
    const q = String(input.client || "").trim();
    if (!q) return { ok: false, message: "Diga qual é o cliente." };
    const { data: cli } = await supabase.from("clients").select("id,name").eq("company_id", companyId).ilike("name", `%${q}%`).limit(1).maybeSingle();
    if (!cli) return { ok: false, message: `Não achei o cliente "${q}".` };
    const { data: machines } = await supabase.from("remote_agents").select("id,name,status,last_seen").eq("company_id", companyId).eq("client_id", cli.id);
    if (!machines || machines.length === 0) return { ok: false, message: `O cliente ${cli.name} não tem computador vinculado.` };
    let agent = machines[0];
    if (machines.length > 1) {
      if (!input.computer) return { ok: false, needs_choice: true, message: `${cli.name} tem vários computadores. Qual?`, options: machines.map((m) => ({ name: m.name })) };
      agent = machines.find((m) => (m.name || "").toLowerCase().includes(String(input.computer).toLowerCase())) || agent;
    }
    // Enfileira o print e aguarda o agente devolver a URL (até ~22s).
    const { data: job } = await supabase.from("agent_jobs").insert({ agent_id: agent.id, company_id: companyId, kind: "screenshot" }).select("id").single();
    if (!job) return { ok: false, message: "Não consegui pedir o print agora." };
    let url = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: j } = await supabase.from("agent_jobs").select("status,result_url").eq("id", job.id).maybeSingle();
      if (j?.status === "done" && j.result_url) { url = j.result_url; break; }
      if (j?.status === "error") break;
    }
    if (!url) return { ok: false, message: `Não recebi o print de ${agent.name} (a máquina pode estar desligada ou o app desatualizado).` };
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        files.push({ name: `print-${cli.name}.jpg`, mime: "image/jpeg", buffer });
        return { ok: true, message: `Print da tela de ${cli.name} (${agent.name}) anexado.` };
      }
    } catch { /* ignore */ }
    return { ok: false, message: "O print foi tirado mas não consegui anexar." };
  }
  return await copilotAction(companyId, name, input);
}

async function copilotSearchFiles(companyId, query) {
  const q = String(query || "").trim();
  if (!q || !companyId) return [];
  const { data } = await supabase
    .from("files")
    .select("id,name,type,storage_path,data_url,parent_id")
    .eq("company_id", companyId)
    .ilike("name", `%${q}%`)
    .limit(20);
  const rows = data ?? [];
  // Descobre o nome da pasta de origem de cada resultado (pra IA dizer "de que
  // pasta veio" e numerar a lista).
  const parentIds = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))];
  const nameById = new Map();
  if (parentIds.length) {
    const { data: parents } = await supabase.from("files").select("id,name").in("id", parentIds);
    for (const p of parents || []) nameById.set(p.id, p.name);
  }
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    pasta: f.parent_id ? nameById.get(f.parent_id) || null : null,
    hasContent: Boolean(f.storage_path || f.data_url),
  }));
}

async function copilotLoadFile(companyId, id) {
  const { data: f } = await supabase
    .from("files")
    .select("id,name,type,storage_path,data_url,mime,company_id")
    .eq("id", id)
    .maybeSingle();
  if (!f || f.company_id !== companyId || f.type === "folder") return null;
  let buffer = null;
  if (f.storage_path) {
    const { data: blob } = await supabase.storage.from("company-files").download(f.storage_path);
    if (blob) buffer = Buffer.from(await blob.arrayBuffer());
  } else if (f.data_url && /^data:/.test(f.data_url)) {
    buffer = Buffer.from(f.data_url.split(",")[1] || "", "base64");
  }
  if (!buffer) return null;
  return { name: f.name, mime: f.mime || "application/octet-stream", buffer };
}

// Retorna { reply, files: [{name,mime,buffer}] }. Usa a IA configurada no bot
// (Gemini ou Anthropic); se não houver, cai na chave Anthropic do ambiente.
async function runCopilotReply(companyId, chatbot, customerText, history = [], fullAccess = false) {
  // Provedor: o do agente (se tiver chave própria); senão o do agente mesmo, e a
  // chave cai no fallback (env ou de outro chatbot da empresa com o mesmo provedor).
  const provider = chatbot?.provider || "anthropic";
  const key = chatbot?.api_key || (await resolveAgentKey(companyId, provider));
  if (!key) return { reply: "Copiloto sem chave de IA configurada (configure em Configurações → Chatbot ou no Labs).", files: [] };
  const name = await companyName(companyId);
  const testMode = chatbot?.test_mode !== false;
  const system =
    `Você é o COPILOTO/assessor pessoal do gestor da empresa "${name}" via WhatsApp. É um assistente forte e direto: ` +
    `responde dúvidas, cria tarefas, cadastra/consulta clientes, publica avisos, abre/encerra atendimentos e TEM ACESSO ` +
    `aos arquivos da empresa. Quando pedirem um arquivo/imagem, use search_files e depois send_file. Para criar tarefa, ` +
    `pegue o setor com list_sectors. Você também pode FALAR COM OUTRAS PESSOAS pelo gestor: quando ele disser algo como ` +
    `"manda X para o fulano", use send_whatsapp (confirme o texto antes). Se pedirem ÁUDIO, chame send_whatsapp com as_audio=true. ` +
    `IMPORTANTE: use EXATAMENTE o destinatário e o texto que a pessoa pediu AGORA, nesta última mensagem. NUNCA reaproveite ` +
    `nomes, números ou textos de mensagens/pedidos ANTIGOS do histórico. Se o pedido atual é "manda pra minha mãe: chego 18h", ` +
    `o destinatário é a mãe e o texto é "chego 18h" — não misture com pedidos anteriores. ` +
    `Se o nome tiver mais de um contato, a ferramenta devolve as opções com telefone — PERGUNTE qual e reenvie com o telefone certo. ` +
    `Para ENCAMINHAR um arquivo a alguém (ex.: "manda o contrato pro João"), ache com search_files, CONFIRME "é esse contrato pro João?" e só então use send_file_to_contact.\n\n` +
    `ENTENDA BEM A INTENÇÃO antes de agir: leia o histórico, pense no que a pessoa REALMENTE quer e, se estiver ambíguo, ` +
    `pergunte em vez de chutar. Guarde na memória o que já foi dito (nomes, datas, valores) e responda CLARO e CONCISO, sem recomeçar. ` +
    `Ao enviar mensagem/arquivo para alguém, CONFIRME o destinatário juntando NOME + TELEFONE (ex.: "confirmando: João, +55 11 9...., certo?") antes de mandar. ` +
    `Se for algo ROTINEIRO que você já fez com o mesmo contato, seja direto e não fique repetindo perguntas de confirmação bobas. ` +
    `FINANCEIRO: você pode consultar e lançar no financeiro DA EMPRESA. Para 'como está o financeiro', 'quais os gastos', saldo do mês, use finance_summary e dê um PANORAMA claro (receitas, despesas, saldo e principais gastos), com um conselho curto pro dono (ex.: alertar se as despesas passaram das receitas). Para lançar, use add_finance_entry (confirme o valor antes). ` +
    `VISÃO DO GRAFO: você tem acesso a TUDO — use graph_overview para ver as pastas de topo, list_servers para os computadores/servidores, e list_folder para entrar numa pasta. ` +
    `Ao listar, mande VISUAL e organizado: cada pasta com 📁 e cada arquivo com 📄, um por linha, mostrando as subpastas e os arquivos que tem dentro. Nada de frase corrida. ` +
    `Ao procurar um ARQUIVO pelo nome (search_files): se a pessoa não disse a pasta e vier mais de um resultado, PERGUNTE se ela tem preferência de pasta; se ela disser que não, LISTE todos os resultados NUMERADOS (1, 2, 3…) mostrando o nome e de qual PASTA veio, e peça o número. ` +
    `SUPORTE REMOTO: se pedirem para ver a tela de um cliente (ex.: 'tira um print da máquina do fulano'), use screenshot_client. SEMPRE saiba QUAL CLIENTE e, se ele tiver mais de um computador, PERGUNTE qual antes. ` +
    (testMode
      ? `MODO TESTE ATIVO: antes de EXECUTAR qualquer ação (criar tarefa, enviar arquivo/mensagem, etc.) ou dar um dado importante, PERGUNTE "posso fazer isso?" / "está correto?" e só prossiga após o "sim".`
      : `Aja de forma autônoma, perguntando só o essencial.`) +
    companyContextBlock(await getCompanyInfo(companyId));
  const hist = (Array.isArray(history) ? history : []).filter((h) => h && h.text);
  const files = [];
  const sends = [];
  // Ferramentas liberadas pelas CAPACIDADES do agente (Labs). Vazio/nulo = todas.
  const caps = Array.isArray(chatbot?.capabilities) ? chatbot.capabilities : null;
  const CAP_TOOLS = {
    files: ["search_files", "send_file", "list_folder", "graph_overview", "list_servers"],
    tasks: ["list_sectors", "list_employees", "create_task", "list_tasks", "move_task"],
    clients: ["lookup_client", "create_client"],
    announcements: ["post_announcement"],
    attendance: ["set_attendance"],
    relay: ["send_whatsapp", "send_file_to_contact", "forward_media"],
    finance: ["finance_summary", "add_finance_entry"],
    remote: ["screenshot_client"],
  };
  // Acesso total (assessor pessoal do gestor) ignora o gate de capacidades.
  const allowedNames = fullAccess || !caps || !caps.length ? null : new Set(caps.flatMap((c) => CAP_TOOLS[c] || []));
  const tools = allowedNames ? COPILOT_TOOLS.filter((t) => allowedNames.has(t.name)) : COPILOT_TOOLS;

  try {
    if (provider === "gemini") {
      const contents = [
        ...hist.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
        { role: "user", parts: [{ text: customerText }] },
      ];
      const functionDeclarations = tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema }));
      let reply = "";
      for (let i = 0; i < 6; i++) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations }] }) }
        );
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        reply = parts.filter((p) => p.text).map((p) => p.text).join("\n") || reply;
        const calls = parts.filter((p) => p.functionCall);
        if (calls.length === 0) break;
        contents.push({ role: "model", parts });
        const responseParts = [];
        for (const c of calls) {
          const out = await copilotDispatch(companyId, c.functionCall.name, c.functionCall.args || {}, files, sends);
          responseParts.push({ functionResponse: { name: c.functionCall.name, response: { result: out } } });
        }
        contents.push({ role: "user", parts: responseParts });
      }
      return { reply, files, sends };
    }

    // Anthropic (default)
    const anthropic = new Anthropic({ apiKey: key });
    const messages = [
      ...hist.map((h) => ({ role: h.role, content: [{ type: "text", text: h.text }] })),
      { role: "user", content: [{ type: "text", text: customerText }] },
    ];
    let reply = "";
    for (let i = 0; i < 6; i++) {
      const res = await anthropic.messages.create({ model: "claude-sonnet-5", max_tokens: 1024, system, tools, messages });
      reply = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const toolUses = res.content.filter((b) => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || toolUses.length === 0) break;
      messages.push({ role: "assistant", content: res.content });
      const results = [];
      for (const tu of toolUses) {
        const out = await copilotDispatch(companyId, tu.name, tu.input || {}, files, sends);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }
    return { reply, files, sends };
  } catch (err) {
    console.error("Copilot reply failed:", err);
    return { reply: "Tive um problema para processar agora. Tente de novo.", files, sends };
  }
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
// Versão do protocolo do WhatsApp Web, cacheada por 1h (com fallback embutido).
let _waVersion = null;
let _waVersionAt = 0;
async function getWaVersion() {
  if (_waVersion && Date.now() - _waVersionAt < 3600000) return _waVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    _waVersion = version;
    _waVersionAt = Date.now();
  } catch (e) {
    console.error("fetchLatestBaileysVersion falhou, usando padrão:", e?.message || e);
  }
  return _waVersion; // undefined = Baileys usa a versão embutida
}

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
    // Usa a versão MAIS RECENTE do protocolo do WhatsApp Web (evita QR que não
    // gera e quedas de conexão por versão desatualizada). Cacheia por 1h.
    const version = await getWaVersion();
    const sock = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: false,
      // Estabilidade + velocidade: não fica "online" (mantém as notificações no
      // celular), keep-alive curto e SEM sincronizar histórico gigante (mais rápido).
      markOnlineOnConnect: false,
      keepAliveIntervalMs: 15000,
      connectTimeoutMs: 60000,
      qrTimeout: 60000,
      retryRequestDelayMs: 250,
      browser: ["Workspace", "Chrome", "121.0"],
      syncFullHistory: false,
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
        s.starting = false;
        await setNumberStatus(numberId, "disconnected", loggedOut ? null : undefined);
        if (loggedOut) {
          // Sessão encerrada no celular → limpa credenciais p/ o próximo QR funcionar.
          await clearSupabaseAuthState(numberId).catch(() => {});
        } else {
          // Reconecta com um pequeno recuo (evita loop apertado que derruba de novo).
          setTimeout(() => void startSession(numberId), 2500);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        // ignore groups / broadcasts — this is 1:1 customer support
        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
        // Mensagem que VOCÊ enviou pelo app oficial do WhatsApp → espelha no site.
        if (msg.key.fromMe) {
          await logOutgoingEcho(sock, numberId, msg, jid);
          continue;
        }
        // Marca como visualizada (tique azul) — sem travar o recebimento (não aguarda).
        sock.readMessages([msg.key]).catch(() => {});
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
        let audioBuffer = null;
        let imageBuffer = null;
        if (mediaKind) {
          try {
            const buffer = await downloadMediaMessage(
              { key: msg.key, message: inner },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage, logger: noopLogger }
            );
            if (mediaKind === "audio") audioBuffer = buffer; // guarda p/ transcrever
            if (mediaKind === "image") imageBuffer = buffer; // guarda p/ visão do bot
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
          void fetchAvatar(sock, contactJid, contact); // foto de perfil (best-effort)
          const { conversation, created } = await findOrCreateOpenConversation(
            contact.id,
            numberId,
            number?.sector_id ?? null,
            cid
          );
          await logMessage(conversation.id, "in", text, null, media, cid);

          // Contato liberado pelo gestor → COPILOTO (assessor com acesso total).
          const isCopilot = contact?.copilot_access === true;
          // Quando o contato é copiloto, quem responde é o AGENTE COPILOTO da
          // empresa (adm, slot 'internal', todas as capacidades) — não o bot de
          // atendimento do número (ex.: "Vitor"). Se não existir, cai no do número.
          const copilotAgent = isCopilot ? await getCopilotAgent(cid) : null;
          const agentForReply = copilotAgent || chatbot;
          // IA CONTÍNUA: responde sempre, NÃO fica anunciando "vou encerrar", e
          // lembra das conversas anteriores do contato. O copiloto é sempre contínuo.
          const continuous = isCopilot || agentForReply?.continuous === true;
          // Agente do Labs com capacidades → usa ferramentas para TODOS deste número.
          const agentHasCaps = Array.isArray(chatbot?.capabilities) && chatbot.capabilities.length > 0;
          const useTools = isCopilot || agentHasCaps;
          // Modo "label" só etiqueta (não responde); demais modos respondem.
          // O bot fica em SILÊNCIO quando um humano assumiu (assignee_id) ou quando
          // o atendimento já foi passado/encerrado por ele (bot_paused) — assim ele
          // não fica naquele loop chato de responder por cima do atendente.
          const botOn =
            number?.auto_reply &&
            chatbot?.enabled &&
            number?.bot_mode !== "label" &&
            !conversation.bot_paused &&
            !conversation.assignee_id;
          if (isCopilot || botOn) {
            // Se o cliente mandou ÁUDIO, transcreve (ElevenLabs) para "ouvir".
            const wasAudio = mediaKind === "audio";
            const botElevenKey = agentForReply?.elevenlabs_key || elevenKey;
            const voiceReplyOn = agentForReply?.voice_reply !== false; // default ligado
            let customerText = text;
            if (!customerText && wasAudio && audioBuffer) {
              customerText = await transcribeAudio(audioBuffer, node?.mimetype, botElevenKey);
            }
            // Preferência de voz — para TODOS os agentes: a prioridade é responder
            // em ÁUDIO. Se a pessoa pedir texto ("não posso ouvir áudio", "responde
            // por texto"), troca para texto até ela pedir áudio de novo. A escolha
            // fica guardada por conversa (coluna copilot_voice, reaproveitada).
            let voicePref = conversation.copilot_voice !== false; // default: áudio
            if (customerText) {
              if (/(responde|manda|escreve|prefiro|pode ser).{0,20}(por )?texto|n[aã]o posso (ouvir|escutar)|sem [aá]udio|por escrito/i.test(customerText)) {
                voicePref = false;
                await supabase.from("conversations").update({ copilot_voice: false }).eq("id", conversation.id);
              } else if (/(responde|manda|prefiro|pode ser|volta).{0,20}(por )?([aá]udio|voz)|fala comigo|me manda [aá]udio/i.test(customerText)) {
                voicePref = true;
                await supabase.from("conversations").update({ copilot_voice: true }).eq("id", conversation.id);
              }
            }
            // Responde por voz sempre que a preferência estiver em áudio e houver
            // chave de TTS; se não puder gerar áudio, cai para texto automaticamente.
            const wantVoice = voicePref && voiceReplyOn && !!botElevenKey;
            // Cliente pediu explicitamente para encerrar → fecha o atendimento,
            // agradece e (se houver) pede avaliação. Depois o sweep gera o relatório.
            if (!isCopilot && !continuous && customerText && /\b(quero|pode|podemos|vamos|prefiro)\s+(finaliz|encerr)|encerrar (o )?atendimento|pode (finalizar|encerrar)|era s[oó] isso[,. ]*(obrigad|valeu)/i.test(customerText)) {
              // Já fechou e mandou a despedida uma vez? Não repete — só encerra em silêncio.
              if (conversation.closing_sent || conversation.status === "fechado") {
                await supabase.from("conversations").update({ status: "fechado", closed_at: new Date().toISOString(), bot_paused: true }).eq("id", conversation.id);
                return;
              }
              const info = await getCompanyInfo(cid);
              let msg = "Perfeito, vou encerrar nosso atendimento então. Muito obrigado pelo contato! 😊";
              if (info?.review_link) msg += `\n\nSe puder, avalie nosso atendimento: ${info.review_link}`;
              const g = await sock.sendMessage(jid, { text: msg });
              await logMessage(conversation.id, "out", msg, null, null, cid, g?.key?.id ?? null);
              await supabase.from("conversations").update({ status: "fechado", closed_at: new Date().toISOString(), bot_paused: true, closing_sent: true }).eq("id", conversation.id);
              void generateContactReport({ ...conversation, status: "fechado" });
              return;
            }
            // Saudação apenas na abertura da conversa (só no bot de atendimento;
            // se houver fluxograma, é ELE que abre a conversa).
            const hasFlow = !isCopilot && Array.isArray(chatbot?.flow?.nodes) && chatbot.flow.nodes.length > 0;
            if (!isCopilot && created && chatbot?.greeting && !hasFlow) {
              const g = await sock.sendMessage(jid, { text: chatbot.greeting });
              await logMessage(conversation.id, "out", chatbot.greeting, null, null, cid, g?.key?.id ?? null);
            }
            // Puxa as últimas mensagens p/ dar contexto ao bot. IA CONTÍNUA lembra
            // de TODAS as conversas anteriores do contato (memória entre atendimentos);
            // o bot normal só desta conversa.
            let history = [];
            try {
              let priorQ = supabase.from("whatsapp_messages").select("direction,text").order("at", { ascending: false }).limit(continuous ? 60 : 40);
              if (continuous) {
                const { data: convs } = await supabase.from("conversations").select("id").eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(10);
                const ids = (convs ?? []).map((c) => c.id);
                priorQ = ids.length ? priorQ.in("conversation_id", ids) : priorQ.eq("conversation_id", conversation.id);
              } else {
                priorQ = priorQ.eq("conversation_id", conversation.id);
              }
              const { data: prior } = await priorQ;
              history = (prior ?? [])
                .reverse()
                .filter((m) => m.text)
                .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", text: m.text }));
              // Remove a última mensagem se for exatamente a que estamos processando
              // agora (evita duplicar e confundir o bot).
              if (history.length && history[history.length - 1].role === "user" && history[history.length - 1].text === (text || "")) {
                history.pop();
              }
            } catch {
              /* sem histórico, segue sem contexto */
            }
            // Mostra ao cliente "digitando…" ou "gravando áudio…" enquanto pensa.
            try {
              await sock.sendPresenceUpdate(wantVoice ? "recording" : "composing", jid);
            } catch {
              /* ignore */
            }
            // Fluxograma do bot (roteiro montado no Labs): se existir, ELE conduz
            // a conversa. Só cai na IA normal se o fluxo não tratar/estiver vazio.
            if (hasFlow && customerText) {
              try {
                const handled = await runBotFlow(sock, jid, conversation, chatbot, customerText, cid, history);
                if (handled) return;
              } catch (e) {
                console.error("runBotFlow failed, caindo no bot normal:", e?.message || e);
              }
            }
            // Copiloto: IA com ferramentas (busca/entrega arquivos, relay). Bot normal: resposta comum.
            let copilotFiles = [];
            let copilotSends = [];
            let reply = null;
            if (customerText && useTools) {
              const out = await runCopilotReply(cid, agentForReply, customerText, history, isCopilot);
              reply = out.reply;
              copilotFiles = out.files || [];
              copilotSends = out.sends || [];
            } else if (customerText || imageBuffer) {
              // Todos os bots "enxergam" a imagem recebida (visão), mesmo sem texto.
              const agentImage = imageBuffer ? { buffer: imageBuffer, mime: node?.mimetype || "image/jpeg" } : null;
              reply = await runChatbotReply(chatbot, customerText, history, number?.bot_mode || "ai", cid, agentImage);
            }
            // Assessor pessoal: envia as mensagens que o copiloto pediu p/ outros contatos.
            for (const s of copilotSends) {
              try {
                let media = null;
                if (s.file) {
                  // Encaminha um arquivo: sobe o conteúdo e envia como imagem/documento.
                  const url = await uploadMedia(s.file.buffer, s.file.mime, "out");
                  if (url) {
                    const isImg = (s.file.mime || "").startsWith("image/");
                    media = { type: isImg ? "image" : "document", url, name: s.file.name, mime: s.file.mime };
                  }
                } else if (s.asAudio) {
                  // Gera a nota de voz (ElevenLabs) e manda como áudio.
                  const key = chatbot?.elevenlabs_key || elevenKey;
                  const mp3 = key ? await synthesizeSpeech(sanitizeForSpeech(s.text), key, chatbot?.elevenlabs_voice_id) : null;
                  const ogg = mp3 ? await mp3ToOpusOgg(mp3) : null;
                  const url = ogg ? await uploadMedia(ogg, "audio/ogg", "out") : null;
                  if (url) media = { type: "audio", url, name: null, mime: "audio/ogg" };
                }
                await sendMessage(numberId, s.to, media ? "" : s.text, null, media);
              } catch (e) {
                console.error("copilot relay send failed:", e);
              }
            }
            // Entrega os arquivos que o copiloto decidiu mandar (imagem/documento).
            for (const f of copilotFiles) {
              try {
                const isImg = (f.mime || "").startsWith("image/");
                const sf = isImg
                  ? await sock.sendMessage(jid, { image: f.buffer, caption: f.name })
                  : await sock.sendMessage(jid, { document: f.buffer, fileName: f.name, mimetype: f.mime });
                const url = await uploadMedia(f.buffer, f.mime, "out");
                await logMessage(
                  conversation.id,
                  "out",
                  f.name,
                  null,
                  url ? { type: isImg ? "image" : "document", url, name: f.name, mime: f.mime } : null,
                  cid,
                  sf?.key?.id ?? null
                );
              } catch (e) {
                console.error("copilot send file failed:", e);
              }
            }
            if (reply) {
              // Responde por áudio conforme a preferência (copiloto) ou se o cliente falou por áudio.
              let sentAsAudio = false;
              if (wantVoice) {
                const speech = await synthesizeSpeech(sanitizeForSpeech(reply), botElevenKey, agentForReply?.elevenlabs_voice_id);
                // WhatsApp precisa de OGG/Opus para tocar a nota de voz.
                const ogg = speech ? await mp3ToOpusOgg(speech) : null;
                if (ogg) {
                  const sa = await sock.sendMessage(jid, { audio: ogg, mimetype: "audio/ogg; codecs=opus", ptt: true });
                  const audioUrl = await uploadMedia(ogg, "audio/ogg", "out");
                  await logMessage(
                    conversation.id,
                    "out",
                    reply,
                    null,
                    audioUrl ? { type: "audio", url: audioUrl, name: null, mime: "audio/ogg" } : null,
                    cid,
                    sa?.key?.id ?? null
                  );
                  sentAsAudio = true;
                }
              }
              if (!sentAsAudio) {
                const st = await sock.sendMessage(jid, { text: reply });
                await logMessage(conversation.id, "out", reply, null, null, cid, st?.key?.id ?? null);
              }
            }
            // FIM DO LOOP: se o PRÓPRIO bot disse que ia encerrar ou passar para um
            // humano, a gente conclui isso de verdade — senão ele fica repetindo
            // "vou encerrar" pra sempre. (Não vale para o copiloto nem IA contínua.)
            if (!isCopilot && !continuous && reply) {
              const intent = detectBotClosureIntent(reply);
              if (intent === "close") {
                const info2 = await getCompanyInfo(cid);
                if (info2?.review_link && !/avali/i.test(reply)) {
                  const rv = `Se puder, avalie nosso atendimento: ${info2.review_link}`;
                  const g = await sock.sendMessage(jid, { text: rv }).catch(() => null);
                  await logMessage(conversation.id, "out", rv, null, null, cid, g?.key?.id ?? null);
                }
                await supabase
                  .from("conversations")
                  .update({ status: "fechado", closed_at: new Date().toISOString(), flow_node: null, bot_paused: true, closing_sent: true })
                  .eq("id", conversation.id);
                void generateContactReport({ ...conversation, status: "fechado" });
              } else if (intent === "handoff") {
                // Passa para a fila humana: guarda um resumo na nota do contato
                // (campo problem) e coloca em ESPERA (aguardando atendimento). O bot
                // some (bot_paused) para o atendente assumir sem interferência.
                const note = conversation.problem || (customerText ? customerText.slice(0, 400) : null);
                await supabase
                  .from("conversations")
                  .update({ status: "espera", bot_paused: true, flow_node: null, ...(note ? { problem: note } : {}) })
                  .eq("id", conversation.id);
              }
            }
            try {
              await sock.sendPresenceUpdate("paused", jid);
            } catch {
              /* ignore */
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

// Espelha no site as mensagens que VOCÊ mandou pelo app oficial do WhatsApp
// (multi-dispositivo). O eco chega em messages.upsert com key.fromMe = true.
async function logOutgoingEcho(sock, numberId, msg, jid) {
  try {
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
    const node = inner.imageMessage || inner.audioMessage || inner.videoMessage || inner.documentMessage || null;
    const text = inner.conversation || inner.extendedTextMessage?.text || node?.caption || "";
    if (!text && !mediaKind) return;

    let media = null;
    if (mediaKind) {
      try {
        const buffer = await downloadMediaMessage(
          { key: msg.key, message: inner },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage, logger: noopLogger }
        );
        const url = await uploadMedia(buffer, node?.mimetype || null, "out");
        if (url) media = { type: mediaKind, url, name: node?.fileName || null, mime: node?.mimetype || null };
      } catch (err) {
        console.error("Failed to download outgoing echo media:", err);
      }
    }

    const isLid = jid.endsWith("@lid");
    const altJid = msg.key.remoteJidAlt || null;
    const phone = isLid && altJid ? altJid.split("@")[0] : jid.split("@")[0];
    const { number } = await getNumberConfig(numberId);
    const cid = number?.company_id ?? null;
    const contact = await upsertContact(phone, null, cid, jid);
    if (!contact) return;
    // IMPORTANTE: só REGISTRA a mensagem na conversa existente — NÃO reabre uma
    // conversa fechada. Reabrir aqui causava um loop: o sweep fechava e mandava
    // "como não tivemos retorno", o eco dessa mensagem reabria a conversa, o sweep
    // fechava de novo e mandava de novo… (dezenas de mensagens repetidas).
    const { data: convo } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let conversationId = convo?.id ?? null;
    if (!conversationId) {
      const { data: created } = await supabase
        .from("conversations")
        .insert({ contact_id: contact.id, status: "atendendo", number_id: numberId, sector_id: number?.sector_id ?? null, company_id: cid })
        .select("id")
        .single();
      conversationId = created?.id ?? null;
    }
    if (!conversationId) return;
    // waId = key.id → dedup contra o envio feito pelo próprio site.
    await logMessage(conversationId, "out", text, null, media, cid, msg.key.id);
  } catch (err) {
    console.error("logOutgoingEcho failed:", err);
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

  let sent = null;
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
    sent = await s.sock.sendMessage(jid, content);
  } else {
    sent = await s.sock.sendMessage(jid, { text });
  }

  const phone = jid.split("@")[0];
  const { number } = await getNumberConfig(numberId);
  const cid = number?.company_id ?? null;
  const contact = await upsertContact(phone, null, cid, jid);
  if (contact) {
    // Registra na conversa mais recente do contato. Só REABRE uma conversa fechada
    // quando quem enviou foi um HUMANO (senderId). Mensagens do sistema/robô (ex.:
    // encerramento por inatividade, senderId nulo) NÃO reabrem — senão o sweep
    // fechava, mandava, reabria e mandava de novo num loop infinito.
    const { data: convo } = await supabase
      .from("conversations")
      .select("id,status")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let conversationId = convo?.id ?? null;
    if (!conversationId) {
      const { data: created } = await supabase
        .from("conversations")
        .insert({ contact_id: contact.id, status: "atendendo", number_id: numberId, sector_id: number?.sector_id ?? null, company_id: cid })
        .select("id")
        .single();
      conversationId = created?.id ?? null;
    }
    if (conversationId) {
      await logMessage(conversationId, "out", text || "", senderId ?? null, media ?? null, cid, sent?.key?.id ?? null);
      // Humano assumiu → "Sendo atendido" (reabre se estava fechada; bot fica quieto).
      if (senderId) {
        await supabase
          .from("conversations")
          .update({ status: "atendendo", assignee_id: senderId, closed_at: null, bot_paused: true })
          .eq("id", conversationId);
      }
    }
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
    hasAnthropic: Boolean(fallbackAnthropicKey),
    hasElevenLabs: Boolean(elevenKey),
    lastElevenError,
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

// --------------------------------------------------------------------------
// Relatório do atendimento por contato + encerramento automático
// --------------------------------------------------------------------------

// Gera um relatório do atendimento (resumo + nota + sentimento) e salva no log
// do contato. Funciona tanto para atendimento por bot quanto MANUAL — a IA lê a
// conversa e avalia como foi. Evita duplicar (um relatório por conversa).
// Detecta, pela PRÓPRIA resposta do bot, que ele decidiu ENCERRAR o atendimento
// ou PASSAR PARA UM HUMANO. Assim a gente fecha/transfere de verdade e não fica
// no loop chato de "vou encerrar" sem nunca encerrar. Só sinais fortes contam.
function detectBotClosureIntent(reply) {
  if (!reply) return null;
  const t = String(reply).toLowerCase();
  // 1) Passar para atendente humano / suporte.
  if (
    /(vou|vamos|posso|estou|deixa eu|j[aá] vou)\s+(te\s+)?(passar|encaminhar|transferir|repassar|direcionar)\b[\s\S]{0,40}(atendente|humano|suporte|equipe|setor|respons[aá]vel|especialista|t[eé]cnic)/i.test(t) ||
    /um[a]? (atendente|t[eé]cnico|respons[aá]vel|pessoa da equipe)[\s\S]{0,30}(vai|ir[aá]|j[aá])[\s\S]{0,20}(te )?(ajud|atend|responder|falar|assumir|continuar)/i.test(t) ||
    /(encaminhando|transferindo|passando)[\s\S]{0,20}(para|pro|pra)[\s\S]{0,20}(o |a )?(suporte|atendimento|equipe|setor|atendente)/i.test(t)
  ) {
    return "handoff";
  }
  // 2) Encerrar / finalizar o atendimento.
  if (
    /(vou|estou|vamos|pode(mos)?|deixa eu|j[aá] vou)\s+(ent[ãa]o\s+)?(encerr|finaliz)/i.test(t) ||
    /atendimento (ser[aá] |foi |vai ser )?(encerrad|finalizad)/i.test(t) ||
    /(encerrando|finalizando)\s+(o|nosso|por|aqui|ent[ãa]o)/i.test(t) ||
    /estou (te )?(encerrando|finalizando)/i.test(t)
  ) {
    return "close";
  }
  return null;
}

// ---------------------------------------------------------------------------
// MEMÓRIA EVOLUTIVA DOS AGENTES ("cérebro" que aprende sozinho)
// ---------------------------------------------------------------------------
// Todo agente tem uma pasta de memória no grafo (o "rosto"/cérebro dele). Aqui
// garantimos a pasta para QUALQUER agente e, ao fim de um atendimento, destilamos
// aprendizados duradouros — principalmente os VÍCIOS DE LINGUAGEM e o jeito de
// falar do cliente/empresa — num .md que evolui com o tempo (a pasta do grafo é a
// mesma pasta do servidor: um só registro em `files`).
const MEMORY_FILE = "memoria_evolutiva.md";

async function ensureBrainFolder(chatbot) {
  if (!supabase || !chatbot?.id) return null;
  if (chatbot.folder_id) return chatbot.folder_id;
  const { data: folder } = await supabase
    .from("files")
    .insert({ name: `Agente: ${chatbot.name || "sem nome"}`, type: "folder", parent_id: null, company_id: chatbot.company_id ?? null })
    .select("id")
    .single();
  const fid = folder?.id ?? null;
  if (fid) {
    await supabase.from("chatbots").update({ folder_id: fid }).eq("id", chatbot.id);
    chatbot.folder_id = fid;
  }
  return fid;
}

// Garante pasta de memória para TODOS os agentes já existentes (roda no start).
async function backfillBrainFolders() {
  if (!supabase) return;
  try {
    const { data: agents } = await supabase.from("chatbots").select("id,name,company_id,folder_id").is("folder_id", null);
    for (const a of agents || []) await ensureBrainFolder(a);
    if (agents && agents.length) console.log(`brain folders backfilled: ${agents.length}`);
  } catch (e) {
    console.error("backfillBrainFolders failed:", e?.message || e);
  }
}

async function evolveAgentMemory(chatbot, transcript, companyId) {
  if (!supabase || !chatbot?.id || !transcript) return;
  const provider = chatbot.provider || "anthropic";
  const agentKey = chatbot.api_key || (await resolveAgentKey(companyId, provider));
  // A destilação roda em Anthropic (estável aqui); usa a chave do agente se for
  // anthropic, senão a chave comum do ambiente. Sem chave, não evolui.
  const anthKey = fallbackAnthropicKey || (provider === "anthropic" ? agentKey : null);
  if (!anthKey) return;
  const folderId = await ensureBrainFolder(chatbot);
  if (!folderId) return;
  try {
    // Lê a memória atual (se houver) para EVOLUIR em cima, não recomeçar.
    const { data: existing } = await supabase
      .from("files")
      .select("id,text_content")
      .eq("parent_id", folderId)
      .eq("name", MEMORY_FILE)
      .maybeSingle();
    const current = existing?.text_content || "";
    const client = new Anthropic({ apiKey: anthKey });
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 900,
      system:
        "Você é a MEMÓRIA EVOLUTIVA de um agente de atendimento. Recebe (1) a memória atual em Markdown e (2) a transcrição de um atendimento recém-encerrado. " +
        "Devolva a memória ATUALIZADA em Markdown, curta e útil, MESCLANDO o que já existe com novos aprendizados — não repita, não apague o que ainda vale. " +
        "Foque em: VÍCIOS DE LINGUAGEM e jeito de falar do cliente/empresa (gírias, expressões, tom, saudações, como chamam produtos/sistemas), preferências e fatos recorrentes, e o que funcionou ou irritou. " +
        "Organize em seções (## Vícios de linguagem, ## Preferências, ## Fatos recorrentes, ## Aprendizados). No máximo ~1200 palavras. Responda SOMENTE com o Markdown, sem comentários.",
      messages: [
        { role: "user", content: [{ type: "text", text: `MEMÓRIA ATUAL:\n${current || "(vazia)"}\n\n---\nATENDIMENTO:\n${String(transcript).slice(0, 6000)}` }] },
      ],
    });
    const block = res.content.find((b) => b.type === "text");
    const md = (block && "text" in block ? block.text : "").replace(/```(markdown)?/gi, "").trim();
    if (!md) return;
    const capped = md.slice(0, 60000);
    if (existing?.id) {
      await supabase.from("files").update({ text_content: capped }).eq("id", existing.id);
    } else {
      await supabase.from("files").insert({
        name: MEMORY_FILE,
        type: "file",
        parent_id: folderId,
        company_id: companyId ?? null,
        text_content: capped,
        mime: "text/markdown",
      });
    }
  } catch (e) {
    console.error("evolveAgentMemory failed:", e?.message || e);
  }
}

// Resolve o agente que cuidou da conversa (bot do número ou copiloto) e evolui a
// memória dele com o que rolou no atendimento.
async function evolveMemoryForConversation(conversation, transcript) {
  try {
    let chatbot = null;
    if (conversation.number_id) chatbot = (await getNumberConfig(conversation.number_id)).chatbot;
    if (!chatbot) chatbot = await getCopilotAgent(conversation.company_id);
    if (chatbot) await evolveAgentMemory(chatbot, transcript, conversation.company_id);
  } catch (e) {
    console.error("evolveMemoryForConversation failed:", e?.message || e);
  }
}

async function generateContactReport(conversation) {
  if (!supabase) return;
  const key = fallbackAnthropicKey;
  if (!key) return;
  try {
    // Já existe relatório desta conversa? Então não refaz.
    const { data: existing } = await supabase
      .from("contact_reports")
      .select("id")
      .eq("conversation_id", conversation.id)
      .maybeSingle();
    if (existing) return;
    const { data: msgs } = await supabase
      .from("whatsapp_messages")
      .select("direction,text,media_type,at")
      .eq("conversation_id", conversation.id)
      .order("at", { ascending: true })
      .limit(120);
    if (!msgs || msgs.length === 0) return;
    const transcript = msgs
      .map((m) => `${m.direction === "in" ? "Cliente" : "Atendimento"}: ${m.text || (m.media_type ? `[${m.media_type}]` : "")}`)
      .join("\n")
      .slice(0, 6000);
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      system:
        "Você analisa um atendimento de WhatsApp (bot ou humano) e devolve APENAS um JSON válido, sem texto extra, no formato " +
        '{"summary": "resumo curto de como foi o atendimento e do que o cliente precisava/como se comportou", "rating": 1-5, "sentiment": "positivo|neutro|negativo"}. ' +
        "O rating avalia a qualidade/cordialidade do atendimento como um todo.",
      messages: [{ role: "user", content: [{ type: "text", text: `Conversa:\n${transcript}` }] }],
    });
    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "{}";
    const json = JSON.parse(raw.replace(/```json|```/g, "").trim());
    await supabase.from("contact_reports").insert({
      company_id: conversation.company_id ?? null,
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      summary: String(json.summary || "").slice(0, 2000),
      rating: Number.isFinite(json.rating) ? Math.max(1, Math.min(5, Math.round(json.rating))) : null,
      sentiment: ["positivo", "neutro", "negativo"].includes(json.sentiment) ? json.sentiment : null,
      handled_by: conversation.assignee_id ? "humano" : "bot",
    });
    // O agente aprende com o atendimento: evolui o "cérebro" dele no grafo.
    if (msgs.length >= 4) void evolveMemoryForConversation(conversation, transcript);
  } catch (e) {
    console.error("generateContactReport failed:", e?.message || e);
  }
}

// Varre os atendimentos: encerra por inatividade (se ligado) e gera relatório
// dos que foram fechados (por bot, por inatividade ou MANUALMENTE no app).
async function attendanceSweep() {
  if (!supabase) return;
  try {
    // 1) Encerramento por inatividade — POR EMPRESA (cada uma tem seu tempo).
    // Pega conversas abertas paradas há +30min (o menor tempo possível) e checa
    // o auto_close_minutes da empresa de cada conversa.
    const minCutoff = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: stale } = await supabase
      .from("conversations")
      .select("*")
      .in("status", ["espera", "atendendo"])
      .lt("last_message_at", minCutoff)
      .order("last_message_at", { ascending: false })
      .limit(50);
    // Um contato pode ter mais de uma conversa aberta (dados antigos, corridas).
    // Só a MAIS RECENTE recebe a despedida; as demais fecham EM SILÊNCIO — senão o
    // cliente recebe "como não tivemos retorno" várias vezes (o loop que ele viu).
    const farewellDone = new Set();
    for (const conv of stale || []) {
      const info = await getCompanyInfo(conv.company_id);
      const minutes = Number(info?.auto_close_minutes || 0);
      if (minutes <= 0) continue;
      const age = Date.now() - new Date(conv.last_message_at || conv.updated_at || Date.now()).getTime();
      if (age < minutes * 60000) continue;
      // Fecha (uma vez que a despedida saiu para este contato, marca como enviada).
      const alreadyGreeted = conv.closing_sent || farewellDone.has(conv.contact_id);
      await supabase
        .from("conversations")
        .update({ status: "fechado", closed_at: new Date().toISOString(), bot_paused: true, closing_sent: true })
        .eq("id", conv.id);
      if (alreadyGreeted) continue; // já mandou a despedida uma vez — fecha calado.
      try {
        // IA CONTÍNUA fecha em SILÊNCIO (não manda "como não tivemos retorno").
        const { chatbot: numBot } = await getNumberConfig(conv.number_id);
        if (numBot?.continuous) continue;
        const { data: contact } = await supabase.from("contacts").select("jid,phone").eq("id", conv.contact_id).maybeSingle();
        const to = contact?.jid || contact?.phone;
        if (to) {
          farewellDone.add(conv.contact_id);
          let msg = "Como não tivemos retorno, vou encerrar nosso atendimento por aqui. 😊 Qualquer coisa é só chamar!";
          if (info?.review_link) msg += `\n\nSe puder, avalie nosso atendimento: ${info.review_link}`;
          await sendMessage(conv.number_id, to, msg, null, null).catch(() => {});
        }
      } catch { /* ignore */ }
    }
    // 2) Relatório dos atendimentos fechados recentemente (bot/inatividade/manual).
    const since = new Date(Date.now() - 6 * 3600000).toISOString();
    const { data: closed } = await supabase
      .from("conversations")
      .select("*")
      .eq("status", "fechado")
      .gte("closed_at", since)
      .limit(30);
    for (const conv of closed || []) {
      await generateContactReport(conv);
    }
  } catch (e) {
    console.error("attendanceSweep failed:", e?.message || e);
  }
}

app.listen(PORT, () => {
  console.log(`WhatsApp service listening on :${PORT}`);
  void resumeSessions();
  void backfillBrainFolders(); // garante pasta de memória p/ todo agente
  setInterval(watchdog, 60000);
  setInterval(attendanceSweep, 90000); // encerra inativos + gera relatórios
});
