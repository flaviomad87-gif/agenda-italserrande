import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, FilePlus2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { createQuote } from "./PreventiviAppSection";

// Nel lavoro: apre il preventivo collegato oppure ne crea uno nuovo nell'agenda
export default function JobQuoteLink({ form, update, editing, initial }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const cls = "inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors bg-[#0047AB] text-white hover:bg-[#003A8C] disabled:opacity-60";

  if (form.quote_ref)
    return (
      <button type="button" onClick={() => nav(`/preventivi/${form.quote_ref}`)} className={cls} data-testid="job-quote-open">
        <FileText className="h-4 w-4" /> Apri preventivo{form.quote_number ? ` N° ${form.quote_number}` : ""}
      </button>
    );

  const create = async () => {
    if (!form.name?.trim()) return toast.error("Inserisci prima il nome del cliente");
    setBusy(true);
    try {
      const q = await createQuote({ ...form, id: editing ? initial.id : null });
      update("quote_ref", q.id);
      update("quote_number", q.number);
      if (editing) await api.put(`/clients/${initial.id}`, { ...initial, quote_ref: q.id, quote_number: q.number });
      toast.success(`Preventivo N° ${q.number} creato${editing ? "" : ": salva il lavoro per collegarlo"}`);
      if (editing) nav(`/preventivi/${q.id}`);
    } catch {
      toast.error("Preventivo non creato, riprova");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={create} disabled={busy} className={cls} data-testid="job-quote-create">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />} Crea preventivo
    </button>
  );
}
