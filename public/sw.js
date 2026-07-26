// Service worker do app (PWA). Estratégia: REDE primeiro; cache só como reserva
// offline. IMPORTANTE: nunca devolver a página HTML no lugar de um script/estilo
// (isso quebrava o app com "This page couldn't load" quando uma requisição de
// chunk falhava por instabilidade de rede).
const CACHE = "workspace-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só GET de mesma origem (não interfere em APIs/uploads/terceiros).
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const isNavigation = req.mode === "navigate";

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        // Guarda no cache só respostas BOAS (evita cachear erro/HTML no lugar de asset).
        if (fresh && fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        // Offline / falha de rede: tenta o MESMO recurso no cache.
        const cached = await caches.match(req);
        if (cached) return cached;
        // Só a NAVEGAÇÃO (documento) pode cair na shell "/". Para script/css/chunk,
        // devolvemos erro de rede — nunca HTML (senão o navegador quebra a página).
        if (isNavigation) {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});
