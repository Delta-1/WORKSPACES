// Sons de notificação do app Mensagens.
//
// Os sons embutidos são SINTETIZADOS na hora com a Web Audio API — não dependem
// de nenhum arquivo/asset externo (nada de rede, nada de CSP), tocam na hora e
// funcionam offline. A empresa também pode subir o PRÓPRIO som (um arquivo de
// áudio): nesse caso tocamos a URL dele.

export type NotifSoundId =
  | "ping"
  | "pop"
  | "chime"
  | "marimba"
  | "tri-tone"
  | "alert"
  | "none"
  | "custom";

export const NOTIF_SOUNDS: { id: NotifSoundId; label: string }[] = [
  { id: "ping", label: "Ping (padrão)" },
  { id: "pop", label: "Pop" },
  { id: "chime", label: "Sino" },
  { id: "marimba", label: "Marimba" },
  { id: "tri-tone", label: "Tri-tom" },
  { id: "alert", label: "Alerta" },
  { id: "none", label: "Sem som" },
];

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Toca uma nota simples (onda + envelope) num instante t.
function note(ac: AudioContext, t: number, freq: number, dur: number, type: OscillatorType = "sine", gain = 0.18) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012); // ataque rápido
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // decaimento
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function playBuiltin(id: NotifSoundId) {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  switch (id) {
    case "pop":
      note(ac, t, 440, 0.12, "sine", 0.22);
      break;
    case "chime":
      note(ac, t, 880, 0.5, "sine", 0.16);
      note(ac, t, 1320, 0.5, "sine", 0.08);
      break;
    case "marimba":
      note(ac, t, 660, 0.18, "triangle", 0.22);
      note(ac, t + 0.13, 990, 0.22, "triangle", 0.18);
      break;
    case "tri-tone":
      note(ac, t, 784, 0.16, "sine", 0.2); // G5
      note(ac, t + 0.14, 988, 0.16, "sine", 0.2); // B5
      note(ac, t + 0.28, 1319, 0.28, "sine", 0.2); // E6
      break;
    case "alert":
      note(ac, t, 520, 0.12, "square", 0.14);
      note(ac, t + 0.16, 520, 0.12, "square", 0.14);
      note(ac, t + 0.32, 520, 0.16, "square", 0.14);
      break;
    case "ping":
    default:
      note(ac, t, 987, 0.16, "sine", 0.2); // B5
      note(ac, t + 0.11, 1319, 0.3, "sine", 0.18); // E6
      break;
  }
}

// Toca a URL de um som personalizado da empresa.
function playUrl(url: string) {
  try {
    const a = new Audio(url);
    a.volume = 0.85;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// Toca o som escolhido. `customUrl` é usado quando id === "custom".
export function playNotifSound(id: NotifSoundId | null | undefined, customUrl?: string | null) {
  if (typeof window === "undefined") return;
  const choice = id || "ping";
  if (choice === "none") return;
  if (choice === "custom") {
    if (customUrl) playUrl(customUrl);
    else playBuiltin("ping");
    return;
  }
  playBuiltin(choice);
}
