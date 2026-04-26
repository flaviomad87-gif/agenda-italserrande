/**
 * Apre WhatsApp con un messaggio preformattato.
 * L'utente sceglie la chat/gruppo a cui inoltrarlo e invia manualmente.
 * Funziona su mobile (apre l'app WhatsApp) e desktop (apre wa.me web).
 */

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { formatEUR, PAYMENT_LABEL } from "./utils";

const PAYMENT_TYPE_LABEL = {
  acconto: "Acconto",
  saldo: "Saldo",
  altro: "Pagamento",
};

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

  if (Number(c.amount) > 0) lines.push(`💶 Totale: ${formatEUR(c.amount)}`);
  if (c.quote_number) lines.push(`📄 N° Preventivo: ${c.quote_number}`);

  const payments = c.payments || [];
  if (payments.length > 0) {
    lines.push("");
    lines.push("*Pagamenti:*");
    let incassato = 0;
    payments.forEach((p) => {
      const typeLabel = PAYMENT_TYPE_LABEL[p.type] || "Pagamento";
      const methodLabel = p.method ? ` (${PAYMENT_LABEL[p.method] || p.method})` : "";
      const invoiceLabel = p.invoice_number ? ` · Fatt. ${p.invoice_number}` : "";
      let dateLabel = "";
      try {
        if (p.date) dateLabel = ` · ${format(parseISO(p.date), "d/MM", { locale: it })}`;
      } catch {
        /* ignore */
      }
      lines.push(`  • ${typeLabel}: ${formatEUR(p.amount)}${methodLabel}${invoiceLabel}${dateLabel}`);
      incassato += Number(p.amount) || 0;
    });
    const saldo = (Number(c.amount) || 0) - incassato;
    if (Number(c.amount) > 0) {
      lines.push("");
      lines.push(`💚 Incassato: ${formatEUR(incassato)}`);
      if (Math.abs(saldo) > 0.001) {
        lines.push(saldo > 0 ? `🟠 Da saldare: ${formatEUR(saldo)}` : `↩️ Eccedenza: ${formatEUR(-saldo)}`);
      } else {
        lines.push("✓ Saldato");
      }
    }
  } else {
    // Legacy single payment fallback
    if (c.payment_method) lines.push(`💳 Pagamento: ${PAYMENT_LABEL[c.payment_method] || c.payment_method}`);
    if (c.invoice_number) lines.push(`🧾 N° Fattura: ${c.invoice_number}`);
  }

  return lines.join("\n");
};

export const sendClientToWhatsApp = (c) => {
  const text = buildClientMessage(c);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};
