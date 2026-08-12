// Ponte segura entre o site do Workspaces e o app desktop. Expõe só o mínimo:
// o site consegue saber que está rodando no app (workspacesDesktop.isDesktop) e
// pedir para abrir um app numa janela/widget nativa (openWidget).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workspacesDesktop", {
  isDesktop: true,
  openWidget: (appId) => ipcRenderer.invoke("open-widget", appId),
  getBaseUrl: () => ipcRenderer.invoke("get-base-url"),
});
