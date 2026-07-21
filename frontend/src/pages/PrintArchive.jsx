import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatEUR, PAYMENT_LABEL, formatMonthLabel, computeWithVat, computeMaterialsTotal } from "../lib/utils";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Vista stampabile "diario" dei lavori ESEGUITI di un mese.
 * Route: /archivio/:month
 * Colonne: Ora | Cliente · Indirizzo | Pag. | Mat. | Margine | Importo
 * Layout: flusso continuo (i giorni non saltano pagina). Header giorno legato
 * alla prima riga con break-after: avoid. Nessun vincolo di orientamento:
 * l'utente sceglie portrait o landscape dal dialog di stampa.
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

  const groupedDays = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => {
      const key = c.date || "senza-data";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
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

  /** Metodo di pagamento con fallback sui payments[] (evita colonna vuota). */
  const paymentLabelOf = (c) => {
    if (c.payment_method) return PAYMENT_LABEL[c.payment_method] || c.payment_method;
    const methods = Array.from(
      new Set((c.payments || []).map((p) => p.method).filter(Boolean)),
    );
    if (methods.length === 0) return "—";
    return methods.map((m) => PAYMENT_LABEL[m] || m).join(" + ");
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

        <article className="archive-sheet mx-auto max-w-[210mm] bg-white p-6 shadow-sm sm:p-10">
          <header className="archive-header pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                  Archivio · Italserrande
                </div>
                <h1 className="font-display text-4xl font-bold capitalize leading-none tracking-tight text-stone-900">
                  {monthLabel}
                </h1>
              </div>
              {!loading && clients.length > 0 && (
                <div className="text-right text-[11px] uppercase tracking-widest text-stone-500">
                  {clients.length} {clients.length === 1 ? "lavoro" : "lavori"} · {groupedDays.length} {groupedDays.length === 1 ? "giornata" : "giornate"}
                </div>
              )}
            </div>
          </header>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
          ) : clients.length === 0 ? (
            <div className="mt-8 border-y border-stone-300 py-10 text-center text-sm text-stone-500">
              Nessun lavoro eseguito registrato in {monthLabel.toLowerCase()}.
            </div>
          ) : (
            <div className="archive-body mt-4">
              <div className="archive-cols archive-cols-head">
                <div className="col-time">Ora</div>
                <div className="col-main">Cliente · Indirizzo</div>
                <div className="col-pay">Pag.</div>
                <div className="col-mat">Mat.</div>
                <div className="col-margin">Margine</div>
                <div className="col-amt">Importo</div>
              </div>

              {groupedDays.map(([dayKey, dayJobs]) => {
                const dt = dayKey !== "senza-data" ? parseISO(dayKey) : null;
                const validDate = dt && isValid(dt);
                const dayName = validDate ? format(dt, "EEEE", { locale: it }) : "Senza data";
                const dayNum = validDate ? format(dt, "d") : "";
                return (
                  <section
                    key={dayKey}
                    data-testid={`archive-day-${dayKey}`}
                    className="archive-day"
                  >
                    <div className="archive-day-header">
                      <span className="day-num">{dayNum}</span>
                      <span className="day-name">{dayName}</span>
                      <span className="day-count">
                        {dayJobs.length} {dayJobs.length === 1 ? "lavoro" : "lavori"}
                      </span>
                    </div>

                    {dayJobs.map((c) => {
                      const appt = c.appointment_at ? parseISO(c.appointment_at) : null;
                      const time = appt && isValid(appt) ? format(appt, "HH:mm") : "";
                      const note = c.appointment_note || c.notes || "";
                      const imponibile = Number(c.amount) || 0;
                      const materialsTotal = computeMaterialsTotal(c.materials);
                      const margin = imponibile - materialsTotal;
                      return (
                        <div
                          key={c.id}
                          data-testid={`archive-row-${c.id}`}
                          className="archive-cols archive-row"
                        >
                          <div className="col-time">{time || <span className="tick">·</span>}</div>
                          <div className="col-main">
                            <div className="row-name">{c.name}</div>
                            {c.address && <div className="row-addr">{c.address}</div>}
                            {note && <div className="row-note">{note}</div>}
                          </div>
                          <div className="col-pay">{paymentLabelOf(c)}</div>
                          <div className="col-mat">
                            {materialsTotal > 0 ? formatEUR(materialsTotal) : "—"}
                          </div>
                          <div className="col-margin">{formatEUR(margin)}</div>
                          <div className="col-amt">{formatEUR(grossOf(c))}</div>
                        </div>
                      );
                    })}
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

function PrintArchiveStyles() {
  return (
    <style>{`
      .archive-sheet { font-family: Georgia, 'Times New Roman', serif; color: #111; }
      .archive-header { border-bottom: 2px solid #111; }

      .archive-cols {
        display: grid;
        grid-template-columns: 3rem 1fr 5rem 4.5rem 5rem 5.5rem;
        gap: 0.6rem;
        align-items: baseline;
      }
      .archive-cols-head {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #666;
        padding: 0.4rem 0.25rem;
        border-bottom: 1px solid #111;
      }
      .col-mat, .col-margin, .col-amt,
      .archive-cols-head .col-mat, .archive-cols-head .col-margin, .archive-cols-head .col-amt {
        text-align: right;
      }
      .col-pay {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 9.5px;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #333;
      }

      .archive-day { break-inside: auto; }
      .archive-day-header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-top: 0.9rem;
        padding: 0.25rem 0.25rem 0.2rem;
        border-bottom: 1.5px solid #111;
        break-after: avoid;
        page-break-after: avoid;
      }
      .archive-day-header .day-num { font-family: Georgia, serif; font-size: 22px; font-weight: 700; line-height: 1; color: #111; }
      .archive-day-header .day-name { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; color: #111; }
      .archive-day-header .day-count { margin-left: auto; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #666; }

      .archive-row {
        padding: 0.45rem 0.25rem;
        border-bottom: 1px solid #d4d4d4;
        break-inside: avoid;
      }
      .archive-row .col-time { font-size: 11px; font-weight: 700; font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; }
      .archive-row .col-time .tick { color: #ccc; }
      .archive-row .row-name { font-family: Georgia, serif; font-size: 13.5px; font-weight: 700; line-height: 1.15; color: #111; }
      .archive-row .row-addr { font-family: Georgia, serif; font-size: 10.5px; line-height: 1.25; color: #333; margin-top: 0.05rem; }
      .archive-row .row-note { font-family: Georgia, serif; font-style: italic; font-size: 10px; line-height: 1.25; color: #555; margin-top: 0.05rem; }
      .archive-row .col-mat { font-family: Georgia, serif; font-size: 11.5px; font-variant-numeric: tabular-nums; color: #444; }
      .archive-row .col-margin { font-family: Georgia, serif; font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; color: #111; }
      .archive-row .col-amt { font-family: Georgia, serif; font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; color: #111; }

      @media print {
        /* Nessun vincolo di orientamento/formato: rispetta la scelta utente
           nel dialog di stampa (portrait o landscape). Solo margini. */
        @page { margin: 12mm 10mm; }
        html, body { background: #fff !important; }
        .archive-sheet {
          box-shadow: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .archive-sheet, .archive-sheet * {
          color: #000 !important;
          background: #fff !important;
          box-shadow: none !important;
        }
        .archive-header { border-bottom-color: #000 !important; }
        .archive-day-header, .archive-cols-head { border-bottom-color: #000 !important; }
        .archive-row { border-bottom-color: #888 !important; }
      }
    `}</style>
  );
}
