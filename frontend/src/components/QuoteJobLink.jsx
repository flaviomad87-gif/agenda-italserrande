import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import JobPicker from "./JobPicker";

// Nel preventivo: mostra a quale lavoro è collegato e permette di collegarlo/cambiarlo
export default function QuoteJobLink({ quote }) {
  const [job, setJob] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get(`/quotes/${quote.id}/lavoro`).then((r) => setJob(r.data?.id ? r.data : null)).catch(() => {});
  }, [quote.id]);

  const pick = async (c) => {
    try {
      await api.post(`/quotes/${quote.id}/collega`, { lavoro_id: c.id });
      setJob(c);
      setOpen(false);
      toast.success(`Preventivo collegato a ${c.name}`);
    } catch {
      toast.error("Collegamento non riuscito, riprova");
    }
  };

  return (
    <div className="space-y-2" data-testid="quote-job-link">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link2 className="h-4 w-4 text-[#0047ab]" />
        {job ? (
          <span data-testid="quote-job-name">Collegato al lavoro <strong>{job.name}</strong></span>
        ) : (
          <span className="text-stone-500">Non collegato a un lavoro</span>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-[#0047ab]" data-testid="quote-job-change">
          {job ? "Cambia" : "Collega a un cliente"}
        </button>
      </div>
      {open && <JobPicker initial={quote.clientName?.split(" ")[0] || ""} onPick={pick} onClose={() => setOpen(false)} testId="quote-job-picker" />}
    </div>
  );
}
