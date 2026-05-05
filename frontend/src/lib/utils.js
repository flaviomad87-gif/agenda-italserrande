import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatEUR = (n) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export const isoDate = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const isoMonth = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};

export const PAYMENT_METHODS = [
  { value: "contanti", label: "Contanti" },
  { value: "pos", label: "POS / Carta" },
  { value: "bonifico", label: "Bonifico bancario" },
];

export const PAYMENT_LABEL = {
  contanti: "Contanti",
  pos: "POS / Carta",
  bonifico: "Bonifico",
};

export const VAT_RATES = [
  { value: "", label: "Senza IVA" },
  { value: "4", label: "IVA 4%" },
  { value: "10", label: "IVA 10%" },
  { value: "22", label: "IVA 22%" },
];

export const WITHHOLDING_RATES = [
  { value: "", label: "Nessuna" },
  { value: "4", label: "Ritenuta 4% (condomini)" },
  { value: "20", label: "Ritenuta 20% (professionisti)" },
];

/** Calcola il totale lordo e gli importi netti dato l'imponibile, l'aliquota IVA e l'eventuale ritenuta d'acconto.
 * - net: imponibile
 * - vat: importo IVA (= net * vatRate/100)
 * - gross: totale fattura (= net + vat)
 * - withholding: ritenuta d'acconto (= net * withholdingRate/100)
 * - toCollect: importo che il cliente paga effettivamente (= gross - withholding)
 */
export const computeWithVat = (amount, vatRate, withholdingRate) => {
  const net = Number(amount) || 0;
  const vRate = Number(vatRate);
  const wRate = Number(withholdingRate);
  const hasVat = !!vRate && !isNaN(vRate);
  const hasWithholding = !!wRate && !isNaN(wRate);
  const vat = hasVat ? net * (vRate / 100) : 0;
  const gross = net + vat;
  const withholding = hasWithholding ? net * (wRate / 100) : 0;
  const toCollect = gross - withholding;
  return { net, vat, gross, withholding, toCollect, hasVat, hasWithholding };
};

/** Giorni trascorsi tra una data ISO (YYYY-MM-DD) e oggi (incluso 0 se è oggi). */
export const daysSince = (isoDateStr) => {
  if (!isoDateStr) return 0;
  const start = new Date(`${isoDateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
};

/** Stato di un cliente rispetto al saldo. Restituisce { isOpen, balance, paid, toCollect, daysWaiting, severity }.
 * severity: "ok" | "warn" (>30g) | "danger" (>60g)
 * Inclusi solo lavori eseguiti o clienti che hanno almeno un pagamento (preventivi vuoti = ok). */
export const computeClientBalance = (c) => {
  const { toCollect } = computeWithVat(c?.amount, c?.vat_rate, c?.withholding_rate);
  const payments = Array.isArray(c?.payments) ? c.payments : [];
  const hasPayments = payments.length > 0;
  let paid = 0;
  let countsAsUnpaid = false;
  if (hasPayments) {
    paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    countsAsUnpaid = true;
  } else if (c?.status === "lavoro_eseguito") {
    if (c?.payment_method || c?.invoice_number) {
      paid = toCollect; // legacy saldato
    } else {
      paid = 0;
      countsAsUnpaid = true;
    }
  }
  const balance = toCollect - paid;
  const isOpen = countsAsUnpaid && balance > 0.01;
  const daysWaiting = isOpen ? daysSince(c?.date) : 0;
  let severity = "ok";
  if (isOpen) {
    if (daysWaiting > 60) severity = "danger";
    else if (daysWaiting > 30) severity = "warn";
  }
  return { isOpen, balance, paid, toCollect, daysWaiting, severity };
};

/** Totale spese fornitura (materiali) di un cliente. */
export const computeMaterialsTotal = (materials) =>
  (Array.isArray(materials) ? materials : []).reduce(
    (s, m) => s + (Number(m?.amount) || 0),
    0,
  );

/** Margine atteso/realizzato del cliente: imponibile (netto fattura) − materiali.
 * L'IVA è pass-through fiscalmente; la ritenuta è anticipo d'imposta che recuperi,
 * quindi il margine reale lavoro = amount (netto concordato) − costo materiali. */
export const computeClientMargin = (c) => {
  const net = Number(c?.amount) || 0;
  const materialsTotal = computeMaterialsTotal(c?.materials);
  const margin = net - materialsTotal;
  const marginPct = net > 0 ? (margin / net) * 100 : 0;
  return { net, materialsTotal, margin, marginPct };
};

/** Genera l'URL di Google Maps per un indirizzo. Apre nell'app Maps su mobile. */
export const googleMapsUrl = (address) => {
  if (!address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

/** Restituisce il mese precedente (YYYY-MM) rispetto a oggi. */
export const previousMonthKey = () => {
  const d = new Date();
  d.setDate(1); // evita problemi tipo 31 marzo → 31 febbraio
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Formatta YYYY-MM in italiano leggibile (es. "Gennaio 2026"). */
export const formatMonthLabel = (yyyymm) => {
  if (!yyyymm) return "";
  const [y, m] = yyyymm.split("-").map(Number);
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
  ];
  return `${months[(m || 1) - 1]} ${y || ""}`;
};
