import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Search, Loader2, FileSignature, BellRing, MapPin } from "lucide-react";
import ContrattoDialog from "../components/ContrattoDialog";
import { fmtDate } from "../lib/documentiPdf";

const refreshBadge = () => window.__refreshContrattiBadge?.();

function Stato({ c }) {
  if (c.stato !== "attivo") return <span className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-500">Disdetto</span>;
  const g = c.giorni_alla_visita;
  const cls = g < 0 ? "bg-red-100 text-red-700" : c.scadenze?.length ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600";
  const txt = g < 0 ? `Scaduta da ${-g} gg` : g === 0 ? "Oggi" : `tra ${g} gg`;
  return <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${cls}`}>{txt}</span>;
}

// Pagina Contratti di manutenzione. Route: /contratti
export default function Contratti() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  // Apertura dal tasto "+" della barra
  useEffect(() => {
    if (!location.state?.nuovo) return;
    setSelected(null);
    setOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  useEffect(() => {
    api
      .get("/contratti")
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => !q || [c.cliente, c.indirizzo, c.comune].join(" ").toLowerCase().includes(q));
  }, [items, query]);
  const dueCount = items.filter((c) => c.scadenze?.length).length;

  const onSaved = (s) => {
    setItems((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [s, ...prev]).sort((a, b) => (a.prossima_visita < b.prossima_visita ? -1 : 1)));
    refreshBadge();
  };

  return (
    <div className="space-y-4 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Manutenzione programmata</div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Contratti</h1>
        <p className="mt-1 text-sm text-stone-500">Ti avviso in app e per email 15 giorni prima di ogni visita.</p>
      </header>

      {dueCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="contratti-due-banner">
          <BellRing className="h-4 w-4" /> {dueCount} {dueCount === 1 ? "manutenzione da fare" : "manutenzioni da fare"} entro 15 giorni
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca cliente o indirizzo…"
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A5D23]/30"
            data-testid="contratti-search"
          />
        </div>
        <button
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#4A5D23] px-3.5 text-sm font-semibold text-white"
          data-testid="contratti-add"
        >
          <Plus className="h-4 w-4" /> Nuovo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-14 text-center text-sm text-stone-500" data-testid="contratti-empty">
          <FileSignature className="mx-auto mb-2 h-7 w-7 text-stone-400" />
          Nessun contratto. Tocca Nuovo per aggiungerne uno.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="contratti-list">
          {filtered.map((c) => (
            <li
              key={c.id}
              onClick={() => {
                setSelected(c);
                setOpen(true);
              }}
              className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition hover:shadow-md"
              data-testid={`contratto-row-${c.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-900">{c.cliente || "Senza nome"}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
                    <span>Prossima visita: <b className="text-stone-700">{fmtDate(c.prossima_visita)}</b></span>
                    {c.indirizzo && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3" /> <span className="truncate">{c.indirizzo}</span>
                      </span>
                    )}
                  </div>
                </div>
                <Stato c={c} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ContrattoDialog
        open={open}
        onOpenChange={setOpen}
        contratto={selected}
        onSaved={onSaved}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((p) => p.id !== id));
          refreshBadge();
        }}
      />
    </div>
  );
}
