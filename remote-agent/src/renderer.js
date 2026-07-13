// Renderer do agente: captura de tela + WebRTC + sinalização via Supabase Realtime.
const { ipcRenderer } = require("electron");
const { createClient } = require("@supabase/supabase-js");

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const statusEl = document.getElementById("status");
const setStatus = (t) => (statusEl.textContent = t);

let supabase = null;
let cfg = null;
let channel = null;
let pc = null;
let stream = null;

ipcRenderer.on("config", async (_e, config) => {
  cfg = config;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !cfg?.agentId || !cfg?.accessCode) {
    setStatus("Configuração inválida (config.json).");
    return;
  }
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
  await heartbeat();
  setInterval(heartbeat, 20000);
  join();
});

async function heartbeat() {
  try {
    await supabase.rpc("agent_heartbeat", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
      p_os: cfg.osName || null,
    });
    setStatus("Online — aguardando conexão do operador.");
  } catch (e) {
    setStatus("Falha ao registrar online: " + e.message);
  }
}

function join() {
  channel = supabase.channel(`remote-${cfg.agentId}`, { config: { broadcast: { self: false } } });
  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload))
    .subscribe();
}

function send(payload) {
  channel?.send({ type: "broadcast", event: "signal", payload });
}

async function onSignal(msg) {
  if (!msg || msg.to !== "agent") return;
  if (msg.type === "connect") {
    await startStreaming();
  } else if (msg.type === "answer") {
    await pc?.setRemoteDescription(msg.sdp);
  } else if (msg.type === "ice" && msg.candidate) {
    try {
      await pc?.addIceCandidate(msg.candidate);
    } catch {
      /* ignore */
    }
  } else if (msg.type === "stop") {
    cleanup();
  }
}

async function startStreaming() {
  cleanup();
  setStatus("Operador conectando… iniciando captura.");
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

  // Canal de controle: o operador envia eventos de mouse/teclado por aqui.
  const control = pc.createDataChannel("control");
  control.onmessage = (ev) => {
    try {
      ipcRenderer.send("input", JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };

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
  setStatus("Transmitindo a tela…");
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
  if (supabase && cfg) supabase.rpc("agent_set_offline", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode });
});
