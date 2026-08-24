import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, computeWithVat } from "../lib/utils";
import { Printer, Search, Users, Phone, Loader2 } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { it } from "date-fns/locale";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Pagina "Clienti": lista di TUTTI i lavori ESEGUITI dell'anno selezionato,
 * raggruppati per mese (Gennaio → Dicembre, mesi vuoti saltati).
 * Una riga per lavoro (se un cliente ha piu' lavori, appare piu' volte).
 * Ricerca su nome + telefono. Pulsante Stampa (riusa CSS @media print).
 * Route: /clienti
 */
export default function Clienti() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/clients?from_date=${year}-01-01&to_date=${year}-12-31`)
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
  }, [year]);

  // Filtro ricerca + raggruppamento per mese (1..12)
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? clients.filter((c) => {
          const name = (c.name || "").toLowerCase();
          const phone = (c.phone || "").toLowerCase();
          return name.includes(q) || phone.includes(q);
        })
      : clients;
    const byMonth = new Map();
    filtered.forEach((c) => {
      const m = (c.date || "").slice(5, 7); // "MM"
      if (!m) return;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(c);
    });
    // Ordina per numero mese e ritorna [mm, items[]]
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [clients, query]);

  const totalCount = grouped.reduce((s, [, arr]) => s + arr.length, 0);

  const grossOf = (c) => {
    const { toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
    return toCollect || 0;
  };

  return (
    <>
      <ClientiPrintStyles />

      <div className="space-y-4 fade-in">
        {/* Header + Toolbar */}
        <header className="no-print">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Rubrica lavori
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Clienti · {year}
          </h1>
        </header>

        <div className="no-print flex flex-wrap items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            data-testid="clienti-year-select"
            className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[10rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per nome o telefono…"
              data-testid="clienti-search-input"
              className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-700 placeholder:text-stone-400"
            />
          </div>

          <button
            onClick={() => window.print()}
            data-testid="clienti-print-button"
            disabled={loading || totalCount === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Stampa
          </button>
        </div>

        {/* Foglio stampabile */}
        <article className="clienti-sheet mx-auto max-w-[210mm] bg-white p-4 shadow-sm sm:p-8">
          {/* Intestazione (visibile anche in stampa) */}
          <div className="clienti-header pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
                  Rubrica lavori · Italserrande
                </div>
                <h2 className="font-display text-3xl font-bold leading-none tracking-tight text-stone-900 sm:text-4xl">
                  Anno {year}
                </h2>
              </div>
              {!loading && totalCount > 0 && (
                <div className="text-right text-[11px] uppercase tracking-widest text-stone-500">
                  {totalCount} {totalCount === 1 ? "lavoro" : "lavori"} · {grouped.length} {grouped.length === 1 ? "mese" : "mesi"}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
          ) : totalCount === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-10 text-center text-sm text-stone-500">
              <Users className="mx-auto mb-2 h-6 w-6 text-stone-400" />
              {query
                ? `Nessun cliente trovato per "${query}".`
                : `Nessun lavoro eseguito registrato nel ${year}.`}
            </div>
          ) : (
            <div className="clienti-body mt-4">
              <div className="clienti-cols clienti-cols-head">
                <div className="col-date">Data</div>
                <div className="col-name">Nome</div>
                <div className="col-phone">Telefono</div>
                <div className="col-desc">Lavoro eseguito</div>
                <div className="col-amt">Prezzo</div>
              </div>

              {grouped.map(([mm, monthClients]) => (
                <section
                  key={mm}
                  data-testid={`clienti-month-${mm}`}
                  className="clienti-month"
                >
                  <div className="clienti-month-header">
                    <span className="month-name">{MONTH_NAMES[parseInt(mm, 10) - 1]}</span>
                    <span className="month-count">
                      {monthClients.length} {monthClients.length === 1 ? "lavoro" : "lavori"}
                    </span>
                  </div>
                  {monthClients.map((c) => {
                    const dt = c.date ? parseISO(c.date) : null;
                    const dayLabel = dt && isValid(dt) ? format(dt, "d MMM", { locale: it }) : c.date;
                    return (
                      <div
                        key={c.id}
                        data-testid={`clienti-row-${c.id}`}
                        className="clienti-cols clienti-row"
                      >
                        <div className="col-date">{dayLabel || "—"}</div>
                        <div className="col-name">
                          <div className="row-name">{c.name}</div>
                          {c.address && <div className="row-addr">{c.address}</div>}
                        </div>
                        <div className="col-phone">
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 no-underline"
                            >
                              <Phone className="phone-icon h-3 w-3" /> {c.phone}
                            </a>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </div>
                        <div className="col-desc">
                          {c.notes || <span className="text-stone-400">—</span>}
                        </div>
                        <div className="col-amt">{formatEUR(grossOf(c))}</div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </article>
      </div>
    </>
  );
}

function ClientiPrintStyles() {
  return (
    <style>{`
      .clienti-sheet { font-family: Georgia, 'Times New Roman', serif; color: #111; }
      .clienti-header { border-bottom: 2px solid #111; }

      .clienti-cols {
        display: grid;
        grid-template-columns: 4.5rem 1.4fr 6.5rem 1.6fr 5rem;
        gap: 0.6rem;
        align-items: baseline;
      }
      .clienti-cols-head {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #666;
        padding: 0.4rem 0.25rem;
        border-bottom: 1px solid #111;
      }
      .col-amt, .clienti-cols-head .col-amt { text-align: right; }
      .col-phone { font-size: 11px; font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; }
      .col-phone .phone-icon { color: #888; }
      .col-date { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #111; }
      .col-desc { font-family: Georgia, serif; font-size: 11.5px; font-style: italic; color: #444; line-height: 1.3; }

      /* ── MOBILE (<640px): layout stacked a due righe ──
         Riga 1: data | prezzo (a destra)
         Riga 2: nome + indirizzo (a piena larghezza)
         Riga 3: telefono
         Riga 4: descrizione lavoro
         La griglia print-oriented resta attiva da 640px in su. */
      @media (max-width: 639px) {
        .clienti-cols {
          grid-template-columns: 1fr auto;
          gap: 0.35rem 0.6rem;
        }
        .clienti-cols-head { display: none; }
        .clienti-row .col-date { grid-column: 1 / 2; }
        .clienti-row .col-amt { grid-column: 2 / 3; text-align: right; align-self: center; font-size: 15px; }
        .clienti-row .col-name { grid-column: 1 / -1; margin-top: 0.1rem; }
        .clienti-row .col-name .row-name { font-size: 15px; }
        .clienti-row .col-phone { grid-column: 1 / -1; }
        .clienti-row .col-desc { grid-column: 1 / -1; }
      }

      .clienti-month { break-inside: auto; }
      .clienti-month-header {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        margin-top: 0.9rem;
        padding: 0.25rem 0.25rem 0.2rem;
        border-bottom: 1.5px solid #111;
        break-after: avoid;
        page-break-after: avoid;
      }
      .clienti-month-header .month-name {
        font-family: Georgia, serif;
        font-size: 20px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #111;
      }
      .clienti-month-header .month-count {
        margin-left: auto;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #666;
      }

      .clienti-row {
        padding: 0.55rem 0.25rem;
        border-bottom: 1px solid #d4d4d4;
        break-inside: avoid;
      }
      .clienti-row .row-name { font-family: Georgia, serif; font-size: 13px; font-weight: 700; line-height: 1.15; color: #111; }
      .clienti-row .row-addr { font-family: Georgia, serif; font-size: 10.5px; line-height: 1.25; color: #444; margin-top: 0.05rem; }
      .clienti-row .col-amt { font-family: Georgia, serif; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: #111; }

      @media print {
        @page { margin: 12mm 10mm; }
        html, body { background: #fff !important; }
        /* Forza il layout print-oriented anche se lo schermo e' stretto */
        .clienti-cols {
          grid-template-columns: 4.5rem 1.4fr 6.5rem 1.6fr 5rem !important;
        }
        .clienti-cols-head { display: grid !important; }
        .clienti-row .col-date, .clienti-row .col-name, .clienti-row .col-phone,
        .clienti-row .col-desc, .clienti-row .col-amt {
          grid-column: auto !important;
          margin-top: 0 !important;
          font-size: revert !important;
          text-align: revert !important;
          align-self: baseline !important;
        }
        .clienti-row .col-amt { text-align: right !important; }
        .clienti-sheet {
          box-shadow: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .clienti-sheet, .clienti-sheet * {
          color: #000 !important;
          background: #fff !important;
          box-shadow: none !important;
        }
        .clienti-header { border-bottom-color: #000 !important; }
        .clienti-month-header, .clienti-cols-head { border-bottom-color: #000 !important; }
        .clienti-row { border-bottom-color: #888 !important; }
      }
    `}</style>
  );
}
