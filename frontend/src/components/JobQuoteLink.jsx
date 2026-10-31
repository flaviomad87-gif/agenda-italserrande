import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FilePlus2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { createQuoteFromJob, prevErrorMessage, quoteUrl, PREVENTIVI_URL } from "../lib/preventiviApp";
import { PreventiviConnectDialog, usePreventiviUser } from "./PreventiviConnect";

// Nel lavoro: apre il preventivo collegato oppure ne crea una bozza nell'app Preventivi
export default function JobQuoteLink({ form, update, editing, initial }) {
  const user = usePreventiviUser();
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const create = async () => {
    if (!form.name?.trim()) return toast.error("Inserisci prima il nome del cliente");
    if (!user) return setConnectOpen(true);
    setBusy(true);
    try {
      const q = await createQuoteFromJob(form);
      update("quote_ref", q.id);
      update("quote_number", q.number);
      if (editing) await api.put(`/clients/${initial.id}`, { ...initial, quote_ref: q.id, quote_number: q.number });
      toast.success(`Bozza preventivo N° ${q.number} creata`);
    } catch (err) {
      toast.error(prevErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cls = "inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors";
  return (
    <div className="flex flex-wrap gap-2" data-testid="job-quote-link">
      {form.quote_ref ? (
        <a href={quoteUrl(form.quote_ref)} target="_blank" rel="noopener noreferrer" className={`${cls} bg-blue-600 text-white hover:bg-blue-700`} data-testid="job-quote-open">
          <ExternalLink className="h-4 w-4" /> Apri preventivo{form.quote_number ? ` N° ${form.quote_number}` : ""}
        </a>
      ) : (
        <>
          <button type="button" onClick={create} disabled={busy} className={`${cls} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60`} data-testid="job-quote-create">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />} Crea preventivo nell'app
          </button>
          <a href={PREVENTIVI_URL} target="_blank" rel="noopener noreferrer" className={`${cls} border border-stone-300 text-stone-700 hover:bg-stone-50`} data-testid="job-quote-open-app">
            <ExternalLink className="h-4 w-4" /> Apri app Preventivi
          </a>
        </>
      )}
      <PreventiviConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
