import { useEffect, useMemo, useState } from "react";
import { apiGetWithCache } from "../lib/api";
import { formatEUR, computeWithVat, computeClientBalance } from "../lib/utils";
import { format, parseISO, addDays, startOfWeek, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlarmClock } from "lucide-react";
import { toast } from "sonner";

const ymd = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export default function WeekView({ baseDate, onPickDay, onPickClient }) {
  const monday = useMemo(
    () => startOfWeek(parseISO(`${baseDate}T00:00:00`), { weekStartsOn: 1 }),
    [baseDate],
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const from = ymd(days[0]);
  const to = ymd(days[6]);

  useEffect(() => {
    const c = apiGetWithCache(`/clients`, { from_date: from, to_date: to });
    if (c.cached) setClients(c.cached);
    setLoading(!c.cached);
    c.fresh
      .then((data) => setClients(data || []))
      .catch(() => {
        if (!c.cached) toast.error("Impossibile caricare la settimana");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const byDay = useMemo(() => {
    const m = new Map();
    days.forEach((d) => m.set(ymd(d), []));
    clients.forEach((c) => {
      if (m.has(c.date)) m.get(c.date).push(c);
    });
    return m;
  }, [clients, days]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekTotal = clients.reduce((s, c) => {
    const { gross, hasWithholding, toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
    return s + (hasWithholding ? toCollect : gross);
  }, 0);

  const shiftWeek = (delta) => {
    onPickDay(ymd(addDays(monday, delta * 7)));
  };

  const monthLabel = format(monday, "MMMM yyyy", { locale: it });
  const rangeLabel = `${format(monday, "d MMM", { locale: it })} – ${format(days[6], "d MMM", { locale: it })}`;

  return (
    <div className="space-y-4" data-testid="week-view">
      {/* Range navigator */}
      <div className="flex items-center justify-between rounded-2xl border border-stone-200/60 bg-white px-3 py-2 shadow-sm">
        <button
          onClick={() => shiftWeek(-1)}
          data-testid="week-prev"
          aria-label="Settimana precedente"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-stone-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500 capitalize">
            {monthLabel}
          </div>
          <div className="font-display text-sm font-bold capitalize">{rangeLabel}</div>
        </div>
        <button
          onClick={() => shiftWeek(1)}
          data-testid="week-next"
          aria-label="Settimana successiva"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-stone-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Week summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Lavori settimana</div>
          <div className="mt-1 font-display text-2xl font-bold" data-testid="week-count">
            {clients.length}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Valore previsto</div>
          <div className="mt-1 font-display text-2xl font-bold" data-testid="week-total">
            {formatEUR(weekTotal)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : (
        <ul className="space-y-2 stagger">
          {days.map((d) => {
            const key = ymd(d);
            const list = byDay.get(key) || [];
            const isToday = isSameDay(d, today);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const dayTotal = list.reduce((s, c) => {
              const { gross, hasWithholding, toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
              return s + (hasWithholding ? toCollect : gross);
            }, 0);
            const isExpanded = expanded[key] !== false; // default expanded
            const visibleClients = isExpanded ? list : [];

            return (
              <li
                key={key}
                data-testid={`week-day-${key}`}
                className={`overflow-hidden rounded-2xl border shadow-sm transition ${
                  isToday
                    ? "border-[#4A5D23]/40 bg-[#F1F4EA]"
                    : list.length === 0
                    ? "border-stone-200/60 bg-white/80"
                    : "border-stone-200/60 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [key]: !isExpanded }))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  data-testid={`week-day-toggle-${key}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-12 w-14 flex-none flex-col items-center justify-center rounded-xl ${
                        isToday
                          ? "bg-[#4A5D23] text-white"
                          : isWeekend
                          ? "bg-stone-100 text-stone-500"
                          : "bg-stone-50 text-stone-700"
                      }`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest">
                        {format(d, "EEE", { locale: it })}
                      </span>
                      <span className="font-display text-lg font-bold leading-none">{format(d, "d")}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-800">
                        {list.length === 0
                          ? "Libero"
                          : `${list.length} ${list.length === 1 ? "lavoro" : "lavori"}`}
                      </div>
                      {list.length > 0 && (
                        <div className="text-xs text-stone-500">{formatEUR(dayTotal)}</div>
                      )}
                      {isToday && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#4A5D23] px-2 py-0.5 text-[10px] font-semibold text-white">
                          Oggi
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPickDay(key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPickDay(key);
                        }
                      }}
                      data-testid={`week-day-open-${key}`}
                      className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold text-[#4A5D23] hover:bg-stone-50"
                    >
                      Apri
                    </span>
                    {list.length > 0 &&
                      (isExpanded ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />)}
                  </div>
                </button>
                {visibleClients.length > 0 && (
                  <ul className="border-t border-stone-200/60 divide-y divide-stone-100">
                    {visibleClients.map((c) => {
                      const { gross, hasWithholding, toCollect } = computeWithVat(c.amount, c.vat_rate, c.withholding_rate);
                      const total = hasWithholding ? toCollect : gross;
                      const { isOpen, daysWaiting } = computeClientBalance(c);
                      return (
                        <li
                          key={c.id}
                          role="button"
                          onClick={() => onPickClient(c)}
                          data-testid={`week-client-${c.id}`}
                          className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm transition hover:bg-stone-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-stone-800">{c.name}</span>
                              <span
                                className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                  c.status === "lavoro_eseguito"
                                    ? "bg-[#EAF3EF] text-[#2E5A47]"
                                    : "bg-[#F8EBE4] text-[#B8683D]"
                                }`}
                              >
                                {c.status === "lavoro_eseguito" ? "Eseguito" : "Prev."}
                              </span>
                              {isOpen && daysWaiting >= 1 && (
                                <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-[#FBF1DE] px-1.5 py-0.5 text-[9px] font-semibold text-[#7A4F0A]">
                                  <AlarmClock className="h-2.5 w-2.5" /> {daysWaiting}g
                                </span>
                              )}
                            </div>
                            {c.address && (
                              <div className="truncate text-[11px] text-stone-500">{c.address}</div>
                            )}
                          </div>
                          <div className="flex-none text-right text-xs font-semibold text-stone-700 tabular-nums">
                            {total > 0 ? formatEUR(total) : "—"}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
