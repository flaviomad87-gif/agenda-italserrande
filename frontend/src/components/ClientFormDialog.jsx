import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { toast } from "sonner";
import { api, newUUID } from "../lib/api";
import { Trash2, Clock, CalendarCheck, Hourglass, Copy, CalendarClock, FileText, Receipt } from "lucide-react";
import { VAT_RATES, WITHHOLDING_RATES, computeWithVat, formatEUR } from "../lib/utils";
import PaymentsList from "./PaymentsList";
import MaterialsList from "./MaterialsList";
import { Switch } from "./ui/switch";
import { it } from "date-fns/locale";
import { format as formatDate } from "date-fns";

const empty = (date) => ({
  date,
  name: "",
  address: "",
  phone: "",
  notes: "",
  status: "preventivo",
  amount: "",
  vat_rate: "",
  withholding_rate: "",
  quote_number: "",
  payments: [],
  materials: [],
  pending: false,
  awaiting_materials: false,
  to_quote: false,
  to_invoice: false,
  appointment_at: "",
  appointment_note: "",
  estimated_materials_cost: "",
});

/** Migra i campi legacy (payment_method, invoice_number) in un singolo payment, una sola volta. */
const migrateLegacy = (data) => {
  if (!data) return data;
  const hasPayments = Array.isArray(data.payments) && data.payments.length > 0;
  if (hasPayments) return data;
  const legacyMethod = data.payment_method;
  const legacyInvoice = data.invoice_number;
  if (
    data.status === "lavoro_eseguito" &&
    (legacyMethod || legacyInvoice) &&
    parseFloat(data.amount) > 0
  ) {
    return {
      ...data,
      payments: [
        {
          type: "saldo",
          amount: data.amount,
          method: legacyMethod || "",
          invoice_number: legacyInvoice || "",
          date: data.date || "",
          notes: "",
        },
      ],
    };
  }
  return data;
};

