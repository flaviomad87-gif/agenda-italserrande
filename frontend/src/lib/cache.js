/**
 * Cache leggera in localStorage per le risposte GET dell'API.
 * Strategia stale-while-revalidate: mostra subito dati vecchi, in parallelo aggiorna.
 *
 * - read(key): ritorna dati cached se presenti e non più vecchi di TTL_MS
 * - write(key, data): salva dati con timestamp
 * - clearForUser(uid): pulisce la cache (es. al logout)
 */

const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 giorni: dati ancora utili come fallback
const PREFIX = "agenda-cache:";

const safeStorage = (() => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
})();

export const cacheKey = (path, params) => {
  const qs = params
    ? "?" + Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
  return PREFIX + path + qs;
};

export const readCache = (key) => {
  if (!safeStorage) return null;
  try {
    const raw = safeStorage.getItem(key);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    if (Date.now() - t > TTL_MS) {
      safeStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const writeCache = (key, data) => {
  if (!safeStorage) return;
  try {
    safeStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // QuotaExceeded: ignora, la cache è solo un'ottimizzazione
  }
};

export const clearAllCache = () => {
  if (!safeStorage) return;
  try {
    const toRemove = [];
    for (let i = 0; i < safeStorage.length; i++) {
      const k = safeStorage.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => safeStorage.removeItem(k));
  } catch {
    // ignore
  }
};

/** Aggiorna in modo ottimistico tutte le voci cached il cui path inizia con `pathPrefix`.
 * `mutator(arrayData) => newArray` viene applicato ad ogni cache che matcha. */
export const mutateCachedCollections = (pathPrefix, mutator) => {
  if (!safeStorage) return;
  const fullPrefix = PREFIX + pathPrefix;
  try {
    for (let i = 0; i < safeStorage.length; i++) {
      const k = safeStorage.key(i);
      if (!k || !k.startsWith(fullPrefix)) continue;
      const raw = safeStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.data)) {
          const next = mutator(parsed.data);
          if (next !== parsed.data) {
            safeStorage.setItem(k, JSON.stringify({ t: parsed.t, data: next }));
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
};
