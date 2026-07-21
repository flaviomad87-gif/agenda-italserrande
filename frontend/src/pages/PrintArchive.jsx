import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatEUR, PAYMENT_LABEL, formatMonthLabel, computeWithVat } from "../lib/utils";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Vista stampabile "diario" dei lavori ESEGUITI di un mese.
 * Route: /archivio/:month  (month = YYYY-MM)
 * Design:
 *  - A4 orizzontale (regola @page in <PrintArchiveStyles />)
 *  - Bianco e nero elegante (nessun colore)
 *  - Sezioni giorno-per-giorno con intestazione grande (es. "Lunedì 3 Giugno")
 *  - Solo giorni con lavori (i vuoti sono saltati)
 *  - Nessun totale in fondo (richiesta esplicita utente)
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

  // Raggruppa i lavori per data (YYYY-MM-DD). Ordinamento gia' fatto sopra.
  const groupedDays = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => {
      const key = c.date || "senza-data";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    // Ordina i lavori dello stesso giorno per orario appuntamento poi nome
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.appointment_at ? new Date(a.appointment_at).getTime() : 0;
        const tb = b.appointment_at ? new Date(b.appointment_at).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.name || "").localeCompare(b.name || "");
      });
    }
    return Array.from(map.entries());
  }, [clients]);

  const grossOf = (c) => {
    const { toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
    return toCollect || 0;
  };

  return (
    <>
      <PrintArchiveStyles />

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
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Stampa
          </button>
        </div>

        {/* Contenitore stampabile */}
        <article className="archive-sheet mx-auto max-w-[280mm] rounded-2xl border border-stone-300 bg-white p-6 shadow-sm sm:p-10">
          {/* Intestazione */}
          <header className="mb-8 border-b-2 border-stone-900 pb-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500">
              Archivio lavori · Italserrande
            </div>
            <h1 className="font-display text-4xl font-bold capitalize tracking-tight text-stone-900 sm:text-5xl">
              {monthLabel}
            </h1>
            {!loading && (
              <div className="mt-2 text-sm text-stone-600">
                {clients.length} {clients.length === 1 ? "lavoro eseguito" : "lavori eseguiti"}
                {groupedDays.length > 0 && (
                  <> · su {groupedDays.length} {groupedDays.length === 1 ? "giornata" : "giornate"}</>
                )}
              </div>
            )}
          </header>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
          ) : clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
              Nessun lavoro eseguito registrato in {monthLabel.toLowerCase()}.
            </div>
          ) : (
            <div className="space-y-8">
              {groupedDays.map(([dayKey, dayJobs]) => {
                const dt = dayKey !== "senza-data" ? parseISO(dayKey) : null;
                const validDate = dt && isValid(dt);
                const dayName = validDate ? format(dt, "EEEE", { locale: it }) : "Senza data";
                const dayNum = validDate ? format(dt, "d") : "";
                const dayMonth = validDate ? format(dt, "MMMM", { locale: it }) : "";
                return (
                  <section
                    key={dayKey}
                    data-testid={`archive-day-${dayKey}`}
                    className="archive-day"
                  >
                    {/* Intestazione giorno */}
                    <div className="mb-3 flex items-baseline gap-3 border-b border-stone-300 pb-1.5">
                      <span className="font-display text-3xl font-bold capitalize leading-none text-stone-900">
                        {dayNum}
                      </span>
                      <span className="font-display text-lg font-semibold capitalize text-stone-900">
                        {dayName}
                      </span>
                      <span className="text-sm capitalize text-stone-500">
                        {dayMonth}
                      </span>
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                        {dayJobs.length} {dayJobs.length === 1 ? "lavoro" : "lavori"}
                      </span>
                    </div>

                    {/* Righe lavori del giorno */}
                    <ul className="space-y-2">
                      {dayJobs.map((c) => {
                        const appt = c.appointment_at ? parseISO(c.appointment_at) : null;
                        const time = appt && isValid(appt) ? format(appt, "HH:mm") : "";
                        return (
                          <li
                            key={c.id}
                            data-testid={`archive-row-${c.id}`}
                            className="archive-row flex items-start gap-4 rounded-xl border border-stone-200 px-4 py-3"
                          >
                            {/* Ora appuntamento (o punto elenco se assente) */}
                            <div className="w-14 shrink-0 pt-0.5 text-sm font-bold tabular-nums text-stone-900">
                              {time || <span className="text-stone-300">·</span>}
                            </div>

                            {/* Dettagli lavoro */}
                            <div className="min-w-0 flex-1">
                              <div className="font-display text-lg font-bold leading-tight text-stone-900">
                                {c.name}
                              </div>
                              {c.address && (
                                <div className="mt-0.5 text-sm text-stone-700">
                                  {c.address}
                                </div>
                              )}
                              {(c.appointment_note || c.notes) && (
                                <div className="mt-0.5 text-sm italic text-stone-600">
                                  {c.appointment_note || c.notes}
                                </div>
                              )}
                            </div>

                            {/* Metodo pagamento */}
                            <div className="w-28 shrink-0 pt-0.5 text-right text-xs uppercase tracking-widest text-stone-600">
                              {c.payment_method
                                ? (PAYMENT_LABEL[c.payment_method] || c.payment_method)
                                : "—"}
                            </div>

                            {/* Importo */}
                            <div className="w-28 shrink-0 pt-0.5 text-right font-display text-lg font-bold tabular-nums text-stone-900">
                              {formatEUR(grossOf(c))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </article>
      </div>
    </>
  );
}

/**
 * Stili di stampa dedicati alla pagina archivio.
 * Iniettati inline per non toccare index.css globale.
 * A4 orizzontale, margine 12mm, B/N assoluto.
 */
function PrintArchiveStyles() {
  return (
    <style>{`
      @media print {
        @page {
          size: A4 landscape;
          margin: 12mm 14mm;
        }
        html, body { background: #fff !important; }
        .archive-sheet {
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        .archive-sheet, .archive-sheet * {
          color: #000 !important;
          background: #fff !important;
          box-shadow: none !important;
        }
        .archive-sheet header {
          border-bottom-color: #000 !important;
        }
        .archive-day {
          page-break-inside: avoid;
        }
        .archive-day > div:first-child {
          border-bottom-color: #000 !important;
        }
        .archive-row {
          border: 1px solid #666 !important;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}