export default function ClientFormDialog({ open, onOpenChange, date, initial, onSaved, onDeleted, onDuplicate, defaultPending = false, defaultAwaiting = false }) {
  const [form, setForm] = useState(empty(date));
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (open) {
      const base = empty(date);
      if (defaultPending && !initial) base.pending = true;
      if (defaultAwaiting && !initial) {
        base.pending = true;
        base.awaiting_materials = true;
      }
      setForm(initial ? { ...base, ...initial, amount: initial.amount ?? "" } : base);
    }
  }, [open, initial, date, defaultPending, defaultAwaiting]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Inserisci il nome del cliente");
      return;
    }
    const payments = (form.payments || [])
      .map((p) => ({
        ...p,
        amount: parseFloat(p.amount) || 0,
        date: p.date || form.date || date,
      }))
      .filter((p) => p.amount > 0 || p.invoice_number);
    const materials = (form.materials || [])
      .map((m) => ({
        ...m,
        amount: parseFloat(m.amount) || 0,
        date: m.date || form.date || date,
        source: m.source || "conto_aziendale",
      }))
      .filter((m) => m.amount > 0 || (m.description && m.description.trim()));
    const id = editing ? initial.id : newUUID();
    const payload = {
      ...form,
      id,
      amount: parseFloat(form.amount) || 0,
      vat_rate: form.vat_rate === "" || form.vat_rate === null ? null : parseFloat(form.vat_rate),
      withholding_rate: form.withholding_rate === "" || form.withholding_rate === null ? null : parseFloat(form.withholding_rate),
      date: form.date || date,
      payments,
      materials,
      pending: !!form.pending,
      awaiting_materials: !!form.awaiting_materials,
      to_quote: !!form.to_quote,
      to_invoice: !!form.to_invoice,
      appointment_at: form.appointment_at || null,
      appointment_note: (form.appointment_note || "").trim(),
      estimated_materials_cost: parseFloat(form.estimated_materials_cost) || 0,
      // Reset legacy fields once we use the new payments model
      payment_method: "",
      invoice_number: "",
    };
    // Optimistic UX: chiudi subito il dialog e aggiorna la lista.
    // La richiesta parte in background; in caso di errore reale dal server,
    // mostriamo un toast e (per le nuove creazioni) revertiamo l'inserimento.
    const optimistic = editing
      ? { ...initial, ...payload }
      : { ...payload, created_at: new Date().toISOString() };
    onSaved?.(optimistic);
    window.__refreshUnpaidBadge?.();
    window.__refreshPendingBadge?.();
    onOpenChange(false);
    try {
      const res = editing
        ? await api.put(`/clients/${id}`, payload)
        : await api.post(`/clients`, payload);
      // Riconcilia lo state con la versione server (campi calcolati dal backend).
      if (res?.data && !res._offline) {
        onSaved?.(res.data);
      }
      window.__refreshUnpaidBadge?.();
      window.__refreshPendingBadge?.();
    } catch (err) {
      toast.error("Errore durante il salvataggio. Riprova.");
      if (!editing) {
        // Rimuovi l'item aggiunto ottimisticamente
        onDeleted?.(id);
      }
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!window.confirm("Eliminare questo cliente?")) return;
    const id = initial.id;
    // Optimistic: rimuovi subito dall'UI e chiudi
    onDeleted?.(id);
    window.__refreshUnpaidBadge?.();
    window.__refreshPendingBadge?.();
    onOpenChange(false);
    try {
      await api.delete(`/clients/${id}`);
    } catch {
      toast.error("Impossibile eliminare. Aggiorna la pagina.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-stone-200/70 bg-white p-6 sm:max-w-lg"
        data-testid="client-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {editing ? "Modifica cliente" : "Nuovo cliente"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Toggle "Lavoro in attesa" — backlog Prossimi lavori */}
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
              form.pending
                ? "border-[#B8683D]/30 bg-[#FBF1DE]"
                : "border-stone-200/70 bg-stone-50"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {form.pending ? (
                <Clock className="mt-0.5 h-4 w-4 text-[#B8683D]" />
              ) : (
                <CalendarCheck className="mt-0.5 h-4 w-4 text-[#2E5A47]" />
              )}
              <div>
                <div className="text-sm font-semibold text-stone-800">
                  {form.pending ? "Lavoro in attesa" : "Lavoro in agenda"}
                </div>
                <div className="text-xs text-stone-500">
                  {form.pending
                    ? "Compare in 'Prossimi lavori', non nell'agenda del giorno."
                    : "Compare nell'agenda del giorno selezionato."}
                </div>
              </div>
            </div>
            <Switch
              checked={!!form.pending}
              onCheckedChange={(v) => update("pending", v)}
              data-testid="client-pending-switch"
              aria-label="Lavoro in attesa"
            />
          </div>
          {/* Toggle "Da preventivare" — sotto-stato di pending, mutuamente esclusivo con "In attesa materiali" */}
          {form.pending && (
            <div
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
                form.to_quote
                  ? "border-blue-400/40 bg-blue-50"
                  : "border-stone-200/70 bg-stone-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <FileText className={`mt-0.5 h-4 w-4 ${form.to_quote ? "text-blue-600" : "text-stone-500"}`} />
                <div>
                  <div className="text-sm font-semibold text-stone-800">
                    Da preventivare
                  </div>
                  <div className="text-xs text-stone-500">
                    {form.to_quote
                      ? "Compare nella pagina 'Da preventivare' finché non fai il preventivo."
                      : "Attiva dopo un sopralluogo, quando devi ancora preparare il preventivo."}
                  </div>
                </div>
              </div>
              <Switch
                checked={!!form.to_quote}
                onCheckedChange={(v) => {
                  update("to_quote", v);
                  if (v) update("awaiting_materials", false);
                }}
                data-testid="client-to-quote-switch"
                aria-label="Da preventivare"
              />
            </div>
          )}
          {/* Toggle "In attesa materiali" — sotto-stato di pending */}
          {form.pending && (
            <div
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
                form.awaiting_materials
                  ? "border-amber-400/40 bg-amber-50"
                  : "border-stone-200/70 bg-stone-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Hourglass className={`mt-0.5 h-4 w-4 ${form.awaiting_materials ? "text-amber-600" : "text-stone-500"}`} />
                <div>
                  <div className="text-sm font-semibold text-stone-800">
                    In attesa materiali
                  </div>
                  <div className="text-xs text-stone-500">
                    {form.awaiting_materials
                      ? "Compare nella pagina 'In attesa', riordinabile a mano."
                      : "Attiva se aspetti l'arrivo dei materiali prima di schedularlo."}
                  </div>
                </div>
              </div>
              <Switch
                checked={!!form.awaiting_materials}
                onCheckedChange={(v) => {
                  update("awaiting_materials", v);
                  if (v) update("to_quote", false);
                }}
                data-testid="client-awaiting-switch"
                aria-label="In attesa materiali"
              />
            </div>
          )}
          {/* Toggle "Da fatturare" — indipendente da pending, spuntabile in qualsiasi momento */}
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
              form.to_invoice
                ? "border-purple-400/40 bg-purple-50"
                : "border-stone-200/70 bg-stone-50"
            }`}
          >
              <div className="flex items-start gap-2.5">
                <Receipt className={`mt-0.5 h-4 w-4 ${form.to_invoice ? "text-purple-600" : "text-stone-500"}`} />
                <div>
                  <div className="text-sm font-semibold text-stone-800">
                    Da fatturare
                  </div>
                  <div className="text-xs text-stone-500">
                    {form.to_invoice
                      ? "Compare nella pagina 'Da fatturare' finché non emetti la fattura."
                      : "Spunta se devi ancora emettere la fattura per questo lavoro."}
                  </div>
                </div>
              </div>
              <Switch
                checked={!!form.to_invoice}
                onCheckedChange={(v) => update("to_invoice", v)}
                data-testid="client-to-invoice-switch"
                aria-label="Da fatturare"
              />
            </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Nome / Ragione sociale</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder=""
              className="mt-2 h-12 rounded-xl"
              data-testid="client-name-input"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Indirizzo</Label>
                {form.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="client-maps-link"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4A5D23] hover:underline"
                  >
                    Apri in Maps →
                  </a>
                )}
              </div>
              <Input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="Via, città"
                className="mt-2 h-12 rounded-xl"
                data-testid="client-address-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Telefono</Label>
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+39 ..."
                className="mt-2 h-12 rounded-xl"
                data-testid="client-phone-input"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Note</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Dettagli del lavoro, materiali, riferimenti..."
              rows={3}
              className="mt-2 rounded-xl"
              data-testid="client-notes-input"
            />
          </div>

          {/* Appuntamento con il cliente (opzionale). Mostrato in evidenza sulle card. */}
          <div className="rounded-2xl border border-[#2E5A47]/20 bg-[#EAF3EF]/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#2E5A47]">
              <CalendarClock className="h-4 w-4" /> Appuntamento (opzionale)
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                  Data e ora
                </Label>
                {(() => {
                  const raw = form.appointment_at || "";
                  const parsed = raw ? new Date(raw) : null;
                  const validDate = parsed && !isNaN(parsed.getTime()) ? parsed : null;
                  const timeStr = validDate
                    ? `${String(validDate.getHours()).padStart(2, "0")}:${String(validDate.getMinutes()).padStart(2, "0")}`
                    : "";
                  const dateBtnLabel = validDate
                    ? formatDate(validDate, "EEEE d MMMM yyyy", { locale: it })
                    : "Scegli giorno";
                  const setDatePart = (d) => {
                    if (!d) return;
                    const [hh, mm] = (timeStr || "09:00").split(":");
                    const next = new Date(d);
                    next.setHours(parseInt(hh || "9", 10), parseInt(mm || "0", 10), 0, 0);
                    // ISO senza timezone (yyyy-MM-ddTHH:mm) compatibile con datetime-local
                    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
                    update("appointment_at", iso);
                  };
                  const setTimePart = (t) => {
                    if (!t) return;
                    const base = validDate || new Date();
                    const [hh, mm] = t.split(":");
                    base.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
                    const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}T${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
                    update("appointment_at", iso);
                  };
                  return (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-testid="client-appointment-date-btn"
                            className="flex h-12 items-center justify-start rounded-xl border border-stone-200 bg-white px-3 text-left text-sm font-medium capitalize text-stone-700 hover:bg-stone-50"
                          >
                            <CalendarClock className="mr-2 h-4 w-4 text-[#2E5A47]" />
                            {dateBtnLabel}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={validDate || undefined}
                            onSelect={setDatePart}
                            locale={it}
                            weekStartsOn={1}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <Input
                        type="time"
                        value={timeStr}
                        onChange={(e) => setTimePart(e.target.value)}
                        className="h-12 rounded-xl"
                        data-testid="client-appointment-time"
                        disabled={!validDate}
                        placeholder="09:00"
                      />
                    </div>
                  );
                })()}
                {form.appointment_at && (() => {
                  const d = new Date(form.appointment_at);
                  if (isNaN(d.getTime())) return null;
                  const label = d.toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  });
                  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div
                      className="mt-1.5 text-xs font-semibold capitalize text-[#2E5A47]"
                      data-testid="client-appointment-preview"
                    >
                      {label} · ore {time}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                  Nota (es. &quot;pomeriggio&quot;)
                </Label>
                <Input
                  value={form.appointment_note || ""}
                  onChange={(e) => update("appointment_note", e.target.value)}
                  placeholder="Facoltativa"
                  className="mt-2 h-12 rounded-xl"
                  data-testid="client-appointment-note"
                />
              </div>
            </div>
            {(form.appointment_at || (form.appointment_note || "").trim()) && (
              <button
                type="button"
                onClick={() => {
                  update("appointment_at", "");
                  update("appointment_note", "");
                }}
                className="mt-2 text-xs font-semibold text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
                data-testid="client-appointment-clear"
              >
                Rimuovi appuntamento
              </button>
            )}
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">Stato</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update("status", "preventivo")}
                data-testid="status-preventivo-toggle"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.status === "preventivo"
                    ? "border-[#B8683D] bg-[#F8EBE4] text-[#8A4A28]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Preventivo
              </button>
              <button
                type="button"
                onClick={() => update("status", "lavoro_eseguito")}
                data-testid="status-eseguito-toggle"
                className={`h-12 rounded-xl border text-sm font-semibold transition ${
                  form.status === "lavoro_eseguito"
                    ? "border-[#2E5A47] bg-[#EAF3EF] text-[#234737]"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Lavoro eseguito
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                Imponibile (€)
              </Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                placeholder="0,00"
                className="mt-2 h-12 rounded-xl"
                data-testid="client-amount-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">IVA</Label>
              <Select
                value={form.vat_rate === null || form.vat_rate === undefined || form.vat_rate === "" ? "none" : String(form.vat_rate)}
                onValueChange={(v) => update("vat_rate", v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-2 h-12 rounded-xl" data-testid="client-vat-select">
                  <SelectValue placeholder="Senza IVA" />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r.label} value={r.value || "none"}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">
              Ritenuta d&apos;acconto
            </Label>
            <Select
              value={
                form.withholding_rate === null || form.withholding_rate === undefined || form.withholding_rate === ""
                  ? "none"
                  : String(form.withholding_rate)
              }
              onValueChange={(v) => update("withholding_rate", v === "none" ? "" : v)}
            >
              <SelectTrigger className="mt-2 h-12 rounded-xl" data-testid="client-withholding-select">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                {WITHHOLDING_RATES.map((r) => (
                  <SelectItem key={r.label} value={r.value || "none"}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const { net, vat, gross, withholding, toCollect, hasVat, hasWithholding } = computeWithVat(
              form.amount,
              form.vat_rate,
              form.withholding_rate,
            );
            if ((!hasVat && !hasWithholding) || net <= 0) return null;
            return (
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Imponibile</span>
                  <span className="tabular-nums">{formatEUR(net)}</span>
                </div>
                {hasVat && (
                  <div className="flex items-center justify-between text-stone-600">
                    <span>+ IVA {form.vat_rate}%</span>
                    <span className="tabular-nums">{formatEUR(vat)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-semibold">
                  <span>= Totale fattura</span>
                  <span className="tabular-nums">{formatEUR(gross)}</span>
                </div>
                {hasWithholding && (
                  <>
                    <div className="flex items-center justify-between text-stone-600">
                      <span>− Ritenuta {form.withholding_rate}%</span>
                      <span className="tabular-nums">−{formatEUR(withholding)}</span>
                    </div>
                    <div className="my-1 h-px bg-stone-200" />
                    <div className="flex items-center justify-between font-display text-base font-bold text-[#2E5A47]">
                      <span>Da incassare</span>
                      <span className="tabular-nums">{formatEUR(toCollect)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          <div>
            <Label className="text-xs font-semibold uppercase tracking-widest text-stone-500">N° Preventivo</Label>
            <Input
              value={form.quote_number}
              onChange={(e) => update("quote_number", e.target.value)}
              placeholder=""
              className="mt-2 h-12 rounded-xl"
              data-testid="client-quote-number-input"
            />
          </div>

          {/* Costo materiali STIMATO (solo per preventivi): non entra nel riepilogo mensile.
              Serve a valutare il margine potenziale prima che il cliente accetti. */}
          <div className="rounded-2xl border border-blue-200/50 bg-blue-50/40 p-3">
            <Label className="text-xs font-semibold uppercase tracking-widest text-blue-700">
              Stima costo materiali (solo per preventivo)
            </Label>
            <div className="relative mt-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.estimated_materials_cost}
                onChange={(e) => update("estimated_materials_cost", e.target.value)}
                placeholder=""
                className="h-12 rounded-xl pr-10"
                data-testid="client-estimated-materials-input"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-stone-500">
                €
              </span>
            </div>
            {(() => {
              const est = parseFloat(form.estimated_materials_cost) || 0;
              const amt = parseFloat(form.amount) || 0;
              if (est <= 0 || amt <= 0) return null;
              const margin = amt - est;
              const pct = amt > 0 ? Math.round((margin / amt) * 100) : 0;
              return (
                <div className="mt-2 text-xs text-blue-800">
                  Margine potenziale: <b>{formatEUR(margin)}</b> ({pct}%)
                </div>
              );
            })()}
            <p className="mt-2 text-[11px] text-stone-500">
              Cifra indicativa: non entra mai nel riepilogo mensile. Quando accetti il preventivo, aggiungi i materiali reali nella sezione &quot;Materiali&quot; sotto.
            </p>
          </div>

          <PaymentsList
            payments={form.payments || []}
            totalAmount={computeWithVat(form.amount, form.vat_rate, form.withholding_rate).toCollect}
            jobDate={form.date || date}
            onChange={(p) => update("payments", p)}
          />

          <MaterialsList
            materials={form.materials || []}
            jobAmount={form.amount}
            jobDate={form.date || date}
            onChange={(m) => update("materials", m)}
          />

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {editing ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={remove}
                  data-testid="client-delete-button"
                  className="h-12 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Elimina
                </Button>
                {onDuplicate && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const prefill = {
                        name: form.name || "",
                        address: form.address || "",
                        phone: form.phone || "",
                        pending: true,
                        awaiting_materials: false,
                      };
                      onOpenChange(false);
                      // Piccolo delay per permettere la chiusura prima della riapertura
                      setTimeout(() => onDuplicate(prefill), 220);
                    }}
                    data-testid="client-duplicate-button"
                    className="h-12 rounded-xl text-[#B8683D] hover:bg-amber-50 hover:text-[#9F5630]"
                  >
                    <Copy className="mr-2 h-4 w-4" /> Duplica
                  </Button>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-12 rounded-xl"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                data-testid="client-save-button"
                className="h-12 rounded-xl bg-[#4A5D23] px-6 text-white hover:bg-[#3C4B1C]"
              >
                Salva
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
