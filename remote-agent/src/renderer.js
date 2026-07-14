// Renderer do agente (host). Fluxo estilo AnyDesk:
// 1) A máquina se registra sozinha com um código próprio (derivado dela).
// 2) Mostra o código na tela — o cliente informa ao suporte.
// 3) Fica online (heartbeat) e aguardando o operador conectar via WebRTC.
const { ipcRenderer } = require("electron");
const { createClient } = require("@supabase/supabase-js");

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const statusEl = document.getElementById("status");
const codeEl = document.getElementById("my-code");
const copyBtn = document.getElementById("copy");
const setStatus = (t) => (statusEl.textContent = t);

let supabase = null;
let cfg = null;
let channel = null;
let pc = null;
let stream = null;

function fmtCode(c) {
  return String(c || "").replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

ipcRenderer.on("config", async (_e, config) => {
  cfg = config;
  codeEl.textContent = fmtCode(cfg.accessCode);
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setStatus("Configuração ausente (config.json embutido).");
    return;
  }
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
  await registerSelf();
});

copyBtn?.addEventListener("click", () => {
  ipcRenderer.send("copy-code", cfg?.accessCode);
  copyBtn.textContent = "Copiado!";
  setTimeout(() => (copyBtn.textContent = "Copiar código"), 1500);
});

async function registerSelf() {
  setStatus("Registrando este computador…");
  try {
    const { data, error } = await supabase.rpc("register_self_agent", {
      p_code: cfg.accessCode,
      p_name: cfg.hostName || null,
      p_os: cfg.osName || null,
    });
    if (error || !data) {
      setStatus("Falha ao registrar: " + (error?.message || "sem resposta"));
      return;
    }
    cfg.agentId = data;
    ipcRenderer.send("save-pairing", { agentId: data, accessCode: cfg.accessCode });
    startAgent();
  } catch (e) {
    setStatus("Erro de rede ao registrar: " + e.message);
  }
}

async function startAgent() {
  await heartbeat();
  setInterval(heartbeat, 20000);
  uploadThumb();
  setInterval(uploadThumb, 6000); // prévia ao vivo (~a cada 6s)
  join();
}

// Sobe uma miniatura da tela para a listagem de computadores mostrar ao vivo.
let thumbBusy = false;
async function uploadThumb() {
  if (thumbBusy || !supabase || !cfg?.agentId) return;
  thumbBusy = true;
  try {
    const base64 = await ipcRenderer.invoke("get-thumbnail");
    if (base64) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      await supabase.storage
        .from("agent-thumbs")
        .upload(`${cfg.agentId}.jpg`, bytes, { contentType: "image/jpeg", upsert: true });
    }
  } catch {
    /* ignore */
  } finally {
    thumbBusy = false;
  }
}

async function heartbeat() {
  try {
    await supabase.rpc("agent_heartbeat", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
      p_os: cfg.osName || null,
    });
    setStatus("Online — pronto para o suporte se conectar.");
  } catch (e) {
    setStatus("Falha ao registrar online: " + e.message);
  }
}

function join() {
  channel = supabase.channel(`remote-${cfg.agentId}`, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload)).subscribe();
}
function send(payload) {
  channel?.send({ type: "broadcast", event: "signal", payload });
}

async function onSignal(msg) {
  if (!msg || msg.to !== "agent") return;
  if (msg.type === "connect") await startStreaming();
  else if (msg.type === "answer") await pc?.setRemoteDescription(msg.sdp);
  else if (msg.type === "ice" && msg.candidate) {
    try {
      await pc?.addIceCandidate(msg.candidate);
    } catch {
      /* ignore */
    }
  } else if (msg.type === "stop") cleanup();
}

async function startStreaming() {
  cleanup();
  setStatus("Suporte conectando… iniciando captura.");
  const sources = await ipcRenderer.invoke("get-sources");
  const src = sources[0];
  if (!src) {
    setStatus("Nenhuma tela encontrada.");
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: src.id,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      },
    },
  });

  pc = new RTCPeerConnection({ iceServers: ICE });
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));

  const control = pc.createDataChannel("control");
  control.onmessage = (ev) => {
    try {
      ipcRenderer.send("input", JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };

  // Canal de arquivos: o operador navega, baixa e envia arquivos p/ esta máquina.
  const files = pc.createDataChannel("files");
  files.binaryType = "arraybuffer";
  files.onmessage = (ev) => handleFileOp(files, ev.data);

  pc.onicecandidate = (e) => {
    if (e.candidate) send({ to: "operator", type: "ice", candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    setStatus("Conexão: " + pc.connectionState);
    if (["disconnected", "failed", "closed"].includes(pc.connectionState)) cleanup();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ to: "operator", type: "offer", sdp: offer });
  setStatus("Transmitindo a tela para o suporte…");
}

// Transfere respostas grandes em pedaços (o data channel tem limite ~16KB).
function sendChunked(ch, meta, base64) {
  const CHUNK = 12000;
  ch.send(JSON.stringify({ ...meta, kind: "begin", total: base64.length }));
  for (let i = 0; i < base64.length; i += CHUNK) {
    ch.send(JSON.stringify({ id: meta.id, kind: "chunk", data: base64.slice(i, i + CHUNK) }));
  }
  ch.send(JSON.stringify({ id: meta.id, kind: "end" }));
}

const incoming = new Map(); // uploads em andamento (operador -> máquina)

async function handleFileOp(ch, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    if (m.op === "list") {
      const res = await ipcRenderer.invoke("fs-list", m.dir);
      ch.send(JSON.stringify({ op: "list-result", id: m.id, ...res }));
    } else if (m.op === "get") {
      const { name, base64 } = await ipcRenderer.invoke("fs-read", m.path);
      sendChunked(ch, { op: "get-result", id: m.id, name }, base64);
    } else if (m.op === "put-begin") {
      incoming.set(m.id, { dir: m.dir, name: m.name, buf: "" });
    } else if (m.op === "put-chunk") {
      const it = incoming.get(m.id);
      if (it) it.buf += m.data;
    } else if (m.op === "put-end") {
      const it = incoming.get(m.id);
      if (it) {
        const saved = await ipcRenderer.invoke("fs-write", { dir: it.dir, name: it.name, base64: it.buf });
        incoming.delete(m.id);
        ch.send(JSON.stringify({ op: "put-done", id: m.id, path: saved.path }));
      }
    }
  } catch (e) {
    ch.send(JSON.stringify({ op: "error", id: m.id, message: e.message }));
  }
}

function cleanup() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    pc?.close();
  } catch {
    /* ignore */
  }
  pc = null;
  stream = null;
}

window.addEventListener("beforeunload", () => {
  if (supabase && cfg?.agentId) supabase.rpc("agent_set_offline", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode });
});
