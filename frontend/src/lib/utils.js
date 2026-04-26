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

/** Calcola il totale lordo dato l'imponibile e l'aliquota IVA (in %).
 * Ritorna { net, vat, gross }. Se aliquota null/undefined/0 → vat=0 e gross=net. */
export const computeWithVat = (amount, vatRate) => {
  const net = Number(amount) || 0;
  const rate = Number(vatRate);
  if (!rate || isNaN(rate)) return { net, vat: 0, gross: net, hasVat: false };
  const vat = net * (rate / 100);
  return { net, vat, gross: net + vat, hasVat: true };
};
