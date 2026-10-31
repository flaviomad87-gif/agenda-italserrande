import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Loader2,
  FileText,
  CalendarDays,
  MapPin,
  Ruler,
} from "lucide-react";
import SezionaleRilievoDialog from "../components/SezionaleRilievoDialog";
import { fmtDate } from "../lib/rilievoPdf";

/**
 * Pagina Rilievi Sezionali: lista dei moduli compilati per porte sezionali
 * da ordinare al fornitore. Permette di aprirne uno esistente o crearne uno nuovo.
 * Route: /rilievi
 */
export default function Rilievi() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState(null); // rilievo oggetto o null per nuovo

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.get("/rilievi-sezionali");
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
    return items.filter((it) => {
      const hay = [
        it.riferimento_cliente,
        it.ditta,
        it.citta,
        it.rif,
        it.destinazione_merce,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const openNew = () => {
    setSelected(null);
    setOpening(true);
  };
  const openEdit = (r) => {
    setSelected(r);
    setOpening(true);
  };

  const onSaved = (saved) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const onDeleted = (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-4 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Produzione · porte sezionali
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Rilievi
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Compila le misure in loco e condividi il PDF al fornitore.
        </p>
      </header>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#F9F8F6]/95 pb-1 pt-1 backdrop-blur">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca rilievo…"
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-[#4A5D23] focus:outline-none"
            data-testid="rilievi-search"
          />
        </div>
        <button
          onClick={openNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3C4C1C]"
          data-testid="rilievi-add"
        >
          <Plus className="h-4 w-4" /> Nuovo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-14 text-center text-sm text-stone-500" data-testid="rilievi-empty">
          <FileText className="mx-auto mb-2 h-7 w-7 text-stone-400" />
          {items.length === 0
            ? "Nessun rilievo ancora. Tocca Nuovo per cominciare."
            : "Nessun risultato per la ricerca."}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="rilievi-list">
          {filtered.map((r) => (
            <RilievoCard key={r.id} rilievo={r} onClick={() => openEdit(r)} />
          ))}
        </ul>
      )}

      <SezionaleRilievoDialog
        open={opening}
        onOpenChange={setOpening}
        rilievo={selected}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function RilievoCard({ rilievo, onClick }) {
  const r = rilievo;
  const title =
    r.riferimento_cliente ||
    r.ditta ||
    r.destinazione_merce ||
    "Rilievo senza nome";

  const dims = [r.l && `L ${r.l}`, r.h && `H ${r.h}`].filter(Boolean).join(" × ");

  return (
    <li
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition hover:border-[#4A5D23]/40 hover:shadow-md"
      data-testid={`rilievo-row-${r.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-stone-900">
            {title}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
            {r.data && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {fmtDate(r.data)}
              </span>
            )}
            {r.citta && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {r.citta}
              </span>
            )}
            {dims && (
              <span className="inline-flex items-center gap-1 font-medium text-[#4A5D23]">
                <Ruler className="h-3 w-3" />
                {dims}
              </span>
            )}
          </div>
        </div>
        {r.tipo && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4A5D23] font-display text-sm font-bold text-white">
            {r.tipo}
          </div>
        )}
      </div>
    </li>
  );
}
