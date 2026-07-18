// Bolinha flutuante do CLIENTE: escuta por voz (ou texto), mostra um balão
// flutuante com o que ouviu/respondeu e fala a resposta. Conversa com o
// /api/support-orb do workspace (identificado pelo access_code da máquina).
const { ipcRenderer } = require("electron");

let cfg = { appUrl: "", accessCode: "", agentName: "" };
let listening = false;
let rec = null;
const history = [];

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

function speak(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    window.speechSynthesis.speak(u);
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
function startListening() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) { toggleType(true); say("Assistente", "Sem microfone aqui — pode escrever."); return; }
  rec = new Ctor();
  rec.lang = "pt-BR";
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
    say("Você", t || "…", true); // texto flutuante do que está falando
    if (e.results[e.results.length - 1].isFinal && t) { stopListening(); ask(t); }
  };
  rec.onerror = () => stopListening();
  rec.onend = () => { if (listening) { try { rec.start(); } catch {} } };
  listening = true;
  ball.classList.add("listening");
  say("Assistente", "Estou ouvindo…", true);
  try { rec.start(); } catch {}
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
