"use client";

import { useEffect } from "react";

// Registra o service worker para o app poder ser instalado (PWA) e funcionar
// com o ícone do site na tela inicial / barra do navegador.
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
