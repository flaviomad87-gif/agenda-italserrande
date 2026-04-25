import { useEffect, useState } from "react";
import { api, apiGetWithCache } from "../lib/api";
import { formatEUR, isoMonth } from "../lib/utils";
import { ChevronLeft, ChevronRight, Wallet, CreditCard, Landmark, TrendingUp, TrendingDown, HardHat, ChevronRight as Chev } from "lucide-react";
import { format, parseISO, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import WorkerAdvancesDialog from "../components/WorkerAdvancesDialog";

const PAY_META = {
  contanti: { label: "Contanti", icon: Wallet, bg: "bg-[#EAF3EF]", text: "text-[#2E5A47]" },
  pos: { label: "POS / Carta", icon: CreditCard, bg: "bg-[#E8F0F4]", text: "text-[#335C6E]" },
  bonifico: { label: "Bonifico", icon: Landmark, bg: "bg-[#F0EBF1]", text: "text-[#6B5B72]" },
};

export default function Riepilogo() {
  const [month, setMonth] = useState(isoMonth());
  const [data, setData] = useState(null);
  const [byWorker, setByWorker] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);

  const reloadByWorker = (m) =>
    api.get(`/advances/by-worker`, { params: { month: m } }).then((r) => setByWorker(r.data));

  useEffect(() => {
    let cancelled = false;
    const cSum = apiGetWithCache(`/summary`, { month });
    const cWk = apiGetWithCache(`/advances/by-worker`, { month });
    if (cSum.cached) setData(cSum.cached);
    if (cWk.cached) setByWorker(cWk.cached);
    setLoading(!(cSum.cached && cWk.cached));
    Promise.all([cSum.fresh, cWk.fresh])
      .then(([s, w]) => {
        if (cancelled) return;
        setData(s);
        setByWorker(w);
      })
      .catch(() => {
        if (!cSum.cached) toast.error("Impossibile caricare il riepilogo");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: it });
  const shiftMonth = (delta) => {
    const d = parseISO(`${month}-01`);
    const next = delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    setMonth(format(next, "yyyy-MM"));
  };

  return (
    <div className="space-y-6 fade-in">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Riepilogo mensile</div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl capitalize">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            data-testid="riepilogo-prev-month"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            data-testid="riepilogo-next-month"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loading || !data ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : (
        <>
          {/* Conto economico — guadagno / perdita del mese */}
          <div
            className={`overflow-hidden rounded-3xl border shadow-sm sm:p-1 ${
              data.balance >= 0
                ? "border-[#2E5A47]/20 bg-gradient-to-br from-[#EAF3EF] to-white"
                : "border-red-200 bg-gradient-to-br from-red-50 to-white"
            }`}
            data-testid="riepilogo-pnl"
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                  {data.balance >= 0 ? "Guadagno del mese" : "Perdita del mese"}
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    data.balance >= 0 ? "bg-[#2E5A47] text-white" : "bg-red-600 text-white"
                  }`}
                >
                  {data.balance >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {data.balance >= 0 ? "Utile" : "Perdita"}
                </span>
              </div>
              <div
                className={`mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl ${
                  data.balance >= 0 ? "text-[#2E5A47]" : "text-red-600"
                }`}
                data-testid="riepilogo-balance"
              >
                {formatEUR(data.balance)}
              </div>

              <div className="mt-5 space-y-2 rounded-2xl bg-white/80 p-4 backdrop-blur">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-[#2E5A47]">
                    <TrendingUp className="h-4 w-4" /> Ricavi (lavori eseguiti)
                  </span>
                  <span className="font-display text-base font-bold tabular-nums">
                    + {formatEUR(data.total_incassi)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-stone-700">
                    <TrendingDown className="h-4 w-4 text-red-600" /> Spese fisse
                  </span>
                  <span className="font-display text-base font-bold tabular-nums text-red-600">
                    − {formatEUR(data.total_spese)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-stone-700">
                    <TrendingDown className="h-4 w-4 text-red-600" /> Acconti operai
                  </span>
                  <span className="font-display text-base font-bold tabular-nums text-red-600">
                    − {formatEUR(data.total_advances)}
                  </span>
                </div>
                <div className="my-2 h-px bg-stone-200" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-700">
                    {data.balance >= 0 ? "Risultato (utile)" : "Risultato (perdita)"}
                  </span>
                  <span
                    className={`font-display text-lg font-bold tabular-nums ${
                      data.balance >= 0 ? "text-[#2E5A47]" : "text-red-600"
                    }`}
                  >
                    {formatEUR(data.balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Incassi by method */}
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Incassi per modalità</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.entries(PAY_META).map(([k, m]) => {
                const Icon = m.icon;
                return (
                  <div
                    key={k}
                    className={`rounded-2xl border border-stone-200/60 ${m.bg} p-4 shadow-sm`}
                    data-testid={`riepilogo-incasso-${k}`}
                  >
                    <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${m.text}`}>
                      <Icon className="h-4 w-4" /> {m.label}
                    </div>
                    <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">
                      {formatEUR(data.incassi_by_method[k] || 0)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2E5A47]">
                  <TrendingUp className="h-4 w-4" /> Totale incassi
                </div>
                <div className="font-display text-xl font-bold">{formatEUR(data.total_incassi)}</div>
              </div>
            </div>
          </section>

          {/* Spese e acconti */}
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Uscite</h2>
            <div className="space-y-3">
              <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#2E5A47]">
                    <Wallet className="h-4 w-4" /> Spese in contanti
                  </div>
                  <div className="font-display text-lg font-bold">
                    {formatEUR(data.spese_by_source.contanti || 0)}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#2B5A82]">
                    <Landmark className="h-4 w-4" /> Spese da conto aziendale
                  </div>
                  <div className="font-display text-lg font-bold">
                    {formatEUR(data.spese_by_source.conto_aziendale || 0)}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <HardHat className="h-4 w-4" /> Acconti operai
                  </div>
                  <div className="font-display text-lg font-bold">{formatEUR(data.total_advances)}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                    <TrendingDown className="h-4 w-4" /> Totale uscite
                  </div>
                  <div className="font-display text-xl font-bold">
                    {formatEUR((data.total_spese || 0) + (data.total_advances || 0))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-lg font-semibold">Acconti per operaio</h2>
              <span className="text-xs text-stone-500">azzerati ad ogni nuovo mese</span>
            </div>
            {byWorker.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500">
                Nessun acconto registrato in questo mese.
              </div>
            ) : (
              <ul className="space-y-2 stagger" data-testid="riepilogo-by-worker-list">
                {byWorker.map((w) => (
                  <li
                    key={w.worker_name}
                    role="button"
                    onClick={() => setSelectedWorker(w.worker_name)}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-stone-200/60 bg-white px-4 py-3 shadow-sm transition hover:border-stone-300 hover:shadow-md"
                    data-testid={`worker-row-${w.worker_name}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#F3F2F0] text-stone-700">
                        <HardHat className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{w.worker_name}</div>
                        <div className="text-xs text-stone-500">
                          {w.count} {w.count === 1 ? "acconto" : "acconti"} nel mese · tocca per dettagli
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold">{formatEUR(w.total)}</span>
                      <Chev className="h-4 w-4 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-600" />
                    </div>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 rounded-2xl bg-[#F3F2F0] px-4 py-3">
                  <span className="text-sm font-semibold text-stone-700">Totale acconti del mese</span>
                  <span className="font-display text-base font-bold">
                    {formatEUR(byWorker.reduce((s, w) => s + (w.total || 0), 0))}
                  </span>
                </li>
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Preventivi aperti</h2>
            <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Valore totale dei preventivi del mese</span>
                <span className="font-display text-lg font-bold text-[#B8683D]">{formatEUR(data.total_quotes)}</span>
              </div>
            </div>
          </section>
        </>
      )}

      <WorkerAdvancesDialog
        open={Boolean(selectedWorker)}
        onOpenChange={(o) => !o && setSelectedWorker(null)}
        worker={selectedWorker}
        month={month}
        onDeleted={() => reloadByWorker(month)}
      />
    </div>
  );
}
