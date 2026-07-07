import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiGetWithCache } from "../lib/api";
import { isoDate, formatEUR, googleMapsUrl } from "../lib/utils";
import { sendClientToWhatsApp } from "../lib/whatsapp";
import ClientFormDialog from "../components/ClientFormDialog";
import WhatsAppIcon from "../components/icons/WhatsAppIcon";
import AppointmentBadge from "../components/AppointmentBadge";
import {
  Plus,
  MapPin,
  Phone,
  FileText,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

export default function DaPreventivare() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = async () => {
    const c = apiGetWithCache(`/clients/to-quote`);
    if (c.cached) setItems(c.cached);
    setLoading(!c.cached);
    try {
      const data = await c.fresh;
      setItems(data || []);
    } catch {
      if (!c.cached) toast.error("Impossibile caricare i lavori da preventivare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshBadges = () => {
    window.__refreshPendingBadge?.();
    window.__refreshAwaitingBadge?.();
    window.__refreshToQuoteBadge?.();
    window.__refreshToInvoiceBadge?.();
    window.__refreshUnpaidBadge?.();
  };

  const onClientSaved = async (item) => {
    if (item) {
      if (!item.to_quote || !item.pending) {
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
      await api.put(`/clients/to-quote/reorder`, { ids: next.map((x) => x.id) });
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

  const markQuoted = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Preventivo pronto per "${c.name}"? Lo sposto in 'Prossimi lavori'.`)) return;
    setActingId(c.id);
    setItems((prev) => prev.filter((p) => p.id !== c.id));
    try {
      await api.put(`/clients/${c.id}`, { ...c, to_quote: false });
      toast.success("Spostato in 'Prossimi lavori'");
      refreshBadges();
    } catch {
      toast.error("Errore. Riprova.");
      load();
    } finally {
      setActingId(null);
    }
  };

  const totalValore = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-6 fade-in" data-testid="da-preventivare-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          Backlog · sopralluogo fatto
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Da preventivare
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Lavori per cui devi ancora preparare il preventivo. Usa ↑ ↓ per ordinarli.
          Quando il preventivo è pronto, tocca &quot;Preventivo pronto&quot;.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Da preventivare</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="to-quote-count">
            {items.length}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Valore stimato</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="to-quote-total">
            {formatEUR(totalValore)}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 no-print">
        <button
          onClick={() => window.print()}
          data-testid="print-to-quote-button"
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
        >
          <Printer className="h-4 w-4" /> Stampa
        </button>
        <button
          onClick={() => {
            setEditing({
              date: isoDate(),
              name: "",
              status: "preventivo",
              pending: true,
              to_quote: true,
            });
            setOpenClient(true);
          }}
          data-testid="add-to-quote-button"
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Nuovo sopralluogo
        </button>
      </div>

      <div className="print-only mb-4 border-b border-stone-300 pb-3">
        <h2 className="font-display text-xl font-bold">Italserrande — Lavori da preventivare</h2>
        <p className="text-xs text-stone-600">
          Stampato il {new Date().toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" · "}{items.length} lavor{items.length === 1 ? "o" : "i"}
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center" data-testid="to-quote-empty">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <FileText className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold">Nessun preventivo da fare</p>
          <p className="mt-1 text-sm text-stone-500">
            Quando fai un sopralluogo e devi preparare un preventivo, aggiungilo qui.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 stagger" data-testid="to-quote-list">
          {items.map((c, idx) => (
            <li
              key={c.id}
              role="button"
              onClick={() => {
                setEditing(c);
                setOpenClient(true);
              }}
              data-testid={`to-quote-card-${c.id}`}
              className="group cursor-pointer rounded-2xl border border-blue-200/60 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md sm:p-5 print-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-display text-lg font-bold tracking-tight">{c.name}</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
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
                    <AppointmentBadge client={c} testId={`appointment-to-quote-${c.id}`} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 no-print">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(idx, "up"); }}
                      disabled={idx === 0}
                      data-testid={`to-quote-move-up-${c.id}`}
                      aria-label="Sposta su"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(idx, "down"); }}
                      disabled={idx === items.length - 1}
                      data-testid={`to-quote-move-down-${c.id}`}
                      aria-label="Sposta giù"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => markQuoted(e, c)}
                    disabled={actingId === c.id}
                    data-testid={`to-quote-done-${c.id}`}
                    aria-label="Preventivo pronto"
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Preventivo pronto
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); sendClientToWhatsApp(c); }}
                    data-testid={`whatsapp-share-to-quote-${c.id}`}
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
        date={editing?.date || isoDate()}
        initial={editing}
        defaultPending
        onSaved={onClientSaved}
        onDeleted={onClientDeleted}
        onDuplicate={(prefill) => {
          navigate("/prossimi-lavori", { state: { prefill } });
        }}
      />
    </div>
  );
}
