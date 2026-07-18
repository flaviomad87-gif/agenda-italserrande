import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { formatEUR, googleMapsUrl } from "../lib/utils";
import { MapPin, Phone, CalendarClock, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Dialog che mostra tutti gli appuntamenti (con appointment_at) di UN giorno specifico.
 * Riceve già la lista filtrata dal WeekStrip.
 */
export default function DayAppointmentsDialog({ open, onOpenChange, day, items }) {
  if (!day) return null;
  const sorted = [...(items || [])].sort(
    (a, b) => new Date(a.appointment_at) - new Date(b.appointment_at),
  );
  const label = format(day, "EEEE d MMMM yyyy", { locale: it });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-lg"
        data-testid="day-appointments-dialog"
      >
        <DialogHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#EAF3EF] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
            <CalendarClock className="h-3.5 w-3.5" /> Appuntamenti
          </div>
          <DialogTitle className="font-display text-2xl capitalize">{label}</DialogTitle>
        </DialogHeader>

        {sorted.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Nessun appuntamento in questo giorno.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {sorted.map((c) => {
              const t = parseISO(c.appointment_at);
              return (
                <li
                  key={c.id}
                  data-testid={`day-appt-${c.id}`}
                  className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-widest text-[#2E5A47]">
                        {format(t, "HH:mm")}
                      </div>
                      <div className="mt-1 font-display text-lg font-bold tracking-tight">
                        {c.name}
                      </div>
                      <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
                        {c.address && (
                          <a
                            href={googleMapsUrl(c.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center gap-1.5 hover:text-[#4A5D23]"
                          >
                            <MapPin className="h-3.5 w-3.5 text-stone-400" /> {c.address}
                          </a>
                        )}
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex w-fit items-center gap-1.5 hover:text-[#4A5D23]"
                          >
                            <Phone className="h-3.5 w-3.5 text-stone-400" /> {c.phone}
                          </a>
                        )}
                        {c.appointment_note && (
                          <span className="inline-flex items-start gap-1.5 text-stone-500">
                            <FileText className="mt-0.5 h-3.5 w-3.5 text-stone-400" />
                            <span className="line-clamp-3">{c.appointment_note}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {c.amount > 0 && (
                      <div className="font-display text-base font-bold tracking-tight text-stone-800">
                        {formatEUR(c.amount)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
