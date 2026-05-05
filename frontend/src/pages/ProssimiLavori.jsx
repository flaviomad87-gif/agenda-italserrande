import { useEffect, useState } from "react";
import { api, apiGetWithCache } from "../lib/api";
import { isoDate, formatEUR, googleMapsUrl } from "../lib/utils";
import { sendClientToWhatsApp } from "../lib/whatsapp";
import ClientFormDialog from "../components/ClientFormDialog";
import WhatsAppIcon from "../components/icons/WhatsAppIcon";
import { Plus, MapPin, Phone, FileText, Clock, CalendarCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const formatPlannedDate = (iso) => {
  if (!iso) return "Senza data";
  try {
    const d = parseISO(`${iso}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    const formatted = format(d, "EEE d MMM", { locale: it });
    if (diff === 0) return `${formatted} · Oggi`;
    if (diff === 1) return `${formatted} · Domani`;
    if (diff > 1) return `${formatted} · tra ${diff} giorni`;
    if (diff === -1) return `${formatted} · ieri`;
    return `${formatted} · ${Math.abs(diff)} giorni fa`;
  } catch {
    return iso;
  }
};

export default function ProssimiLavori() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [editing, setEditing] = useState(null);
  const [executingId, setExecutingId] = useState(null);

  const load = async () => {
    const c = apiGetWithCache(`/clients/pending`);
    if (c.cached) setItems(c.cached);
    setLoading(!c.cached);
    try {
      const data = await c.fresh;
      setItems(data || []);
    } catch {
      if (!c.cached) toast.error("Impossibile caricare i prossimi lavori");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshAll = async () => {
    await load();
    window.__refreshPendingBadge?.();
    window.__refreshUnpaidBadge?.();
  };

  const onClientSaved = async (item) => {
    if (item && !item.pending) {
      // Promosso in Agenda → rimuovilo dalla lista
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    }
    await refreshAll();
  };
  const onClientDeleted = async (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    window.__refreshPendingBadge?.();
  };

  const executeToday = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Spostare "${c.name}" nell'agenda di oggi?`)) return;
    setExecutingId(c.id);
    try {
      await api.post(`/clients/${c.id}/execute`, null, { params: { date: isoDate() } });
      toast.success("Lavoro spostato in agenda");
      setItems((prev) => prev.filter((p) => p.id !== c.id));
      window.__refreshPendingBadge?.();
    } catch {
      toast.error("Impossibile spostare il lavoro");
    } finally {
      setExecutingId(null);
    }
  };

  const totalValore = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-6 fade-in" data-testid="prossimi-lavori-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Backlog · da pianificare
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Prossimi lavori
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Tutti i lavori da fare. Quando li esegui, vanno automaticamente nell'agenda del giorno con la scheda compilata.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Lavori in attesa</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="pending-count">
            {items.length}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Valore totale</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="pending-total">
            {formatEUR(totalValore)}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditing(null);
            setOpenClient(true);
          }}
          data-testid="add-pending-button"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B8683D] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9F5630]"
        >
          <Plus className="h-4 w-4" /> Nuovo lavoro
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center" data-testid="prossimi-empty">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FBF1DE] text-[#B8683D]">
            <Clock className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold">Nessun lavoro in attesa</p>
          <p className="mt-1 text-sm text-stone-500">
            Aggiungi qui i lavori da fare nei prossimi giorni così non te ne dimentichi.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 stagger">
          {items.map((c) => (
            <li
              key={c.id}
              role="button"
              onClick={() => {
                setEditing(c);
                setOpenClient(true);
              }}
              data-testid={`pending-card-${c.id}`}
              className="group cursor-pointer rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow-md sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold tracking-tight">{c.name}</div>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B8683D]">
                      <Clock className="h-3.5 w-3.5" /> {formatPlannedDate(c.date)}
                    </span>
                    {c.address && (
                      <a
                        href={googleMapsUrl(c.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`maps-link-pending-${c.id}`}
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
                <div className="flex flex-col items-end gap-2">
                  {c.amount > 0 && (
                    <div className="font-display text-lg font-bold tracking-tight">
                      {formatEUR(c.amount)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => executeToday(e, c)}
                    disabled={executingId === c.id}
                    data-testid={`execute-today-${c.id}`}
                    aria-label="Esegui oggi"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#4A5D23] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#3C4B1C] active:scale-95 disabled:opacity-60"
                  >
                    <CalendarCheck className="h-3.5 w-3.5" />
                    {executingId === c.id ? "…" : "Esegui oggi"}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      sendClientToWhatsApp(c);
                    }}
                    data-testid={`whatsapp-share-pending-${c.id}`}
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
      />
    </div>
  );
}
