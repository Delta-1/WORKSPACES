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
const zlib = require("zlib");
const { execSync } = require("child_process");

// Acesso completo: o agente precisa rodar COMO ADMINISTRADOR para controlar
// janelas elevadas (Gerenciador de Tarefas, instaladores) e as caixas de UAC.
function isElevated() {
  if (process.platform !== "win32") return true; // Linux/mac: sem UIPI
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}


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

// Miniatura da tela (prévia ao vivo). Com { full: true } captura em resolução
// maior — usado quando o suporte pede um PRINT nítido da tela.
ipcMain.handle("get-thumbnail", async (_e, opts) => {
  try {
    const full = opts && opts.full;
    const size = full
      ? (() => { const b = screen.getPrimaryDisplay().size; return { width: Math.min(1920, b.width), height: Math.min(1080, b.height) }; })()
      : { width: 320, height: 180 };
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: size });
    const thumb = sources[0]?.thumbnail;
    if (!thumb || thumb.isEmpty()) return null;
    return thumb.toJPEG(full ? 80 : 60).toString("base64");
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
      elevated: isElevated(), // acesso completo (admin) disponível?
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
// ---- Allowlist de pastas ("bloquear acesso") ----
// Quando o gestor define pastas liberadas, o operador só navega/lê/grava dentro
// delas. Vazio = sem restrição (comportamento antigo).
let sharedPaths = [];
ipcMain.handle("set-shared-paths", (_e, paths) => {
  sharedPaths = Array.isArray(paths) ? paths.filter((p) => p && String(p).trim()).map((p) => String(p)) : [];
  return sharedPaths.length;
});
function norm(p) {
  return path.resolve(String(p || "")).replace(/[\\/]+$/, "").toLowerCase();
}
// Um caminho é permitido se não há restrição, OU está dentro de alguma pasta liberada.
function isAllowed(p) {
  if (!sharedPaths.length) return true;
  const t = norm(p);
  return sharedPaths.some((root) => {
    const r = norm(root);
    return t === r || t.startsWith(r + path.sep.toLowerCase()) || t.startsWith(r + "/");
  });
}
function ensureAllowed(p) {
  if (!isAllowed(p)) throw new Error("Acesso bloqueado: esta pasta não está liberada pelo gestor.");
}

ipcMain.handle("fs-home", () => (sharedPaths.length ? sharedPaths[0] : os.homedir()));
ipcMain.handle("fs-list", (_e, dir) => {
  // Sem pasta definida e com restrição → mostra as pastas liberadas como "raízes".
  if ((!dir || dir === "~") && sharedPaths.length) {
    const entries = sharedPaths.map((p) => ({ name: p, isDir: true, size: 0, full: p }));
    return { dir: "", parent: "", sep: path.sep, entries, roots: true };
  }
  const target = dir && dir !== "~" ? dir : os.homedir();
  ensureAllowed(target);
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
  // Se estamos numa raiz liberada, não deixa "subir" além dela.
  const atSharedRoot = sharedPaths.some((r) => norm(r) === norm(target));
  return { dir: target, parent: atSharedRoot ? "" : path.dirname(target), sep: path.sep, entries };
});
ipcMain.handle("fs-read", (_e, filePath) => {
  ensureAllowed(filePath);
  const stat = fs.statSync(filePath);
  if (stat.size > 60 * 1024 * 1024) throw new Error("Arquivo muito grande (limite 60 MB).");
  return { name: path.basename(filePath), base64: fs.readFileSync(filePath).toString("base64") };
});
// Coleta arquivos de um caminho (arquivo único OU pasta inteira, recursivo)
// para a automação enviar tudo pro Drive. Retorna [{ rel, base64 }].
// Coleta arquivos de um caminho (arquivo único ou pasta inteira, recursiva).
// Retorna [{ rel, base64 }] preservando a estrutura relativa a partir da
// pasta de origem (a raiz é o nome da própria pasta/arquivo).
function collectFiles(srcPath) {
  const out = [];
  const MAX_FILES = 2000;
  const MAX_BYTES = 200 * 1024 * 1024; // teto total ~200 MB por rodada
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
          if (sz > 90 * 1024 * 1024) continue; // pula arquivos gigantes
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
}

ipcMain.handle("fs-collect", (_e, srcPath) => collectFiles(srcPath));

// Empacota o caminho de origem num ÚNICO arquivo comprimido (.wsz = JSON gzip).
// Uma só transferência (rápida) que preserva os arquivos reais e a estrutura.
ipcMain.handle("fs-bundle", (_e, srcPath) => {
  const files = collectFiles(srcPath);
  if (!files.length) return { bundle: null, names: [], count: 0 };
  const payload = { root: path.basename(srcPath), files };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
  return { bundle: gz.toString("base64"), names: files.map((f) => f.rel.split("/").pop()), count: files.length };
});

// Recebe um .wsz (JSON gzip), descompacta e grava os arquivos reais preservando
// a estrutura, dentro da pasta de destino do servidor.
ipcMain.handle("server-extract-bundle", (_e, { root, dir, base64 }) => {
  const json = JSON.parse(zlib.gunzipSync(Buffer.from(base64, "base64")).toString());
  const baseDir = dir && String(dir).trim() ? String(dir) : path.join(serverBase(root), "Arquivos");
  const written = [];
  for (const f of json.files || []) {
    const safeRel = String(f.rel || "arquivo")
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p && p !== "." && p !== "..")
      .join("/");
    const dest = path.join(baseDir, safeRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(f.base64, "base64"));
    written.push(path.basename(dest));
  }
  return { count: written.length, names: written };
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
    fs.mkdirSync(base, { recursive: true });
    for (const d of ["Cerebro", "Arquivos", "Download"]) fs.mkdirSync(path.join(base, d), { recursive: true });
    // Deixa um guia para o gestor achar/entender a pasta compartilhada.
    const readme = path.join(base, "LEIA-ME.txt");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        [
          "Esta é a pasta do SERVIDOR de arquivos do Workspace.",
          "",
          "  • Arquivos  → banco de dados de arquivos da empresa (automações caem aqui).",
          "  • Cerebro   → base de conhecimento da IA (o cérebro do robô).",
          "  • Download  → arquivos baixados pelo acesso remoto vão para cá.",
          "",
          "Não renomeie estas pastas. Elas aparecem no grafo do site em tempo real.",
        ].join("\r\n")
      );
    }
  } catch (err) {
    console.error("server-init", err);
  }
  return base;
});

