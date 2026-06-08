import { useEffect, useState } from "react";
import { api, apiGetWithCache } from "../lib/api";
import { isoDate, formatEUR, googleMapsUrl } from "../lib/utils";
import { sendClientToWhatsApp } from "../lib/whatsapp";
import ClientFormDialog from "../components/ClientFormDialog";
import WhatsAppIcon from "../components/icons/WhatsAppIcon";
import {
  Plus,
  MapPin,
  Phone,
  FileText,
  Hourglass,
  CalendarCheck,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export default function InAttesa() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = async () => {
    const c = apiGetWithCache(`/clients/awaiting`);
    if (c.cached) setItems(c.cached);
    setLoading(!c.cached);
    try {
      const data = await c.fresh;
      setItems(data || []);
    } catch {
      if (!c.cached) toast.error("Impossibile caricare i lavori in attesa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    load();
  }, []);

  const refreshBadges = () => {
    window.__refreshPendingBadge?.();
    window.__refreshAwaitingBadge?.();
    window.__refreshUnpaidBadge?.();
  };

  const onClientSaved = async (item) => {
    // Se il toggle "in attesa" è stato disattivato, l'item deve sparire da qui
    if (item) {
      if (!item.awaiting_materials || !item.pending) {
        setItems((prev) => prev.filter((p) => p.id !== item.id));
      } else {
        // Aggiorna in place
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
      await api.put(`/clients/awaiting/reorder`, { ids: next.map((x) => x.id) });
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
      // Salva ordine in background
      persistOrder(next);
      return next;
    });
  };

  const markReady = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Materiali arrivati per "${c.name}"? Lo sposto in 'Prossimi lavori'.`)) return;
    setActingId(c.id);
    // Optimistic remove
    setItems((prev) => prev.filter((p) => p.id !== c.id));
    try {
      await api.put(`/clients/${c.id}`, { ...c, awaiting_materials: false });
      toast.success("Spostato in 'Prossimi lavori'");
      refreshBadges();
    } catch {
      toast.error("Errore. Riprova.");
      load();
    } finally {
      setActingId(null);
    }
  };

  const executeToday = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Spostare "${c.name}" nell'agenda di oggi?`)) return;
    setActingId(c.id);
    setItems((prev) => prev.filter((p) => p.id !== c.id));
    try {
      await api.post(`/clients/${c.id}/execute`, null, { params: { date: isoDate() } });
      toast.success("Lavoro spostato in agenda");
      refreshBadges();
    } catch {
      toast.error("Impossibile spostare il lavoro");
      load();
    } finally {
      setActingId(null);
    }
  };

  const totalValore = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-6 fade-in" data-testid="in-attesa-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
          Backlog · aspetta materiali
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          In attesa
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Lavori che aspettano l&apos;arrivo dei materiali. Usa ↑ ↓ per ordinarli come preferisci.
          Quando i materiali sono pronti, tocca &quot;Pronto&quot;.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Lavori in attesa</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="awaiting-count">
            {items.length}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Valore totale</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="awaiting-total">
            {formatEUR(totalValore)}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditing({
              date: isoDate(),
              name: "",
              status: "preventivo",
              pending: true,
              awaiting_materials: true,
            });
            setOpenClient(true);
          }}
          data-testid="add-awaiting-button"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
        >
          <Plus className="h-4 w-4" /> Nuovo lavoro
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center" data-testid="awaiting-empty">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Hourglass className="h-6 w-6" />
          </div>
                  <p className="font-display text-lg font-semibold">Nessun lavoro in attesa</p>
          <p className="mt-1 text-sm text-stone-500">
            Quando hai un lavoro che aspetta materiali, aggiungilo qui per non perderlo di vista.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 stagger" data-testid="awaiting-list">
          {items.map((c, idx) => (
            <li
              key={c.id}
              role="button"
              onClick={() => {
                setEditing(c);
                setOpenClient(true);
              }}
              data-testid={`awaiting-card-${c.id}`}
              className="group cursor-pointer rounded-2xl border border-amber-200/60 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Hourglass className="h-4 w-4 text-amber-600" />
                    <span className="font-display text-lg font-bold tracking-tight">{c.name}</span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
                    {c.address && (
                      <a
                        href={googleMapsUrl(c.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`maps-link-awaiting-${c.id}`}
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
                  {/* Riordinamento manuale */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        move(idx, "up");
                      }}
                      disabled={idx === 0}
                      data-testid={`awaiting-move-up-${c.id}`}
                      aria-label="Sposta su"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        move(idx, "down");
                      }}
                      disabled={idx === items.length - 1}
                      data-testid={`awaiting-move-down-${c.id}`}
                      aria-label="Sposta giù"
                      className="rounded-full bg-stone-100 p-1.5 text-stone-600 transition hover:bg-stone-200 active:scale-90 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => markReady(e, c)}
                    disabled={actingId === c.id}
                    data-testid={`awaiting-mark-ready-${c.id}`}
                    aria-label="Materiali pronti"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#B8683D] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#9F5630] active:scale-95 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Pronto
                  </button>
                  <button
                    type="button"
                    onClick={(e) => executeToday(e, c)}
                    disabled={actingId === c.id}
                    data-testid={`awaiting-execute-${c.id}`}
                    aria-label="Esegui oggi"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#4A5D23] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#3C4B1C] active:scale-95 disabled:opacity-60"
                  >
                    <CalendarCheck className="h-3.5 w-3.5" />
                    Esegui oggi
                    <ArrowRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      sendClientToWhatsApp(c);
                    }}
                    data-testid={`whatsapp-share-awaiting-${c.id}`}
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
        initial={editing && editing.id ? editing : null}
        defaultPending
        defaultAwaiting
        onSaved={onClientSaved}
        onDeleted={onClientDeleted}
      />
    </div>
  );
}
