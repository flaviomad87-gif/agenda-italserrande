import { useEffect, useMemo, useState } from "react";
import { api, apiGetWithCache } from "../lib/api";
import { formatEUR, isoMonth } from "../lib/utils";
import {
  Truck,
  Wallet,
  Building,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Pagina "Fornitori": riepilogo mensile dei materiali acquistati raggruppati
 * per fornitore. Serve all'utente per sapere quanto deve pagare a ciascun
 * fornitore a fine mese. Aggrega TUTTI i materiali dei lavori del mese
 * (inclusi preventivi) perché sono acquisti già effettuati.
 * Route: /fornitori
 */

const SourceBadge = ({ source }) => {
  if (source === "conto_aziendale")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#E6EEF5] px-2 py-0.5 text-[11px] font-semibold text-[#2B5A82]"
        data-testid="src-conto"
      >
        <Building className="h-3 w-3" /> Conto
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#EAF3EF] px-2 py-0.5 text-[11px] font-semibold text-[#2E5A47]"
      data-testid="src-contanti"
    >
      <Wallet className="h-3 w-3" /> Contanti
    </span>
  );
};

export default function Fornitori() {
  const [month, setMonth] = useState(isoMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    const cached = apiGetWithCache(`/suppliers/summary`, { month });
    if (cached.cached) {
      setData(cached.cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    cached.fresh
      .then((fresh) => {
        if (cancelled) return;
        setData(fresh);
      })
      .catch(() => {
        if (cancelled) return;
        if (!cached.cached) toast.error("Impossibile caricare i fornitori");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // reset expansions when month changes
    setExpanded(new Set());
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

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totals = useMemo(
    () => ({
      total: data?.total || 0,
      contanti: data?.total_contanti || 0,
      conto: data?.total_conto_aziendale || 0,
      itemsCount: data?.items_count || 0,
      suppliersCount: data?.suppliers?.length || 0,
    }),
    [data],
  );

  return (
    <div className="space-y-6 fade-in" data-testid="fornitori-page">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Da pagare ai fornitori
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl capitalize">
            {monthLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese precedente"
            data-testid="fornitori-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese successivo"
            data-testid="fornitori-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Totale materiali
          </div>
          <div
            className="mt-1 font-display text-2xl font-bold sm:text-3xl"
            data-testid="fornitori-total"
          >
            {formatEUR(totals.total)}
          </div>
          <div className="mt-1 text-xs text-stone-500">
            {totals.itemsCount} {totals.itemsCount === 1 ? "voce" : "voci"} ·{" "}
            {totals.suppliersCount} {totals.suppliersCount === 1 ? "fornitore" : "fornitori"}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
            Pagato in Contanti
          </div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            {formatEUR(totals.contanti)}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#2B5A82]">
            Conto aziendale
          </div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            {formatEUR(totals.conto)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Elenco fornitori</h2>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
        </div>
      ) : totals.suppliersCount === 0 ? (
        <div
          className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center"
          data-testid="fornitori-empty"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBF1DE] text-[#B8683D]">
            <Truck className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold">Nessun materiale registrato</p>
          <p className="mt-1 text-sm text-stone-500">
            Aggiungi i materiali direttamente sulle schede dei lavori del mese: qui vedrai il
            totale raggruppato per fornitore.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 stagger">
          {data.suppliers.map((s, idx) => {
            const key = s.name || `__${idx}`;
            const isOpen = expanded.has(key);
            const noSupplier = s.name === "Senza fornitore";
            return (
              <li
                key={key}
                className="overflow-hidden rounded-2xl border border-stone-200/60 bg-white shadow-sm"
                data-testid={`supplier-row-${idx}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-stone-50"
                  aria-expanded={isOpen}
                  data-testid={`supplier-toggle-${idx}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        "flex h-10 w-10 flex-none items-center justify-center rounded-xl " +
                        (noSupplier
                          ? "bg-stone-100 text-stone-500"
                          : "bg-[#FBF1DE] text-[#B8683D]")
                      }
                    >
                      {noSupplier ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <Truck className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold" data-testid={`supplier-name-${idx}`}>
                        {s.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                        <span>
                          {s.items_count} {s.items_count === 1 ? "acquisto" : "acquisti"}
                        </span>
                        {s.total_contanti > 0 && (
                          <span className="inline-flex items-center gap-1 text-[#2E5A47]">
                            · <Wallet className="h-3 w-3" /> {formatEUR(s.total_contanti)}
                          </span>
                        )}
                        {s.total_conto_aziendale > 0 && (
                          <span className="inline-flex items-center gap-1 text-[#2B5A82]">
                            · <Building className="h-3 w-3" /> {formatEUR(s.total_conto_aziendale)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <span
                      className="font-display text-base font-bold"
                      data-testid={`supplier-total-${idx}`}
                    >
                      {formatEUR(s.total)}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-stone-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-stone-400" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <ul
                    className="divide-y divide-stone-100 border-t border-stone-100 bg-stone-50/50"
                    data-testid={`supplier-items-${idx}`}
                  >
                    {s.items.map((it, j) => (
                      <li
                        key={`${it.client_id}-${j}`}
                        className="flex items-start gap-3 px-4 py-2.5"
                      >
                        <Package className="mt-0.5 h-4 w-4 flex-none text-stone-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="truncate font-medium text-stone-800">
                              {it.description || "Materiale"}
                            </span>
                            <span className="text-xs text-stone-500">
                              per <span className="font-semibold">{it.client_name || "—"}</span>
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                            {it.client_date && (
                              <span>
                                {format(parseISO(it.client_date), "d MMM", { locale: it })}
                              </span>
                            )}
                            {it.notes && <span className="italic">· {it.notes}</span>}
                          </div>
                        </div>
                        <div className="flex flex-none flex-col items-end gap-1">
                          <span className="font-display text-sm font-bold">
                            {formatEUR(it.amount)}
                          </span>
                          <SourceBadge source={it.source} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
