// Processo principal do agente de acesso remoto.
// - Carrega a configuração de pareamento (config.json gerado pela plataforma).
// - Abre uma janela oculta (renderer) que faz a captura de tela + WebRTC.
// - Injeta mouse/teclado recebidos do operador usando nut.js.
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

let win = null;
let tray = null;

function loadConfig() {
  // Procura config.json ao lado do executável e na pasta do app.
  const candidates = [
    path.join(process.resourcesPath || ".", "config.json"),
    path.join(path.dirname(process.execPath), "config.json"),
    path.join(__dirname, "..", "config.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return null;
}

function createWindow(config) {
  win = new BrowserWindow({
    width: 480,
    height: 320,
    show: false, // roda em segundo plano
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer.html"));
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("config", { ...config, osName: `${os.type()} ${os.release()}` });
  });
}

// O renderer pede as fontes de captura (precisa rodar no main nas versões novas).
ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// Injeção de mouse/teclado vinda do operador (coordenadas normalizadas 0..1).
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
    const n = await ensureNut();
    const { mouse, keyboard, Point, Button, Key } = n;
    const disp = screen.getPrimaryDisplay();
    const w = disp.size.width;
    const h = disp.size.height;
    if (ev.kind === "move") {
      await mouse.setPosition(new Point(Math.round(ev.x * w), Math.round(ev.y * h)));
    } else if (ev.kind === "down") {
      await mouse.setPosition(new Point(Math.round(ev.x * w), Math.round(ev.y * h)));
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
    Enter: Key.Enter,
    Backspace: Key.Backspace,
    Tab: Key.Tab,
    Escape: Key.Escape,
    " ": Key.Space,
    ArrowLeft: Key.Left,
    ArrowRight: Key.Right,
    ArrowUp: Key.Up,
    ArrowDown: Key.Down,
    Delete: Key.Delete,
    Home: Key.Home,
    End: Key.End,
    Control: Key.LeftControl,
    Shift: Key.LeftShift,
    Alt: Key.LeftAlt,
    Meta: Key.LeftSuper,
  };
  return map[name] ?? null;
}

app.whenReady().then(() => {
  const config = loadConfig();
  if (!config || !config.agentId || !config.accessCode) {
    console.error("config.json ausente ou inválido — coloque o arquivo de pareamento ao lado do agente.");
  }
  createWindow(config || {});

  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Workspace — Acesso Remoto");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: config?.name ? `Máquina: ${config.name}` : "Acesso Remoto", enabled: false },
        { label: "Sair", click: () => app.quit() },
      ])
    );
  } catch {
    /* tray opcional */
  }
});

app.on("window-all-closed", (e) => {
  // Mantém rodando em segundo plano.
  e.preventDefault?.();
});
