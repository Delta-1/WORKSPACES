// WORKSPACES DESKTOP (Electron)
// ─────────────────────────────────────────────────────────────────────────────
// O app do Workspaces para computador. Ele abre o site do Workspaces numa janela
// própria (com o ícone do Workspaces na barra de tarefas) e, o mais importante,
// deixa você jogar CADA app numa janela separada — arraste o Kanban para um
// monitor e o Calendário para outro, cada um como um widget independente.
//
// Como ele sabe QUAL endereço abrir? Na primeira vez ele pergunta o endereço do
// seu Workspaces (ex.: https://suaempresa.com) e guarda. Dá para trocar depois
// no menu (Arquivo → Configurar endereço).

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const ICON = path.join(__dirname, "icon.png");
const CONFIG_PATH = () => path.join(app.getPath("userData"), "config.json");

// Endereço padrão: pode vir pré-configurado por variável de ambiente na hora de
// gerar o instalador (WORKSPACES_URL). Senão, perguntamos na primeira vez.
const DEFAULT_URL = process.env.WORKSPACES_URL || "";

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), "utf8")); } catch { return {}; }
}
function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2)); } catch { /* ignore */ }
}
function baseUrl() {
  const cfg = readConfig();
  return (cfg.url || DEFAULT_URL || "").trim();
}

let mainWindow = null;
const widgetWindows = new Map(); // appId -> BrowserWindow

// Janela onde a pessoa digita o endereço do Workspaces (1ª vez / trocar).
function askForUrl() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 460, height: 300, resizable: false, icon: ICON,
      title: "Workspaces", autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "setup-preload.js"), contextIsolation: true },
    });
    win.loadFile(path.join(__dirname, "setup.html"));
    ipcMain.once("setup-save", (_e, url) => {
      const clean = String(url || "").trim().replace(/\/+$/, "");
      const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
      const cfg = readConfig(); cfg.url = full; writeConfig(cfg);
      win.close();
      resolve(full);
    });
    win.on("closed", () => resolve(baseUrl()));
  });
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    icon: ICON, title: "Workspaces", backgroundColor: "#060a12",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  mainWindow.loadURL(url);
  wireWindowOpen(mainWindow);
  mainWindow.on("closed", () => { mainWindow = null; });
}

// Abre um app do Workspaces numa janela SEPARADA (widget): usa a rota ?solo=<id>
// do próprio site, que mostra só aquele app. Uma janela por app; se já existir,
// só traz para frente.
function openWidget(appId) {
  const url = baseUrl();
  if (!url) return;
  const existing = widgetWindows.get(appId);
  if (existing && !existing.isDestroyed()) { existing.focus(); return; }
  const win = new BrowserWindow({
    width: 520, height: 720, minWidth: 360, minHeight: 420,
    icon: ICON, title: "Workspaces", backgroundColor: "#060a12",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.loadURL(`${url}/?solo=${encodeURIComponent(appId)}&widget=1`);
  wireWindowOpen(win);
  widgetWindows.set(appId, win);
  win.on("closed", () => widgetWindows.delete(appId));
}

// Links externos abrem no navegador padrão; janelas ?solo= abrem como widget
// nativo em vez de uma popup do Chromium.
function wireWindowOpen(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      const solo = u.searchParams.get("solo");
      const base = baseUrl();
      if (solo && base && url.startsWith(base)) { openWidget(solo); return { action: "deny" }; }
      if (u.protocol === "http:" || u.protocol === "https:") { shell.openExternal(url); return { action: "deny" }; }
    } catch { /* ignore */ }
    return { action: "allow" };
  });
}

function buildMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        { label: "Recarregar", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
        {
          label: "Configurar endereço…",
          click: async () => { const url = await askForUrl(); if (url && mainWindow) mainWindow.loadURL(url); },
        },
        { type: "separator" },
        { role: "quit", label: "Sair" },
      ],
    },
    { label: "Editar", submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "Janela",
      submenu: [
        { role: "minimize" }, { role: "zoom" },
        { label: "Tela cheia", accelerator: "F11", click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { label: "Ferramentas do desenvolvedor", accelerator: "CmdOrCtrl+Shift+I", click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// A web pede "abrir este app numa janela" pela ponte do preload.
ipcMain.handle("open-widget", (_e, appId) => { openWidget(String(appId || "")); });
ipcMain.handle("get-base-url", () => baseUrl());

app.whenReady().then(async () => {
  buildMenu();
  let url = baseUrl();
  if (!url) url = await askForUrl();
  if (!url) {
    dialog.showMessageBoxSync({ type: "info", title: "Workspaces", message: "Nenhum endereço configurado. Abra o app de novo para configurar." });
    app.quit();
    return;
  }
  createMainWindow(url);

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(baseUrl()); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