// Escreve/atualiza um item do "cérebro" da IA na pasta Cerebro do servidor.
// O conteúdo textual da base de conhecimento vira um .txt local, para o
// servidor virar também o banco de dados do cérebro do robô.
ipcMain.handle("cerebro-write", (_e, { root, name, content }) => {
  const dir = path.join(serverBase(root), "Cerebro");
  fs.mkdirSync(dir, { recursive: true });
  let safe = String(name || "documento").replace(/[\\/:*?"<>|]/g, "_").trim() || "documento";
  if (!/\.txt$/i.test(safe)) safe += ".txt";
  fs.writeFileSync(path.join(dir, safe), String(content || ""), "utf8");
  return { path: path.join(dir, safe) };
});

// Remove da pasta Cerebro os .txt que não pertencem mais ao cérebro (limpeza).
ipcMain.handle("cerebro-prune", (_e, { root, keep }) => {
  const dir = path.join(serverBase(root), "Cerebro");
  if (!fs.existsSync(dir)) return { removed: 0 };
  const keepSet = new Set((keep || []).map((k) => String(k)));
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.txt$/i.test(entry.name) && !keepSet.has(entry.name)) {
      try {
        fs.unlinkSync(path.join(dir, entry.name));
        removed++;
      } catch {
        /* ignore */
      }
    }
  }
  return { removed };
});

// Lê a árvore de pastas/arquivos do servidor (Cerebro/Arquivos/Download) para
// espelhar no grafo do site. Retorna [{ rel, dir }].
ipcMain.handle("server-tree", (_e, root) => {
  const base = serverBase(root);
  const out = [];
  const walk = (dir, prefix, depth) => {
    if (depth > 6 || out.length > 2000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) { out.push({ rel, dir: true, src: abs }); walk(abs, rel, depth + 1); }
      else if (d.isFile()) {
        let size = 0, mtime = 0;
        try { const st = fs.statSync(abs); size = st.size; mtime = st.mtimeMs; } catch { /* ignore */ }
        out.push({ rel, dir: false, src: abs, size, mtime });
      }
    }
  };
  for (const top of ["Cerebro", "Arquivos", "Download"]) {
    const p = path.join(base, top);
    if (fs.existsSync(p)) { out.push({ rel: top, dir: true, src: p }); walk(p, top, 1); }
  }
  return out;
});

