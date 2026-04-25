import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Loader2 } from "lucide-react";

const empty = (date) => ({ date, worker_name: "", amount: "", notes: "" });

export default function AdvanceFormDialog({ open, onOpenChange, date, onSaved }) {
  const [form, setForm] = useState(empty(date));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(empty(date));
  }, [open, date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.worker_name.trim()) {
      toast.error("Inserisci il nome dell'operaio");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/advances`, {
        ...form,
        amount: parseFloat(form.amount) || 0,
      });
      toast.success("Acconto registrato");
      onSaved?.(res.data);
      onOpenChange(false);
    } catch {
      toast.error("Errore durante il salvataggio");
    } finally {
      setSaving(false);
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
              disabled={saving}
              data-testid="advance-save-button"
              className="h-12 flex-1 rounded-xl bg-[#4A5D23] text-white hover:bg-[#3C4B1C]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
