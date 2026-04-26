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
import { toast } from "sonner";
import { api } from "../lib/api";
import { Loader2, Trash2, Clock, CalendarCheck } from "lucide-react";
import { VAT_RATES, WITHHOLDING_RATES, computeWithVat, formatEUR } from "../lib/utils";
import PaymentsList from "./PaymentsList";
import MaterialsList from "./MaterialsList";
import { Switch } from "./ui/switch";

const empty = (date) => ({
  date,
  name: "",
  address: "",
  phone: "",
  notes: "",
  status: "preventivo",
  amount: "",
  vat_rate: "",
  withholding_rate: "",
  quote_number: "",
  payments: [],
  materials: [],
  pending: false,
});

/** Migra i campi legacy (payment_method, invoice_number) in un singolo payment, una sola volta. */
const migrateLegacy = (data) => {
  if (!data) return data;
  const hasPayments = Array.isArray(data.payments) && data.payments.length > 0;
  if (hasPayments) return data;
  const legacyMethod = data.payment_method;
  const legacyInvoice = data.invoice_number;
  if (
    data.status === "lavoro_eseguito" &&
    (legacyMethod || legacyInvoice) &&
    parseFloat(data.amount) > 0
  ) {
    return {
      ...data,
      payments: [
        {
          type: "saldo",
          amount: data.amount,
          method: legacyMethod || "",
          invoice_number: legacyInvoice || "",
          date: data.date || "",
          notes: "",
        },
      ],
    };
  }
  return data;
};

export default function ClientFormDialog({ open, onOpenChange, date, initial, onSaved, onDeleted, defaultPending = false }) {
  const [form, setForm] = useState(empty(date));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (open) {
      const base = empty(date);
      if (defaultPending && !initial) base.pending = true;
      setForm(initial ? { ...base, ...initial, amount: initial.amount ?? "" } : base);
    }
  }, [open, initial, date, defaultPending]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Inserisci il nome del cliente");
      return;
    }
    setSaving(true);
    try {
      const payments = (form.payments || [])
        .map((p) => ({
          ...p,
          amount: parseFloat(p.amount) || 0,
          date: p.date || form.date || date,
        }))
        .filter((p) => p.amount > 0 || p.invoice_number);
      const materials = (form.materials || [])
        .map((m) => ({
          ...m,
          amount: parseFloat(m.amount) || 0,
          date: m.date || form.date || date,
          source: m.source || "conto_aziendale",
        }))
        .filter((m) => m.amount > 0 || (m.description && m.description.trim()));
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        vat_rate: form.vat_rate === "" || form.vat_rate === null ? null : parseFloat(form.vat_rate),
        withholding_rate: form.withholding_rate === "" || form.withholding_rate === null ? null : parseFloat(form.withholding_rate),
        date: form.date || date,
        payments,
        materials,
        pending: !!form.pending,
        // Reset legacy fields once we use the new payments model
        payment_method: "",
        invoice_number: "",
      };
      const res = editing
        ? await api.put(`/clients/${initial.id}`, payload)
        : await api.post(`/clients`, payload);
      toast.success(editing ? "Cliente aggiornato" : "Cliente aggiunto");
      onSaved?.(res.data);
      window.__refreshUnpaidBadge?.();
      window.__refreshPendingBadge?.();
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
      window.__refreshUnpaidBadge?.();
      window.__refreshPendingBadge?.();
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
          {/* Toggle "Lavoro in attesa" — backlog Prossimi lavori */}
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
              form.pending
                ? "border-[#B8683D]/30 bg-[#FBF1DE]"
                : "border-stone-200/70 bg-stone-50"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {form.pending ? (
                <Clock className="mt-0.5 h-4 w-4 text-[#B8683D]" />
              ) : (
                <CalendarCheck className="mt-0.5 h-4 w-4 text-[#2E5A47]" />
              )}
              <div>
                <div className="text-sm font-semibold text-stone-800">
                  {form.pending ? "Lavoro in attesa" : "Lavoro in agenda"}
                </div>
                <div className="text-xs text-stone-500">
                  {form.pending
                    ? "Compare in 'Prossimi lavori', non nell'agenda del giorno."
                    : "Compare nell'agenda del giorno selezionato."}
                </div>
              </div>
            </div>
            <Switch
              checked={!!form.pending}
              onCheckedChange={(v) => update("pending", v)}
              data-testid="client-pending-switch"
              aria-label="Lavoro in attesa"
            />
          </div>
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
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                Imponibile (€)
              </Label>
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
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">IVA</Label>
              <Select
                value={form.vat_rate === null || form.vat_rate === undefined || form.vat_rate === "" ? "none" : String(form.vat_rate)}
                onValueChange={(v) => update("vat_rate", v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-2 h-12 rounded-xl" data-testid="client-vat-select">
                  <SelectValue placeholder="Senza IVA" />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r.label} value={r.value || "none"}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
              Ritenuta d'acconto
            </Label>
            <Select
              value={
                form.withholding_rate === null || form.withholding_rate === undefined || form.withholding_rate === ""
                  ? "none"
                  : String(form.withholding_rate)
              }
              onValueChange={(v) => update("withholding_rate", v === "none" ? "" : v)}
            >
              <SelectTrigger className="mt-2 h-12 rounded-xl" data-testid="client-withholding-select">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                {WITHHOLDING_RATES.map((r) => (
                  <SelectItem key={r.label} value={r.value || "none"}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const { net, vat, gross, withholding, toCollect, hasVat, hasWithholding } = computeWithVat(
              form.amount,
              form.vat_rate,
              form.withholding_rate,
            );
            if ((!hasVat && !hasWithholding) || net <= 0) return null;
            return (
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Imponibile</span>
                  <span className="tabular-nums">{formatEUR(net)}</span>
                </div>
                {hasVat && (
                  <div className="flex items-center justify-between text-stone-600">
                    <span>+ IVA {form.vat_rate}%</span>
                    <span className="tabular-nums">{formatEUR(vat)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-semibold">
                  <span>= Totale fattura</span>
                  <span className="tabular-nums">{formatEUR(gross)}</span>
                </div>
                {hasWithholding && (
                  <>
                    <div className="flex items-center justify-between text-stone-600">
                      <span>− Ritenuta {form.withholding_rate}%</span>
                      <span className="tabular-nums">−{formatEUR(withholding)}</span>
                    </div>
                    <div className="my-1 h-px bg-stone-200" />
                    <div className="flex items-center justify-between font-display text-base font-bold text-[#2E5A47]">
                      <span>Da incassare</span>
                      <span className="tabular-nums">{formatEUR(toCollect)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">N° Preventivo</Label>
            <Input
              value={form.quote_number}
              onChange={(e) => update("quote_number", e.target.value)}
              placeholder="Es. 2026/045"
              className="mt-2 h-12 rounded-xl"
              data-testid="client-quote-number-input"
            />
          </div>

          <PaymentsList
            payments={form.payments || []}
            totalAmount={computeWithVat(form.amount, form.vat_rate, form.withholding_rate).toCollect}
            jobDate={form.date || date}
            onChange={(p) => update("payments", p)}
          />

          <MaterialsList
            materials={form.materials || []}
            jobAmount={form.amount}
            jobDate={form.date || date}
            onChange={(m) => update("materials", m)}
          />

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
