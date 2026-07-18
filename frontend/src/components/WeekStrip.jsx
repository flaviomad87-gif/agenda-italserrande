import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { startOfWeek, addDays, format, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import DayAppointmentsDialog from "./DayAppointmentsDialog";

/**
 * Striscia orizzontale con i 7 giorni della settimana corrente (Lun→Dom).
 * Ogni casella mostra: giorno abbreviato, numero e conteggio appuntamenti.
 * Al click su una casella si apre un dialog con tutti gli appuntamenti di quel giorno.
 * Considera solo lavori con appointment_at fissato (pending + awaiting + to-quote).
 */
export default function WeekStrip() {
  const [items, setItems] = useState([]);
  const [openDay, setOpenDay] = useState(null); // Date object o null

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/clients/pending").then((r) => r.data).catch(() => []),
      api.get("/clients/awaiting").then((r) => r.data).catch(() => []),
      api.get("/clients/to-quote").then((r) => r.data).catch(() => []),
    ]).then(([p, a, q]) => {
      if (cancelled) return;
      const all = [...(p || []), ...(a || []), ...(q || [])];
      const withAppt = all.filter((c) => {
        if (!c.appointment_at) return false;
        const d = new Date(c.appointment_at);
        return !isNaN(d.getTime());
      });
      setItems(withAppt);
    });
    return () => { cancelled = true; };
  }, []);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = days.map((day) => ({
    day,
    items: items.filter((c) => isSameDay(new Date(c.appointment_at), day)),
  }));

  const totalCount = byDay.reduce((s, d) => s + d.items.length, 0);
  if (totalCount === 0) return null; // striscia nascosta se non ci sono appuntamenti

  const selectedItems = openDay
    ? byDay.find((d) => isSameDay(d.day, openDay))?.items || []
    : [];

  return (
    <>
      <section
        data-testid="week-strip"
        className="rounded-3xl border border-stone-200/60 bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Questa settimana · appuntamenti
          </div>
          <div className="text-xs font-semibold text-stone-500">
            {totalCount} tot
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {byDay.map(({ day, items: dayItems }) => {
            const isToday = isSameDay(day, new Date());
            const count = dayItems.length;
            const hasItems = count > 0;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => hasItems && setOpenDay(day)}
                disabled={!hasItems}
                data-testid={`week-strip-day-${format(day, "yyyy-MM-dd")}`}
                className={`flex flex-col items-center rounded-2xl border p-1.5 text-center transition sm:p-2 ${
                  isToday
                    ? "border-[#4A5D23]/40 bg-[#EAF3EF]"
                    : hasItems
                      ? "border-stone-200 bg-white hover:border-[#B8683D]/40 hover:bg-[#FBF1DE]/40"
                      : "border-stone-100 bg-stone-50/50"
                } ${hasItems ? "cursor-pointer active:scale-95" : "cursor-default opacity-70"}`}
              >
                <span className={`text-[9px] font-semibold uppercase tracking-widest sm:text-[10px] ${
                  isToday ? "text-[#2E5A47]" : "text-stone-500"
                }`}>
                  {format(day, "EEE", { locale: it })}
                </span>
                <span className={`font-display text-lg font-bold sm:text-xl ${
                  isToday ? "text-[#2E5A47]" : "text-stone-800"
                }`}>
                  {format(day, "d")}
                </span>
                {hasItems ? (
                  <span className={`mt-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:text-[10px] ${
                    isToday
                      ? "bg-[#2E5A47] text-white"
                      : "bg-[#B8683D] text-white"
                  }`}>
                    {count}
                  </span>
                ) : (
                  <span className="mt-0.5 text-[9px] text-stone-300">—</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <DayAppointmentsDialog
        open={!!openDay}
        onOpenChange={(v) => { if (!v) setOpenDay(null); }}
        day={openDay}
        items={selectedItems}
      />
    </>
  );
}
