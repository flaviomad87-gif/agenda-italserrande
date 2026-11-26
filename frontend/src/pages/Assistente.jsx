import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Bot, Check, Copy, FileText, History, Link2Off, Loader2, MessageCircle, Smartphone, X } from "lucide-react";
import AssistenteChat from "../components/AssistenteChat";
import JobPicker from "../components/JobPicker";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "mai");

const Card = ({ title, icon: Icon, children, testId }) => (
  <section className="rounded-2xl border border-stone-200 bg-white p-5" data-testid={testId}>
    <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold md:text-lg">
      <Icon className="h-5 w-5 text-[#0047ab]" /> {title}
    </h2>
    {children}
  </section>
);

const Connect = ({ url }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Indirizzo copiato");
    } catch {
      window.prompt("Copia questo indirizzo:", url);
    }
  };
  return (
    <Card title="Collega un assistente" icon={Bot} testId="assistente-collega">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-stone-50 p-3">
        <code className="min-w-0 flex-1 truncate text-sm" data-testid="assistente-mcp-url">{url}</code>
        <Button size="sm" onClick={copy} data-testid="assistente-copy-url"><Copy className="mr-1 h-4 w-4" /> Copia</Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
        <li>Su Claude (dal computer): Impostazioni → Connettori → Aggiungi connettore personalizzato.</li>
        <li>Nome: Agenda Italserrande. Incolla l'indirizzo qui sopra e conferma.</li>
        <li>Si apre la pagina dell'agenda: entra con la tua email e password e tocca Autorizza.</li>
        <li>Fatto: chiedi per esempio "Quali contratti di manutenzione sono in scadenza?".</li>
      </ol>
      <p className="mt-3 text-xs text-stone-500">L'assistente legge tutto, chiede conferma prima di ogni modifica e non può cancellare lavori o documenti (solo scartare le sue bozze). Lo stesso indirizzo funziona con altri assistenti compatibili (es. ChatGPT Business).</p>
    </Card>
  );
};

