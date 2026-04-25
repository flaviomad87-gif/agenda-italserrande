import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Loader2, Trash2 } from "lucide-react";
import { isoDate } from "../lib/utils";

const empty = () => ({
  date: isoDate(),
  category: "",
  amount: "",
  source: "contanti",
  notes: "",
});

export default function ExpenseFormDialog({ open, onOpenChange, initial, onSaved, onDeleted }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ? { ...empty(), ...initial, amount: initial.amount ?? "" } : empty());
  }, [open, initial]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category.trim()) {
      toast.error("Inserisci la categoria");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0 };
      const res = editing
        ? await api.put(`/expenses/${initial.id}`, payload)
        : await api.post(`/expenses`, payload);
      toast.success(editing ? "Spesa aggiornata" : "Spesa aggiunta");
      onSaved?.(res.data);
      onOpenChange(false);
    } catch {
      toast.error("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm("Eliminare questa spesa?")) return;
    try {
      await api.delete(`/expenses/${initial.id}`);
      toast.success("Spesa eliminata");
      onDeleted?.(initial.id);
      onOpenChange(false);
    } catch {
      toast.error("Impossibile eliminare");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-md"
        data-testid="expense-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Modifica spesa" : "Nuova spesa fissa"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Data</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="mt-2 h-12 rounded-xl"
              data-testid="expense-date-input"
              required
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Categoria</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Es. Carburante, Affitto, Materiali"
              className="mt-2 h-12 rounded-xl"
              data-testid="expense-category-input"
              required
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Importo (€)</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0,00"
              className="mt-2 h-12 rounded-xl"
              data-testid="expense-amount-input"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Fonte pagamento</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, source: "contanti" })}
                data-testid="expense-source-contanti"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.source === "contanti"
                    ? "border-[#2E5A47] bg-[#EAF3EF] text-[#234737]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Contanti
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, source: "conto_aziendale" })}
                data-testid="expense-source-conto"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.source === "conto_aziendale"
                    ? "border-[#2B5A82] bg-[#E6EEF5] text-[#1F4566]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Conto aziendale
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Note</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-2 rounded-xl"
            />
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                data-testid="expense-delete-button"
                className="h-12 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Elimina
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-12 rounded-xl">
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={saving}
                data-testid="expense-save-button"
                className="h-12 rounded-xl bg-[#4A5D23] px-6 text-white hover:bg-[#3C4B1C]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
