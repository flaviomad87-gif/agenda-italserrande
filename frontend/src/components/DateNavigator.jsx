import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format, addDays, subDays, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { isoDate } from "../lib/utils";

export default function DateNavigator({ value, onChange }) {
  const date = value ? parseISO(value) : new Date();

  const prev = () => onChange(isoDate(subDays(date, 1)));
  const next = () => onChange(isoDate(addDays(date, 1)));

  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={prev}
        data-testid="agenda-prev-day-button"
        aria-label="Giorno precedente"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/70 bg-white shadow-sm transition hover:bg-stone-50 active:scale-95"
      >
        <ChevronLeft className="h-5 w-5 text-stone-700" />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="agenda-date-picker-trigger"
            className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl bg-transparent px-3 py-1 transition hover:bg-white"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {format(date, "EEEE", { locale: it })}
            </span>
            <span className="font-display text-2xl font-bold leading-tight tracking-tight">
              {format(date, "d MMMM yyyy", { locale: it })}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onChange(isoDate(d))}
            locale={it}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={next}
        data-testid="agenda-next-day-button"
        aria-label="Giorno successivo"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/70 bg-white shadow-sm transition hover:bg-stone-50 active:scale-95"
      >
        <ChevronRight className="h-5 w-5 text-stone-700" />
      </button>
    </div>
  );
}

export { CalendarIcon };
