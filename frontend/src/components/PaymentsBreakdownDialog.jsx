import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api } from "../lib/api";
import { Loader2, Wallet, CreditCard, Landmark, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatEUR } from "../lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const META = {
  contanti: { label: "Contanti", icon: Wallet, color: "text-[#2E5A47]", bg: "bg-[#EAF3EF]" },
  pos: { label: "POS / Carta", icon: CreditCard, color: "text-[#335C6E]", bg: "bg-[#E8F0F4]" },
  bonifico: { label: "Bonifico", icon: Landmark, color: "text-[#6B5B72]", bg: "bg-[#F0EBF1]" },
};

const TYPE_LABEL = { acconto: "Acconto", saldo: "Saldo", altro: "Altro" };

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd MMM", { locale: it });
  } catch {
    return d;
  }
};

const fmtDay = (d) => {
  if (!d) return "—";
  try {
    return format(parseISO(d), "EEEE d MMMM", { locale: it });
  } catch {
    return d;
  }
};

export default function PaymentsBreakdownDialog({ open, onOpenChange, month, method, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!open || !month || !method) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .get(`/payments/by-method`, { params: { month, method } })
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, month, method]);

  const removePayment = async (p) => {
    if (!p.payment_id) return;
    if (!window.confirm(`Eliminare questo pagamento di ${formatEUR(p.amount)} di ${p.client_name}?`)) return;
    setDeletingId(p.payment_id);
    // Optimistic: rimuovi subito dalla lista
    const prevData = data;
    setData((d) => {
      if (!d) return d;
      const items = d.items.filter((x) => x.payment_id !== p.payment_id);
      const total_gross = items.reduce((s, x) => s + (x.amount || 0), 0);
      const total_imponibile = items.reduce((s, x) => s + (x.imponibile || 0), 0);
      const total_iva = items.reduce((s, x) => s + (x.iva || 0), 0);
      return {
        ...d,
        items,
        total: Math.round(total_gross * 100) / 100,
        total_gross: Math.round(total_gross * 100) / 100,
        total_imponibile: Math.round(total_imponibile * 100) / 100,
        total_iva: Math.round(total_iva * 100) / 100,
        count: items.length,
      };
    });
    try {
      await api.delete(`/clients/${p.client_id}/payments/${p.payment_id}`);
      toast.success("Pagamento eliminato");
      window.__refreshUnpaidBadge?.();
      onChanged?.();
    } catch {
      toast.error("Errore durante l'eliminazione. Riprova.");
      setData(prevData);
    } finally {
      setDeletingId(null);
    }
  };

  const meta = META[method] || META.contanti;
  const Icon = meta.icon;

  // Raggruppa per giorno di pagamento per facilitare il riscontro con il conteggio giornaliero
  const groupedByDay = (() => {
    if (!data?.items) return [];
    const map = new Map();
    for (const it of data.items) {
      const key = it.payment_date || it.job_date || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()).map(([day, items]) => ({
      day,
      items,
      total_net: items.reduce((s, x) => s + (x.imponibile || 0), 0),
      total_gross: items.reduce((s, x) => s + (x.amount || 0), 0),
    }));
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-lg"
        data-testid="payments-breakdown-dialog"
      >
        <DialogHeader>
          <div className={`mb-2 inline-flex w-fit items-center gap-2 rounded-full ${meta.bg} px-3 py-1 text-xs font-semibold uppercase tracking-widest ${meta.color}`}>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </div>
          <DialogTitle className="font-display text-2xl">Dettaglio incassi</DialogTitle>
          <p className="text-sm text-stone-500">
            Tutti i pagamenti {meta.label.toLowerCase()} dei lavori del mese, raggruppati per giorno di incasso.
            Confronta con il tuo conteggio giornaliero in cassa.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento…
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Impossibile caricare i dettagli. Riprova.
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
            Nessun pagamento {meta.label.toLowerCase()} in questo mese.
          </div>
        ) : (
          <>
            <div className={`flex items-center justify-between rounded-2xl ${meta.bg} px-4 py-3`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-700">
                  Totale {meta.label} · {data.count} pagament{data.count === 1 ? "o" : "i"}
                </div>
                {(data.total_iva || 0) > 0 && (
                  <div className="mt-0.5 text-[11px] text-stone-500">
                    Lordo {formatEUR(data.total_gross || data.total)} · IVA {formatEUR(data.total_iva)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`font-display text-xl font-bold ${meta.color}`} data-testid="payments-breakdown-total-net">
                  {formatEUR(data.total_imponibile ?? data.total)}
                </div>
                {(data.total_iva || 0) > 0 && (
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                    Netto IVA
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-4" data-testid="payments-breakdown-list">
              {groupedByDay.map((g) => (
                <div key={g.day} className="rounded-2xl border border-stone-200/60 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-baseline justify-between border-b border-stone-100 pb-2">
                    <div className="text-sm font-semibold capitalize text-stone-800">{fmtDay(g.day)}</div>
                    <div className="text-right">
                      <div className="font-display text-base font-bold tabular-nums">
                        {formatEUR(g.total_net)}
                      </div>
                      {Math.abs(g.total_gross - g.total_net) > 0.01 && (
                        <div className="text-[10px] text-stone-400">
                          lordo {formatEUR(g.total_gross)}
                        </div>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {g.items.map((p, idx) => {
                      const mismatch = p.payment_date && p.job_date && p.payment_date !== p.job_date;
                      const showVat = Math.abs((p.amount || 0) - (p.imponibile || 0)) > 0.01;
                      return (
                        <li
                          key={(p.payment_id || `${p.client_id}-${idx}`)}
                          className="flex items-start justify-between gap-3"
                          data-testid={`payment-item-${idx}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-stone-800">
                              {p.client_name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                              <span className="inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.5 font-medium uppercase tracking-wide">
                                {TYPE_LABEL[p.payment_type] || p.payment_type}
                              </span>
                              {mismatch && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  Lavoro del {fmtDate(p.job_date)}
                                </span>
                              )}
                              {p.legacy && (
                                <span className="inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">
                                  legacy
                                </span>
                              )}
                              {p.invoice_number && (
                                <span>Fatt. {p.invoice_number}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-start gap-2">
                            <div className="text-right">
                              <div className="font-display text-sm font-bold tabular-nums">
                                {formatEUR(p.imponibile ?? p.amount)}
                              </div>
                              {showVat && (
                                <div className="text-[10px] text-stone-400">
                                  lordo {formatEUR(p.amount)}
                                </div>
                              )}
                            </div>
                            {p.payment_id ? (
                              <button
                                type="button"
                                onClick={() => removePayment(p)}
                                disabled={deletingId === p.payment_id}
                                className="rounded-full p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Elimina pagamento"
                                data-testid={`payment-delete-${idx}`}
                              >
                                {deletingId === p.payment_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            ) : (
                              <div
                                className="rounded-full p-1.5 text-stone-300"
                                title="Pagamento legacy: modifica dal cliente"
                              >
                                <Trash2 className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              <b>Come leggere:</b> le cifre principali sono il <b>margine netto IVA</b>. Il "lordo" sotto in piccolo è quanto hai effettivamente preso in cassa. Se vedi il badge arancione <i>"Lavoro del …"</i>, la data del pagamento è diversa da quella del lavoro.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
