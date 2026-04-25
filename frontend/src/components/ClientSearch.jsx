import { useEffect, useRef, useState } from "react";
import { Search, X, MapPin, Phone, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { format, parseISO } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { formatEUR } from "../lib/utils";

export default function ClientSearch({ onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/clients/search`, { params: { q: term } });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const reset = () => {
    setQ("");
    setResults([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-stone-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Cerca cliente per nome, indirizzo, telefono…"
          data-testid="client-search-input"
          className="h-12 w-full rounded-2xl border border-stone-200/70 bg-white pl-10 pr-10 text-sm shadow-sm outline-none transition focus:border-[#4A5D23]/40 focus:ring-2 focus:ring-[#4A5D23]/10"
        />
        {q && (
          <button
            type="button"
            onClick={reset}
            data-testid="client-search-clear"
            className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Cancella"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-stone-200/70 bg-white shadow-xl"
          data-testid="client-search-results"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-5 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Ricerca…
            </div>
          ) : results.length === 0 ? (
            <div className="p-5 text-center text-sm text-stone-500">
              Nessun cliente trovato per “{q}”.
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {results.map((c) => (
                <li
                  key={c.id}
                  role="button"
                  data-testid={`search-result-${c.id}`}
                  onClick={() => {
                    onPick?.(c);
                    setOpen(false);
                    reset();
                  }}
                  className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 transition hover:bg-stone-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-sm font-bold">{c.name}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          c.status === "lavoro_eseguito"
                            ? "bg-[#EAF3EF] text-[#2E5A47]"
                            : "bg-[#F8EBE4] text-[#B8683D]"
                        }`}
                      >
                        {c.status === "lavoro_eseguito" ? "Eseguito" : "Preventivo"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                      <span>{format(parseISO(c.date), "d MMM yyyy", { locale: itLocale })}</span>
                      {c.address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.address}
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-display text-sm font-bold tabular-nums text-stone-700">
                    {formatEUR(c.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
