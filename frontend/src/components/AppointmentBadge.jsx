import { CalendarClock } from "lucide-react";
import { formatAppointmentBadge } from "../lib/utils";

/**
 * Badge che mostra l'appuntamento con il cliente in modo evidente sulla card.
 * Compare solo se c'è una data (appointment_at) o una nota (appointment_note).
 *
 * Props:
 *  - client: oggetto cliente con appointment_at (ISO) e appointment_note (string)
 *  - compact: se true, badge inline più piccolo (per liste dense)
 */
export default function AppointmentBadge({ client, compact = false, testId }) {
  if (!client) return null;
  const dateLabel = formatAppointmentBadge(client.appointment_at);
  const note = (client.appointment_note || "").trim();
  if (!dateLabel && !note) return null;

  if (compact) {
    return (
      <span
        data-testid={testId || "appointment-badge"}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EF] px-2.5 py-1 text-xs font-semibold text-[#2E5A47]"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        {dateLabel || note}
      </span>
    );
  }

  return (
    <div
      data-testid={testId || "appointment-badge"}
      className="mt-2 flex items-start gap-2 rounded-xl border border-[#2E5A47]/20 bg-[#EAF3EF] px-3 py-2"
    >
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#2E5A47]" />
      <div className="min-w-0 flex-1">
        {dateLabel && (
          <div className="text-sm font-semibold text-[#2E5A47]">
            Appuntamento · {dateLabel}
          </div>
        )}
        {note && (
          <div className={`text-xs text-[#2E5A47]/80 ${dateLabel ? "mt-0.5" : ""}`}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
