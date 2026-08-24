/**
 * Utility per gestione ore lavoro / banca ore.
 */

/** Converte "HH:MM" in minuti dall'inizio del giorno. */
export const timeToMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Converte ISO datetime string in "HH:MM". */
export const isoToTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 5);
};

/** Costruisce ISO datetime da una data (YYYY-MM-DD) + orario ("HH:MM"). */
export const buildIso = (date, time) => {
  if (!date || !time) return null;
  // Costruisce data locale per evitare shift timezone
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const d = new Date(Y, (M || 1) - 1, D || 1, h || 0, m || 0, 0, 0);
  return d.toISOString();
};

/** Minuti lavorati in una entry (clock_out − clock_in − pausa). */
export const workedMinutes = (entry) => {
  if (!entry?.clock_in || !entry?.clock_out) return 0;
  const inD = new Date(entry.clock_in);
  const outD = new Date(entry.clock_out);
  if (isNaN(inD.getTime()) || isNaN(outD.getTime())) return 0;
  const diff = Math.max(0, (outD.getTime() - inD.getTime()) / 60000);
  const withBreak = diff - (entry.break_minutes || 0);
  return Math.max(0, Math.round(withBreak));
};

/** Formatta minuti come "8h 15'" (o "-1h 30'" con segno). */
export const formatMinutes = (mins, { withSign = false } = {}) => {
  const sign = mins < 0 ? "-" : withSign ? "+" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0 && m === 0) return "0h";
  if (m === 0) return `${sign}${h}h`;
  if (h === 0) return `${sign}${m}'`;
  return `${sign}${h}h ${String(m).padStart(2, "0")}'`;
};

/** Delta giornaliero: ore lavorate − ore contrattuali (in minuti). */
export const dayDelta = (entry, dailyHours) => {
  const worked = workedMinutes(entry);
  if (worked === 0) return 0;
  return worked - Math.round((dailyHours || 8) * 60);
};

/** Stato corrente del dipendente in base all'entry di oggi. */
export const employeeStatusToday = (entry) => {
  if (!entry) return "off"; // a casa
  if (entry.clock_in && !entry.clock_out) return "working";
  if (entry.clock_in && entry.clock_out) return "done";
  return "off";
};
