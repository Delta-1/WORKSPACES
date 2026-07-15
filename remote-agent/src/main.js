// Processo principal do agente de acesso remoto.
// - Config pública (supabaseUrl + anonKey) vem de config.json embutido no app.
// - O pareamento (agentId + accessCode) é digitado pelo usuário no 1º uso e
//   salvo em userData/pairing.json (não precisa mexer em arquivo manualmente).
// - Injeta mouse/teclado recebidos do operador usando nut.js.
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, Tray, Menu, nativeImage, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Gera um código de suporte estável, derivado desta máquina (hostname + MAC).
// Mesmo PC => sempre o mesmo código de 9 dígitos.
function machineCode() {
  let mac = "";
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") {
        mac = ni.mac;
        break;
      }
    }
    if (mac) break;
  }
  const seed = `${os.hostname()}|${mac}|workspace-remote`;
  const hash = crypto.createHash("sha256").update(seed).digest();
  // 9 dígitos a partir do hash (fácil de ditar por telefone).
  const num = hash.readUInt32BE(0) % 1000000000;
  return String(num).padStart(9, "0");
}

let win = null;
let tray = null;
let lastPayload = null;

// Linux/Wayland: habilita a captura de tela via PipeWire (no X11 já funciona).
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

function loadBundledConfig() {
  const candidates = [
    path.join(process.resourcesPath || ".", "config.json"),
    path.join(__dirname, "..", "config.json"),
    path.join(path.dirname(process.execPath), "config.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return {};
}

function pairingPath() {
  return path.join(app.getPath("userData"), "pairing.json");
}
function loadPairing() {
  try {
    return JSON.parse(fs.readFileSync(pairingPath(), "utf8"));
  } catch {
    return null;
  }
}

function createWindow(payload, visible) {
  win = new BrowserWindow({
    width: 460,
    height: 300,
    show: visible,
    resizable: false,
    title: "Workspace — Acesso Remoto",
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, "renderer.html"));
  win.webContents.on("did-finish-load", () => {
    if (win && !win.isDestroyed()) win.webContents.send("config", payload);
  });
  // Evita usar referência de janela destruída (fonte do erro "Object destroyed").
  win.on("closed", () => {
    win = null;
  });
}

function showWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  } else if (lastPayload) {
    createWindow(lastPayload, true); // recria se já foi fechada
  }
}

ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.map((s) => ({ id: s.id, name: s.name, display_id: s.display_id }));
});

// Qual monitor está sendo controlado (para mapear mouse/teclado no lugar certo).
let activeDisplayId = null;
ipcMain.on("set-display", (_e, displayId) => {
  activeDisplayId = displayId != null ? String(displayId) : null;
});
function activeDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => String(d.id) === activeDisplayId) || screen.getPrimaryDisplay();
}

// Miniatura da tela (para a prévia ao vivo na listagem de computadores).
ipcMain.handle("get-thumbnail", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 320, height: 180 },
    });
    const thumb = sources[0]?.thumbnail;
    if (!thumb || thumb.isEmpty()) return null;
    return thumb.toJPEG(60).toString("base64");
  } catch {
    return null;
  }
});

ipcMain.on("save-pairing", (_e, pairing) => {
  try {
    fs.writeFileSync(pairingPath(), JSON.stringify(pairing));
  } catch (err) {
    console.error("save pairing", err);
  }
});
ipcMain.on("hide-window", () => {
  if (win && !win.isDestroyed()) win.hide();
});

// ---- Gerenciador de arquivos remoto (o operador navega/baixa/envia) ----
ipcMain.handle("fs-home", () => os.homedir());
ipcMain.handle("fs-list", (_e, dir) => {
  const target = dir && dir !== "~" ? dir : os.homedir();
  const entries = fs.readdirSync(target, { withFileTypes: true }).map((d) => {
    let size = 0;
    try {
      if (d.isFile()) size = fs.statSync(path.join(target, d.name)).size;
    } catch {
      /* ignore */
    }
    return { name: d.name, isDir: d.isDirectory(), size };
  });
  // pastas primeiro, depois arquivos, ambos ordenados
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return { dir: target, parent: path.dirname(target), sep: path.sep, entries };
});
ipcMain.handle("fs-read", (_e, filePath) => {
  const stat = fs.statSync(filePath);
  if (stat.size > 60 * 1024 * 1024) throw new Error("Arquivo muito grande (limite 60 MB).");
  return { name: path.basename(filePath), base64: fs.readFileSync(filePath).toString("base64") };
});
ipcMain.handle("fs-write", (_e, { dir, name, base64 }) => {
  const safeName = path.basename(name || "arquivo");
  const dest = path.join(dir || os.homedir(), safeName);
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return { path: dest };
});

