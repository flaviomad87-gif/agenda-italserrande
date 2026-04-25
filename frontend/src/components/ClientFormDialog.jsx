import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { PAYMENT_METHODS } from "../lib/utils";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Loader2, Trash2 } from "lucide-react";

const empty = (date) => ({
  date,
  name: "",
  address: "",
  phone: "",
  notes: "",
  status: "preventivo",
  payment_method: "",
  amount: "",
});

export default function ClientFormDialog({ open, onOpenChange, date, initial, onSaved, onDeleted }) {
  const [form, setForm] = useState(empty(date));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...empty(date), ...initial, amount: initial.amount ?? "" } : empty(date));
    }
  }, [open, initial, date]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Inserisci il nome del cliente");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        date: form.date || date,
      };
      const res = editing
        ? await api.put(`/clients/${initial.id}`, payload)
        : await api.post(`/clients`, payload);
      toast.success(editing ? "Cliente aggiornato" : "Cliente aggiunto");
      onSaved?.(res.data);
      onOpenChange(false);
    } catch (err) {
      toast.error("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm("Eliminare questo cliente?")) return;
    try {
      await api.delete(`/clients/${initial.id}`);
      toast.success("Cliente eliminato");
      onDeleted?.(initial.id);
      onOpenChange(false);
    } catch {
      toast.error("Impossibile eliminare");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-lg"
        data-testid="client-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Modifica cliente" : "Nuovo cliente"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Nome / Ragione sociale</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Es. Mario Rossi"
              className="mt-2 h-12 rounded-xl"
              data-testid="client-name-input"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Indirizzo</Label>
              <Input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="Via, città"
                className="mt-2 h-12 rounded-xl"
                data-testid="client-address-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Telefono</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+39 ..."
                className="mt-2 h-12 rounded-xl"
                data-testid="client-phone-input"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Note</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Dettagli del lavoro, materiali, riferimenti..."
              rows={3}
              className="mt-2 rounded-xl"
              data-testid="client-notes-input"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Stato</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update("status", "preventivo")}
                data-testid="status-preventivo-toggle"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.status === "preventivo"
                    ? "border-[#B8683D] bg-[#F8EBE4] text-[#8A4A28]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Preventivo
              </button>
              <button
                type="button"
                onClick={() => update("status", "lavoro_eseguito")}
                data-testid="status-eseguito-toggle"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.status === "lavoro_eseguito"
                    ? "border-[#2E5A47] bg-[#EAF3EF] text-[#234737]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Lavoro eseguito
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="0,00"
                className="mt-2 h-12 rounded-xl"
                data-testid="client-amount-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Pagamento</Label>
              <Select
                value={form.payment_method || "none"}
                onValueChange={(v) => update("payment_method", v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-2 h-12 rounded-xl" data-testid="client-payment-select">
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nessuno —</SelectItem>
                  {PAYMENT_METHODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                data-testid="client-delete-button"
                className="h-12 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Elimina
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-12 rounded-xl"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={saving}
                data-testid="client-save-button"
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
