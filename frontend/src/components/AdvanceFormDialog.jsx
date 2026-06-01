import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { api, newUUID } from "../lib/api";

const empty = (date) => ({ date, worker_name: "", amount: "", notes: "" });

export default function AdvanceFormDialog({ open, onOpenChange, date, onSaved, onError }) {
  const [form, setForm] = useState(empty(date));

  useEffect(() => {
    if (open) setForm(empty(date));
  }, [open, date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.worker_name.trim()) {
      toast.error("Inserisci il nome dell'operaio");
      return;
    }
    const id = newUUID();
    const payload = {
      ...form,
      id,
      amount: parseFloat(form.amount) || 0,
    };
    // Optimistic: aggiungi subito e chiudi
    const optimistic = { ...payload, created_at: new Date().toISOString() };
    onSaved?.(optimistic);
    onOpenChange(false);
    try {
      const res = await api.post(`/advances`, payload);
      if (res?.data && !res._offline) {
        // Riconcilia con la versione server (mantiene stesso id)
        onSaved?.(res.data, true);
      }
    } catch {
      toast.error("Errore durante il salvataggio. Riprova.");
      onError?.(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1.5rem)] rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-md"
        data-testid="advance-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Nuovo acconto operaio</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Operaio</Label>
            <Input
              value={form.worker_name}
              onChange={(e) => setForm({ ...form, worker_name: e.target.value })}
              placeholder="Es. Luca"
              className="mt-2 h-12 rounded-xl"
              data-testid="advance-worker-input"
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
              data-testid="advance-amount-input"
              required
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Note (opzionale)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-2 rounded-xl"
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-12 flex-1 rounded-xl">
              Annulla
            </Button>
            <Button
              type="submit"
              data-testid="advance-save-button"
              className="h-12 flex-1 rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C]"
            >
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
