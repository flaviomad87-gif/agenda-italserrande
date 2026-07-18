import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api } from "../lib/api";
import { formatEUR, googleMapsUrl } from "../lib/utils";
import { ChevronLeft, ChevronRight, MapPin, CalendarClock, Loader2 } from "lucide-react";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, addDays, format, parseISO, isSameDay } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Dialog "Vista settimanale": mostra solo i lavori pending con appointment_at,
 * raggruppati in 7 colonne per giorno (Lun→Dom). Navigabile con ←/→.
 */
export default function WeekAppointmentsDialog({ open, onOpenChange }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    // Carichiamo pending + awaiting (tutti i lavori "da fare"); il filtro appointment_at
    // dentro la settimana avviene in memoria.
    Promise.all([
      api.get("/clients/pending").then((r) => r.data).catch(() => []),
      api.get("/clients/awaiting").then((r) => r.data).catch(() => []),
      api.get("/clients/to-quote").then((r) => r.data).catch(() => []),
    ])
      .then(([p, a, q]) => {
        if (!cancelled) {
          const all = [...(p || []), ...(a || []), ...(q || [])];
          // Solo con appointment_at valido
          const withAppt = all.filter((c) => {
            if (!c.appointment_at) return false;
            const d = new Date(c.appointment_at);
            return !isNaN(d.getTime());
          });
          setItems(withAppt);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const inWeek = items.filter((c) => {
    const d = new Date(c.appointment_at);
    return d >= weekStart && d <= weekEnd;
  });
  const byDay = days.map((day) => ({
    day,
    items: inWeek
      .filter((c) => isSameDay(new Date(c.appointment_at), day))
      .sort((a, b) => new Date(a.appointment_at) - new Date(b.appointment_at)),
  }));

  const label = `${format(weekStart, "d MMM", { locale: it })} — ${format(weekEnd, "d MMM yyyy", { locale: it })}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-5xl"
        data-testid="week-appointments-dialog"
      >
        <DialogHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#EAF3EF] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
            <CalendarClock className="h-3.5 w-3.5" /> Settimana
          </div>
          <DialogTitle className="font-display text-2xl">Appuntamenti della settimana</DialogTitle>
        </DialogHeader>

        <div className="mt-2 flex items-center justify-between rounded-2xl bg-stone-50 px-3 py-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            data-testid="week-prev"
            className="rounded-full p-2 text-stone-600 hover:bg-white"
            aria-label="Settimana precedente"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold capitalize text-stone-800">{label}</div>
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-[10px] font-semibold uppercase tracking-widest text-stone-500 hover:text-[#4A5D23]"
              data-testid="week-today"
            >
              Vai a oggi
            </button>
          </div>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            data-testid="week-next"
            className="rounded-full p-2 text-stone-600 hover:bg-white"
            aria-label="Settimana successiva"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Caricamento…
          </div>
        ) : inWeek.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Nessun appuntamento questa settimana.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {byDay.map(({ day, items: dayItems }) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`rounded-2xl border p-2 ${
                    isToday
                      ? "border-[#4A5D23]/40 bg-[#EAF3EF]"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <div className={`mb-2 border-b pb-1 text-center ${isToday ? "border-[#4A5D23]/30" : "border-stone-100"}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-widest ${isToday ? "text-[#2E5A47]" : "text-stone-500"}`}>
                      {format(day, "EEE", { locale: it })}
                    </div>
                    <div className={`font-display text-xl font-bold ${isToday ? "text-[#2E5A47]" : "text-stone-800"}`}>
                      {format(day, "d")}
                    </div>
                  </div>
                  {dayItems.length === 0 ? (
                    <div className="py-2 text-center text-[10px] text-stone-400">—</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {dayItems.map((c) => {
                        const t = parseISO(c.appointment_at);
                        return (
                          <li
                            key={c.id}
                            className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-stone-200"
                            data-testid={`week-appt-${c.id}`}
                          >
                            <div className="text-[10px] font-bold text-[#2E5A47]">
                              {format(t, "HH:mm")}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-stone-800">
                              {c.name}
                            </div>
                            {c.address && (
                              <a
                                href={googleMapsUrl(c.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 line-clamp-1 flex items-center gap-0.5 text-[10px] text-stone-500 hover:text-[#4A5D23]"
                              >
                                <MapPin className="h-2.5 w-2.5" /> {c.address}
                              </a>
                            )}
                            {c.amount > 0 && (
                              <div className="mt-0.5 text-[10px] font-semibold text-stone-600">
                                {formatEUR(c.amount)}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
          Compaiono solo i lavori <b>da fare</b> (Prossimi, In attesa, Da preventivare) con appuntamento fissato.
        </div>
      </DialogContent>
    </Dialog>
  );
}