ipcMain.on("copy-code", (_e, code) => {
  try {
    clipboard.writeText(String(code || ""));
  } catch {
    /* ignore */
  }
});

// Injeção de mouse/teclado (coordenadas normalizadas 0..1).
let nut = null;
async function ensureNut() {
  if (nut) return nut;
  nut = require("@nut-tree-fork/nut-js");
  nut.mouse.config.autoDelayMs = 0;
  nut.keyboard.config.autoDelayMs = 0;
  return nut;
}
ipcMain.on("input", async (_e, ev) => {
  try {
    const { mouse, keyboard, Point, Button, Key } = await ensureNut();
    // Mapeia para o monitor que está sendo controlado (bounds inclui o offset,
    // então o mouse vai pro monitor certo mesmo com vários monitores).
    const disp = activeDisplay();
    const b = disp.bounds;
    const absX = (nx) => Math.round(b.x + nx * b.width);
    const absY = (ny) => Math.round(b.y + ny * b.height);
    if (ev.kind === "move") {
      await mouse.setPosition(new Point(absX(ev.x), absY(ev.y)));
    } else if (ev.kind === "down") {
      await mouse.setPosition(new Point(absX(ev.x), absY(ev.y)));
      await mouse.pressButton(ev.button === 2 ? Button.RIGHT : Button.LEFT);
    } else if (ev.kind === "up") {
      await mouse.releaseButton(ev.button === 2 ? Button.RIGHT : Button.LEFT);
    } else if (ev.kind === "scroll") {
      if (ev.dy < 0) await mouse.scrollUp(3);
      else await mouse.scrollDown(3);
    } else if (ev.kind === "key") {
      const k = mapKey(Key, ev.key);
      if (k != null) {
        if (ev.down) await keyboard.pressKey(k);
        else await keyboard.releaseKey(k);
      } else if (ev.down && ev.text && ev.text.length === 1) {
        await keyboard.type(ev.text);
      }
    }
  } catch (err) {
    console.error("input error", err);
  }
});

function mapKey(Key, name) {
  const map = {
    Enter: Key.Enter, Backspace: Key.Backspace, Tab: Key.Tab, Escape: Key.Escape, " ": Key.Space,
    ArrowLeft: Key.Left, ArrowRight: Key.Right, ArrowUp: Key.Up, ArrowDown: Key.Down,
    Delete: Key.Delete, Home: Key.Home, End: Key.End,
    Control: Key.LeftControl, Shift: Key.LeftShift, Alt: Key.LeftAlt, Meta: Key.LeftSuper,
  };
  return map[name] ?? null;
}

// Garante uma única instância rodando (evita duplicar quando abre de novo).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

// Rede de segurança: nunca deixa uma exceção não tratada derrubar o app com
// aquela caixa de "A JavaScript error occurred in the main process".
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});

// Faz o app subir sozinho junto com o sistema (Windows, macOS e Linux).
function enableAutoStart() {
  try {
    if (process.platform === "linux") {
      // No Linux o setLoginItemSettings não funciona: cria um .desktop em
      // ~/.config/autostart apontando para o executável.
      const dir = path.join(app.getPath("home"), ".config", "autostart");
      fs.mkdirSync(dir, { recursive: true });
      const exec = process.execPath;
      const desktop = [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Workspace Acesso Remoto",
        `Exec="${exec}" --hidden`,
        "X-GNOME-Autostart-enabled=true",
        "NoDisplay=true",
        "Terminal=false",
      ].join("\n");
      fs.writeFileSync(path.join(dir, "workspace-remote-agent.desktop"), desktop);
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        path: process.execPath,
        args: ["--hidden"],
      });
    }
  } catch (err) {
    console.error("auto-start", err);
  }
}

app.whenReady().then(() => {
  enableAutoStart();
  const bundled = loadBundledConfig();
  const pairing = loadPairing();
  // O código é derivado da máquina (estável). Guardamos junto o agentId após o
  // 1º registro para não recriar linha à toa.
  const code = pairing?.accessCode || machineCode();
  const payload = {
    supabaseUrl: bundled.supabaseUrl || "",
    supabaseAnonKey: bundled.supabaseAnonKey || "",
    osName: `${os.type()} ${os.release()}`,
    hostName: os.hostname(),
    agentId: pairing?.agentId || null,
    accessCode: code,
  };
  lastPayload = payload; // guarda p/ recriar a janela pelo menu "Abrir"
  // Abre a janela na 1ª vez (pra mostrar o código); depois pode subir oculto.
  const hidden = process.argv.includes("--hidden");
  createWindow(payload, !hidden);

  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Workspace — Acesso Remoto");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir", click: () => showWindow() },
        { label: "Sair", click: () => app.quit() },
      ])
    );
  } catch {
    /* tray opcional */
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.(); // mantém rodando em segundo plano
});
