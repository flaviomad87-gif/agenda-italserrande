import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Minus,
  Search,
  Trash2,
  Pencil,
  Save,
  X,
  Loader2,
  PackageOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

/**
 * Pagina Magazzino: lista materiale presente in officina.
 * - Lista piatta ordinata per nome
 * - Ricerca testuale
 * - Pulsanti rapidi +1 / −1 per aggiornare la quantità in un tap
 * - Edit nome / note inline
 * Route: /magazzino
 */
export default function Magazzino() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.get("/materials");
      setItems(res.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.name || "").toLowerCase().includes(q) ||
        (it.notes || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const addItem = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Nome richiesto");
      return;
    }
    setSaving(true);
    const qty = Number(newQty) || 0;
    const notes = newNotes.trim();
    const tempId = `tmp-${Date.now()}`;
    // Optimistic
    setItems((prev) => [
      ...prev,
      { id: tempId, name, quantity: qty, notes, _optimistic: true },
    ]);
    try {
      const res = await api.post("/materials", { name, quantity: qty, notes });
      setItems((prev) =>
        prev.map((p) => (p.id === tempId ? res.data : p)).sort(byName),
      );
      setNewName("");
      setNewQty(1);
      setNewNotes("");
      setAdding(false);
      toast.success("Aggiunto");
    } catch {
      setItems((prev) => prev.filter((p) => p.id !== tempId));
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const adjust = async (item, delta) => {
    const prevQty = item.quantity || 0;
    const nextQty = Math.max(0, prevQty + delta);
    if (nextQty === prevQty) return;
    // Optimistic
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, quantity: nextQty } : p)),
    );
    try {
      await api.post(`/materials/${item.id}/adjust`, null, {
        params: { delta },
      });
    } catch {
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, quantity: prevQty } : p)),
      );
      toast.error("Errore");
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Rimuovere "${item.name}"?`)) return;
    const snapshot = items;
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    try {
      await api.delete(`/materials/${item.id}`);
      toast.success("Eliminato");
    } catch {
      setItems(snapshot);
      toast.error("Errore");
    }
  };

  const updateItem = async (item, patch) => {
    const snapshot = items;
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, ...patch } : p)).sort(byName),
    );
    try {
      await api.put(`/materials/${item.id}`, patch);
    } catch {
      setItems(snapshot);
      toast.error("Errore");
    }
  };

  return (
    <div className="space-y-4 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Officina · magazzino
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Lista Materiale
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Tieni traccia di cosa hai in officina. Tocca <b>+</b> o <b>−</b> per
          aggiornare la quantità.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca materiale…"
            className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#4A5D23] focus:outline-none"
            data-testid="materials-search"
          />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#3C4C1C]"
          data-testid="materials-add"
        >
          <Plus className="h-4 w-4" /> Aggiungi
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-14 text-center text-sm text-stone-500" data-testid="materials-empty">
          <PackageOpen className="mx-auto mb-2 h-7 w-7 text-stone-400" />
          {items.length === 0
            ? "Il magazzino è vuoto. Aggiungi il primo materiale."
            : "Nessun risultato per la ricerca."}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="materials-list">
          {filtered.map((it) => (
            <MaterialRow
              key={it.id}
              item={it}
              onAdjust={(d) => adjust(it, d)}
              onDelete={() => removeItem(it)}
              onUpdate={(patch) => updateItem(it, patch)}
            />
          ))}
        </ul>
      )}

      {adding && (
        <AddDialog
          name={newName}
          qty={newQty}
          notes={newNotes}
          saving={saving}
          onName={setNewName}
          onQty={setNewQty}
          onNotes={setNewNotes}
          onClose={() => {
            if (saving) return;
            setAdding(false);
            setNewName("");
            setNewQty(1);
            setNewNotes("");
          }}
          onSubmit={addItem}
        />
      )}
    </div>
  );
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "it");

function MaterialRow({ item, onAdjust, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name || "");
  const [notes, setNotes] = useState(item.notes || "");

  useEffect(() => {
    setName(item.name || "");
    setNotes(item.notes || "");
  }, [item.name, item.notes]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nome richiesto");
      return;
    }
    onUpdate({ name: trimmed, notes: notes.trim() });
    setEditing(false);
  };

  const qty = item.quantity ?? 0;
  const low = qty === 0;

  if (editing) {
    return (
      <li
        className="rounded-2xl border border-stone-300 bg-amber-50/40 p-3 shadow-sm"
        data-testid={`material-row-${item.id}`}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome materiale"
          className="h-10 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm font-semibold text-stone-800 focus:border-[#4A5D23] focus:outline-none"
          data-testid={`material-edit-name-${item.id}`}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (opzionale)"
          rows={2}
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-700 focus:border-[#4A5D23] focus:outline-none"
          data-testid={`material-edit-notes-${item.id}`}
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={() => {
              setName(item.name || "");
              setNotes(item.notes || "");
              setEditing(false);
            }}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-600 hover:bg-stone-50"
          >
            <X className="h-3.5 w-3.5" /> Annulla
          </button>
          <button
            onClick={save}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4A5D23] px-3 text-xs font-semibold text-white hover:bg-[#3C4C1C]"
            data-testid={`material-save-${item.id}`}
          >
            <Save className="h-3.5 w-3.5" /> Salva
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
      data-testid={`material-row-${item.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${low ? "bg-red-50 text-red-500" : "bg-[#EAF3EF] text-[#4A5D23]"}`}>
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-semibold text-stone-900"
            data-testid={`material-name-${item.id}`}
          >
            {item.name}
          </div>
          {item.notes ? (
            <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">
              {item.notes}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onAdjust(-1)}
            disabled={qty <= 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-stone-50"
            data-testid={`material-decrement-${item.id}`}
            aria-label="Diminuisci"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div
            className={`min-w-[48px] text-center font-display text-xl font-bold tabular-nums ${low ? "text-red-500" : "text-stone-900"}`}
            data-testid={`material-qty-${item.id}`}
          >
            {formatQty(qty)}
          </div>
          <button
            onClick={() => onAdjust(1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A5D23] text-white shadow-sm transition active:scale-95 hover:bg-[#3C4C1C]"
            data-testid={`material-increment-${item.id}`}
            aria-label="Aumenta"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:bg-stone-50"
          data-testid={`material-edit-${item.id}`}
          aria-label="Modifica"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
          data-testid={`material-delete-${item.id}`}
          aria-label="Elimina"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

const formatQty = (q) => {
  const n = Number(q) || 0;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
};

function AddDialog({
  name,
  qty,
  notes,
  saving,
  onName,
  onQty,
  onNotes,
  onClose,
  onSubmit,
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-md"
        style={{ scrollPaddingBottom: "25vh", scrollPaddingTop: "2rem" }}
        data-testid="materials-add-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Nuovo materiale</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
          onFocusCapture={(e) => {
            // Fix Android Chrome: quando si apre la tastiera virtuale il dialog
            // a volte resetta lo scroll in alto. Ripristiniamo la vista
            // sull'input focalizzato dopo che la tastiera e' aperta.
            const target = e.target;
            if (!target || !(target instanceof HTMLElement)) return;
            if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
            window.setTimeout(() => {
              try {
                target.scrollIntoView({ block: "center", behavior: "smooth" });
              } catch {
                /* ignore */
              }
            }, 350);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="mat-name" className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
              Nome
            </Label>
            <Input
              id="mat-name"
              autoFocus
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Es. Avvolgibile PVC 150cm"
              data-testid="materials-new-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mat-qty" className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
              Quantita'
            </Label>
            <Input
              id="mat-qty"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={qty}
              onChange={(e) => onQty(e.target.value)}
              className="tabular-nums"
              data-testid="materials-new-qty"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mat-notes" className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
              Note (opzionale)
            </Label>
            <Textarea
              id="mat-notes"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={3}
              placeholder="Marca, misure, scaffale..."
              data-testid="materials-new-notes"
            />
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#4A5D23] hover:bg-[#3C4C1C]"
              data-testid="materials-new-submit"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Aggiungi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
