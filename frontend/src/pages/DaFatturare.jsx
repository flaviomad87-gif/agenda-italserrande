import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiGetWithCache } from "../lib/api";
import { formatEUR, googleMapsUrl } from "../lib/utils";
import { sendClientToWhatsApp } from "../lib/whatsapp";
import ClientFormDialog from "../components/ClientFormDialog";
import WhatsAppIcon from "../components/icons/WhatsAppIcon";
import {
  MapPin,
  Phone,
  FileText,
  Receipt,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

export default function DaFatturare() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = async () => {
    const c = apiGetWithCache(`/clients/to-invoice`);
    if (c.cached) setItems(c.cached);
    setLoading(!c.cached);
    try {
      const data = await c.fresh;
      setItems(data || []);
    } catch {
      if (!c.cached) toast.error("Impossibile caricare i lavori da fatturare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshBadges = () => {
    window.__refreshToInvoiceBadge?.();
    window.__refreshUnpaidBadge?.();
  };

  const onClientSaved = async (item) => {
    if (item) {
      if (!item.to_invoice) {
        setItems((prev) => prev.filter((p) => p.id !== item.id));
      } else {
        setItems((prev) => {
          const idx = prev.findIndex((p) => p.id === item.id);
          if (idx === -1) return [...prev, item];
          const next = [...prev];
          next[idx] = item;
          return next;
        });
      }
    }
    refreshBadges();
  };
  const onClientDeleted = async (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    refreshBadges();
  };

  const persistOrder = async (next) => {
    try {
      await api.put(`/clients/to-invoice/reorder`, { ids: next.map((x) => x.id) });
    } catch {
      toast.error("Impossibile salvare l'ordine. Riprova.");
      load();
    }
  };

  const move = (idx, dir) => {
    setItems((prev) => {
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      persistOrder(next);
      return next;
    });
  };

  const markInvoiced = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Fattura emessa per "${c.name}"? Lo rimuovo da questa lista.`)) return;
    setActingId(c.id);
    setItems((prev) => prev.filter((p) => p.id !== c.id));
    try {
      await api.put(`/clients/${c.id}`, { ...c, to_invoice: false });
      toast.success("Rimosso da 'Da fatturare'");
      refreshBadges();
    } catch {
      toast.error("Errore. Riprova.");
      load();
    } finally {
      setActingId(null);
    }
  };

  const totalValore = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const fmtJobDate = (iso) => {
    try {
      return format(parseISO(iso), "d MMM yyyy", { locale: it });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6 fade-in" data-testid="da-fatturare-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600">
          Backlog · da fatturare
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Da fatturare
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Lavori eseguiti che aspettano l&apos;emissione della fattura.
          Quando emetti la fattura, tocca &quot;Fatturato&quot;.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Da fatturare</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="to-invoice-count">
            {items.length}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Valore totale</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="to-invoice-total">
            {formatEUR(totalValore)}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 no-print">
        <button
          onClick={() => window.print()}
          data-testid="print-to-invoice-button"
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
        >
          <Printer className="h-4 w-4" /> Stampa
        </button>
      </div>

      <div className="print-only mb-4 border-b border-stone-300 pb-3">
        <h2 className="font-display text-xl font-bold">Italserrande — Lavori da fatturare</h2>
        <p className="text-xs text-stone-600">
          Stampato il {new Date().toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" · "}{items.length} lavor{items.length === 1 ? "o" : "i"} · valore totale {formatEUR(totalValore)}
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center" data-testid="to-invoice-empty">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
            <Receipt className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold">Nessun lavoro da fatturare</p>
          <p className="mt-1 text-sm text-stone-500">
            Quando un lavoro è eseguito ma la fattura non è ancora stata emessa, spunta &quot;Da fatturare&quot; sulla scheda.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 stagger" data-testid="to-invoice-list">
          {items.map((c, idx) => (
            <li
              key={c.id}
              role="button"
              onClick={() => { setEditing(c); setOpenClient(true); }}
              data-testid={`to-invoice-card-${c.id}`}
              className="group cursor-pointer rounded-2xl border border-purple-200/60 bg-white p-4 shadow-sm transition hover:border-purple-300 hover:shadow-md sm:p-5 print-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-purple-600" />
                    <span className="font-display text-lg font-bold tracking-tight">{c.name}</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
                    {c.date && (
                      <span className="text-xs text-stone-500">Eseguito il {fmtJobDate(c.date)}</span>
                    )}
                    {c.address && (
                      <a
                        href={googleMapsUrl(c.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex w-fit items-center gap-1.5 hover:text-[#4A5D23]"
                      >
                        <MapPin className="h-3.5 w-3.5 text-stone-400" /> {c.address}
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex w-fit items-center gap-1.5 hover:text-[#4A5D23]"
                      >
                        <Phone className="h-3.5 w-3.5 text-stone-400" /> {c.phone}
                      </a>
                    )}
                    {c.notes && (
                      <span className="inline-flex items-start gap-1.5 text-stone-500">
                        <FileText className="mt-0.5 h-3.5 w-3.5 text-stone-400" />
                        <span className="line-clamp-2">{c.notes}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 no-print">
                  {c.amount > 0 && (
                    <div className="font-display text-lg font-bold tracking-tight">
                      {formatEUR(c.amount)}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(idx, "up"); }}
                      disabled={idx === 0}
                      data-testid={`to-invoice-move-up-${c.id}`}
                      aria-label="Sposta su"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(idx, "down"); }}
                      disabled={idx === items.length - 1}
                      data-testid={`to-invoice-move-down-${c.id}`}
                      aria-label="Sposta giù"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => markInvoiced(e, c)}
                    disabled={actingId === c.id}
                    data-testid={`to-invoice-done-${c.id}`}
                    aria-label="Fatturato"
                    className="inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Fatturato
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); sendClientToWhatsApp(c); }}
                    data-testid={`whatsapp-share-to-invoice-${c.id}`}
                    aria-label="Invia su WhatsApp"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1FB053] active:scale-95"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ClientFormDialog
        open={openClient}
        onOpenChange={setOpenClient}
        date={editing?.date}
        initial={editing}
        onSaved={onClientSaved}
        onDeleted={onClientDeleted}
        onDuplicate={(prefill) => {
          navigate("/prossimi-lavori", { state: { prefill } });
        }}
      />
    </div>
  );
}
