import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Clock, Play, StopCircle, CheckCircle2, Loader2, Home } from "lucide-react";
import {
  isoToTime, buildIso, workedMinutes, formatMinutes, employeeStatusToday,
} from "../lib/hours";
import { isoDate } from "../lib/utils";
import { Link } from "react-router-dom";

/**
 * Widget in cima ad Agenda: mostra stato di OGGI per ogni dipendente e
 * permette di timbrare ingresso/uscita in blocco.
 * Il dialog consente di modificare gli orari (default: adesso) e la pausa.
 */
export default function TimeTrackerWidget() {
  const today = isoDate();
  const [employees, setEmployees] = useState([]);
  const [todayEntries, setTodayEntries] = useState({}); // employee_id -> entry
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("in"); // "in" | "out"
  const [dialogRows, setDialogRows] = useState([]); // [{employee, time, breakMinutes}]

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, entRes] = await Promise.all([
        api.get("/employees"),
        api.get(`/time-entries?date=${today}`),
      ]);
      const emps = (empRes.data || []).filter((e) => e.active !== false);
      setEmployees(emps);
      const map = {};
      (entRes.data || []).forEach((e) => { map[e.employee_id] = e; });
      setTodayEntries(map);
    } catch (e) {
      // silenzio: se la rete e' giu' il widget resta com'era
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { refresh(); }, [refresh]);

  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const openInDialog = () => {
    const toClockIn = employees.filter((e) => !todayEntries[e.id]);
    if (toClockIn.length === 0) {
      toast.info("Tutti i dipendenti hanno già timbrato ingresso oggi.");
      return;
    }
    setDialogMode("in");
    setDialogRows(toClockIn.map((emp) => ({
      employee: emp,
      selected: true,
      time: emp.default_clock_in || "08:00",
      breakMinutes: emp.default_break_minutes ?? 60,
    })));
    setDialogOpen(true);
  };

  const openOutDialog = () => {
    const working = employees.filter((e) => {
      const entry = todayEntries[e.id];
      return entry && entry.clock_in && !entry.clock_out;
    });
    if (working.length === 0) {
      toast.info("Nessun dipendente al lavoro al momento.");
      return;
    }
    setDialogMode("out");
    setDialogRows(working.map((emp) => {
      const entry = todayEntries[emp.id];
      return {
        employee: emp,
        entry,
        selected: true,
        time: emp.default_clock_out || "17:00",
        breakMinutes: entry.break_minutes ?? emp.default_break_minutes ?? 60,
      };
    }));
    setDialogOpen(true);
  };

  const submit = async () => {
    const rows = dialogRows.filter((r) => r.selected);
    if (rows.length === 0) { setDialogOpen(false); return; }
    try {
      for (const r of rows) {
        if (dialogMode === "in") {
          await api.post("/time-entries", {
            employee_id: r.employee.id,
            date: today,
            clock_in: buildIso(today, r.time),
            break_minutes: r.breakMinutes,
          });
        } else {
          await api.put(`/time-entries/${r.entry.id}`, {
            clock_out: buildIso(today, r.time),
            break_minutes: r.breakMinutes,
          });
        }
      }
      toast.success(dialogMode === "in" ? "Ingresso registrato" : "Uscita registrata");
      setDialogOpen(false);
      refresh();
    } catch (e) {
      toast.error("Errore nella timbratura. Riprova.");
    }
  };

  if (loading && employees.length === 0) {
    return null; // non ingombrare l'Agenda durante il primo caricamento
  }

  if (employees.length === 0) return null;

  const anyWorking = employees.some((e) => {
    const en = todayEntries[e.id];
    return en && en.clock_in && !en.clock_out;
  });
  const anyOff = employees.some((e) => !todayEntries[e.id]);

  return (
    <>
      <section
        data-testid="time-tracker-widget"
        className="rounded-3xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#4A5D23]" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Ore lavoro · oggi
            </span>
          </div>
          <Link
            to="/ore-lavoro"
            data-testid="tracker-open-report"
            className="text-xs font-semibold text-[#4A5D23] hover:underline"
          >
            Resoconto →
          </Link>
        </div>

        <ul className="space-y-2">
          {employees.map((emp) => {
            const entry = todayEntries[emp.id];
            const state = employeeStatusToday(entry);
            return (
              <li
                key={emp.id}
                data-testid={`tracker-row-${emp.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl bg-stone-50/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-800">{emp.name}</div>
                  <div className={`mt-0.5 text-xs ${
                    state === "working" ? "text-[#2E5A47]" :
                    state === "done" ? "text-stone-500" : "text-stone-400"
                  }`}>
                    {state === "working" && entry.clock_in && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2E5A47]"></span>
                        Al lavoro da {isoToTime(entry.clock_in)}
                      </span>
                    )}
                    {state === "done" && (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {isoToTime(entry.clock_in)}–{isoToTime(entry.clock_out)} · {formatMinutes(workedMinutes(entry))}
                      </span>
                    )}
                    {state === "off" && (
                      <span className="inline-flex items-center gap-1">
                        <Home className="h-3 w-3" /> A casa
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          {anyOff && (
            <button
              type="button"
              onClick={openInDialog}
              data-testid="tracker-clock-in-button"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#4A5D23] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3C4B1C] active:scale-95"
            >
              <Play className="h-4 w-4" /> Timbra ingresso
            </button>
          )}
          {anyWorking && (
            <button
              type="button"
              onClick={openOutDialog}
              data-testid="tracker-clock-out-button"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#B8683D] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9E5730] active:scale-95"
            >
              <StopCircle className="h-4 w-4" /> Timbra uscita
            </button>
          )}
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-md rounded-3xl border-stone-200/70 bg-white p-6"
          data-testid="tracker-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {dialogMode === "in" ? "Timbra ingresso" : "Timbra uscita"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            {dialogRows.map((r, idx) => (
              <div
                key={r.employee.id}
                className={`rounded-2xl border p-3 transition ${
                  r.selected ? "border-[#4A5D23]/40 bg-[#EAF3EF]/40" : "border-stone-200 bg-stone-50"
                }`}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => {
                      const nr = [...dialogRows];
                      nr[idx].selected = e.target.checked;
                      setDialogRows(nr);
                    }}
                    className="h-4 w-4 rounded border-stone-300"
                    data-testid={`tracker-select-${r.employee.id}`}
                  />
                  <span className="font-semibold text-stone-800">{r.employee.name}</span>
                </label>
                {r.selected && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-stone-600">
                      {dialogMode === "in" ? "Ingresso" : "Uscita"}
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) => {
                          const nr = [...dialogRows];
                          nr[idx].time = e.target.value;
                          setDialogRows(nr);
                        }}
                        className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
                        data-testid={`tracker-time-${r.employee.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nr = [...dialogRows];
                          nr[idx].time = nowTime();
                          setDialogRows(nr);
                        }}
                        data-testid={`tracker-now-${r.employee.id}`}
                        className="rounded-full border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        Adesso
                      </button>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-stone-600">
                      Pausa (min)
                      <input
                        type="number"
                        min="0"
                        max="240"
                        step="15"
                        value={r.breakMinutes}
                        onChange={(e) => {
                          const nr = [...dialogRows];
                          nr[idx].breakMinutes = Number(e.target.value) || 0;
                          setDialogRows(nr);
                        }}
                        className="h-9 w-16 rounded-lg border border-stone-300 bg-white px-2 text-sm tabular-nums"
                        data-testid={`tracker-break-${r.employee.id}`}
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={submit}
                data-testid="tracker-confirm-button"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#4A5D23] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3C4B1C]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Conferma
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
