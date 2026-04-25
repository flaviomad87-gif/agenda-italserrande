import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, isoMonth } from "../lib/utils";
import ExpenseFormDialog from "../components/ExpenseFormDialog";
import { Plus, Wallet, Building, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";

const SourceBadge = ({ source }) => {
  if (source === "conto_aziendale")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6EEF5] px-2.5 py-1 text-xs font-semibold text-[#2B5A82]">
        <Building className="h-3.5 w-3.5" /> Conto aziendale
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EF] px-2.5 py-1 text-xs font-semibold text-[#2E5A47]">
      <Wallet className="h-3.5 w-3.5" /> Contanti
    </span>
  );
};

export default function Spese() {
  const [month, setMonth] = useState(isoMonth());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async (m) => {
    setLoading(true);
    try {
      const res = await api.get(`/expenses`, { params: { month: m } });
      setItems(res.data);
    } catch {
      toast.error("Impossibile caricare le spese");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
  }, [month]);

  const totals = useMemo(() => {
    const c = items.filter((i) => i.source === "contanti").reduce((s, i) => s + Number(i.amount || 0), 0);
    const a = items.filter((i) => i.source === "conto_aziendale").reduce((s, i) => s + Number(i.amount || 0), 0);
    return { contanti: c, conto: a, total: c + a };
  }, [items]);

  const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy", { locale: it });

  const onSaved = (item) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };
  const onDeleted = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  const shiftMonth = (delta) => {
    const d = parseISO(`${month}-01`);
    const next = delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    setMonth(format(next, "yyyy-MM"));
  };

  return (
    <div className="space-y-6 fade-in">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Spese fisse</div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl capitalize">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese precedente"
            data-testid="spese-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm hover:bg-stone-50"
            aria-label="Mese successivo"
            data-testid="spese-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Totale del mese</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">{formatEUR(totals.total)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">Contanti</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">{formatEUR(totals.contanti)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#2B5A82]">Conto aziendale</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">{formatEUR(totals.conto)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Movimenti</h2>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          data-testid="add-expense-button"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#4A5D23] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#3C4B1C]"
        >
          <Plus className="h-4 w-4" /> Aggiungi spesa
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-display text-lg font-semibold">Nessuna spesa registrata</p>
          <p className="mt-1 text-sm text-stone-500">
            Aggiungi le tue spese fisse mensili (affitto, utenze, carburante, materiali...).
          </p>
        </div>
      ) : (
        <ul className="space-y-2 stagger">
          {items.map((exp) => (
            <li
              key={exp.id}
              role="button"
              onClick={() => {
                setEditing(exp);
                setOpen(true);
              }}
              data-testid={`expense-row-${exp.id}`}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-stone-200/60 bg-white px-4 py-3 shadow-sm transition hover:border-stone-300 hover:shadow-md"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">{exp.category}</div>
                <div className="mt-0.5 text-xs text-stone-500">
                  {format(parseISO(exp.date), "d MMM yyyy", { locale: it })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <SourceBadge source={exp.source} />
                <span className="font-display text-base font-bold">{formatEUR(exp.amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExpenseFormDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}
