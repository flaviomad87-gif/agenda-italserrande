import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, computeMaterialsTotal } from "../lib/utils";
import { TrendingUp, Wallet, CreditCard, Loader2 } from "lucide-react";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Pagina "Margine": mostra il margine di guadagno del mese selezionato.
 * Margine = Imponibile (senza IVA) − Materiali. Suddiviso per metodo di
 * pagamento. Solo lavori con status='lavoro_eseguito'.
 * Route: /margine
 */
export default function Margine() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/clients?month=${monthKey}`)
      .then((r) => {
        if (cancelled) return;
        const executed = (r.data || []).filter((c) => c.status === "lavoro_eseguito");
        setClients(executed);
      })
      .catch(() => setClients([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthKey]);

  // Aggregazioni
  const { totalMargin, byMethod, rows } = useMemo(() => {
    const methods = { contanti: 0, pos: 0, bonifico: 0 };
    const perClient = [];
    let total = 0;
    clients.forEach((c) => {
      const imp = Number(c.amount) || 0;
      const mat = computeMaterialsTotal(c.materials);
      const margin = imp - mat;
      total += margin;

      // Distribuzione margine per metodo di pagamento:
      // 1) se ci sono payments[] con method, distribuisco pro-quota sull'amount di ogni payment
      // 2) altrimenti tutto al payment_method principale
      // 3) altrimenti fallback contanti
      const payments = (c.payments || []).filter((p) => p.method);
      if (payments.length > 0) {
        const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        if (totalPaid > 0) {
          payments.forEach((p) => {
            const share = ((Number(p.amount) || 0) / totalPaid) * margin;
            const m = p.method in methods ? p.method : "contanti";
            methods[m] += share;
          });
        } else {
          const m = c.payment_method && c.payment_method in methods ? c.payment_method : "contanti";
          methods[m] += margin;
        }
      } else {
        const m = c.payment_method && c.payment_method in methods ? c.payment_method : "contanti";
        methods[m] += margin;
      }

      perClient.push({ id: c.id, name: c.name, date: c.date, imp, mat, margin });
    });
    perClient.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return { totalMargin: total, byMethod: methods, rows: perClient };
  }, [clients]);

  const positive = totalMargin >= 0;

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
              Margine = Imponibile (senza IVA) − Materiali · {rows.length} {rows.length === 1 ? "lavoro eseguito" : "lavori eseguiti"}
            </div>
          </section>

          {/* Suddivisione per metodo */}
          {rows.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                Per metodo di pagamento
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
                    {formatEUR(byMethod.contanti || 0)}
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
                    {formatEUR((byMethod.bonifico || 0) + (byMethod.pos || 0))}
                  </div>
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    Bonifico {formatEUR(byMethod.bonifico || 0)} · POS {formatEUR(byMethod.pos || 0)}
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
                {rows.map((r) => (
                  <li
                    key={r.id}
                    data-testid={`margine-row-${r.id}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-800">{r.name}</div>
                      <div className="text-[11px] text-stone-500">
                        {r.date}
                        {r.mat > 0 && (
                          <> · imp. {formatEUR(r.imp)} − mat. {formatEUR(r.mat)}</>
                        )}
                      </div>
                    </div>
                    <div className={`shrink-0 font-display text-base font-bold tabular-nums ${
                      r.margin >= 0 ? "text-[#2E5A47]" : "text-red-600"
                    }`}>
                      {formatEUR(r.margin)}
                    </div>
                  </li>
                ))}
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
