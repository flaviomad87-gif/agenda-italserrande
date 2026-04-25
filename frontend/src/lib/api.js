import axios from "axios";
import { auth } from "./firebase";
import { cacheKey, readCache, writeCache } from "./cache";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Allega automaticamente l'ID token Firebase a ogni richiesta
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
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

api.interceptors.response.use((response) => {
  const cfg = response.config || {};
  if (cfg.method === "get" && CACHEABLE_PATHS.some((p) => (cfg.url || "").startsWith(p))) {
    writeCache(cacheKey(cfg.url, cfg.params), response.data);
  }
  return response;
});

/** Helper: ritorna [cachedData|null, freshPromise]. Usalo per popolare la UI subito e refresh in background. */
export const apiGetWithCache = (url, params) => {
  const key = cacheKey(url, params);
  const cached = readCache(key);
  const fresh = api.get(url, { params }).then((res) => res.data);
  return { cached, fresh };
};
