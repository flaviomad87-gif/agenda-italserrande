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
