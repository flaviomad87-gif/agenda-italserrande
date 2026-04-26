import { useMemo } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { PAYMENT_METHODS, formatEUR } from "../lib/utils";
import { Plus, Trash2, Wallet, CreditCard, Landmark } from "lucide-react";

const PaymentTypeButton = ({ active, onClick, label, color }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
      active
        ? `border-${color}-300 bg-${color}-50`
        : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
    }`}
    style={
      active
        ? color === "amber"
          ? { borderColor: "#D89A2C", backgroundColor: "#FBF1DE", color: "#7A4F0A" }
          : color === "green"
          ? { borderColor: "#2E5A47", backgroundColor: "#EAF3EF", color: "#234737" }
          : { borderColor: "#9CA3AF", backgroundColor: "#F3F4F6", color: "#374151" }
        : {}
    }
  >
    {label}
  </button>
);

const newPayment = (date) => ({
  type: "acconto",
  amount: "",
  method: "",
  invoice_number: "",
  date: date || "",
  notes: "",
});

export default function PaymentsList({ payments, totalAmount, onChange, jobDate }) {
  const total = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments],
  );
  const remaining = (parseFloat(totalAmount) || 0) - total;

  const updateAt = (idx, key, value) => {
    const next = [...payments];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };

  const addPayment = () => {
    const last = payments[payments.length - 1];
    onChange([
      ...payments,
      {
        ...newPayment(jobDate),
        // Se è il secondo pagamento, suggerisci "saldo"
        type: payments.length === 0 ? "acconto" : payments.length === 1 ? "saldo" : "altro",
        amount: remaining > 0 && payments.length >= 1 ? String(remaining.toFixed(2)) : "",
      },
    ]);
  };

  const removeAt = (idx) => {
    const next = payments.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
          Pagamenti / Fatture
        </Label>
        {payments.length > 0 && (
          <div className="text-xs">
            <span className="text-stone-500">Incassato </span>
            <span className="font-display font-bold text-[#2E5A47]">{formatEUR(total)}</span>
            {totalAmount > 0 && (
              <>
                <span className="text-stone-500"> · Saldo </span>
                <span
                  className={`font-display font-bold ${
                    remaining > 0.001 ? "text-[#B8683D]" : "text-[#2E5A47]"
                  }`}
                >
                  {formatEUR(remaining)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {payments.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm text-stone-500">
          Nessun pagamento registrato. Aggiungilo quando il cliente paga.
        </div>
      )}

      {payments.map((p, idx) => (
        <div
          key={idx}
          data-testid={`payment-row-${idx}`}
          className="space-y-2 rounded-2xl border border-stone-200/70 bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 gap-1">
              <PaymentTypeButton
                active={p.type === "acconto"}
                onClick={() => updateAt(idx, "type", "acconto")}
                label="Acconto"
                color="amber"
              />
              <PaymentTypeButton
                active={p.type === "saldo"}
                onClick={() => updateAt(idx, "type", "saldo")}
                label="Saldo"
                color="green"
              />
              <PaymentTypeButton
                active={p.type === "altro"}
                onClick={() => updateAt(idx, "type", "altro")}
                label="Altro"
                color="gray"
              />
            </div>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              data-testid={`payment-remove-${idx}`}
              aria-label="Rimuovi pagamento"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={p.amount}
              onChange={(e) => updateAt(idx, "amount", e.target.value)}
              placeholder="Importo €"
              className="h-11 rounded-xl"
              data-testid={`payment-amount-${idx}`}
            />
            <Select
              value={p.method || "none"}
              onValueChange={(v) => updateAt(idx, "method", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-11 rounded-xl" data-testid={`payment-method-${idx}`}>
                <SelectValue placeholder="Metodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— scegli —</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={p.invoice_number || ""}
              onChange={(e) => updateAt(idx, "invoice_number", e.target.value)}
              placeholder="N° Fattura"
              className="h-11 rounded-xl"
              data-testid={`payment-invoice-${idx}`}
            />
            <Input
              type="date"
              value={p.date || ""}
              onChange={(e) => updateAt(idx, "date", e.target.value)}
              className="h-11 rounded-xl"
              data-testid={`payment-date-${idx}`}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addPayment}
        data-testid="payment-add-button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#4A5D23] transition hover:bg-stone-50"
      >
        <Plus className="h-4 w-4" />
        {payments.length === 0 ? "Aggiungi pagamento" : "Aggiungi altro pagamento"}
      </button>
    </div>
  );
}

export const PaymentMethodIcon = ({ method, className = "h-3 w-3" }) => {
  if (method === "contanti") return <Wallet className={className} />;
  if (method === "pos") return <CreditCard className={className} />;
  if (method === "bonifico") return <Landmark className={className} />;
  return null;
};
