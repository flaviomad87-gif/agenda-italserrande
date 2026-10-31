import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Link2, Loader2, RefreshCw, CalendarPlus, CheckCircle2, LogOut } from "lucide-react";
import { api } from "../lib/api";
import { formatEUR } from "../lib/utils";
import { fmtDate } from "../lib/rilievoPdf";
import {
  PREVENTIVI_URL,
  STATUS,
  disconnectPreventivi,
  listQuotes,
  prevErrorMessage,
  quoteTotal,
  quoteUrl,
} from "../lib/preventiviApp";
import { PreventiviConnectDialog, usePreventiviUser } from "./PreventiviConnect";

const FILTERS = [
  ["open", "Da gestire"],
  ["accepted", "Accettati"],
  ["all", "Tutti"],
];

// Preventivi letti dall'app Preventivi, dentro la scheda "Da preventivare"
export default function PreventiviAppSection({ onCreateJob, refreshKey }) {
  const user = usePreventiviUser();
  const [quotes, setQuotes] = useState([]);
  const [links, setLinks] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("open");
  const [connectOpen, setConnectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, refs] = await Promise.all([listQuotes(), api.get("/clients/quote-refs").then((r) => r.data)]);
      setQuotes(q);
      setLinks(Object.fromEntries((refs || []).map((r) => [r.quote_ref, r])));
    } catch (err) {
      toast.error(prevErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load, refreshKey]);

  const shown = useMemo(() => {
    if (filter === "all") return quotes;
    if (filter === "accepted") return quotes.filter((q) => q.status === "accepted");
    return quotes.filter((q) => q.status !== "rejected" && !links[q.id]);
  }, [quotes, links, filter]);

  if (user === undefined) return null;

  return (
    <section className="space-y-3 rounded-3xl border border-blue-200/70 bg-blue-50/40 p-4" data-testid="prev-app-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">App Preventivi</div>
          <p className="text-xs text-stone-500">{user ? user.email : "Non collegata"}</p>
        </div>
        <div className="flex gap-1.5">
          <a href={PREVENTIVI_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-full border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50" data-testid="prev-open-app">
            <ExternalLink className="h-3.5 w-3.5" /> Apri app
          </a>
          {user ? (
            <>
              <IconBtn onClick={load} label="Aggiorna" testId="prev-refresh">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </IconBtn>
              <IconBtn onClick={() => window.confirm("Scollegare l'app Preventivi?") && disconnectPreventivi()} label="Scollega" testId="prev-disconnect">
                <LogOut className="h-4 w-4" />
              </IconBtn>
            </>
          ) : (
            <button type="button" onClick={() => setConnectOpen(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700" data-testid="prev-connect-button">
              <Link2 className="h-3.5 w-3.5" /> Collega
            </button>
          )}
        </div>
      </div>

      {user && (
        <>
          <div className="flex gap-1.5" data-testid="prev-filters">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === k ? "bg-blue-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`} data-testid={`prev-filter-${k}`}>
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 && !loading ? (
            <p className="py-2 text-sm text-stone-500" data-testid="prev-empty">Nessun preventivo qui.</p>
          ) : (
            <ul className="space-y-2" data-testid="prev-list">
              {shown.map((q) => (
                <QuoteRow key={q.id} q={q} linked={links[q.id]} onCreateJob={onCreateJob} />
              ))}
            </ul>
          )}
        </>
      )}
      <PreventiviConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </section>
  );
}

function QuoteRow({ q, linked, onCreateJob }) {
  const st = STATUS[q.status] || STATUS.draft;
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-3" data-testid={`prev-quote-${q.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold">N° {q.number}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st.cls}`}>{st.label}</span>
          </div>
          <div className="truncate text-sm font-medium text-stone-800">{q.clientName || "Senza nome"}</div>
          {q.clientAddress && <div className="truncate text-xs text-stone-500">{q.clientAddress}</div>}
          <div className="text-xs text-stone-400">{fmtDate(q.date)}</div>
        </div>
        <div className="shrink-0 text-right font-display font-bold tabular-nums">{formatEUR(quoteTotal(q))}</div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        <a href={quoteUrl(q.id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50" data-testid={`prev-quote-open-${q.id}`}>
          <ExternalLink className="h-3.5 w-3.5" /> Apri
        </a>
        {linked ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-emerald-50 px-3 text-xs font-semibold text-emerald-700" data-testid={`prev-quote-linked-${q.id}`}>
            <CheckCircle2 className="h-3.5 w-3.5" /> In agenda
          </span>
        ) : (
          <button type="button" onClick={() => onCreateJob(q)} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#4A5D23] px-3 text-xs font-semibold text-white hover:bg-[#3C4C1C]" data-testid={`prev-quote-create-job-${q.id}`}>
            <CalendarPlus className="h-3.5 w-3.5" /> Crea lavoro
          </button>
        )}
      </div>
    </li>
  );
}

function IconBtn({ onClick, label, testId, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 hover:bg-stone-50" data-testid={testId}>
      {children}
    </button>
  );
}
