import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api } from "../lib/api";
import { formatEUR } from "../lib/utils";
import { format, parseISO } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { HardHat, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function WorkerAdvancesDialog({ open, onOpenChange, worker, month, onDeleted }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !worker || !month) return;
    setLoading(true);
    api
      .get(`/advances`, { params: { month, worker } })
      .then((res) => setItems(res.data))
      .catch(() => toast.error("Impossibile caricare gli acconti"))
      .finally(() => setLoading(false));
  }, [open, worker, month]);

  const remove = async (id) => {
    if (!window.confirm("Eliminare questo acconto?")) return;
    try {
      await api.delete(`/advances/${id}`);
      setItems((prev) => prev.filter((a) => a.id !== id));
      onDeleted?.(id);
      toast.success("Acconto eliminato");
    } catch {
      toast.error("Impossibile eliminare");
    }
  };

  const total = items.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const monthLabel = month ? format(parseISO(`${month}-01`), "MMMM yyyy", { locale: itLocale }) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-md"
        data-testid="worker-advances-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F2F0]">
              <HardHat className="h-5 w-5 text-stone-700" />
            </span>
            <div className="flex min-w-0 flex-col items-start">
              <span className="truncate">{worker}</span>
              <span className="text-xs font-normal capitalize text-stone-500">{monthLabel}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-stone-50 p-5 text-center text-sm text-stone-500">
            Nessun acconto in questo mese.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/60">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
                data-testid={`worker-advance-row-${a.id}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold capitalize">
                    {format(parseISO(a.date), "EEEE d MMMM", { locale: itLocale })}
                  </div>
                  {a.notes && (
                    <div className="mt-0.5 truncate text-xs text-stone-500">{a.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold tabular-nums">
                    {formatEUR(a.amount)}
                  </span>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Elimina"
                    data-testid={`worker-advance-delete-${a.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#EAE7DE] px-4 py-3">
          <span className="text-sm font-semibold text-stone-700">Totale del mese</span>
          <span className="font-display text-lg font-bold">{formatEUR(total)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
