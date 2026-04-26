/**
 * Apre WhatsApp con un messaggio preformattato.
 * L'utente sceglie la chat/gruppo a cui inoltrarlo e invia manualmente.
 * Funziona su mobile (apre l'app WhatsApp) e desktop (apre wa.me web).
 */

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { formatEUR, PAYMENT_LABEL } from "./utils";

export const buildClientMessage = (c) => {
  const lines = [];

  lines.push(`🔧 *${c.name}*`);

  try {
    lines.push(`📅 ${format(parseISO(c.date), "EEEE d MMMM yyyy", { locale: it })}`);
  } catch {
    /* ignore date format errors */
  }

  if (c.address) lines.push(`📍 ${c.address}`);
  if (c.phone) lines.push(`📞 ${c.phone}`);
  if (c.notes) lines.push(`📝 ${c.notes}`);

  lines.push("");
  lines.push(c.status === "lavoro_eseguito" ? "✅ Lavoro eseguito" : "📋 Preventivo");

  if (Number(c.amount) > 0) lines.push(`💶 Importo: ${formatEUR(c.amount)}`);
  if (c.payment_method) lines.push(`💳 Pagamento: ${PAYMENT_LABEL[c.payment_method] || c.payment_method}`);
  if (c.quote_number) lines.push(`📄 N° Preventivo: ${c.quote_number}`);
  if (c.invoice_number) lines.push(`🧾 N° Fattura: ${c.invoice_number}`);

  return lines.join("\n");
};

export const sendClientToWhatsApp = (c) => {
  const text = buildClientMessage(c);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};
