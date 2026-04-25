import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { isoDate, formatEUR, PAYMENT_LABEL } from "../lib/utils";
import DateNavigator from "../components/DateNavigator";
import ClientFormDialog from "../components/ClientFormDialog";
import AdvanceFormDialog from "../components/AdvanceFormDialog";
import { Plus, MapPin, Phone, FileText, Wallet, CreditCard, Landmark, HardHat, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PaymentIcon = ({ method, className }) => {
  if (method === "contanti") return <Wallet className={className} />;
  if (method === "pos") return <CreditCard className={className} />;
  if (method === "bonifico") return <Landmark className={className} />;
  return null;
};

const StatusBadge = ({ status }) => {
  const isExec = status === "lavoro_eseguito";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        isExec
          ? "border-[#2E5A47]/20 bg-[#EAF3EF] text-[#2E5A47]"
          : "border-[#B8683D]/20 bg-[#F8EBE4] text-[#B8683D]"
      }`}
    >
      {isExec ? "Lavoro eseguito" : "Preventivo"}
    </span>
  );
};

const PaymentBadge = ({ method }) => {
  if (!method) return null;
  const styles = {
    contanti: "bg-[#EAF3EF] text-[#2E5A47]",
    pos: "bg-[#E8F0F4] text-[#335C6E]",
    bonifico: "bg-[#F0EBF1] text-[#6B5B72]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[method]}`}>
      <PaymentIcon method={method} className="h-3.5 w-3.5" />
      {PAYMENT_LABEL[method]}
    </span>
  );
};

export default function Agenda() {
  const [date, setDate] = useState(isoDate());
  const [clients, setClients] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openClient, setOpenClient] = useState(false);
  const [openAdvance, setOpenAdvance] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async (d) => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([
        api.get(`/clients`, { params: { date: d } }),
        api.get(`/advances`, { params: { date: d } }),
      ]);
      setClients(c.data);
      setAdvances(a.data);
    } catch {
      toast.error("Impossibile caricare l'agenda");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(date);
  }, [date]);

  const totalIncasso = useMemo(
    () =>
      clients
        .filter((c) => c.status === "lavoro_eseguito")
        .reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [clients],
  );
  const totalAdvances = useMemo(
    () => advances.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [advances],
  );

  const onClientSaved = (item) => {
    setClients((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };
  const onClientDeleted = (id) => setClients((prev) => prev.filter((p) => p.id !== id));

  const removeAdvance = async (id) => {
    if (!window.confirm("Eliminare questo acconto?")) return;
    try {
      await api.delete(`/advances/${id}`);
      setAdvances((prev) => prev.filter((a) => a.id !== id));
      toast.success("Acconto eliminato");
    } catch {
      toast.error("Impossibile eliminare");
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Agenda giornaliera
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          La tua giornata
        </h1>
      </header>

      <div className="rounded-3xl border border-stone-200/60 bg-white p-4 shadow-sm sm:p-5">
        <DateNavigator value={date} onChange={setDate} />
      </div>

      {/* Day totals */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Incasso del giorno</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">{formatEUR(totalIncasso)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Acconti operai</div>
          <div className="mt-1 font-display text-2xl font-bold sm:text-3xl">{formatEUR(totalAdvances)}</div>
        </div>
      </div>

      {/* Clients */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Clienti</h2>
          <button
            onClick={() => {
              setEditing(null);
              setOpenClient(true);
            }}
            data-testid="add-client-desktop-button"
            className="hidden items-center gap-1.5 rounded-full bg-[#4A5D23] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#3C4B1C] md:inline-flex"
          >
            <Plus className="h-4 w-4" /> Aggiungi
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-stone-200/60 bg-white p-6 text-stone-500">Caricamento…</div>
        ) : clients.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <img
              src="https://images.pexels.com/photos/214240/pexels-photo-214240.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=420&w=600"
              alt="Agenda vuota"
              className="mx-auto mb-4 h-32 w-full max-w-xs rounded-2xl object-cover opacity-90"
            />
            <p className="font-display text-lg font-semibold">Nessun cliente in agenda</p>
            <p className="mt-1 text-sm text-stone-500">
              Tocca <span className="font-semibold text-[#4A5D23]">+</span> per aggiungere il primo lavoro o preventivo della giornata.
            </p>
          </div>
        ) : (
          <ul className="space-y-3 stagger">
            {clients.map((c) => (
              <li
                key={c.id}
                role="button"
                onClick={() => {
                  setEditing(c);
                  setOpenClient(true);
                }}
                data-testid={`client-card-${c.id}`}
                className="group cursor-pointer rounded-2xl border border-stone-200/60 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow-md sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold tracking-tight">{c.name}</div>
                    <div className="mt-1 flex flex-col gap-1 text-sm text-stone-600">
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
                      {c.notes && (
                        <span className="inline-flex items-start gap-1.5 text-stone-500">
                          <FileText className="mt-0.5 h-3.5 w-3.5 text-stone-400" />
                          <span className="line-clamp-2">{c.notes}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl font-bold tracking-tight">{formatEUR(c.amount)}</div>
                    <ChevronRight className="ml-auto mt-1 h-4 w-4 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-600" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  <PaymentBadge method={c.payment_method} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Advances */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Acconti operai</h2>
          <button
            onClick={() => setOpenAdvance(true)}
            data-testid="add-advance-button"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Plus className="h-4 w-4" /> Acconto
          </button>
        </div>
        {advances.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-500">
            Nessun acconto registrato per oggi.
          </div>
        ) : (
          <ul className="space-y-2">
            {advances.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/60 bg-white px-4 py-3 shadow-sm"
                data-testid={`advance-row-${a.id}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#F3F2F0] text-stone-700">
                    <HardHat className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.worker_name}</div>
                    {a.notes && <div className="truncate text-xs text-stone-500">{a.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold">{formatEUR(a.amount)}</span>
                  <button
                    onClick={() => removeAdvance(a.id)}
                    className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Elimina acconto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mobile FAB */}
      <button
        onClick={() => {
          setEditing(null);
          setOpenClient(true);
        }}
        data-testid="add-client-fab"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A5D23] text-white shadow-lg transition active:scale-95 md:hidden"
        aria-label="Aggiungi cliente"
      >
        <Plus className="h-6 w-6" />
      </button>

      <ClientFormDialog
        open={openClient}
        onOpenChange={setOpenClient}
        date={date}
        initial={editing}
        onSaved={onClientSaved}
        onDeleted={onClientDeleted}
      />
      <AdvanceFormDialog
        open={openAdvance}
        onOpenChange={setOpenAdvance}
        date={date}
        onSaved={(item) => setAdvances((prev) => [...prev, item])}
      />
    </div>
  );
}
