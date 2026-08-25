import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import {
  Users, Printer, Plus, Pencil, Trash2, Save, X, Clock, Loader2, CheckCircle2,
} from "lucide-react";
import { format, parseISO, isValid, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { it } from "date-fns/locale";
import {
  isoToTime, buildIso, workedMinutes, formatMinutes, dayDelta,
} from "../lib/hours";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export default function OreLavoro() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);

  const firstDay = useMemo(() => startOfMonth(new Date(year, month - 1, 1)), [year, month]);
  const lastDay = useMemo(() => endOfMonth(firstDay), [firstDay]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, entRes] = await Promise.all([
        api.get("/employees"),
        api.get(`/time-entries?from_date=${isoDate(firstDay)}&to_date=${isoDate(lastDay)}`),
      ]);
      setEmployees(empRes.data || []);
      setEntries(entRes.data || []);
    } catch (e) {
      setEmployees([]); setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [firstDay, lastDay]);

  useEffect(() => { refresh(); }, [refresh]);

  const days = useMemo(() => eachDayOfInterval({ start: firstDay, end: lastDay }), [firstDay, lastDay]);

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const activeEmployees = employees.filter((e) => e.active !== false);

  const entriesByEmpDate = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      map.set(`${e.employee_id}|${e.date}`, e);
    });
    return map;
  }, [entries]);

  const bankPerEmployee = useMemo(() => {
    return activeEmployees.map((emp) => {
      let total = 0;
      let workedTotal = 0;
      let workedDays = 0;
      days.forEach((d) => {
        const key = `${emp.id}|${isoDate(d)}`;
        const en = entriesByEmpDate.get(key);
        if (en && en.clock_in && en.clock_out) {
          const w = workedMinutes(en);
          workedTotal += w;
          workedDays += 1;
          total += dayDelta(en, emp.daily_hours);
        }
      });
      return { emp, deltaMinutes: total, workedTotal, workedDays };
    });
  }, [activeEmployees, days, entriesByEmpDate]);

  return (
    <>
      <OreLavoroPrintStyles />
      <div className="space-y-4 fade-in">
        <header className="no-print">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Banca ore · report mensile
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Ore Lavoro
          </h1>
        </header>

        <div className="no-print flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            data-testid="ore-month-select"
            className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
          >
            {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            data-testid="ore-year-select"
            className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setManaging(true)}
            data-testid="ore-manage-employees"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Users className="h-4 w-4" /> Dipendenti
          </button>
          <button
            onClick={() => window.print()}
            data-testid="ore-print-button"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-black"
          >
            <Printer className="h-4 w-4" /> Stampa
          </button>
        </div>

        <article className="ore-sheet mx-auto max-w-[210mm] bg-white p-4 shadow-sm sm:p-8">
          <div className="ore-header pb-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-500">
              Report ore · Italserrande
            </div>
            <h2 className="font-display text-3xl font-bold leading-none capitalize tracking-tight text-stone-900 sm:text-4xl">
              {MONTHS[month - 1]} {year}
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>
          ) : activeEmployees.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-10 text-center text-sm text-stone-500">
              <Users className="mx-auto mb-2 h-6 w-6 text-stone-400" />
              Nessun dipendente attivo. Aggiungine uno dal pulsante <b>Dipendenti</b>.
            </div>
          ) : (
            <>
              {/* Banca ore riepilogo */}
              <section className="mt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {bankPerEmployee.map(({ emp, deltaMinutes, workedTotal, workedDays }) => {
                    const absMin = Math.abs(deltaMinutes);
                    let actionLabel = "In pari con le ore contrattuali.";
                    let actionColor = "text-stone-500";
                    if (deltaMinutes > 0) {
                      actionLabel = `Ha lavorato ${formatMinutes(absMin)} in più · può recuperare`;
                      actionColor = "text-[#2E5A47]";
                    } else if (deltaMinutes < 0) {
                      actionLabel = `Deve lavorare ${formatMinutes(absMin)} in più per recuperare`;
                      actionColor = "text-red-600";
                    }
                    return (
                      <div
                        key={emp.id}
                        data-testid={`ore-bank-${emp.id}`}
                        className={`rounded-2xl border p-4 ${
                          deltaMinutes > 0
                            ? "border-[#4A5D23]/30 bg-[#EAF3EF]/40"
                            : deltaMinutes < 0
                              ? "border-red-200 bg-red-50/40"
                              : "border-stone-200 bg-stone-50/60"
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                          {emp.name}
                        </div>
                        <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                          deltaMinutes > 0 ? "text-[#2E5A47]" : deltaMinutes < 0 ? "text-red-600" : "text-stone-500"
                        }`}>
                          {formatMinutes(deltaMinutes, { withSign: true })}
                        </div>
                        <div className={`mt-1 text-xs font-semibold ${actionColor}`} data-testid={`ore-action-${emp.id}`}>
                          {actionLabel}
                        </div>
                        <div className="mt-2 text-[11px] text-stone-500">
                          {workedDays} {workedDays === 1 ? "giornata" : "giornate"} · {formatMinutes(workedTotal)} lavorate · base {emp.daily_hours}h/g
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Calendario dettagliato per ogni dipendente */}
              {activeEmployees.map((emp) => (
                <section key={emp.id} className="ore-emp-section mt-6">
                  <div className="ore-emp-header">
                    <span className="ore-emp-name">{emp.name}</span>
                    <span className="ore-emp-base">Base: {emp.daily_hours}h/g</span>
                  </div>
                  <div className="ore-cols ore-cols-head">
                    <div>Giorno</div>
                    <div>Ingresso</div>
                    <div>Uscita</div>
                    <div>Pausa</div>
                    <div>Lavorate</div>
                    <div>Delta</div>
                    <div className="no-print">Azioni</div>
                  </div>
                  {days.map((d) => {
                    const dateIso = isoDate(d);
                    const key = `${emp.id}|${dateIso}`;
                    const entry = entriesByEmpDate.get(key);
                    const isWk = isWeekend(d);
                    return (
                      <DayRow
                        key={key}
                        day={d}
                        dateIso={dateIso}
                        entry={entry}
                        employee={emp}
                        isWk={isWk}
                        onChange={refresh}
                      />
                    );
                  })}
                </section>
              ))}
            </>
          )}
        </article>
      </div>

      <EmployeesDialog
        open={managing}
        onOpenChange={setManaging}
        employees={employees}
        onChanged={refresh}
      />
    </>
  );
}

