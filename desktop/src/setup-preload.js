// Preload da telinha de configuração do endereço (1ª vez).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setup", {
  save: (url) => ipcRenderer.send("setup-save", url),
});
