import { useMemo } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { formatEUR } from "../lib/utils";
import { Plus, Trash2, Package, Wallet, Landmark } from "lucide-react";

const SOURCES = [
  { value: "conto_aziendale", label: "Conto aziendale", icon: Landmark },
  { value: "contanti", label: "Contanti", icon: Wallet },
];

const newMaterial = (date) => ({
  description: "",
  amount: "",
  supplier: "",
  source: "conto_aziendale",
  date: date || "",
  notes: "",
});

export default function MaterialsList({ materials, jobAmount, onChange, jobDate }) {
  const total = useMemo(
    () => materials.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0),
    [materials],
  );
  const margin = (parseFloat(jobAmount) || 0) - total;
  const marginPct = jobAmount > 0 ? (margin / parseFloat(jobAmount)) * 100 : 0;

  const updateAt = (idx, key, value) => {
    const next = [...materials];
    next[idx] = { ...next[idx], [key]: value };
    onChange(next);
  };

  const addMaterial = () => onChange([...materials, newMaterial(jobDate)]);
  const removeAt = (idx) => onChange(materials.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500">
          <Package className="h-3.5 w-3.5" /> Spese fornitura / materiali
        </Label>
        {materials.length > 0 && (
          <div className="text-xs text-right">
            <div>
              <span className="text-stone-500">Totale </span>
              <span className="font-display font-bold text-[#B8683D]" data-testid="materials-total">
                {formatEUR(total)}
              </span>
            </div>
            {parseFloat(jobAmount) > 0 && (
              <div>
                <span className="text-stone-500">Margine </span>
                <span
                  className={`font-display font-bold ${margin >= 0 ? "text-[#2E5A47]" : "text-red-600"}`}
                  data-testid="materials-margin"
                >
                  {formatEUR(margin)}
                </span>
                <span className="ml-1 text-stone-400">({marginPct.toFixed(0)}%)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {materials.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm text-stone-500">
          Nessuna spesa di fornitura. Aggiungi i materiali acquistati per questo lavoro.
        </div>
      )}

      {materials.map((m, idx) => (
        <div
          key={idx}
          data-testid={`material-row-${idx}`}
          className="space-y-2 rounded-2xl border border-stone-200/70 bg-white p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              value={m.description || ""}
              onChange={(e) => updateAt(idx, "description", e.target.value)}
              placeholder="Descrizione (es. Tubolare 40x40)"
              className="h-11 flex-1 rounded-xl"
              data-testid={`material-description-${idx}`}
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              data-testid={`material-remove-${idx}`}
              aria-label="Rimuovi materiale"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={m.amount}
              onChange={(e) => updateAt(idx, "amount", e.target.value)}
              placeholder="Importo €"
              className="h-11 rounded-xl"
              data-testid={`material-amount-${idx}`}
            />
            <Input
              value={m.supplier || ""}
              onChange={(e) => updateAt(idx, "supplier", e.target.value)}
              placeholder="Fornitore (es. Ferramenta Rossi)"
              className="h-11 rounded-xl"
              data-testid={`material-supplier-${idx}`}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={m.source || "conto_aziendale"}
              onValueChange={(v) => updateAt(idx, "source", v)}
            >
              <SelectTrigger className="h-11 rounded-xl" data-testid={`material-source-${idx}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="inline-flex items-center gap-2">
                      <s.icon className="h-3.5 w-3.5" /> {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={m.date || ""}
              onChange={(e) => updateAt(idx, "date", e.target.value)}
              className="h-11 rounded-xl"
              data-testid={`material-date-${idx}`}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addMaterial}
        data-testid="material-add-button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#B8683D] transition hover:bg-stone-50"
      >
        <Plus className="h-4 w-4" />
        {materials.length === 0 ? "Aggiungi materiale" : "Aggiungi altro materiale"}
      </button>
    </div>
  );
}