function DayRow({ day, dateIso, entry, employee, isWk, onChange }) {
  const [editing, setEditing] = useState(false);
  const [inTime, setInTime] = useState(entry?.clock_in ? isoToTime(entry.clock_in) : "");
  const [outTime, setOutTime] = useState(entry?.clock_out ? isoToTime(entry.clock_out) : "");
  const [breakMin, setBreakMin] = useState(entry?.break_minutes ?? employee.default_break_minutes ?? 60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInTime(entry?.clock_in ? isoToTime(entry.clock_in) : "");
    setOutTime(entry?.clock_out ? isoToTime(entry.clock_out) : "");
    setBreakMin(entry?.break_minutes ?? employee.default_break_minutes ?? 60);
  }, [entry, employee.default_break_minutes]);

  const worked = entry ? workedMinutes(entry) : 0;
  const delta = entry ? dayDelta(entry, employee.daily_hours) : 0;

  const save = async () => {
    if (!inTime && !outTime) {
      // Cancella la entry se esiste (utente ha svuotato entrambi)
      if (entry) {
        setSaving(true);
        try {
          await api.delete(`/time-entries/${entry.id}`);
          toast.success("Timbratura eliminata");
          onChange();
        } catch { toast.error("Errore"); }
        finally { setSaving(false); setEditing(false); }
      } else {
        setEditing(false);
      }
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clock_in: inTime ? buildIso(dateIso, inTime) : null,
        clock_out: outTime ? buildIso(dateIso, outTime) : null,
        break_minutes: breakMin,
      };
      if (entry) {
        await api.put(`/time-entries/${entry.id}`, payload);
      } else {
        await api.post("/time-entries", {
          employee_id: employee.id,
          date: dateIso,
          ...payload,
        });
      }
      toast.success("Salvato");
      setEditing(false);
      onChange();
    } catch (e) {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!window.confirm("Cancellare questa giornata?")) return;
    setSaving(true);
    try {
      await api.delete(`/time-entries/${entry.id}`);
      toast.success("Eliminata");
      onChange();
    } catch { toast.error("Errore"); }
    finally { setSaving(false); }
  };

  const dayLabel = format(day, "EEE d", { locale: it });

  if (editing) {
    return (
      <div className={`ore-row ore-row-editing ${isWk ? "ore-row-weekend" : ""}`} data-testid={`ore-row-${employee.id}-${dateIso}`}>
        <div className="ore-cell-day">{dayLabel}</div>
        <div><input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} className="h-8 w-full rounded border border-stone-300 px-1 text-xs" data-testid={`ore-in-${employee.id}-${dateIso}`} /></div>
        <div><input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="h-8 w-full rounded border border-stone-300 px-1 text-xs" data-testid={`ore-out-${employee.id}-${dateIso}`} /></div>
        <div><input type="number" min="0" max="240" step="15" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 0)} className="h-8 w-full rounded border border-stone-300 px-1 text-xs tabular-nums" /></div>
        <div className="ore-cell-mut">—</div>
        <div className="ore-cell-mut">—</div>
        <div className="no-print flex gap-1">
          <button onClick={save} disabled={saving} className="rounded bg-[#4A5D23] p-1 text-white" data-testid={`ore-save-${employee.id}-${dateIso}`}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setEditing(false)} className="rounded border border-stone-300 p-1"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ore-row ${isWk ? "ore-row-weekend" : ""} ${!entry ? "ore-row-empty" : ""}`} data-testid={`ore-row-${employee.id}-${dateIso}`}>
      <div className="ore-cell-day">{dayLabel}</div>
      <div className="tabular-nums">{entry?.clock_in ? isoToTime(entry.clock_in) : "—"}</div>
      <div className="tabular-nums">{entry?.clock_out ? isoToTime(entry.clock_out) : "—"}</div>
      <div className="tabular-nums">{entry ? `${entry.break_minutes ?? 60}'` : "—"}</div>
      <div className="tabular-nums font-semibold">{worked > 0 ? formatMinutes(worked) : "—"}</div>
      <div className={`tabular-nums font-semibold ${delta > 0 ? "text-[#2E5A47]" : delta < 0 ? "text-red-600" : "text-stone-500"}`}>
        {entry?.clock_in && entry?.clock_out ? formatMinutes(delta, { withSign: true }) : "—"}
      </div>
      <div className="no-print flex gap-1">
        <button onClick={() => setEditing(true)} data-testid={`ore-edit-${employee.id}-${dateIso}`} className="rounded border border-stone-300 p-1 hover:bg-stone-50">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {entry && (
          <button onClick={remove} className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50" data-testid={`ore-delete-${employee.id}-${dateIso}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmployeesDialog({ open, onOpenChange, employees, onChanged }) {
  const [newName, setNewName] = useState("");
  const [newHours, setNewHours] = useState(8);

  if (!open) return null;

  const create = async () => {
    if (!newName.trim()) { toast.error("Nome richiesto"); return; }
    try {
      await api.post("/employees", { name: newName.trim(), daily_hours: newHours || 8 });
      toast.success("Dipendente aggiunto");
      setNewName(""); setNewHours(8);
      onChanged();
    } catch { toast.error("Errore"); }
  };

  // Salva solo su blur / change (per number). Evita 15 PUT ad ogni keystroke.
  const commitField = async (emp, patch, valueChanged) => {
    if (!valueChanged) return;
    try {
      await api.put(`/employees/${emp.id}`, patch);
      onChanged();
    } catch { toast.error("Errore"); }
  };

  const remove = async (emp) => {
    if (!window.confirm(`Rimuovere ${emp.name}? Le timbrature storiche resteranno.`)) return;
    try {
      await api.delete(`/employees/${emp.id}`);
      toast.success("Rimosso");
      onChanged();
    } catch { toast.error("Errore"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)} data-testid="employees-dialog">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Dipendenti</h2>
          <button onClick={() => onOpenChange(false)} className="rounded-full p-1 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        <ul className="mt-3 space-y-2">
          {employees.map((emp) => (
            <li key={emp.id} className="rounded-2xl border border-stone-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={emp.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== emp.name) commitField(emp, { name: v }, true);
                  }}
                  className="flex-1 border-b border-stone-200 bg-transparent text-sm font-semibold text-stone-800 focus:outline-none focus:border-[#4A5D23]"
                  data-testid={`emp-name-${emp.id}`}
                />
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    step="0.5"
                    defaultValue={emp.daily_hours}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 8;
                      if (v !== emp.daily_hours) commitField(emp, { daily_hours: v }, true);
                    }}
                    className="h-8 w-16 rounded border border-stone-300 px-2 text-sm tabular-nums"
                    data-testid={`emp-hours-${emp.id}`}
                  /> h/g
                </label>
                <button onClick={() => remove(emp)} className="rounded p-1 text-red-600 hover:bg-red-50" data-testid={`emp-delete-${emp.id}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <label className="flex items-center gap-1.5">
                  Ingresso
                  <input
                    type="time"
                    defaultValue={emp.default_clock_in || "08:00"}
                    onBlur={(e) => {
                      const v = e.target.value || "08:00";
                      if (v !== (emp.default_clock_in || "08:00")) commitField(emp, { default_clock_in: v }, true);
                    }}
                    className="h-8 rounded border border-stone-300 px-2 text-sm tabular-nums"
                    data-testid={`emp-in-${emp.id}`}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Uscita
                  <input
                    type="time"
                    defaultValue={emp.default_clock_out || "17:00"}
                    onBlur={(e) => {
                      const v = e.target.value || "17:00";
                      if (v !== (emp.default_clock_out || "17:00")) commitField(emp, { default_clock_out: v }, true);
                    }}
                    className="h-8 rounded border border-stone-300 px-2 text-sm tabular-nums"
                    data-testid={`emp-out-${emp.id}`}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Pausa
                  <input
                    type="number"
                    min="0"
                    max="240"
                    step="15"
                    defaultValue={emp.default_break_minutes ?? 60}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 60;
                      if (v !== (emp.default_break_minutes ?? 60)) commitField(emp, { default_break_minutes: v }, true);
                    }}
                    className="h-8 w-14 rounded border border-stone-300 px-2 text-sm tabular-nums"
                    data-testid={`emp-break-${emp.id}`}
                  />
                  min
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-2xl border border-dashed border-stone-300 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Aggiungi dipendente</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome e cognome"
              className="h-9 flex-1 rounded-lg border border-stone-300 px-2 text-sm"
              data-testid="emp-new-name"
            />
            <input
              type="number"
              min="1" max="12" step="0.5"
              value={newHours}
              onChange={(e) => setNewHours(Number(e.target.value) || 8)}
              className="h-9 w-16 rounded-lg border border-stone-300 px-2 text-sm tabular-nums"
              data-testid="emp-new-hours"
            />
            <button onClick={create} className="rounded-lg bg-[#4A5D23] px-3 py-2 text-sm font-semibold text-white" data-testid="emp-new-submit">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OreLavoroPrintStyles() {
  return (
    <style>{`
      .ore-sheet { font-family: Georgia, 'Times New Roman', serif; color: #111; }
      .ore-header { border-bottom: 2px solid #111; }

      .ore-emp-section { break-inside: auto; }
      .ore-emp-header {
        display: flex; align-items: baseline; gap: 0.75rem;
        margin-top: 0.75rem; padding: 0.25rem 0.25rem 0.2rem;
        border-bottom: 1.5px solid #111;
        break-after: avoid; page-break-after: avoid;
      }
      .ore-emp-name { font-family: Georgia, serif; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
      .ore-emp-base { margin-left: auto; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #666; }

      .ore-cols {
        display: grid;
        grid-template-columns: 4.5rem 4rem 4rem 3.5rem 4rem 4rem 4rem;
        gap: 0.4rem;
        align-items: center;
      }
      .ore-cols-head {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
        color: #666; padding: 0.35rem 0.2rem; border-bottom: 1px solid #111;
      }
      .ore-row {
        display: grid;
        grid-template-columns: 4.5rem 4rem 4rem 3.5rem 4rem 4rem 4rem;
        gap: 0.4rem;
        align-items: center;
        padding: 0.35rem 0.2rem;
        border-bottom: 1px solid #e5e5e5;
        font-family: Georgia, serif;
        font-size: 12px;
        break-inside: avoid;
      }
      .ore-row-weekend { background-color: #fafafa; }
      .ore-row-empty { color: #a3a3a3; }
      .ore-row-editing { background-color: #fef9e7; }
      .ore-cell-day { text-transform: capitalize; font-weight: 600; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; }
      .ore-cell-mut { color: #a3a3a3; }

      @media (max-width: 639px) {
        .ore-cols-head { display: none; }
        .ore-row {
          grid-template-columns: 1fr auto;
          gap: 0.15rem 0.5rem;
          padding: 0.55rem 0.35rem;
          font-size: 11.5px;
        }
        .ore-row > div:nth-child(1) { /* giorno */
          grid-column: 1 / 2;
          font-size: 12px; font-weight: 700;
        }
        .ore-row > div:nth-child(6) { /* delta a destra della prima riga */
          grid-column: 2 / 3;
          text-align: right;
          font-size: 13px;
        }
        .ore-row > div:nth-child(2)::before { content: "In "; color: #9a9a9a; font-size: 10px; }
        .ore-row > div:nth-child(3)::before { content: "Out "; color: #9a9a9a; font-size: 10px; }
        .ore-row > div:nth-child(4)::before { content: "Pausa "; color: #9a9a9a; font-size: 10px; }
        .ore-row > div:nth-child(5)::before { content: "Lav "; color: #9a9a9a; font-size: 10px; }
        .ore-row > div:nth-child(2),
        .ore-row > div:nth-child(3),
        .ore-row > div:nth-child(4),
        .ore-row > div:nth-child(5) {
          grid-column: auto;
          display: inline-flex;
          gap: 0.15rem;
          align-items: baseline;
        }
        .ore-row > div:nth-child(2) { grid-column: 1 / 2; }
        .ore-row > div:nth-child(3) { grid-column: 2 / 3; justify-content: flex-end; }
        .ore-row > div:nth-child(4) { grid-column: 1 / 2; }
        .ore-row > div:nth-child(5) { grid-column: 2 / 3; justify-content: flex-end; }
        .ore-row > div:nth-child(7) { /* azioni */
          grid-column: 1 / -1;
          margin-top: 0.15rem;
          justify-content: flex-end;
        }
        .ore-row-editing {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media print {
        @page { margin: 12mm 10mm; }
        html, body { background: #fff !important; }
        .ore-cols, .ore-row {
          grid-template-columns: 4.5rem 4rem 4rem 3.5rem 4rem 4rem !important;
        }
        .ore-sheet {
          box-shadow: none !important;
          padding: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
        }
        .ore-sheet, .ore-sheet * {
          color: #000 !important;
          background: #fff !important;
          box-shadow: none !important;
        }
        .ore-header, .ore-emp-header, .ore-cols-head { border-bottom-color: #000 !important; }
        .ore-row { border-bottom-color: #888 !important; }
      }
    `}</style>
  );
}
