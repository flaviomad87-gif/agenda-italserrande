import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Search, Loader2, FileText, CalendarDays, MapPin, FolderCheck, ClipboardCheck } from "lucide-react";
import DocumentoDialog, { KINDS } from "../components/DocumentoDialog";
import PraticaDialog from "../components/PraticaDialog";
import VerificaDialog from "../components/VerificaDialog";
import { TIPI_CHIUSURA } from "../lib/praticaTesti";

import StampaVuoto from "../components/StampaVuoto";
import { fmtDate } from "../lib/documentiPdf";

const TABS = [
  ["pratica", "Pratiche", FolderCheck],
  ["verifica", "Verifiche", ClipboardCheck],
  ["ce", "Solo CE", KINDS.ce.icon],
  ["manutenzione", "Registri", KINDS.manutenzione.icon],
];

// Pagina Documenti: pratiche, verifiche, CE e registri. Route: /documenti
export default function Documenti() {
  const [kind, setKind] = useState("pratica");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [params, setParams] = useSearchParams();
  // Apertura dalla scheda lavoro: nuova pratica con cliente e indirizzo già compilati
  useEffect(() => {
    if (params.get("nuova") !== "pratica") return;
    setKind("pratica");
    setSelected({ kind: "pratica", cliente: params.get("cliente") || "", indirizzo: params.get("indirizzo") || "", fields: {} });
    setOpen(true);
    setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    api
      .get("/documenti")
      .then((r) => setItems(r.data || []))
      .catch(() => {
        setItems([]);
        toast.error("Impossibile caricare i documenti. Controlla la connessione.", { id: "documenti-load-error" });
      })
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
        <p className="mt-1 text-sm text-stone-500">Pratiche impianto, verifiche, dichiarazioni e registri, pronti in PDF.</p>
      </header>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1" data-testid="documenti-tabs">
        {TABS.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:text-sm ${
              kind === k ? "bg-white text-[#4A5D23] shadow-sm" : "text-stone-500"
            }`}
            data-testid={`documenti-tab-${k}`}
          >
            <Icon className="h-4 w-4" /> {label}
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
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#4A5D23]/30"
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

      {kind === "pratica" && (
        <p className="text-xs text-stone-500" data-testid="documenti-pratica-hint">
          Compili una volta e ottieni tutto: Dichiarazione CE, collaudo, analisi rischi, manuale d'uso, DM 37/08, registro e targhetta.
        </p>
      )}
      {kind === "pratica" && <StampaVuoto />}

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
                    {d.kind === "pratica" && d.fields?.tipo_chiusura && (
                      <span className="font-medium text-[#4A5D23]">{TIPI_CHIUSURA[d.fields.tipo_chiusura]}</span>
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

      <VerificaDialog
        open={open && (selected?.kind || kind) === "verifica"}
        onOpenChange={setOpen}
        documento={selected}
        onSaved={onSaved}
        onDeleted={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
        onCreatePratica={(prefill) => {
          setKind("pratica");
          setSelected(prefill);
          setTimeout(() => setOpen(true), 50);
        }}
      />
      <PraticaDialog
        open={open && (selected?.kind || kind) === "pratica"}
        onOpenChange={setOpen}
        documento={selected}
        onSaved={onSaved}
        onDeleted={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
      />
      <DocumentoDialog
        open={open && !["pratica", "verifica"].includes(selected?.kind || kind)}
        onOpenChange={setOpen}
        kind={["pratica", "verifica"].includes(selected?.kind || kind) ? "ce" : selected?.kind || kind}
        documento={selected}
        onSaved={onSaved}
        onDeleted={(id) => setItems((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}
