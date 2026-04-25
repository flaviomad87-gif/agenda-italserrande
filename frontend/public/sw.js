// Service worker — versione 2 (cache busting + strategie ottimizzate)
const CACHE = "agenda-italserrande-v2";
const HTML_CACHE = "agenda-html-v2";
const ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== HTML_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // 1. Mai cache per le chiamate API o richieste cross-origin
  if (url.pathname.startsWith("/api") || url.origin !== self.location.origin) return;

  // 2. HTML / navigation requests → network-first (così le nuove versioni arrivano subito)
  const isHTML =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(HTML_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/index.html"))),
    );
    return;
  }

  // 3. Static assets (JS/CSS/img/font) → cache-first con revalidate in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});

// Permetti al client di forzare l'aggiornamento del SW
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