const Proposta = ({ p, onDone }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [job, setJob] = useState(null);
  const [picking, setPicking] = useState(false);
  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "ok") {
        const { data } = await api.post(`/assistente/proposte/${p.id}/approva`, { lavoro_id: job?.id || null });
        toast.success(`Preventivo N° ${data.number} creato${data.lavoro_id ? " e collegato al lavoro" : ""}: inserisci i prezzi`);
        navigate(`/preventivi/${data.quote_id}`);
      } else {
        await api.delete(`/assistente/proposte/${p.id}`);
        toast("Bozza scartata");
      }
      onDone();
    } catch {
      toast.error("Operazione non riuscita, riprova");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="rounded-xl border border-stone-200 p-4" data-testid={`proposta-${p.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">{p.cliente}</div>
        <div className="text-xs text-stone-500">{fmt(p.created_at)}</div>
      </div>
      {p.indirizzo && <div className="text-xs text-stone-500">{p.indirizzo}</div>}
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{p.oggetto}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{p.righe.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {p.note && <p className="mt-2 text-xs text-stone-500">{p.note}</p>}
      <div className="mt-3 text-sm" data-testid={`proposta-lavoro-${p.id}`}>
        {job ? (
          <span>Collegata a <strong>{job.name}</strong> · <button type="button" className="text-xs font-semibold text-[#0047ab]" onClick={() => setPicking(true)} data-testid={`proposta-lavoro-cambia-${p.id}`}>Cambia</button></span>
        ) : p.lavoro_id ? (
          <span className="text-stone-600">Già collegata al lavoro indicato dall'assistente · <button type="button" className="text-xs font-semibold text-[#0047ab]" onClick={() => setPicking(true)} data-testid={`proposta-lavoro-cambia-${p.id}`}>Cambia</button></span>
        ) : (
          <button type="button" className="text-xs font-semibold text-[#0047ab]" onClick={() => setPicking(true)} data-testid={`proposta-lavoro-collega-${p.id}`}>+ Collega a un cliente/lavoro</button>
        )}
        {picking && (
          <div className="mt-2">
            <JobPicker initial={p.cliente.split(" ")[0]} onPick={(c) => { setJob(c); setPicking(false); }} onClose={() => setPicking(false)} testId={`proposta-picker-${p.id}`} />
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => act("ok")} disabled={!!busy} data-testid={`proposta-approva-${p.id}`}>
          {busy === "ok" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Approva e metti i prezzi
        </Button>
        <Button size="sm" variant="outline" onClick={() => act("no")} disabled={!!busy} data-testid={`proposta-scarta-${p.id}`}>
          <X className="mr-1 h-4 w-4" /> Scarta
        </Button>
      </div>
    </div>
  );
};

const STATI = { approvata: ["Approvata", "bg-emerald-100 text-emerald-800"], scartata: ["Scartata", "bg-stone-200 text-stone-600"] };

const Storico = ({ items, onDone }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const remove = async (p) => {
    const msg = p.stato === "approvata" ? "Eliminare questa bozza e il suo preventivo? Il preventivo verrà eliminato." : "Togliere questa bozza dallo storico?";
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/assistente/proposte/${p.id}/storico`);
      toast.success(p.stato === "approvata" ? "Bozza e preventivo eliminati" : "Bozza eliminata");
      onDone();
    } catch {
      toast.error("Eliminazione non riuscita");
    }
  };
  const restore = async (id) => {
    try {
      await api.post(`/assistente/proposte/${id}/ripristina`);
      toast.success("Bozza ripristinata");
      onDone();
    } catch {
      toast.error("Ripristino non riuscito");
    }
  };
  return (
    <Card title={`Bozze precedenti (${items.length})`} icon={History} testId="assistente-storico">
      {!items.length ? (
        <p className="text-sm text-stone-500">Nessuna bozza approvata o scartata.</p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-[#0047ab]" data-testid="storico-toggle">
            {open ? "Nascondi" : "Mostra le bozze precedenti"}
          </button>
          {open && (
            <div className="mt-3 space-y-2">
              {items.map((p) => (
                <div key={p.id} className="rounded-xl border border-stone-200 p-3" data-testid={`storico-${p.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-semibold">{p.cliente}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATI[p.stato][1]}`}>{STATI[p.stato][0]}</span>
                  </div>
                  <div className="text-xs text-stone-500">{fmt(p.created_at)} · {p.oggetto}</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-stone-700">{p.righe.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.stato === "approvata" && p.quote_id && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/preventivi/${p.quote_id}`)} data-testid={`storico-apri-${p.id}`}>Apri preventivo</Button>
                    )}
                    {p.stato === "scartata" && (
                      <Button size="sm" variant="outline" onClick={() => restore(p.id)} data-testid={`storico-ripristina-${p.id}`}>Ripristina</Button>
                    )}
                    <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => remove(p)} data-testid={`storico-elimina-${p.id}`}>
                      <Trash2 className="mr-1 h-4 w-4" /> Elimina
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
};

const MODES = [
  { key: "chat", label: "Chat nell'agenda", sub: "a consumo, credito Anthropic", icon: MessageCircle },
  { key: "claude", label: "App Claude", sub: "incluso nel tuo abbonamento", icon: Smartphone },
];

const ModePicker = ({ mode, onPick }) => (
  <div className="grid grid-cols-2 gap-2" data-testid="assistente-mode">
    {MODES.map((m) => (
      <button
        key={m.key}
        type="button"
        onClick={() => onPick(m.key)}
        data-testid={`assistente-mode-${m.key}`}
        className={`rounded-2xl border p-3 text-left transition-colors ${mode === m.key ? "border-[#0047ab] bg-[#0047ab] text-white" : "border-stone-200 bg-white"}`}
      >
        <m.icon className="mb-1 h-5 w-5" />
        <div className="text-sm font-bold">{m.label}</div>
        <div className={`text-[11px] ${mode === m.key ? "text-white/80" : "text-stone-500"}`}>{m.sub}</div>
      </button>
    ))}
  </div>
);

export default function Assistente() {
  const [s, setS] = useState(null);
  const [mode, setMode] = useState(() => localStorage.getItem("agenda_ai_mode") || "chat");
  const pickMode = (k) => {
    setMode(k);
    localStorage.setItem("agenda_ai_mode", k);
  };
  const load = () => api.get("/assistente/stato").then((r) => setS(r.data)).catch(() => toast.error("Impossibile caricare l'assistente"));
  useEffect(() => {
    load();
  }, []);
  const revoke = async (id) => {
    if (!window.confirm("Scollegare questo assistente? Non potrà più accedere all'agenda.")) return;
    try {
      await api.delete(`/assistente/collegamenti/${id}`);
      toast.success("Assistente scollegato");
      load();
    } catch {
      toast.error("Scollegamento non riuscito, riprova");
    }
  };
  if (!s) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-stone-400" /></div>;
  return (
    <div className="space-y-5" data-testid="assistente-page">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Assistente IA</h1>
        <p className="text-sm text-stone-500">Scegli come usarlo: legge l'agenda e modifica solo con la tua conferma.</p>
      </div>
      <ModePicker mode={mode} onPick={pickMode} />
      {mode === "chat" && <Card title="Chat con l'assistente" icon={MessageCircle} testId="assistente-chat-card"><AssistenteChat onChange={load} /></Card>}
      <Card title={`Bozze di preventivo (${s.proposte.length})`} icon={FileText} testId="assistente-proposte">
        {s.proposte.length ? (
          <div className="space-y-3">{s.proposte.map((p) => <Proposta key={p.id} p={p} onDone={load} />)}</div>
        ) : (
          <p className="text-sm text-stone-500">Nessuna bozza. Quando l'assistente prepara un preventivo lo trovi qui.</p>
        )}
      </Card>
      <Storico items={s.storico || []} onDone={load} />
      {mode === "claude" && <Connect url={s.mcp_url} />}
      {mode === "claude" && <Card title="Assistenti collegati" icon={Bot} testId="assistente-collegamenti">
        {s.collegamenti.length ? (
          s.collegamenti.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-b border-stone-100 py-2 last:border-0" data-testid={`collegamento-${c.id}`}>
              <div className="min-w-0 text-sm">
                <div className="truncate font-semibold">{c.client_name}</div>
                <div className="text-xs text-stone-500">Collegato {fmt(c.created_at)} · ultimo uso {fmt(c.last_used)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => revoke(c.id)} data-testid={`scollega-${c.id}`}><Link2Off className="mr-1 h-4 w-4" /> Scollega</Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-500">Nessun assistente collegato.</p>
        )}
      </Card>}
      <Card title="Ultime operazioni dell'assistente" icon={History} testId="assistente-attivita">
        {s.attivita.length ? (
          <ul className="space-y-2">
            {s.attivita.map((a) => (
              <li key={a.id} className="text-sm" data-testid={`attivita-${a.id}`}>
                <span className="font-semibold">{a.azione}</span> — {a.dettaglio}
                <div className="text-xs text-stone-500">{fmt(a.at)}{a.assistente ? ` · ${a.assistente}` : ""}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nessuna operazione finora.</p>
        )}
      </Card>
    </div>
  );
}
