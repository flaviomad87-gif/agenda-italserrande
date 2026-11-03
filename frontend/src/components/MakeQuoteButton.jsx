import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FilePlus2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { createQuoteAndOpen, prevErrorMessage, quoteUrl } from "../lib/preventiviApp";
import { PreventiviConnectDialog, usePreventiviUser } from "./PreventiviConnect";

const cls =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-60";

// Sulla lista "Da preventivare": crea la bozza nell'app Preventivi (nome e indirizzo in maiuscolo) e la apre
export default function MakeQuoteButton({ client, onLinked }) {
  const user = usePreventiviUser();
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const stop = (e) => e.stopPropagation();

  const make = async (e) => {
    e.stopPropagation();
    if (!user) return setConnectOpen(true);
    setBusy(true);
    try {
      const q = await createQuoteAndOpen(client);
      const res = await api.put(`/clients/${client.id}`, { ...client, quote_ref: q.id, quote_number: q.number });
      onLinked?.(res.data);
      toast.success(`Preventivo N° ${q.number} creato`);
    } catch (err) {
      toast.error(prevErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (client.quote_ref)
    return (
      <a href={quoteUrl(client.quote_ref)} target="_blank" rel="noopener noreferrer" onClick={stop} className={`${cls} border border-blue-300 bg-white text-blue-700 hover:bg-blue-50`} data-testid={`to-quote-open-quote-${client.id}`}>
        <ExternalLink className="h-3.5 w-3.5" /> Apri preventivo{client.quote_number ? ` N° ${client.quote_number}` : ""}
      </a>
    );

  return (
    <>
      <button type="button" onClick={make} disabled={busy || user === undefined} className={`${cls} border border-blue-300 bg-white text-blue-700 hover:bg-blue-50`} data-testid={`to-quote-make-quote-${client.id}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} Fai preventivo
      </button>
      <span onClick={stop}>
        <PreventiviConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      </span>
    </>
  );
}
