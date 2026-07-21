import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatEUR, PAYMENT_LABEL, formatMonthLabel, computeWithVat } from "../lib/utils";
import { Printer, ArrowLeft, Loader2, MapPin, FileText, CalendarClock } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_LABEL = {
  lavoro_eseguito: "Eseguito",
  preventivo: "Preventivo",
};

/**
 * Vista stampabile dei lavori ESEGUITI di un mese.
 * Route: /archivio/:month  (month = YYYY-MM)
 * Layout studiato per A4: intestazione con mese, poi elenco righe compatte
 * ordinate per data. Il CSS globale @media print nasconde nav e chrome.
 */
export default function PrintArchive() {
  const { month } = useParams();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/clients?month=${month}`)
      .then((r) => {
        if (cancelled) return;
        const executed = (r.data || [])
          .filter((c) => c.status === "lavoro_eseguito")
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setClients(executed);
      })
      .catch(() => setClients([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);

  const grossOf = (c) => {
    const { toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
    return toCollect || 0;
  };

  return (
    <div className="space-y-4 fade-in">
      {/* Toolbar (nascosta in stampa) */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <Link
          to="/profilo"
          data-testid="archive-back-link"
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
        >
          <ArrowLeft className="h-4 w-4" /> Torna al profilo
        </Link>
        <button
          onClick={() => window.print()}
          data-testid="archive-print-button"
          disabled={loading || clients.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#4A5D23] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3C4B1C] disabled:opacity-50"
        >
          <Printer className="h-4 w-4" /> Stampa
        </button>
      </div>

      {/* Intestazione (visibile anche in stampa) */}
      <header className="rounded-3xl border border-stone-200/60 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Archivio lavori
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl capitalize">
          {monthLabel}
        </h1>
        <div className="mt-1 text-sm text-stone-500">
          {loading ? "Caricamento…" : `${clients.length} ${clients.length === 1 ? "lavoro eseguito" : "lavori eseguiti"}`}
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
          Nessun lavoro eseguito registrato in {monthLabel.toLowerCase()}.
        </div>
      ) : (
        <ol className="space-y-2">
          {clients.map((c, idx) => {
            const dt = c.date ? parseISO(c.date) : null;
            const dateLabel = dt && isValid(dt) ? format(dt, "EEE d MMM", { locale: it }) : c.date;
            const appt = c.appointment_at ? parseISO(c.appointment_at) : null;
            return (
              <li
                key={c.id}
                data-testid={`archive-row-${c.id}`}
                className="print-card flex flex-wrap items-start gap-3 rounded-2xl border border-stone-200/60 bg-white p-3 shadow-sm sm:flex-nowrap sm:p-4"
              >
                <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-stone-50 px-2 py-1.5 text-center sm:w-16">
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-stone-500 sm:text-[10px]">
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold capitalize text-stone-700 sm:text-xs">
                    {dateLabel || "—"}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <div className="font-display text-base font-bold tracking-tight text-stone-900 sm:text-lg">
                      {c.name}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3EF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#2E5A47]">
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-stone-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-0.5">
                    {c.address && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-stone-400" /> {c.address}
                      </span>
                    )}
                    {c.payment_method && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3 text-stone-400" />
                        {PAYMENT_LABEL[c.payment_method] || c.payment_method}
                      </span>
                    )}
                    {appt && isValid(appt) && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3 text-stone-400" />
                        {format(appt, "HH:mm")}
                        {c.appointment_note ? ` · ${c.appointment_note}` : ""}
                      </span>
                    )}
                    {!appt && c.appointment_note && (
                      <span className="inline-flex items-center gap-1 italic text-stone-500">
                        <FileText className="h-3 w-3 text-stone-400" /> {c.appointment_note}
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-auto shrink-0 text-right">
                  <div className="font-display text-base font-bold tabular-nums text-stone-900 sm:text-lg">
                    {formatEUR(grossOf(c))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
