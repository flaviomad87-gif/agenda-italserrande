import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatEUR, isoMonth } from "../lib/utils";
import ExpenseFormDialog from "../components/ExpenseFormDialog";
import RecurringExpensesDialog from "../components/RecurringExpensesDialog";
import { Plus, Wallet, Building, ChevronLeft, ChevronRight, Repeat, Sparkles, Loader2 } from "lucide-react";
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
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [openRecurring, setOpenRecurring] = useState(false);
  const [editing, setEditing] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = async (m) => {
    setLoading(true);
    try {
      const [exp, rec] = await Promise.all([
        api.get(`/expenses`, { params: { month: m } }),
        api.get(`/recurring-expenses`),
      ]);
      setItems(exp.data);
      setRecurring(rec.data);
    } catch {
      toast.error("Impossibile caricare le spese");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
  }, [month]);

  // Has every recurring template been applied for this month?
  const recurringMissing = useMemo(() => {
    if (recurring.length === 0) return [];
    const presentIds = new Set(items.map((i) => i.recurring_id).filter(Boolean));
    return recurring.filter((r) => !presentIds.has(r.id));
  }, [recurring, items]);

  const applyRecurring = async () => {
    setApplying(true);
    try {
      const res = await api.post(`/recurring-expenses/apply`, null, { params: { month } });
      const { created } = res.data;
      if (created > 0) toast.success(`${created} ${created === 1 ? "spesa applicata" : "spese applicate"} al mese`);
      else toast.info("Nessuna spesa nuova da applicare");
      await load(month);
    } catch {
      toast.error("Impossibile applicare le spese ricorrenti");
    } finally {
      setApplying(false);
    }
  };

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

      {/* Recurring banner */}
      {recurringMissing.length > 0 ? (
        <div
          className="flex flex-col gap-3 rounded-3xl border border-[#4A5D23]/15 bg-[#EAE7DE]/60 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          data-testid="apply-recurring-banner"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-[#4A5D23]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-base font-bold leading-tight">
                Hai {recurringMissing.length} {recurringMissing.length === 1 ? "spesa fissa" : "spese fisse"} da applicare a questo mese
              </div>
              <div className="text-sm text-stone-600">
                Totale: {formatEUR(recurringMissing.reduce((s, r) => s + (Number(r.amount) || 0), 0))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOpenRecurring(true)}
              data-testid="open-recurring-dialog"
              className="h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Modifica
            </button>
            <button
              onClick={applyRecurring}
              disabled={applying}
              data-testid="apply-recurring-button"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#1C1C1A] px-4 text-sm font-semibold text-white hover:bg-[#2A2A28] disabled:opacity-60"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
              Applica
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-stone-200/60 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <Repeat className="h-4 w-4 text-[#4A5D23]" />
            <span>
              {recurring.length === 0
                ? "Imposta le tue spese fisse ricorrenti per non riscriverle ogni mese"
                : `${recurring.length} ${recurring.length === 1 ? "spesa fissa attiva" : "spese fisse attive"}`}
            </span>
          </div>
          <button
            onClick={() => setOpenRecurring(true)}
            data-testid="manage-recurring-button"
            className="text-sm font-semibold text-[#4A5D23] hover:underline"
          >
            Gestisci
          </button>
        </div>
      )}

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
      <RecurringExpensesDialog
        open={openRecurring}
        onOpenChange={(o) => {
          setOpenRecurring(o);
          if (!o) load(month);
        }}
        month={month}
        onApplied={() => load(month)}
      />
    </div>
  );
}
