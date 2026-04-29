import axios from "axios";
import { auth } from "./firebase";
import { cacheKey, readCache, writeCache, mutateCachedCollections } from "./cache";
import { enqueue, drainQueue, onQueueChange, queueCount } from "./offlineQueue";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

const newUUID = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Endpoint di creazione che accettano un id idempotente client-side.
const CREATE_ROUTES = ["/clients", "/expenses", "/advances", "/recurring-expenses"];

// Allega automaticamente l'ID token Firebase + inietta id client-side per i creates
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // Offline → niente token, la richiesta fallirà e verrà accodata
    }
  }
  // Inietta id idempotente solo per POST esatto sui create routes (non /clients/:id/execute)
  if ((config.method || "").toLowerCase() === "post" && CREATE_ROUTES.includes(config.url || "")) {
    let body = config.data;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (body && typeof body === "object" && !Array.isArray(body) && !body.id) {
      config.data = { ...body, id: newUUID() };
    }
  }
  return config;
});

// Cache writer per richieste GET di sola lettura (clienti, spese, acconti, riepilogo)
const CACHEABLE_PATHS = [
  "/clients",
  "/expenses",
  "/advances",
  "/summary",
  "/recurring-expenses",
  "/advances/by-worker",
];

api.interceptors.response.use(
  (response) => {
    const cfg = response.config || {};
    if (cfg.method === "get" && CACHEABLE_PATHS.some((p) => (cfg.url || "").startsWith(p))) {
      writeCache(cacheKey(cfg.url, cfg.params), response.data);
    }
    return response;
  },
  async (error) => {
    const cfg = error.config || {};
    const method = (cfg.method || "").toLowerCase();
    const isMutation = ["post", "put", "delete"].includes(method);
    const isNetworkError = !error.response || error.code === "ERR_NETWORK" || error.message === "Network Error";
    const isReplay = cfg.headers && cfg.headers["X-Drain-Replay"];
    if (isMutation && isNetworkError && !isReplay) {
      // Estrai il body
      let body = cfg.data;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      // Accoda per drain successivo
      enqueue({ method: method.toUpperCase(), url: cfg.url, data: body, params: cfg.params });
      // Aggiorna ottimisticamente la cache locale (così la UI riflette subito le modifiche
      // anche quando l'utente naviga tra le pagine offline).
      try {
        applyOptimisticToCache(method, cfg.url, body);
      } catch {
        // best-effort
      }
      // Sintetizza una risposta "ok" così il chiamante non vede un errore
      return Promise.resolve({
        data: body,
        status: 202,
        statusText: "Accepted (offline queue)",
        config: cfg,
        headers: {},
        _offline: true,
      });
    }
    return Promise.reject(error);
  },
);

/** Applica una mutation alle collezioni cached locali per refletterla immediatamente. */
const applyOptimisticToCache = (method, url, body) => {
  if (!url) return;
  // Match POST /clients, /expenses, /advances, /recurring-expenses → aggiungi alla collection
  // Match PUT /clients/{id}, /expenses/{id}, ... → sostituisci item
  // Match DELETE /clients/{id}, ... → rimuovi item
  // Match POST /clients/{id}/execute → muove da /clients/pending a /clients (refresh sarà necessario)

  const m = url.match(/^\/(clients|expenses|advances|recurring-expenses)(\/([^/]+)(\/(\w+))?)?$/);
  if (!m) return;
  const collection = "/" + m[1];
  const itemId = m[3];
  const action = m[5];

  if (method === "post" && !itemId) {
    // Nuova creazione → aggiungi in coda alla collection
    if (body && body.id) {
      mutateCachedCollections(collection, (arr) => [...arr, body]);
    }
  } else if (method === "put" && itemId) {
    mutateCachedCollections(collection, (arr) =>
      arr.map((it) => (it.id === itemId ? { ...it, ...(body || {}), id: itemId } : it)),
    );
  } else if (method === "delete" && itemId) {
    mutateCachedCollections(collection, (arr) => arr.filter((it) => it.id !== itemId));
    if (collection === "/clients") {
      // Rimuovi anche dalle viste derivate
      mutateCachedCollections("/clients/pending", (arr) => arr.filter((it) => it.id !== itemId));
      mutateCachedCollections("/clients/unpaid", (arr) => arr.filter((it) => it.id !== itemId));
    }
  } else if (method === "post" && action === "execute" && collection === "/clients") {
    // /clients/{id}/execute → rimuove da pending, mantiene in /clients
    mutateCachedCollections("/clients/pending", (arr) => arr.filter((it) => it.id !== itemId));
  }
};

/** Helper: ritorna [cachedData|null, freshPromise]. Usalo per popolare la UI subito e refresh in background. */
export const apiGetWithCache = (url, params) => {
  const key = cacheKey(url, params);
  const cached = readCache(key);
  const fresh = api.get(url, { params }).then((res) => res.data);
  return { cached, fresh };
};

// ---- Drain automatico quando torna online + ascoltatori esposti ----

let drainScheduled = false;
const scheduleDrain = () => {
  if (drainScheduled) return;
  drainScheduled = true;
  setTimeout(async () => {
    drainScheduled = false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!auth.currentUser) return; // serve token Firebase
    const before = queueCount();
    if (before === 0) return;
    const { processed, failed, remaining } = await drainQueue(api);
    if (processed > 0) {
      toast.success(
        `${processed} ${processed === 1 ? "modifica sincronizzata" : "modifiche sincronizzate"}` +
          (remaining > 0 ? ` · ${remaining} in attesa` : ""),
      );
    }
    if (failed > 0) {
      toast.error(`${failed} ${failed === 1 ? "modifica scartata" : "modifiche scartate"} (rifiuto del server)`);
    }
    // Notifica le pagine: rilancia un evento custom per far refetchare i dati
    if (processed > 0 || failed > 0) {
      window.dispatchEvent(new CustomEvent("agenda:queue-drained", { detail: { processed, failed, remaining } }));
    }
  }, 300);
};

if (typeof window !== "undefined") {
  window.addEventListener("online", scheduleDrain);
  // Drain anche dopo login (auth pronta)
  auth.onAuthStateChanged((u) => {
    if (u) scheduleDrain();
  });
  // Esponi count + listener per UI
  onQueueChange(() => {
    /* re-render via React subscriber nella OfflineBanner */
  });
}

export { onQueueChange, queueCount } from "./offlineQueue";
