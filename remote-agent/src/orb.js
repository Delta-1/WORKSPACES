// Bolinha flutuante do CLIENTE: escuta por voz (ou texto), mostra um balão
// flutuante com o que ouviu/respondeu e fala a resposta. Conversa com o
// /api/support-orb do workspace (identificado pelo access_code da máquina).
const { ipcRenderer } = require("electron");

let cfg = { appUrl: "", accessCode: "", agentName: "" };
let listening = false;
let speaking = false;
let rec = null;
const history = [];
const lastCmd = { text: "", at: 0 }; // dedup: não repetir o mesmo comando

const ball = document.getElementById("ball");
const mic = document.getElementById("mic");
const kbd = document.getElementById("kbd");
const closeBtn = document.getElementById("close");
const bubble = document.getElementById("bubble");
const bubbleText = document.getElementById("bubbleText");
const bubbleWho = document.getElementById("bubbleWho");
const typebox = document.getElementById("typebox");

ipcRenderer.on("orb-config", (_e, c) => { cfg = { ...cfg, ...c }; });

let hideTimer = null;
function say(who, text, keep) {
  bubbleWho.textContent = who;
  bubbleText.textContent = text;
  bubble.classList.add("show");
  if (hideTimer) clearTimeout(hideTimer);
  if (!keep) hideTimer = setTimeout(() => bubble.classList.remove("show"), 9000);
}

// Escolhe UMA voz em português e mantém sempre a mesma (evita misturar com a voz
// padrão do sistema/Google e a resposta sair "bugada" com duas vozes).
let ptVoice = null;
function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices() || [];
    ptVoice =
      vs.find((v) => /pt.?BR/i.test(v.lang) && /google/i.test(v.name)) ||
      vs.find((v) => /pt.?BR/i.test(v.lang)) ||
      vs.find((v) => /^pt/i.test(v.lang)) ||
      null;
  } catch { /* ignore */ }
}
try { pickVoice(); if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = pickVoice; } catch { /* ignore */ }

function speak(text) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // corta qualquer fala anterior — nunca sobrepõe duas vozes
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    if (ptVoice) u.voice = ptVoice;
    u.rate = 1; u.pitch = 1;
    // Enquanto fala, PAUSA o microfone (senão ele se ouve e vira loop).
    speaking = true;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } }
    const resume = () => { speaking = false; if (listening) { try { rec && rec.start(); } catch { /* ignore */ } } };
    u.onend = resume; u.onerror = resume;
    synth.speak(u);
  } catch { /* sem voz */ }
}

async function ask(text) {
  if (!text || !text.trim()) return;
  say("Você", text);
  history.push({ role: "user", text });
  if (!cfg.appUrl) { say("Assistente", "Não consigo falar com o suporte agora (app não configurado)."); return; }
  say("Assistente", "…", true);
  try {
    const res = await fetch(`${cfg.appUrl.replace(/\/$/, "")}/api/support-orb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code: cfg.accessCode, text, history: history.slice(-8) }),
    });
    const data = await res.json();
    const answer = data.answer || data.error || "Não consegui responder agora.";
    history.push({ role: "assistant", text: answer });
    say("Assistente", answer, true);
    speak(answer);
  } catch {
    say("Assistente", "Falha ao falar com o suporte. Tente de novo.");
  }
}

// --- Voz ---
// No PC o Orb fica MÃOS-LIVRES: clica no microfone e ele fica ouvindo direto;
// clica de novo e para. Ele NÃO para a cada frase — segue ouvindo o próximo
// comando — e ignora o mesmo comando repetido (fim do loop de "abre o YouTube").
function startListening() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) { toggleType(true); say("Assistente", "Sem microfone aqui — pode escrever."); return; }
  rec = new Ctor();
  rec.lang = "pt-BR";
  rec.continuous = true;   // sessão contínua — não corta a cada frase
  rec.interimResults = true;
  rec.onresult = (e) => {
    const from = typeof e.resultIndex === "number" ? e.resultIndex : e.results.length - 1;
    for (let i = from; i < e.results.length; i++) {
      const r = e.results[i];
      const t = (r[0] && r[0].transcript ? r[0].transcript : "").trim();
      if (!r.isFinal) { if (t) say("Você", t, true); continue; }
      if (!t || speaking) continue; // ignora o que capturou enquanto o Orb falava
      const norm = t.toLowerCase().replace(/[^\wà-ú\s]/gi, "").replace(/\s+/g, " ").trim();
      const now = Date.now();
      if (norm && norm === lastCmd.text && now - lastCmd.at < 6000) continue; // dedup
      lastCmd.text = norm; lastCmd.at = now;
      ask(t); // segue ouvindo (não para)
    }
  };
  rec.onerror = (ev) => {
    const err = ev && ev.error;
    if (err === "not-allowed" || err === "service-not-allowed") { stopListening(); say("Assistente", "Permita o microfone para eu ouvir."); }
    // no-speech/network/aborted: deixa o onend religar.
  };
  rec.onend = () => { if (listening && !speaking) { try { rec.start(); } catch { /* ignore */ } } };
  listening = true;
  ball.classList.add("listening");
  say("Assistente", "Estou ouvindo — pode falar.", true);
  try { rec.start(); } catch { /* ignore */ }
}
function stopListening() {
  listening = false;
  ball.classList.remove("listening");
  try { rec && rec.stop(); } catch {}
  rec = null;
}

function toggleType(force) {
  const show = force === true || !typebox.classList.contains("show");
  typebox.classList.toggle("show", show);
  if (show) typebox.focus();
}

mic.addEventListener("click", () => { if (listening) stopListening(); else startListening(); });
kbd.addEventListener("click", () => toggleType());
closeBtn.addEventListener("click", () => ipcRenderer.send("orb-hide"));
typebox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && typebox.value.trim()) { ask(typebox.value.trim()); typebox.value = ""; }
});
