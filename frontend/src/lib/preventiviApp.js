// Collegamento con l'app "Preventivi Italserrande" (progetto Firebase separato).
// Legge/scrive direttamente su Firestore: users/{uid}/quotes e users/{uid}/meta/settings.
import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";

export const PREVENTIVI_URL = "https://preventiviitalserrande.netlify.app";

const config = {
  apiKey: "AIzaSyBDe2f1_2Sys7SQuSWuU6rFMQKctkW3o4k",
  authDomain: "app-preventivi-aa253.firebaseapp.com",
  projectId: "app-preventivi-aa253",
  storageBucket: "app-preventivi-aa253.firebasestorage.app",
  messagingSenderId: "105201487943",
  appId: "1:105201487943:web:447e33e92cfa838ff32162",
};

const NAME = "preventivi";
let inst = null;

function prev() {
  if (inst) return inst;
  const app = getApps().find((a) => a.name === NAME) || initializeApp(config, NAME);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  inst = { auth, db: getFirestore(app) };
  return inst;
}

export const quoteUrl = (id) => `${PREVENTIVI_URL}/quote/${id}`;

export const onPreventiviUser = (cb) => onAuthStateChanged(prev().auth, cb);

export const connectPreventivi = (email, password) =>
  signInWithEmailAndPassword(prev().auth, email.trim(), password);

export const disconnectPreventivi = () => signOut(prev().auth);

function uid() {
  const u = prev().auth.currentUser;
  if (!u) throw new Error("not-connected");
  return u.uid;
}

const num = (n) => {
  const d = String(n ?? "").replace(/\D/g, "");
  return d ? parseInt(d, 10) : 0;
};

export const quoteTotal = (q) => (q.lineItems || []).reduce((s, li) => s + (Number(li?.amount) || 0), 0);

export async function listQuotes() {
  const snap = await getDocs(collection(prev().db, "users", uid(), "quotes"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || num(b.number) - num(a.number));
}

// Crea una bozza con gli stessi campi predefiniti dell'app Preventivi
export async function createQuoteFromJob(job) {
  const { db } = prev();
  const u = uid();
  const settingsRef = doc(db, "users", u, "meta", "settings");
  const [settings, quotes] = await Promise.all([getDoc(settingsRef), listQuotes()]);
  const counter = Number(settings.data()?.counter) || 0;
  const n = Math.max(counter, ...quotes.map((q) => num(q.number)), 0) + 1;
  const now = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  const id = crypto.randomUUID();
  const quote = {
    number: String(n).padStart(3, "0"),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    status: "draft",
    clientName: job.name || "",
    clientAddress: job.address || "",
    subject: "OFFERTA",
    lineItems: [{ id: crypto.randomUUID(), description: "", amount: Number(job.amount) || 0, vatRate: 22 }],
    paymentTerms:
      "Per l'attivazione del preventivo è richiesto il versamento di un acconto pari al 50% del totale.\nIl saldo del restante 50% dovrà essere corrisposto al termine dei lavori tramite contanti o POS direttamente ai tecnici incaricati. In alternativa, è possibile procedere via bonifico bancario anticipato, che dovrà risultare accreditato presso il nostro istituto prima della data dell'appuntamento.",
    footerNote: "Firma e timbro per accettazione.",
    notes: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await setDoc(doc(db, "users", u, "quotes", id), quote, { merge: false });
  await setDoc(settingsRef, { counter: n }, { merge: true });
  return { id, ...quote };
}

export const STATUS = {
  draft: { label: "Bozza", cls: "bg-stone-100 text-stone-700" },
  sent: { label: "Inviato", cls: "bg-blue-100 text-blue-700" },
  accepted: { label: "Accettato", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rifiutato", cls: "bg-red-100 text-red-700" },
};

export function prevErrorMessage(err) {
  const c = err?.code || err?.message || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "Email o password non corrette";
  if (/permission-denied/.test(c)) return "L'app Preventivi non concede l'accesso ai dati";
  if (/network|unavailable/.test(c)) return "Nessuna connessione, riprova";
  if (/not-connected/.test(c)) return "Collega prima l'app Preventivi";
  return "Errore con l'app Preventivi";
}
