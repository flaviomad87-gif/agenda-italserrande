// Service worker v3 — pre-cache completa dell'app shell per offline robusto.
// Strategia:
//   1. install → fetch /asset-manifest.json e pre-cacha TUTTI i bundle JS/CSS dell'app
//   2. fetch  → HTML network-first con fallback affidabile a /index.html cached
//                static cache-first con revalidate in background
//   3. message → SKIP_WAITING per attivazione immediata di nuove versioni

const APP_CACHE = "agenda-italserrande-app-v3";
const HTML_CACHE = "agenda-italserrande-html-v3";

// Risorse minime sempre necessarie
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

const isJsOrCss = (url) =>
  /\.(js|css)(\?|$)/.test(url) && !url.endsWith(".map");

const precacheAppShell = async () => {
  const cache = await caches.open(APP_CACHE);
  // Core assets
  await Promise.all(
    CORE_ASSETS.map((u) =>
      cache.add(u).catch(() => {
        /* asset opzionale: continua */
      }),
    ),
  );
  // Asset manifest → pre-cache di TUTTI i bundle (così l'app parte anche da cold-offline)
  try {
    const res = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (res.ok) {
      const manifest = await res.json();
      const files = manifest && manifest.files ? Object.values(manifest.files) : [];
      const toCache = files.filter((u) => typeof u === "string" && isJsOrCss(u));
      // Aggiungi in parallelo, ma non fallire l'install se uno fallisce
      await Promise.all(
        toCache.map((u) =>
          cache.add(u).catch(() => {
            /* singolo file fallito: best-effort */
          }),
        ),
      );
    }
  } catch {
    // asset-manifest.json non disponibile — l'app potrà comunque cachare a runtime
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== HTML_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Bypassa API e cross-origin (incluso Firebase)
  if (url.pathname.startsWith("/api") || url.origin !== self.location.origin) return;

  const isHTML =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // Network-first per HTML, fallback affidabile a /index.html
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(HTML_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/index.html")) ||
            (await caches.match("/"));
          if (cached) return cached;
          // Ultima spiaggia: pagina minima offline
          return new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
              "<style>body{font-family:system-ui;padding:2rem;color:#444;text-align:center}" +
              "h1{color:#4A5D23}</style>" +
              "<h1>Sei offline</h1>" +
              "<p>Riapri l'app quando hai connessione. " +
              "I dati salvati sul telefono restano integri.</p>",
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 200,
            },
          );
        }),
    );
    return;
  }

  // Static assets → cache-first con background revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
