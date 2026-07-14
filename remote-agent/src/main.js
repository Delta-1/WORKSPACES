// Processo principal do agente de acesso remoto.
// - Config pública (supabaseUrl + anonKey) vem de config.json embutido no app.
// - O pareamento (agentId + accessCode) é digitado pelo usuário no 1º uso e
//   salvo em userData/pairing.json (não precisa mexer em arquivo manualmente).
// - Injeta mouse/teclado recebidos do operador usando nut.js.
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

let win = null;
let tray = null;

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
  win.webContents.on("did-finish-load", () => win.webContents.send("config", payload));
}

ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

ipcMain.on("save-pairing", (_e, pairing) => {
  try {
    fs.writeFileSync(pairingPath(), JSON.stringify(pairing));
  } catch (err) {
    console.error("save pairing", err);
  }
});
ipcMain.on("hide-window", () => win?.hide());

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
    Enter: Key.Enter, Backspace: Key.Backspace, Tab: Key.Tab, Escape: Key.Escape, " ": Key.Space,
    ArrowLeft: Key.Left, ArrowRight: Key.Right, ArrowUp: Key.Up, ArrowDown: Key.Down,
    Delete: Key.Delete, Home: Key.Home, End: Key.End,
    Control: Key.LeftControl, Shift: Key.LeftShift, Alt: Key.LeftAlt, Meta: Key.LeftSuper,
  };
  return map[name] ?? null;
}

app.whenReady().then(() => {
  const bundled = loadBundledConfig();
  const pairing = loadPairing();
  // Permite "zero digitação": o código pode vir no nome do .exe
  // (ex.: WorkspaceAcessoRemoto-123456789012.exe).
  const exeName = path.basename(process.execPath);
  const m = exeName.match(/(\d{6,})/);
  const codeFromFilename = m ? m[1] : null;
  const payload = {
    supabaseUrl: bundled.supabaseUrl || "",
    supabaseAnonKey: bundled.supabaseAnonKey || "",
    osName: `${os.type()} ${os.release()}`,
    agentId: pairing?.agentId || null,
    accessCode: pairing?.accessCode || null,
    codeFromFilename,
    needCode: !pairing,
  };
  // Só mostra a janela se precisar digitar o código manualmente.
  const askManually = !pairing && !codeFromFilename;
  createWindow(payload, askManually);

  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("Workspace — Acesso Remoto");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir", click: () => win?.show() },
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
