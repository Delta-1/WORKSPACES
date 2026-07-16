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
// Só encerra de verdade quando pedido explicitamente (nunca ao fechar a janela).
// Fechar a janela apenas esconde na bandeja; para encerrar mesmo, só pelo
// Gerenciador de Tarefas — assim usuários comuns não derrubam o acesso do técnico.
app.isQuitting = false;

// Ícone simples (quadrado verde) pra bandeja aparecer no canto inferior direito.
const TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKAAA67QAEwJ0F0kAAAAASUVORK5CYII=";
function trayIcon() {
  try {
    const img = nativeImage.createFromDataURL("data:image/png;base64," + TRAY_ICON_PNG);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch {
    return nativeImage.createEmpty();
  }
}

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
  // Fechar a janela (X) NÃO encerra o app: apenas esconde na bandeja e segue
  // rodando em segundo plano. Para encerrar mesmo, só pelo Gerenciador de Tarefas.
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      if (win && !win.isDestroyed()) win.hide();
    }
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

// Coleta um panorama do computador (rede, CPU, memória) para o painel do técnico.
ipcMain.handle("get-specs", () => {
  try {
    const nets = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name] || []) {
        if (ni.family === "IPv4" && !ni.internal) {
          nets.push({ name, ip: ni.address, mac: ni.mac });
        }
      }
    }
    const cpus = os.cpus();
    return {
      platform: process.platform, // win32 | linux | darwin
      osName: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      cpu: cpus[0]?.model?.trim() || "CPU",
      cores: cpus.length,
      memTotalGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      memFreeGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
      uptimeH: Math.round((os.uptime() / 3600) * 10) / 10,
      networks: nets,
      reportedAt: new Date().toISOString(),
    };
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
// Coleta arquivos de um caminho (arquivo único OU pasta inteira, recursivo)
// para a automação enviar tudo pro Drive. Retorna [{ rel, base64 }].
ipcMain.handle("fs-collect", (_e, srcPath) => {
  const out = [];
  const MAX_FILES = 500;
  const MAX_BYTES = 80 * 1024 * 1024; // teto total ~80 MB por rodada
  let total = 0;
  const stat = fs.statSync(srcPath);
  if (stat.isFile()) {
    out.push({ rel: path.basename(srcPath), base64: fs.readFileSync(srcPath).toString("base64") });
    return out;
  }
  const walk = (dir, prefix) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES || total >= MAX_BYTES) return;
      const full = path.join(dir, d.name);
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      if (d.isDirectory()) {
        walk(full, rel);
      } else if (d.isFile()) {
        try {
          const sz = fs.statSync(full).size;
          if (sz > 40 * 1024 * 1024) continue; // pula arquivos gigantes
          total += sz;
          out.push({ rel, base64: fs.readFileSync(full).toString("base64") });
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(srcPath, path.basename(srcPath));
  return out;
});

// ---- Modo SERVIDOR de arquivos ----
// Pasta base do servidor (padrão: ~/WorkspaceServer). Cria as pastas nossas
// (Cérebro do robô + Arquivos) para não bagunçar o resto da máquina.
function serverBase(root) {
  return root && String(root).trim() ? String(root) : path.join(os.homedir(), "WorkspaceServer");
}
ipcMain.handle("server-init", (_e, root) => {
  const base = serverBase(root);
  try {
    for (const d of ["Cerebro", "Arquivos"]) fs.mkdirSync(path.join(base, d), { recursive: true });
  } catch (err) {
    console.error("server-init", err);
  }
  return base;
});
ipcMain.handle("server-write", (_e, { root, rel, base64 }) => {
  const base = serverBase(root);
  // Sanitiza o caminho relativo (nunca escapa da pasta base).
  const safeRel = String(rel || "arquivo")
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
  const dest = path.join(base, "Arquivos", safeRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return { path: dest };
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
    } else if (ev.kind === "move-rel") {
      // Movimento relativo (trackpad do celular): desloca o cursor atual.
      const cur = await mouse.getPosition();
      const gain = 1.4;
      let nx = cur.x + (ev.dx || 0) * gain;
      let ny = cur.y + (ev.dy || 0) * gain;
      // Mantém dentro do monitor controlado.
      nx = Math.max(b.x, Math.min(b.x + b.width - 1, nx));
      ny = Math.max(b.y, Math.min(b.y + b.height - 1, ny));
      await mouse.setPosition(new Point(Math.round(nx), Math.round(ny)));
    } else if (ev.kind === "click") {
      // Clique do trackpad na posição atual (sem mover).
      await mouse.click(ev.button === 2 ? Button.RIGHT : Button.LEFT);
    } else if (ev.kind === "combo") {
      // Atalhos rápidos vindos dos botões do celular / barra de comando.
      if (ev.name === "taskmanager") {
        // Gerenciador de Tarefas (Windows): Ctrl+Shift+Esc.
        await keyboard.pressKey(Key.LeftControl, Key.LeftShift, Key.Escape);
        await keyboard.releaseKey(Key.LeftControl, Key.LeftShift, Key.Escape);
      } else if (ev.name === "home") {
        // Tecla "casa" (Windows/Super) — abre o menu inicial (Win/Linux).
        await keyboard.pressKey(Key.LeftSuper);
        await keyboard.releaseKey(Key.LeftSuper);
      } else if (ev.name === "altf4") {
        await keyboard.pressKey(Key.LeftAlt, Key.F4);
        await keyboard.releaseKey(Key.LeftAlt, Key.F4);
      } else if (ev.name === "copy") {
        await keyboard.pressKey(Key.LeftControl, Key.C);
        await keyboard.releaseKey(Key.LeftControl, Key.C);
      } else if (ev.name === "paste") {
        await keyboard.pressKey(Key.LeftControl, Key.V);
        await keyboard.releaseKey(Key.LeftControl, Key.V);
      }
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
    tray = new Tray(trayIcon());
    tray.setToolTip("Workspace — Acesso Remoto (ativo)");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir janela do código", click: () => showWindow() },
        { type: "separator" },
        {
          label: "Encerrar acesso remoto",
          click: () => {
            // Confirmação: encerrar tira o acesso do técnico até reabrir o app.
            app.isQuitting = true;
            app.quit();
          },
        },
      ])
    );
    // Clicar no ícone da bandeja reabre a janela do código.
    tray.on("click", () => showWindow());
    tray.on("double-click", () => showWindow());
  } catch {
    /* tray opcional */
  }
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.(); // mantém rodando em segundo plano
});
