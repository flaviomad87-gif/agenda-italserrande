/**
 * Coda di sincronizzazione offline.
 *
 * Quando una mutation (POST/PUT/DELETE) fallisce per assenza di rete, viene
 * accodata in localStorage. Quando torna online la coda viene drainata in
 * ordine FIFO. Le creazioni includono già un id (idempotency key) generato
 * client-side, così un eventuale retry dopo riconnessione non duplica.
 */

const QUEUE_KEY = "agenda-offline-queue-v1";

const safeStorage = (() => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
})();

const read = () => {
  if (!safeStorage) return [];
  try {
    return JSON.parse(safeStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
};

const write = (q) => {
  if (!safeStorage) return;
  try {
    safeStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // QuotaExceeded — silenzioso
  }
};

const listeners = new Set();
const notify = () => {
  const c = read().length;
  listeners.forEach((fn) => {
    try { fn(c); } catch { /* ignore */ }
  });
};

export const onQueueChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const queueCount = () => read().length;

export const enqueue = ({ method, url, data, params }) => {
  const op = {
    op_id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `op-${Date.now()}-${Math.random()}`,
    method: (method || "GET").toUpperCase(),
    url,
    data,
    params: params || null,
    ts: Date.now(),
    attempts: 0,
  };
  const q = read();
  q.push(op);
  write(q);
  notify();
  return op;
};

export const clearQueue = () => {
  write([]);
  notify();
};

export const isOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

let draining = false;

/** Replay sequenziale della coda. Ferma su errore di rete. Scarta su 4xx (per evitare loop). */
export const drainQueue = async (axiosInstance) => {
  if (draining) return { processed: 0, failed: 0, remaining: queueCount() };
  draining = true;
  let processed = 0;
  let failed = 0;
  try {
    while (true) {
      const q = read();
      if (q.length === 0) break;
      const op = q[0];
      try {
        await axiosInstance.request({
          method: op.method,
          url: op.url,
          data: op.data,
          params: op.params || undefined,
          // segnala all'interceptor di NON ri-accodare in caso di rete
          headers: { "X-Drain-Replay": "1" },
        });
        // Successo → rimuovi dalla coda
        const next = read().slice(1);
        write(next);
        notify();
        processed++;
      } catch (err) {
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 409) {
          // Errore "permanente" (richiesta malformata, autorizzazione persa, not found): scarta
          const next = read().slice(1);
          write(next);
          notify();
          failed++;
        } else {
          // Rete o 5xx → ferma drain, riproveremo dopo
          break;
        }
      }
    }
  } finally {
    draining = false;
  }
  return { processed, failed, remaining: queueCount() };
};
