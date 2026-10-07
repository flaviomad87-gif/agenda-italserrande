import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, computeMaterialsTotal } from "../lib/utils";
import { TrendingUp, Wallet, CreditCard, Loader2 } from "lucide-react";
import ClientFormDialog from "../components/ClientFormDialog";

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
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [openClient, setOpenClient] = useState(false);
  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/clients?month=${monthKey}`)
      .then((r) => {
        if (cancelled) return;
        setClients((r.data || []).filter((c) => c.status === "lavoro_eseguito"));
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  // Totali per metodo = margine attribuito a Contanti/Bonifico/POS, basato su:
  //   • pagamenti con amount>0 (prioritari): usano il loro metodo per il
  //     margine effettivamente incassato;
  //   • pagamento con amount=0 ma METODO scelto (fattura emessa ma non ancora
  //     saldata): il metodo salvato indica dove verrà il saldo → attribuisce
  //     il margine ATTESO residuo a quel bucket;
  //   • se non ci sono né pagamenti né payment_method sulla scheda, il lavoro
  //     NON contribuisce ai totali (niente ipotesi automatiche).
  const byMethod = useMemo(() => {
    const _split = (amount, vat, wh) => {
      const divisor = 1 + (Number(vat || 0) - Number(wh || 0)) / 100;
      const d = divisor <= 0 ? 1 : divisor;
      return amount / d;
    };
    const _validMethod = (m) =>
      m === "contanti" || m === "pos" || m === "bonifico";
    const acc = { contanti: 0, pos: 0, bonifico: 0 };
    clients.forEach((c) => {
      const vat = c.vat_rate == null ? 0 : Number(c.vat_rate);
      const wh = c.withholding_rate == null ? 0 : Number(c.withholding_rate);
      const matTotal = computeMaterialsTotal(c.materials);
      const expectedMargin = (Number(c.amount) || 0) - matTotal;
      const allPayments = c.payments || [];
      const paidPayments = allPayments.filter((p) => Number(p.amount) > 0);

      // Margine effettivamente incassato: viene dai paidPayments e usa i loro
      // metodi. Teniamo conto della distribuzione pro-quota dei materiali.
      let collectedMargin = 0;
      if (paidPayments.length > 0) {
        const clientImpTotal = paidPayments.reduce(
          (s, p) => s + _split(Number(p.amount) || 0, vat, wh),
          0,
        );
        paidPayments.forEach((p) => {
          const imp = _split(Number(p.amount) || 0, vat, wh);
          const share = clientImpTotal > 0 ? imp / clientImpTotal : 0;
          const matShare = matTotal * share;
          const marginP = imp - matShare;
          collectedMargin += marginP;
          const m = (p.method || "").trim();
          if (_validMethod(m)) acc[m] += marginP;
        });
      }

      // Residuo = margine atteso non ancora incassato. Lo attribuiamo al
      // metodo "annunciato" dall'utente: un payment entry con amount<=0 che
      // ha già un metodo scelto (es. fattura emessa ma non ancora saldata).
      // Fallback: payment_method del cliente. Se nessuno dei due è valido,
      // il residuo NON contribuisce (nessuna ipotesi automatica).
      const remaining = expectedMargin - collectedMargin;
      if (remaining > 0.01) {
        const intentPayment = allPayments.find(
          (p) =>
            (Number(p.amount) || 0) <= 0 &&
            _validMethod((p.method || "").trim()),
        );
        const method = intentPayment
          ? (intentPayment.method || "").trim()
          : (c.payment_method || "").trim();
        if (_validMethod(method)) acc[method] += remaining;
      }
    });
    return acc;
  }, [clients]);

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
      } else {
        // Nessun pagamento registrato: usiamo il valore atteso del lavoro.
        // Mostriamo quindi margine ATTESO al valore pieno (non in grigio).
        // Il flag isPending resta true per uso interno; il rendering non
        // differenzia più visivamente paid vs unpaid.
        collectedImp = expectedImp;
        collectedMargin = expectedMargin;
      }

      const isPending = payments.length === 0;

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
        isPending,
        client: c,
      });
    });
    out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return out;
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
              Margine già incassato (imponibile scorporato IVA − materiali) · {rows.length} {rows.length === 1 ? "lavoro eseguito" : "lavori eseguiti"}
            </div>
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

          {/* Elenco lavori: TUTTI i lavori eseguiti del mese. Il margine
              mostrato è quello incassato (se ci sono payments[]) oppure
              quello atteso (fallback sui lavori senza pagamenti registrati).
              Tap su una riga → apre la scheda per correggere metodo/pagamento. */}
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
                  // Importo mostrato: usiamo il margine incassato se ci sono
                  // payments[], altrimenti il margine atteso (fallback). In
                  // entrambi i casi il valore viene mostrato a pieno colore.
                  const shownMargin = r.isPending ? r.expectedMargin : r.collectedMargin;
                  return (
                    <li
                      key={r.id}
                      data-testid={`margine-row-${r.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(r.client);
                          setOpenClient(true);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl py-2 px-1 text-left transition hover:bg-stone-50 active:bg-stone-100"
                        data-testid={`margine-row-open-${r.id}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-stone-800">
                              {r.name}
                            </span>
                            {partial && (
                              <span className="shrink-0 rounded-full bg-[#FBF1DE] px-2 py-0.5 text-[10px] font-semibold text-[#8A5A1F]">
                                acconto
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
                          <div className={
                            "font-display text-base font-bold tabular-nums " +
                            (shownMargin >= 0 ? "text-[#2E5A47]" : "text-red-600")
                          }>
                            {formatEUR(shownMargin)}
                          </div>
                          {partial ? (
                            <div className="text-[10px] text-stone-500">
                              atteso {formatEUR(r.expectedMargin)}
                            </div>
                          ) : null}
                        </div>
                      </button>
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

      <ClientFormDialog
        open={openClient}
        onOpenChange={setOpenClient}
        date={editing?.date}
        initial={editing}
        onSaved={() => {
          // Ricarica i dati del mese per aggiornare totali e lista.
          api.get(`/clients?month=${monthKey}`)
            .then((r) =>
              setClients((r.data || []).filter((c) => c.status === "lavoro_eseguito")),
            )
            .catch(() => {});
          setOpenClient(false);
        }}
        onDeleted={() => {
          api.get(`/clients?month=${monthKey}`)
            .then((r) =>
              setClients((r.data || []).filter((c) => c.status === "lavoro_eseguito")),
            )
            .catch(() => {});
          setOpenClient(false);
        }}
      />
    </div>
  );
}
