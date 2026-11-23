import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, FilePlus2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { createQuote } from "./PreventiviAppSection";

const cls =
  "inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-95 disabled:opacity-60";

// Sulla lista "Da preventivare": crea il preventivo (nome e indirizzo in maiuscolo) e lo apre nell'agenda
export default function MakeQuoteButton({ client, onLinked }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (client.quote_ref)
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); nav(`/preventivi/${client.quote_ref}`); }} className={cls} data-testid={`to-quote-open-quote-${client.id}`}>
        <FileText className="h-3.5 w-3.5" /> Preventivo{client.quote_number ? ` N° ${client.quote_number}` : ""}
      </button>
    );

  const make = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const q = await createQuote(client);
      const res = await api.put(`/clients/${client.id}`, { ...client, quote_ref: q.id, quote_number: q.number });
      onLinked?.(res.data);
      nav(`/preventivi/${q.id}`);
    } catch {
      toast.error("Preventivo non creato, riprova");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={make} disabled={busy} className={cls} data-testid={`to-quote-make-quote-${client.id}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} Fai preventivo
    </button>
  );
}
