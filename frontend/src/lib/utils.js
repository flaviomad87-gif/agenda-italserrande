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
