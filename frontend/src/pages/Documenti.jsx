import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Plus, Search, Loader2, FileText, CalendarDays, MapPin } from "lucide-react";
import DocumentoDialog, { KINDS } from "../components/DocumentoDialog";
import { fmtDate } from "../lib/documentiPdf";

// Pagina Documenti: Dichiarazioni CE e Registri di Manutenzione. Route: /documenti
export default function Documenti() {
  const [kind, setKind] = useState("ce");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .get("/documenti")
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (d) => d.kind === kind && (!q || [d.cliente, d.indirizzo, d.fields?.matricola].filter(Boolean).join(" ").toLowerCase().includes(q)),
    );
  }, [items, kind, query]);

  const onSaved = (saved) =>
    setItems((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]));

  const openDoc = (d) => {
    setSelected(d);
    setOpen(true);
  };

  return (
    <div className="space-y-4 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Conformità · fascicolo tecnico</div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Documenti</h1>
        <p className="mt-1 text-sm text-stone-500">Dichiarazioni CE e registri di manutenzione, pronti in PDF.</p>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1" data-testid="documenti-tabs">
        {Object.entries(KINDS).map(([k, c]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
              kind === k ? "bg-white text-[#4A5D23] shadow-sm" : "text-stone-500"
            }`}
            data-testid={`documenti-tab-${k}`}
          >
            <c.icon className="h-4 w-4" /> {k === "ce" ? "Dichiarazioni CE" : "Manutenzioni"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca cliente o indirizzo…"
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm placeholder:text-stone-400 focus:border-[#4A5D23] focus:outline-none"
            data-testid="documenti-search"
          />
        </div>
        <button
          onClick={() => openDoc(null)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3C4C1C]"
          data-testid="documenti-add"
        >
          <Plus className="h-4 w-4" /> Nuovo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-14 text-center text-sm text-stone-500" data-testid="documenti-empty">
          <FileText className="mx-auto mb-2 h-7 w-7 text-stone-400" />
          Nessun documento. Tocca Nuovo per compilarne uno.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="documenti-list">
          {filtered.map((d) => (
            <li
              key={d.id}
              onClick={() => openDoc(d)}
              className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition hover:border-[#4A5D23]/40 hover:shadow-md"
              data-testid={`documento-row-${d.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-900">{d.cliente || d.indirizzo || "Senza nome"}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
                    {d.data && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {fmtDate(d.data)}
                      </span>
                    )}
                    {d.cliente && d.indirizzo && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3" /> <span className="truncate">{d.indirizzo}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-600">
                  n. {d.numero}/{d.anno}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DocumentoDialog
        open={open}
        onOpenChange={setOpen}
        kind={selected?.kind || kind}
        documento={selected}
        onSaved={onSaved}
        onDeleted={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}
