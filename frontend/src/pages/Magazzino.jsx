import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Search,
  Trash2,
  Pencil,
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

/**
 * Pagina Magazzino: lista materiale presente in officina.
 * - Righe compatte (una riga per materiale) per massimizzare la densita'
 * - Ricerca testuale
 * - Pulsanti rapidi +1 / -1 per aggiornare la quantita' in un tap
 * - Edit nome inline tramite dialog
 * Route: /magazzino
 */
export default function Magazzino() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // item in edit
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
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
    return items.filter((it) => (it.name || "").toLowerCase().includes(q));
  }, [items, query]);

  const addItem = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Nome richiesto");
      return;
    }
    setSaving(true);
    const qty = Number(newQty) || 0;
    const tempId = `tmp-${Date.now()}`;
    setItems((prev) =>
      [...prev, { id: tempId, name, quantity: qty, _optimistic: true }].sort(byName),
    );
    try {
      const res = await api.post("/materials", { name, quantity: qty });
      setItems((prev) =>
        prev.map((p) => (p.id === tempId ? res.data : p)).sort(byName),
      );
      setNewName("");
      setNewQty(1);
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
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, quantity: nextQty } : p)),
    );
    try {
      await api.post(`/materials/${item.id}/adjust`, null, { params: { delta } });
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

  const saveEdit = async (patch) => {
    if (!editing) return;
    const id = editing.id;
    const snapshot = items;
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort(byName),
    );
    setEditing(null);
    try {
      await api.put(`/materials/${id}`, patch);
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
      </header>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#F9F8F6]/95 pb-1 pt-1 backdrop-blur">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca materiale…"
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#4A5D23] focus:outline-none"
            data-testid="materials-search"
          />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3C4C1C]"
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
        <div
          className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-14 text-center text-sm text-stone-500"
          data-testid="materials-empty"
        >
          <PackageOpen className="mx-auto mb-2 h-7 w-7 text-stone-400" />
          {items.length === 0
            ? "Il magazzino è vuoto. Aggiungi il primo materiale."
            : "Nessun risultato per la ricerca."}
        </div>
      ) : (
        <ul
          className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
          data-testid="materials-list"
        >
          {filtered.map((it) => (
            <MaterialRow
              key={it.id}
              item={it}
              onAdjust={(d) => adjust(it, d)}
              onDelete={() => removeItem(it)}
              onEdit={() => setEditing(it)}
            />
          ))}
        </ul>
      )}

      {filtered.length > 0 && (
        <div className="text-center text-[11px] text-stone-400">
          {filtered.length} {filtered.length === 1 ? "voce" : "voci"}
        </div>
      )}

      <AddDialog
        open={adding}
        name={newName}
        qty={newQty}
        saving={saving}
        onName={setNewName}
        onQty={setNewQty}
        onClose={() => {
          if (saving) return;
          setAdding(false);
          setNewName("");
          setNewQty(1);
        }}
        onSubmit={addItem}
      />

      <EditDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </div>
  );
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "it");

const formatQty = (q) => {
  const n = Number(q) || 0;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
};

function MaterialRow({ item, onAdjust, onDelete, onEdit }) {
  const qty = item.quantity ?? 0;
  const low = qty === 0;

  return (
    <li
      className="flex items-center gap-2 px-3 py-2"
      data-testid={`material-row-${item.id}`}
    >
      <button
        onClick={onEdit}
        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-stone-900 hover:text-[#4A5D23]"
        data-testid={`material-name-${item.id}`}
        title="Modifica nome"
      >
        {item.name}
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onAdjust(-1)}
          disabled={qty <= 0}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-stone-50"
          data-testid={`material-decrement-${item.id}`}
          aria-label="Diminuisci"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div
          className={`min-w-[36px] text-center font-display text-base font-bold tabular-nums ${low ? "text-red-500" : "text-stone-900"}`}
          data-testid={`material-qty-${item.id}`}
        >
          {formatQty(qty)}
        </div>
        <button
          onClick={() => onAdjust(1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4A5D23] text-white shadow-sm transition active:scale-95 hover:bg-[#3C4C1C]"
          data-testid={`material-increment-${item.id}`}
          aria-label="Aumenta"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="ml-1 flex items-center gap-0.5">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          data-testid={`material-edit-${item.id}`}
          aria-label="Modifica"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500"
          data-testid={`material-delete-${item.id}`}
          aria-label="Elimina"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function AddDialog({ open, name, qty, saving, onName, onQty, onClose, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
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
          onFocusCapture={focusScrollFix}
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

          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#4A5D23] hover:bg-[#3C4C1C]"
              data-testid="materials-new-submit"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ item, onClose, onSave }) {
  const [name, setName] = useState(item?.name || "");

  useEffect(() => {
    setName(item?.name || "");
  }, [item]);

  if (!item) return null;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nome richiesto");
      return;
    }
    if (trimmed === item.name) {
      onClose();
      return;
    }
    onSave({ name: trimmed });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-md"
        style={{ scrollPaddingBottom: "25vh", scrollPaddingTop: "2rem" }}
        data-testid="materials-edit-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Modifica materiale</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" onFocusCapture={focusScrollFix}>
          <div className="space-y-1.5">
            <Label htmlFor="mat-edit-name" className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
              Nome
            </Label>
            <Input
              id="mat-edit-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="materials-edit-name"
            />
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button
              type="submit"
              className="bg-[#4A5D23] hover:bg-[#3C4C1C]"
              data-testid="materials-edit-save"
            >
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Fix Android Chrome: quando si apre la tastiera virtuale, scroll sull'input focalizzato
function focusScrollFix(e) {
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
}
