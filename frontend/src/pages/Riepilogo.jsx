import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, isoMonth } from "../lib/utils";
import { ChevronLeft, ChevronRight, Wallet, CreditCard, Landmark, TrendingUp, TrendingDown, HardHat } from "lucide-react";
import { format, parseISO, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/summary`, { params: { month } }),
      api.get(`/advances/by-worker`, { params: { month } }),
    ])
      .then(([s, w]) => {
        if (!cancelled) {
          setData(s.data);
          setByWorker(w.data);
        }
      })
      .catch(() => toast.error("Impossibile caricare il riepilogo"))
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
          {/* Saldo */}
          <div className="rounded-3xl border border-stone-200/60 bg-white p-6 shadow-sm sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Saldo del mese</div>
            <div
              className={`mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl ${
                data.balance >= 0 ? "text-[#2E5A47]" : "text-red-600"
              }`}
              data-testid="riepilogo-balance"
            >
              {formatEUR(data.balance)}
            </div>
            <p className="mt-2 text-sm text-stone-500">
              Incassi - Spese - Acconti operai
            </p>
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
                    className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/60 bg-white px-4 py-3 shadow-sm"
                    data-testid={`worker-row-${w.worker_name}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#F3F2F0] text-stone-700">
                        <HardHat className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{w.worker_name}</div>
                        <div className="text-xs text-stone-500">
                          {w.count} {w.count === 1 ? "acconto" : "acconti"} nel mese
                        </div>
                      </div>
                    </div>
                    <div className="font-display text-base font-bold">{formatEUR(w.total)}</div>
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
    </div>
  );
}
