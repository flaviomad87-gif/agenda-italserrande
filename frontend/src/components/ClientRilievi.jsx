import { useEffect, useMemo, useState } from "react";
import { Plus, Ruler, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import SezionaleRilievoDialog from "./SezionaleRilievoDialog";

export default function ClientRilievi({ client }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!client?.id) return;
    api
      .get("/rilievi-sezionali", { params: { client_id: client.id } })
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, [client?.id]);

  const openDialog = (r) => {
    setSelected(r);
    setOpen(true);
  };

  const onSaved = (saved) =>
    setItems((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
  const onDeleted = (id) => setItems((prev) => prev.filter((p) => p.id !== id));

  const id = client?.id;
  const name = client?.name || "";
  const address = client?.address || "";
  const defaults = useMemo(
    () => ({ client_id: id, riferimento_cliente: name, destinazione_merce: address }),
    [id, name, address],
  );

  return (
    <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50/60 p-3" data-testid="client-rilievi-section">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[#4A5D23]">
          <Ruler className="h-3.5 w-3.5" /> Rilievi sezionali
        </div>
        <button
          type="button"
          onClick={() => openDialog(null)}
          disabled={!client?.id}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4A5D23] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#3C4C1C] disabled:opacity-40"
          data-testid="client-new-rilievo-button"
        >
          <Plus className="h-3.5 w-3.5" /> Nuovo rilievo
        </button>
      </div>
      {!client?.id ? (
        <p className="text-xs text-stone-500" data-testid="client-rilievi-hint">
          Salva prima il lavoro per poter collegare un rilievo.
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="client-rilievi-empty">Nessun rilievo collegato.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="client-rilievi-list">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => openDialog(r)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-[#4A5D23]/40"
                data-testid={`client-rilievo-item-${r.id}`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-stone-800">{r.data || "Senza data"}</span>
                  <span className="ml-2 text-xs text-stone-500">
                    {[r.l && `L ${r.l}`, r.h && `H ${r.h}`].filter(Boolean).join(" × ")}
                    {r.tipo ? ` · Tipo ${r.tipo}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SezionaleRilievoDialog
        open={open}
        onOpenChange={setOpen}
        rilievo={selected}
        defaultValues={defaults}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}
