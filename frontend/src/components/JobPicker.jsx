import { useEffect, useState } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { Input } from "./ui/input";

// Cerca un lavoro/cliente per nome, indirizzo o telefono e lo restituisce con onPick
export default function JobPicker({ initial = "", onPick, onClose, testId = "job-picker" }) {
  const [q, setQ] = useState(initial);
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setRes([]);
    setBusy(true);
    const t = setTimeout(() => {
      api.get("/clients/search", { params: { q: term } })
        .then((r) => setRes(r.data.slice(0, 8)))
        .catch(() => setRes([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-stone-400" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca il cliente (nome, via, telefono)" className="h-9" data-testid={`${testId}-input`} />
        {busy && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Chiudi" className="p-1 text-stone-400" data-testid={`${testId}-close`}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {res.length > 0 && (
        <ul className="mt-2 max-h-60 divide-y divide-stone-100 overflow-y-auto">
          {res.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-2 px-1 py-2 text-left text-sm hover:bg-stone-50" data-testid={`${testId}-item-${c.id}`}>
                <Link2 className="h-4 w-4 shrink-0 text-[#0047ab]" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-stone-500">{[c.address, c.date].filter(Boolean).join(" · ")}{c.quote_number ? ` · ha già il preventivo N° ${c.quote_number}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !busy && !res.length && <p className="mt-2 px-1 text-xs text-stone-500">Nessun lavoro trovato.</p>}
    </div>
  );
}
