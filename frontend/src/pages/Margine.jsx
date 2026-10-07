import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, computeMaterialsTotal } from "../lib/utils";
import { TrendingUp, Wallet, CreditCard, Loader2 } from "lucide-react";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Pagina "Margine": mostra il margine di guadagno REALMENTE INCASSATO del
 * mese selezionato. Prende i totali dal backend `/api/summary` (che calcola
 * imponibile scorporato IVA + materiali pro-quota SOLO sui pagamenti già
 * ricevuti), così resta coerente con Riepilogo e Incassi.
 * Route: /margine
 */
export default function Margine() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/clients?month=${monthKey}`).then((r) => r.data || []).catch(() => []),
      api.get(`/summary?month=${monthKey}`).then((r) => r.data).catch(() => null),
    ])
      .then(([cs, s]) => {
        if (cancelled) return;
        setClients(cs.filter((c) => c.status === "lavoro_eseguito"));
        setSummary(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  // Totali per metodo di pagamento = margine REALMENTE INCASSATO (dal backend).
  // È il valore corretto da esporre: coincide con quello mostrato in Riepilogo.
  const byMethod = useMemo(() => {
    const src = summary?.incassi_margine_by_method || {};
    return {
      contanti: Number(src.contanti) || 0,
      pos: Number(src.pos) || 0,
      bonifico: Number(src.bonifico) || 0,
    };
  }, [summary]);

  const totalMargin = useMemo(
    () => byMethod.contanti + byMethod.pos + byMethod.bonifico,
    [byMethod],
  );

  // Dettaglio per lavoro: calcolo il margine PER CLIENTE basato sui pagamenti
  // già incassati, specchio della logica backend.
  const rows = useMemo(() => {
    const _split = (amount, vat, wh) => {
      const divisor = 1 + (Number(vat || 0) - Number(wh || 0)) / 100;
      const d = divisor <= 0 ? 1 : divisor;
      return amount / d;
    };
    const out = [];
    clients.forEach((c) => {
      const vat = c.vat_rate == null ? 0 : Number(c.vat_rate);
      const wh = c.withholding_rate == null ? 0 : Number(c.withholding_rate);
      const matTotal = computeMaterialsTotal(c.materials);
      const payments = (c.payments || []).filter((p) => Number(p.amount) > 0);
      const expectedImp = Number(c.amount) || 0;
      const expectedMargin = expectedImp - matTotal;

      let collectedImp = 0;
      let collectedMargin = 0;

      if (payments.length > 0) {
        const clientImpTotal = payments.reduce(
          (s, p) => s + _split(Number(p.amount) || 0, vat, wh),
          0,
        );
        payments.forEach((p) => {
          const imp = _split(Number(p.amount) || 0, vat, wh);
          const share = clientImpTotal > 0 ? imp / clientImpTotal : 0;
          const matShare = matTotal * share;
          collectedImp += imp;
          collectedMargin += imp - matShare;
        });
      } else if (
        c.status === "lavoro_eseguito" &&
        (c.payment_method || c.invoice_number)
      ) {
        // Legacy: considerato saldato
        collectedImp = expectedImp;
        collectedMargin = expectedMargin;
      }

      out.push({
        id: c.id,
        name: c.name,
        date: c.date,
        expectedMargin,
        collectedMargin,
        expectedImp,
        collectedImp,
        matTotal,
        pending: expectedImp - collectedImp,
      });
    });
    out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return out;
  }, [clients]);

  const positive = totalMargin >= 0;
  const pendingTotal = rows.reduce((s, r) => s + Math.max(0, r.pending), 0);
  const pendingMarginTotal = rows.reduce(
    (s, r) => s + Math.max(0, r.expectedMargin - r.collectedMargin),
    0,
  );

  return (
    <div className="space-y-4 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Margine di guadagno
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Guadagno del mese
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          data-testid="margine-month-select"
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
        >
          {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          data-testid="margine-year-select"
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
      ) : (
        <>
          {/* Totale grande */}
          <section
            data-testid="margine-total-card"
            className={`rounded-3xl border p-6 shadow-sm ${
              positive
                ? "border-[#4A5D23]/30 bg-gradient-to-br from-[#EAF3EF] to-white"
                : "border-red-200 bg-gradient-to-br from-red-50 to-white"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
              {MONTHS[month - 1]} {year}
            </div>
            <div className={`mt-1 font-display text-4xl font-bold tabular-nums sm:text-5xl ${
              positive ? "text-[#2E5A47]" : "text-red-600"
            }`}>
              {positive ? "+ " : "− "}{formatEUR(Math.abs(totalMargin))}
            </div>
            <div className="mt-2 text-xs text-stone-500">
              Margine già incassato (imponibile scorporato IVA − materiali) · {rows.length} {rows.length === 1 ? "lavoro eseguito" : "lavori eseguiti"}
            </div>
            {pendingMarginTotal > 0.01 && (
              <div
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#FBF1DE] px-3 py-1 text-[11px] font-semibold text-[#8A5A1F]"
                data-testid="margine-pending-badge"
              >
                + {formatEUR(pendingMarginTotal)} ancora da incassare
                {pendingTotal > 0.01 && <> · saldo {formatEUR(pendingTotal)}</>}
              </div>
            )}
          </section>

          {/* Suddivisione per metodo */}
          {rows.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                Per metodo di pagamento (già incassato)
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  data-testid="margine-method-contanti"
                  className="rounded-2xl bg-[#EAF3EF] p-4"
                >
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#2E5A47]">
                    <Wallet className="h-3 w-3" /> Contanti
                  </div>
                  <div className="mt-1 font-display text-3xl font-bold tabular-nums">
                    {formatEUR(byMethod.contanti)}
                  </div>
                </div>
                <div
                  data-testid="margine-method-tracciabile"
                  className="rounded-2xl bg-[#E8F0F4] p-4"
                >
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#335C6E]">
                    <CreditCard className="h-3 w-3" /> Bonifico / POS
                  </div>
                  <div className="mt-1 font-display text-3xl font-bold tabular-nums">
                    {formatEUR(byMethod.bonifico + byMethod.pos)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    Bonifico {formatEUR(byMethod.bonifico)} · POS {formatEUR(byMethod.pos)}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Elenco lavori */}
          {rows.length > 0 && (
            <section className="rounded-3xl border border-stone-200/60 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#4A5D23]" />
                <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                  Dettaglio lavori
                </span>
              </div>
              <ul className="divide-y divide-stone-100">
                {rows.map((r) => {
                  const partial =
                    r.collectedMargin < r.expectedMargin - 0.01 &&
                    r.collectedMargin > 0;
                  const unpaid = r.collectedMargin <= 0.01 && r.expectedMargin > 0;
                  return (
                    <li
                      key={r.id}
                      data-testid={`margine-row-${r.id}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-stone-800">{r.name}</span>
                          {partial && (
                            <span className="shrink-0 rounded-full bg-[#FBF1DE] px-2 py-0.5 text-[10px] font-semibold text-[#8A5A1F]">
                              acconto
                            </span>
                          )}
                          {unpaid && (
                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                              non incassato
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {r.date}
                          {r.matTotal > 0 && (
                            <> · imp. {formatEUR(r.expectedImp)} − mat. {formatEUR(r.matTotal)}</>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`font-display text-base font-bold tabular-nums ${
                          r.collectedMargin >= 0 ? "text-[#2E5A47]" : "text-red-600"
                        }`}>
                          {formatEUR(r.collectedMargin)}
                        </div>
                        {partial || unpaid ? (
                          <div className="text-[10px] text-stone-500">
                            atteso {formatEUR(r.expectedMargin)}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-10 text-center text-sm text-stone-500">
              Nessun lavoro eseguito registrato in {MONTHS[month - 1].toLowerCase()} {year}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
