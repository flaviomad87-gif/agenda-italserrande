import { useEffect, useState } from "react";
import { api, apiGetWithCache } from "../lib/api";
import { formatEUR, daysSince } from "../lib/utils";
import { sendClientToWhatsApp } from "../lib/whatsapp";
import ClientFormDialog from "../components/ClientFormDialog";
import WhatsAppIcon from "../components/icons/WhatsAppIcon";
import { MapPin, Phone, AlarmClock, Wallet } from "lucide-react";
import { toast } from "sonner";

const severityFor = (days) => {
  if (days > 60) return "danger";
  if (days > 30) return "warn";
  return "ok";
};

const SeverityPill = ({ days }) => {
  const sev = severityFor(days);
  const cls =
    sev === "danger"
      ? "bg-[#FCE3DC] text-[#9A3A1A] ring-1 ring-[#9A3A1A]/15"
      : sev === "warn"
      ? "bg-[#FBF1DE] text-[#7A4F0A] ring-1 ring-[#7A4F0A]/15"
      : "bg-[#EAF3EF] text-[#2E5A47] ring-1 ring-[#2E5A47]/15";
  return (
    <span
      data-testid={`days-waiting-pill-${sev}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <AlarmClock className="h-3.5 w-3.5" />
      {days} {days === 1 ? "giorno" : "giorni"} in attesa
    </span>
  );
};

export default function Incassi() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const c = apiGetWithCache(`/clients/unpaid`);
    if (c.cached) setItems(c.cached);
    setLoading(!c.cached);
    try {
      const data = await c.fresh;
      setItems(data || []);
    } catch {
      if (!c.cached) toast.error("Impossibile caricare i clienti da incassare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onClientSaved = async () => {
    // Una modifica può cambiare il saldo → ricarica
    await load();
  };
  const onClientDeleted = (id) => setItems((prev) => prev.filter((p) => p.id !== id));

  const totalDaIncassare = items.reduce((s, c) => s + (Number(c.balance) || 0), 0);

  // Ordina dal più vecchio (giorni in attesa decrescenti)
  const sorted = [...items].sort((a, b) => daysSince(b.date) - daysSince(a.date));

  return (
    <div className="space-y-6 fade-in" data-testid="incassi-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Crediti aperti
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Da incassare
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Clienti con saldo aperto, ordinati dal più vecchio.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Totale aperto</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="incassi-total">
            {formatEUR(totalDaIncassare)}
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Clienti</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl" data-testid="incassi-count">
            {items.length}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center" data-testid="incassi-empty">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF3EF] text-[#2E5A47]">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold">Tutto saldato!</p>
          <p className="mt-1 text-sm text-stone-500">
            Non ci sono clienti con pagamenti aperti.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 stagger">
          {sorted.map((c) => {
            const days = daysSince(c.date);
            return (
              <li
                key={c.id}
                role="button"
                onClick={() => {
                  setEditing(c);
                  setOpenClient(true);
                }}
                data-testid={`incasso-card-${c.id}`}
                className="group cursor-pointer rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow-md sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold tracking-tight">{c.name}</div>
                    <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
                      <span className="text-xs uppercase tracking-wider text-stone-400">
                        {new Date(`${c.date}T00:00:00`).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {c.address && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-stone-400" /> {c.address}
                        </span>
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
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl font-bold tracking-tight text-[#B8683D]">
                      {formatEUR(c.balance)}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      su {formatEUR(c.to_collect)}
                    </div>
                    {c.paid > 0 && (
                      <div className="mt-0.5 text-xs text-[#2E5A47] font-semibold">
                        +{formatEUR(c.paid)} incassato
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sendClientToWhatsApp(c);
                      }}
                      data-testid={`whatsapp-share-incasso-${c.id}`}
                      aria-label="Sollecita su WhatsApp"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1FB053] active:scale-95"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Sollecita</span>
                      <span className="sm:hidden">WA</span>
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SeverityPill days={days} />
                  {c.invoice_number && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E5EFE9] px-2.5 py-1 text-xs font-semibold text-[#2E5A47]">
                      Fatt. {c.invoice_number}
                    </span>
                  )}
                  {c.quote_number && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F4EFE6] px-2.5 py-1 text-xs font-semibold text-[#8A6B33]">
                      Prev. {c.quote_number}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ClientFormDialog
        open={openClient}
        onOpenChange={setOpenClient}
        date={editing?.date}
        initial={editing}
        onSaved={onClientSaved}
        onDeleted={onClientDeleted}
      />
    </div>
  );
}
