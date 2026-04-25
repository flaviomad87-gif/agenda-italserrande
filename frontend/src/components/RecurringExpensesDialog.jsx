import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { api } from "../lib/api";
import { formatEUR } from "../lib/utils";
import { Loader2, Plus, Trash2, RefreshCw, Wallet, Building, Repeat } from "lucide-react";
import { toast } from "sonner";

const empty = () => ({ category: "", amount: "", source: "contanti", notes: "" });

export default function RecurringExpensesDialog({ open, onOpenChange, month, onApplied }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/recurring-expenses`);
      setItems(res.data);
    } catch {
      toast.error("Impossibile caricare le spese ricorrenti");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category.trim()) {
      toast.error("Inserisci la categoria");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/recurring-expenses`, {
        ...form,
        amount: parseFloat(form.amount) || 0,
      });
      setItems((prev) => [...prev, res.data]);
      setForm(empty());
      toast.success("Spesa ricorrente aggiunta");
    } catch {
      toast.error("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Eliminare questa spesa ricorrente? (gli importi già inseriti nei mesi precedenti restano)")) return;
    try {
      await api.delete(`/recurring-expenses/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Eliminata");
    } catch {
      toast.error("Impossibile eliminare");
    }
  };

  const applyToMonth = async () => {
    setApplying(true);
    try {
      const res = await api.post(`/recurring-expenses/apply`, null, { params: { month } });
      const { created, skipped } = res.data;
      if (created === 0 && skipped > 0) {
        toast.info("Le spese ricorrenti sono già presenti in questo mese");
      } else {
        toast.success(`${created} ${created === 1 ? "spesa aggiunta" : "spese aggiunte"} al mese${skipped ? ` (${skipped} già presenti)` : ""}`);
      }
      onApplied?.();
    } catch {
      toast.error("Impossibile applicare al mese");
    } finally {
      setApplying(false);
    }
  };

  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-lg"
        data-testid="recurring-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EAE7DE] text-[#4A5D23]">
              <Repeat className="h-5 w-5" />
            </span>
            Spese fisse ricorrenti
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-stone-500">
          Le spese che hai ogni mese (affitto, utenze, abbonamenti…). Le scrivi una volta sola, poi le applichi al mese corrente con un tocco. Puoi sempre aggiungerne di occasionali dalla pagina Spese.
        </p>

        {/* Add form */}
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border border-stone-200/60 bg-stone-50/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Aggiungi modello</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Categoria (es. Affitto)"
              className="h-11 rounded-xl bg-white"
              data-testid="recurring-category-input"
              required
            />
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Importo €"
              className="h-11 rounded-xl bg-white"
              data-testid="recurring-amount-input"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, source: "contanti" })}
              data-testid="recurring-source-contanti"
              className={`h-11 rounded-xl border text-sm font-semibold transition ${
                form.source === "contanti"
                  ? "border-[#2E5A47] bg-[#EAF3EF] text-[#234737]"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              <Wallet className="mr-1 inline h-4 w-4" /> Contanti
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, source: "conto_aziendale" })}
              data-testid="recurring-source-conto"
              className={`h-11 rounded-xl border text-sm font-semibold transition ${
                form.source === "conto_aziendale"
                  ? "border-[#2B5A82] bg-[#E6EEF5] text-[#1F4566]"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              <Building className="mr-1 inline h-4 w-4" /> Conto aziendale
            </button>
          </div>
          <Button
            type="submit"
            disabled={saving}
            data-testid="recurring-add-button"
            className="h-11 w-full rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Plus className="mr-1 h-4 w-4" /> Aggiungi</>)}
          </Button>
        </form>

        {/* List */}
        <div className="mt-5">
          <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            I tuoi modelli ({items.length})
          </Label>
          {loading ? (
            <div className="mt-2 rounded-2xl border border-stone-200/60 bg-white p-4 text-stone-500">Caricamento…</div>
          ) : items.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-center text-sm text-stone-500">
              Nessuna spesa ricorrente impostata.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 rounded-2xl border border-stone-200/60 bg-white">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  data-testid={`recurring-row-${i.id}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{i.category}</div>
                    <div className="text-xs text-stone-500">
                      {i.source === "conto_aziendale" ? "Conto aziendale" : "Contanti"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold tabular-nums">{formatEUR(i.amount)}</span>
                    <button
                      onClick={() => remove(i.id)}
                      className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Elimina"
                      data-testid={`recurring-delete-${i.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-[#F3F2F0] px-4 py-3">
                <span className="text-sm font-semibold text-stone-700">Totale ricorrente / mese</span>
                <span className="font-display text-base font-bold">{formatEUR(total)}</span>
              </li>
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <Button
            onClick={applyToMonth}
            disabled={applying}
            data-testid="recurring-apply-button"
            className="mt-5 h-12 w-full rounded-xl bg-[#1C1C1A] text-white hover:bg-[#2A2A28]"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><RefreshCw className="mr-2 h-4 w-4" /> Applica al mese in corso</>)}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
