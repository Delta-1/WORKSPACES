// Service worker mínimo para tornar o app instalável (PWA).
// Estratégia: rede primeiro; se offline, tenta o cache; senão, a página raiz.
const CACHE = "workspace-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos de versões anteriores.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só lida com GET de mesma origem (não interfere em APIs/uploads).
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Guarda uma cópia para uso offline.
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("/");
      }
    })()
  );
});