// Lê o conteúdo de um arquivo do servidor (para subir ao company-files).
ipcMain.handle("server-read", (_e, absPath) => {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size > 30 * 1024 * 1024) return null;
    return fs.readFileSync(absPath).toString("base64");
  } catch {
    return null;
  }
});
// Move/renomeia um item no disco do servidor.
ipcMain.handle("server-move", (_e, { from, to }) => {
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle("server-delete", (_e, target) => {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Grava um arquivo recebido (transferência do operador) na pasta Download do servidor.
ipcMain.handle("server-download-write", (_e, { root, name, base64 }) => {
  const base = serverBase(root);
  const dir = path.join(base, "Download");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(name || "arquivo"));
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return { path: dest };
});

// Máquina comum (não-servidor) que recebe um arquivo distribuído: guarda em
// ~/WorkspaceDownloads (caixa de entrada).
ipcMain.handle("inbox-write", (_e, { name, base64 }) => {
  const dir = path.join(os.homedir(), "WorkspaceDownloads");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(name || "arquivo"));
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return { path: dest };
});
ipcMain.handle("server-write", (_e, { root, dir, rel, base64 }) => {
  // Sanitiza o caminho relativo (nunca escapa da pasta base).
  const safeRel = String(rel || "arquivo")
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
  // Pasta de destino escolhida (dir absoluto) ou o padrão WorkspaceServer/Arquivos.
  const baseDir = dir && String(dir).trim() ? String(dir) : path.join(serverBase(root), "Arquivos");
  const dest = path.join(baseDir, safeRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(base64, "base64"));
  return { path: dest };
});

// Operações de pasta (para o seletor: criar/renomear/apagar).
ipcMain.handle("fs-mkdir", (_e, { dir, name }) => {
  ensureAllowed(dir || os.homedir());
  const dest = path.join(dir || os.homedir(), path.basename(name || "Nova Pasta"));
  fs.mkdirSync(dest, { recursive: true });
  return { path: dest };
});
ipcMain.handle("fs-rename", (_e, { fromPath, toName }) => {
  ensureAllowed(fromPath);
  const dest = path.join(path.dirname(fromPath), path.basename(toName || "renomeado"));
  fs.renameSync(fromPath, dest);
  return { path: dest };
});
ipcMain.handle("fs-delete", (_e, targetPath) => {
  ensureAllowed(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  return { ok: true };
});

ipcMain.handle("fs-write", (_e, { dir, name, base64 }) => {
  ensureAllowed(dir || os.homedir());
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
      } else if (ev.name === "enter") {
        await keyboard.pressKey(Key.Enter);
        await keyboard.releaseKey(Key.Enter);
      } else if (ev.name === "tab") {
        await keyboard.pressKey(Key.Tab);
        await keyboard.releaseKey(Key.Tab);
      } else if (ev.name === "selectall") {
        await keyboard.pressKey(Key.LeftControl, Key.A);
        await keyboard.releaseKey(Key.LeftControl, Key.A);
      } else if (ev.name === "save") {
        await keyboard.pressKey(Key.LeftControl, Key.S);
        await keyboard.releaseKey(Key.LeftControl, Key.S);
      } else if (ev.name === "run") {
        // Win+R (executar) — usado para abrir apps por nome.
        await keyboard.pressKey(Key.LeftSuper, Key.R);
        await keyboard.releaseKey(Key.LeftSuper, Key.R);
      }
    } else if (ev.kind === "type") {
      // Digita um texto inteiro de uma vez (usado pelo Orb autônomo).
      if (ev.text) await keyboard.type(String(ev.text));
    } else if (ev.kind === "down") {
      // Com coordenadas = clique absoluto; sem = segura no ponto atual (arrasto do trackpad).
      if (ev.x != null && ev.y != null) await mouse.setPosition(new Point(absX(ev.x), absY(ev.y)));
      await mouse.pressButton(ev.button === 2 ? Button.RIGHT : Button.LEFT);
    } else if (ev.kind === "up") {
      await mouse.releaseButton(ev.button === 2 ? Button.RIGHT : Button.LEFT);
    } else if (ev.kind === "scroll") {
      // amount = quantos "cliques" de scroll (mais sensível). Default 3.
      const ticks = Math.max(1, Math.min(40, Math.round(Math.abs(ev.amount || 3))));
      if (ev.dy < 0) await mouse.scrollUp(ticks);
      else await mouse.scrollDown(ticks);
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

// ---------------------------------------------------------------------------
// AUTO-ATUALIZAÇÃO — o app se atualiza sozinho para a última versão.
// Lê a tabela app_releases no Supabase (version + link direto por sistema),
// compara com a versão atual e, se houver nova, baixa e executa o instalador.
// O gestor atualiza app_releases após cada build (versão + link DIRETO de
// download do Windows/.exe e do Linux/.AppImage).
// ---------------------------------------------------------------------------
const https = require("https");
const { spawn } = require("child_process");

function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function httpsGet(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
          res.resume();
          return resolve(httpsGet(res.headers.location, headers, redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function httpsDownload(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 6) {
          res.resume();
          file.close();
          return resolve(httpsDownload(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); file.close(); return reject(new Error("HTTP " + res.statusCode)); }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(dest)));
      })
      .on("error", (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

let updating = false;
async function checkForUpdate(cfg, manual = false) {
  const { dialog } = require("electron");
  if (updating) return;
  try {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    const buf = await httpsGet(`${cfg.supabaseUrl}/rest/v1/app_releases?select=updated_at,version,url_win,url_linux&limit=1`, {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    });
    const rows = JSON.parse(buf.toString("utf8"));
    const rel = Array.isArray(rows) ? rows[0] : null;
    // SEM número de versão manual: compara a DATA/HORA da última publicação
    // (updated_at) com a que esta máquina já aplicou (guardada localmente).
    const stampFile = path.join(app.getPath("userData"), "applied-release.txt");
    let applied = null;
    try { applied = fs.readFileSync(stampFile, "utf8").trim(); } catch {}
    const releaseStamp = rel ? String(rel.updated_at || "") : "";
    // Primeira execução (recém-instalado): marca a publicação atual como base e
    // NÃO atualiza — afinal a pessoa acabou de baixar a versão mais nova.
    if (applied === null) {
      try { fs.writeFileSync(stampFile, releaseStamp); } catch {}
      if (manual) dialog.showMessageBox({ type: "info", title: "Acesso Remoto", message: "Você já está na versão mais recente." });
      return;
    }
    if (!rel || !releaseStamp || releaseStamp <= applied) {
      if (manual) dialog.showMessageBox({ type: "info", title: "Acesso Remoto", message: "Você já está na versão mais recente." });
      return;
    }
    const url = process.platform === "win32" ? rel.url_win : rel.url_linux;
    if (!url) {
      if (manual) dialog.showMessageBox({ type: "warning", title: "Atualização", message: "Há uma nova versão, mas sem link para o seu sistema ainda." });
      return;
    }
    if (manual) {
      const r = dialog.showMessageBoxSync({ type: "question", buttons: ["Atualizar agora", "Depois"], defaultId: 0, title: "Atualização disponível", message: "Há uma nova versão do Acesso Remoto. Atualizar agora?" });
      if (r !== 0) return;
    }
    // Marca ANTES de instalar, para não repetir a atualização depois do reinício.
    try { fs.writeFileSync(stampFile, releaseStamp); } catch {}
    updating = true;
    const ext = process.platform === "win32" ? ".exe" : ".AppImage";
    const dest = path.join(app.getPath("temp"), `workspace-remote-update-${Date.now()}${ext}`);
    await httpsDownload(url, dest);
    if (process.platform !== "win32") { try { fs.chmodSync(dest, 0o755); } catch {} }
    // Executa o instalador/nova versão e fecha o app atual para concluir.
    const child = spawn(dest, [], { detached: true, stdio: "ignore" });
    child.unref();
    app.isQuitting = true;
    setTimeout(() => app.quit(), 900);
  } catch (e) {
    updating = false;
    console.error("auto-update", e?.message || e);
    if (manual) { try { require("electron").dialog.showMessageBox({ type: "error", title: "Atualização", message: "Não consegui atualizar agora: " + (e?.message || e) }); } catch {} }
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
        { label: `Código: ${code}`, enabled: false },
        { label: `Versão ${app.getVersion()}`, enabled: false },
        { type: "separator" },
        { label: "Abrir janela do código", click: () => showWindow() },
        { label: "Atualizar (buscar nova versão)", click: () => checkForUpdate(payload, true) },
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

  // Verifica atualização ao abrir e depois a cada 3 horas (silencioso).
  setTimeout(() => checkForUpdate(payload, false), 8000);
  setInterval(() => checkForUpdate(payload, false), 3 * 3600 * 1000);
});

app.on("window-all-closed", (e) => {
  e.preventDefault?.(); // mantém rodando em segundo plano
});
