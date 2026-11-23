import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

// Caricato solo finche' l'import dalla vecchia app non e' fatto (evita ~300KB di Firestore)
const ImportOld = lazy(() => import("./ImportOldQuotes"));
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, CalendarPlus, CheckCircle2, ChevronDown, Search } from "lucide-react";
import { api } from "../lib/api";
import { QUOTE_STATUS, money, qDate, quoteTotal } from "../lib/quoteDoc";

const FILTERS = [["open", "Da gestire"], ["accepted", "Accettati"], ["all", "Tutti"]];

export async function createQuote(prefill = {}) {
  const res = await api.post("/quotes", {
    clientName: (prefill.name || "").toUpperCase(),
    clientAddress: (prefill.address || "").toUpperCase(),
    lineItems: [{ id: crypto.randomUUID(), description: "", amount: Number(prefill.amount) || 0, vatRate: 22 }],
    client_id: prefill.id || null,
  });
  return res.data;
}

// Preventivi dentro l'agenda (scheda Preventivi)
export default function PreventiviAppSection({ onCreateJob, refreshKey }) {
  const nav = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [links, setLinks] = useState({});
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => localStorage.getItem("prev_section_open") !== "0");

  const load = useCallback(async () => {
    try {
      const [q, r] = await Promise.all([api.get("/quotes"), api.get("/clients/quote-refs")]);
      setQuotes(q.data || []);
      setLinks(Object.fromEntries((r.data || []).map((x) => [x.quote_ref, x])));
    } catch {
      toast.error("Errore nel caricamento dei preventivi");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const shown = useMemo(() => {
    const s = search.trim().toUpperCase();
    return quotes
      .filter((q) => (filter === "all" ? true : filter === "accepted" ? q.status === "accepted" : q.status !== "rejected" && !links[q.id]))
      .filter((q) => !s || `${q.number} ${q.clientName} ${q.clientAddress}`.toUpperCase().includes(s));
  }, [quotes, links, filter, search]);
  const [imported, setImported] = useState(() => !!localStorage.getItem("quotes_imported_v1"));
  const onImported = useCallback(() => {
    setImported(true);
    load();
  }, [load]);
  const openCount = quotes.filter((q) => q.status !== "rejected" && !links[q.id]).length;

  const toggle = () => setExpanded((v) => { localStorage.setItem("prev_section_open", v ? "0" : "1"); return !v; });
  const newQuote = async () => {
    try { nav(`/preventivi/${(await createQuote()).id}`); } catch { toast.error("Errore"); }
  };

  return (
    <section className="space-y-3 rounded-3xl border border-blue-200/70 bg-blue-50/40 p-4" data-testid="prev-app-section">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={toggle} className="flex min-w-0 items-center gap-2 text-left" data-testid="prev-toggle">
          <ChevronDown className={`h-5 w-5 shrink-0 text-blue-700 transition-transform ${expanded ? "rotate-180" : ""}`} />
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Preventivi{!loading ? ` · ${openCount} da gestire` : ""}
          </div>
        </button>
        <button type="button" onClick={newQuote} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#0047AB] px-3 text-xs font-semibold text-white hover:bg-[#003A8C]" data-testid="quote-new-button">
          <Plus className="h-3.5 w-3.5" /> Nuovo preventivo
        </button>
      </div>
      {expanded && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="prev-filters">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === k ? "bg-[#0047AB] text-white" : "bg-white text-stone-600"}`} data-testid={`prev-filter-${k}`}>{label}</button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca" className="h-8 w-32 rounded-full border border-stone-200 bg-white pl-7 pr-2 text-xs" data-testid="prev-search" />
            </div>
          </div>
          {shown.length === 0 && !loading ? (
            <p className="py-2 text-sm text-stone-500" data-testid="prev-empty">Nessun preventivo qui.</p>
          ) : (
            <ul className="space-y-2" data-testid="prev-list">
              {shown.slice(0, 60).map((q) => <QuoteRow key={q.id} q={q} linked={links[q.id]} onOpen={() => nav(`/preventivi/${q.id}`)} onCreateJob={onCreateJob} />)}
            </ul>
          )}
          {quotes.length > 0 && !imported && <Suspense fallback={null}><ImportOld onDone={onImported} /></Suspense>}
        </>
      )}
      {!loading && quotes.length === 0 && <Suspense fallback={null}><ImportOld onDone={onImported} prominent /></Suspense>}
    </section>
  );
}

function QuoteRow({ q, linked, onOpen, onCreateJob }) {
  const st = QUOTE_STATUS.find((s) => s.value === q.status) || QUOTE_STATUS[0];
  return (
    <li className="cursor-pointer rounded-2xl border border-stone-200 bg-white p-3" onClick={onOpen} data-testid={`prev-quote-${q.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold">N° {q.number}</span>
            <span className={`border px-2 py-0.5 text-[10px] font-semibold uppercase ${st.cls}`}>{st.label}</span>
          </div>
          <div className="truncate text-sm font-medium text-stone-800">{q.clientName || "Senza nome"}</div>
          {q.clientAddress && <div className="truncate text-xs text-stone-500">{q.clientAddress}</div>}
          <div className="text-xs text-stone-400">{qDate(q.date)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display font-bold tabular-nums">€ {money(quoteTotal(q))}</div>
          {linked ? (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" data-testid={`prev-quote-linked-${q.id}`}><CheckCircle2 className="h-3.5 w-3.5" /> In agenda</span>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); onCreateJob(q); }} className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-[#4A5D23] px-3 text-xs font-semibold text-white" data-testid={`prev-quote-create-job-${q.id}`}>
              <CalendarPlus className="h-3.5 w-3.5" /> Crea lavoro
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

