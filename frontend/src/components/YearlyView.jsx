import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR } from "../lib/utils";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MONTH_NAMES = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

export default function YearlyView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/summary/year`, { params: { year } })
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch(() => toast.error("Impossibile caricare l'anno"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  // Range per la barra-grafico: |max| del balance assoluto tra i mesi
  const maxAbs = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.months.map((m) => Math.abs(m.balance || 0)));
  }, [data]);

  if (loading || !data) {
    return (
      <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento anno…</div>
    );
  }

  const totals = data.totals;
  const isProfit = totals.balance >= 0;

  return (
    <div className="space-y-6 fade-in" data-testid="yearly-view">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Riepilogo annuale</div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{year}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            data-testid="year-prev"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Anno precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setYear((y) => y + 1)}
            data-testid="year-next"
            disabled={year >= today.getFullYear() + 1}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50 disabled:opacity-40"
            aria-label="Anno successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Risultato annuale */}
      <div
        className={`overflow-hidden rounded-3xl border shadow-sm ${
          isProfit
            ? "border-[#2E5A47]/20 bg-gradient-to-br from-[#EAF3EF] to-white"
            : "border-red-200 bg-gradient-to-br from-red-50 to-white"
        }`}
        data-testid="year-pnl"
      >
        <div className="p-6 sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            {isProfit ? "Guadagno dell'anno" : "Perdita dell'anno"}
          </div>
          <div
            className={`mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl ${
              isProfit ? "text-[#2E5A47]" : "text-red-600"
            }`}
            data-testid="year-balance"
          >
            {isProfit ? "+" : "−"} {formatEUR(Math.abs(totals.balance))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Imponibile</div>
              <div className="font-display text-lg font-bold tabular-nums">{formatEUR(totals.total_imponibile || 0)}</div>
              {(totals.total_iva || 0) > 0 && (
                <div className="mt-0.5 text-[10px] text-stone-400">
                  IVA: {formatEUR(totals.total_iva)}
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Spese fisse</div>
              <div className="font-display text-lg font-bold tabular-nums">{formatEUR(totals.total_spese)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Materiali</div>
              <div className="font-display text-lg font-bold tabular-nums">{formatEUR(totals.total_materials)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Acconti operai</div>
              <div className="font-display text-lg font-bold tabular-nums">{formatEUR(totals.total_advances)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Best / worst */}
      {(data.best_month || data.worst_month) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.best_month && (
            <div className="rounded-2xl border border-[#2E5A47]/20 bg-[#EAF3EF]/60 p-4 shadow-sm" data-testid="year-best">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
                <Trophy className="h-4 w-4" /> Mese migliore
              </div>
              <div className="mt-1 font-display text-lg font-bold capitalize">
                {MONTH_NAMES[parseInt(data.best_month.split("-")[1], 10) - 1]} {data.best_month.split("-")[0]}
              </div>
            </div>
          )}
          {data.worst_month && data.worst_month !== data.best_month && (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-sm" data-testid="year-worst">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-600">
                <AlertTriangle className="h-4 w-4" /> Mese peggiore
              </div>
              <div className="mt-1 font-display text-lg font-bold capitalize">
                {MONTH_NAMES[parseInt(data.worst_month.split("-")[1], 10) - 1]} {data.worst_month.split("-")[0]}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabella mese per mese con barra */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Mese per mese</h2>
        <ul className="space-y-2 stagger" data-testid="year-months-list">
          {data.months.map((m, idx) => {
            const balance = m.balance || 0;
            const profit = balance >= 0;
            const widthPct = (Math.abs(balance) / maxAbs) * 100;
            const isEmpty = m.counts.clients === 0 && m.counts.expenses === 0 && m.counts.advances === 0;
            return (
              <li
                key={m.month}
                data-testid={`year-month-${m.month}`}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  isEmpty ? "border-stone-200/40 opacity-60" : "border-stone-200/60"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-lg font-bold capitalize">{MONTH_NAMES[idx]}</span>
                    {!isEmpty && (
                      <span className="text-xs text-stone-400">
                        {m.counts.clients} {m.counts.clients === 1 ? "lavoro" : "lavori"}
                      </span>
                    )}
                  </div>
                  <div
                    className={`font-display text-lg font-bold tabular-nums ${
                      isEmpty ? "text-stone-400" : profit ? "text-[#2E5A47]" : "text-red-600"
                    }`}
                  >
                    {isEmpty ? "—" : `${profit ? "+" : "−"} ${formatEUR(Math.abs(balance))}`}
                  </div>
                </div>
                {!isEmpty && (
                  <>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full ${profit ? "bg-[#2E5A47]" : "bg-red-500"}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-stone-500">
                      <div className="inline-flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-[#2E5A47]" /> {formatEUR(m.total_imponibile || 0)}
                      </div>
                      <div className="inline-flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-red-500" /> {formatEUR(m.total_spese + m.total_materials + m.total_advances)}
                      </div>
                      <div className="text-right text-stone-400">{formatEUR(m.total_materials)} mat.</div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
