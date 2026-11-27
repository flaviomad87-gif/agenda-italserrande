import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Share2, Loader2, Eye, PenLine, CalendarPlus, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import ClientFormDialog from "../components/ClientFormDialog";
import QuoteJobLink from "../components/QuoteJobLink";
import { QuotePages, QUOTE_STATUS, VAT_RATES, buildQuotePdf, money, quoteFileName, quoteTotal } from "../lib/quoteDoc";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const newItem = () => ({ id: crypto.randomUUID(), description: "", amount: 0, vatRate: 22 });
const UP = new Set(["clientName", "clientAddress"]);

export default function QuoteEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(null);
  const [company, setCompany] = useState(null);
  const [linked, setLinked] = useState(null);
  const [tab, setTab] = useState("edit");
  const [busy, setBusy] = useState("");
  const [jobOpen, setJobOpen] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api
      .get(`/quotes/${id}`)
      .then((a) => {
        setQ(a.data);
        if (a.data.id !== id) nav(`/preventivi/${a.data.id}`, { replace: true });
      })
      .catch((e) => setError(e?.response?.status === 404 ? "notfound" : "network"));
    api.get("/quote-settings").then((b) => setCompany(b.data.company)).catch(() => setCompany({ name: "Italserrande S.r.l." }));
    api.get("/clients/quote-refs").then((c) => setLinked((c.data || []).find((r) => r.quote_ref === id) || null)).catch(() => {});
  }, [id, nav]);

  if (error) return <QuoteMissing kind={error} onBack={() => nav("/da-preventivare")} />;
  if (!q || !company) return <div className="p-6 text-stone-500">Caricamento…</div>;

  const set = (k, v) => setQ((p) => ({ ...p, [k]: UP.has(k) ? v.toUpperCase() : v }));
  const setItem = (i, k, v) => setQ((p) => ({ ...p, lineItems: p.lineItems.map((li, j) => (j === i ? { ...li, [k]: v } : li)) }));
  const clean = () => ({ ...q, lineItems: q.lineItems.map((li) => ({ ...li, amount: parseFloat(String(li.amount).replace(",", ".")) || 0, vatRate: Number(li.vatRate) })) });

  const save = async (silent) => {
    setBusy("save");
    try {
      const res = await api.put(`/quotes/${id}`, clean());
      setQ(res.data);
      if (!silent) toast.success("Preventivo salvato");
      return res.data;
    } catch {
      toast.error("Errore nel salvataggio");
      return null;
    } finally {
      setBusy("");
    }
  };

  const sharePdf = async () => {
    const saved = await save(true);
    if (!saved) return;
    setBusy("pdf");
    try {
      const blob = await buildQuotePdf(saved, company);
      const file = new File([blob], quoteFileName(saved), { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Preventivo ${saved.number}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      if (saved.status === "draft") {
        const res = await api.put(`/quotes/${id}`, { ...saved, status: "sent" });
        setQ(res.data);
      }
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("PDF non creato, riprova");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Eliminare il preventivo N° ${q.number}?`)) return;
    try {
      await api.delete(`/quotes/${id}`);
      toast.success("Preventivo eliminato");
      nav("/da-preventivare");
    } catch {
      toast.error("Errore, riprova");
    }
  };

  const jobPrefill = {
    date: localToday(), name: q.clientName, address: q.clientAddress, amount: quoteTotal(q),
    vat_rate: q.lineItems?.[0]?.vatRate ?? 22, quote_number: q.number, quote_ref: q.id, pending: true, to_quote: false,
  };

  return (
    <div className="space-y-4 pb-28" data-testid="quote-editor-page">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => nav("/da-preventivare")} className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600" data-testid="quote-back">
          <ArrowLeft className="h-4 w-4" /> Preventivi
        </button>
        <div className="flex rounded-full border border-stone-200 bg-white p-0.5" data-testid="quote-tabs">
          <TabBtn on={tab === "edit"} onClick={() => setTab("edit")} icon={PenLine} label="Modifica" testId="quote-tab-edit" />
          <TabBtn on={tab === "preview"} onClick={() => setTab("preview")} icon={Eye} label="Anteprima" testId="quote-tab-preview" />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">Preventivo N° {q.number}</h1>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Imponibile</div>
          <div className="font-display text-xl font-bold tabular-nums" data-testid="quote-total">€ {money(quoteTotal(q))}</div>
        </div>
      </div>

      <QuoteJobLink quote={q} />

      <div className="flex flex-wrap gap-1.5" data-testid="quote-status">
        {QUOTE_STATUS.map((s) => (
          <button key={s.value} type="button" onClick={() => set("status", s.value)} className={`border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${q.status === s.value ? s.cls : "border-stone-200 bg-white text-stone-400"}`} data-testid={`quote-status-${s.value}`}>
            {s.label}
          </button>
        ))}
      </div>

      {tab === "edit" ? (
        <QuoteForm q={q} set={set} setItem={setItem} setQ={setQ} />
      ) : (
        <ScaledPreview quote={clean()} company={company} />
      )}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-stone-200 bg-white/95 px-3 py-2 backdrop-blur md:bottom-0 md:left-64">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-1.5">
          <ActBtn onClick={remove} cls="text-red-600 hover:bg-red-50" icon={Trash2} label="" testId="quote-delete" />
          {linked ? (
            <span className="inline-flex h-11 items-center gap-1 px-2 text-xs font-semibold text-emerald-700" data-testid="quote-linked"><CheckCircle2 className="h-4 w-4" /> In agenda</span>
          ) : (
            <ActBtn onClick={async () => (await save(true)) && setJobOpen(true)} cls="border border-stone-300 text-stone-700 hover:bg-stone-50" icon={CalendarPlus} label="Lavoro" testId="quote-create-job" />
          )}
          <ActBtn onClick={sharePdf} busy={busy === "pdf"} cls="bg-[#B8683D] text-white hover:bg-[#9F5630]" icon={Share2} label="Invia PDF" testId="quote-share-pdf" />
          <ActBtn onClick={() => save()} busy={busy === "save"} cls="bg-[#4A5D23] text-white hover:bg-[#3C4C1C]" icon={Save} label="Salva" testId="quote-save" />
        </div>
      </div>

      <ClientFormDialog
        open={jobOpen}
        onOpenChange={setJobOpen}
        initial={jobPrefill}
        onSaved={(item) => item?.id && setLinked({ id: item.id })}
      />
    </div>
  );
}

function QuoteMissing({ kind, onBack }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-stone-200 bg-white p-6 text-center" data-testid="quote-missing">
      <h1 className="font-display text-2xl font-bold">{kind === "notfound" ? "Preventivo non ancora nell'agenda" : "Connessione assente"}</h1>
      <p className="text-sm text-stone-600">
        {kind === "notfound"
          ? "Questo lavoro è collegato a un preventivo della vecchia app Preventivi. Vai in Preventivi, apri il riquadro blu e tocca \"Importa dalla vecchia app Preventivi\": poi si aprirà da qui."
          : "Il server non risponde (può servire qualche secondo se era in pausa). Riprova tra poco."}
      </p>
      <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white" data-testid="quote-missing-back">
        <ArrowLeft className="h-4 w-4" /> Vai a Preventivi
      </button>
    </div>
  );
}

function QuoteForm({ q, set, setItem, setQ }) {
  const field = (label, k, props = {}) => (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">{label}</Label>
      <Input value={q[k] || ""} onChange={(e) => set(k, e.target.value)} className="h-12 rounded-xl" data-testid={`quote-input-${k}`} {...props} />
    </div>
  );
  return (
    <div className="space-y-4">
      <Box>
        {field("Cliente", "clientName", { autoCapitalize: "characters" })}
        {field("Indirizzo", "clientAddress", { autoCapitalize: "characters" })}
        <div className="grid grid-cols-2 gap-2">
          {field("Numero", "number", { inputMode: "numeric" })}
          {field("Data", "date", { type: "date" })}
        </div>
        {field("Oggetto", "subject")}
      </Box>
      <Box>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Descrizione lavori</div>
        {q.lineItems.map((li, i) => (
          <div key={li.id} className="space-y-2 rounded-xl border border-stone-200 bg-white p-3" data-testid={`quote-item-${i}`}>
            <Textarea value={li.description} onChange={(e) => setItem(i, "description", e.target.value)} rows={5} placeholder="Descrizione…" data-testid={`quote-item-desc-${i}`} />
            <div className="flex items-center gap-2">
              <Input inputMode="decimal" value={li.amount} onChange={(e) => setItem(i, "amount", e.target.value)} className="h-11 flex-1 rounded-xl tabular-nums" placeholder="Importo €" data-testid={`quote-item-amount-${i}`} />
              <select value={li.vatRate} onChange={(e) => setItem(i, "vatRate", Number(e.target.value))} className="h-11 rounded-xl border border-stone-200 bg-white px-2 text-sm" data-testid={`quote-item-vat-${i}`}>
                {VAT_RATES.map((v) => <option key={v} value={v}>{`${v}%`}</option>)}
              </select>
              {q.lineItems.length > 1 && (
                <button type="button" onClick={() => setQ((p) => ({ ...p, lineItems: p.lineItems.filter((_, j) => j !== i) }))} className="h-11 rounded-xl px-2 text-red-500 hover:bg-red-50" aria-label="Rimuovi riga" data-testid={`quote-item-remove-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setQ((p) => ({ ...p, lineItems: [...p.lineItems, newItem()] }))} className="inline-flex h-10 items-center gap-1 rounded-xl border border-dashed border-stone-300 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50" data-testid="quote-add-item">
          <Plus className="h-4 w-4" /> Aggiungi riga
        </button>
      </Box>
      <Box>
        <TextBlock label="Modalità di pagamento" v={q.paymentTerms} on={(v) => set("paymentTerms", v)} k="paymentTerms" rows={5} />
        <TextBlock label="Nota finale" v={q.footerNote} on={(v) => set("footerNote", v)} k="footerNote" rows={2} />
        <TextBlock label="Note" v={q.notes} on={(v) => set("notes", v)} k="notes" rows={3} />
      </Box>
    </div>
  );
}

const Box = ({ children }) => <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-3">{children}</section>;

function TextBlock({ label, v, on, k, rows }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">{label}</Label>
      <Textarea value={v || ""} onChange={(e) => on(e.target.value)} rows={rows} data-testid={`quote-input-${k}`} />
    </div>
  );
}

// Anteprima A4 ridotta alla larghezza dello schermo
function ScaledPreview({ quote, company }) {
  const ref = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(0.45);
  const [h, setH] = useState(0);
  useEffect(() => {
    const fit = () => {
      if (ref.current) setScale(Math.min(1, ref.current.clientWidth / 794));
      if (inner.current) setH(inner.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (inner.current) ro.observe(inner.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  return (
    <div ref={ref} className="w-full overflow-hidden" style={{ height: h ? h * scale : undefined }} data-testid="quote-preview">
      <div ref={inner} style={{ width: "210mm", transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <QuotePages quote={quote} company={company} />
      </div>
    </div>
  );
}

function TabBtn({ on, onClick, icon: Icon, label, testId }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-[#4A5D23] text-white" : "text-stone-600"}`} data-testid={testId}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function ActBtn({ onClick, busy, cls, icon: Icon, label, testId }) {
  return (
    <button type="button" onClick={onClick} disabled={!!busy} className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${cls}`} data-testid={testId}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  );
}
