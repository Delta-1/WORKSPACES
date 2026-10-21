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
  useEffect(() => {
    // iOS and Android can keep 100dvh behind the keyboard. Follow the visible
    // viewport while preserving pinch zoom for accessibility.
    const viewport = window.visualViewport;
    const sync = () => {
      if (viewport && viewport.scale !== 1) return;
      document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    sync();
    viewport?.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return null;
}
