import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Share2, Save, Loader2, Trash2, Plus, X, CalendarCheck, FileSignature } from "lucide-react";
import { Section, Row, Field, focusScrollFix } from "./DocumentoDialog";
import { fmtDate } from "../lib/documentiPdf";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const blank = () => ({
  cliente: "",
  indirizzo: "",
  comune: "",
  telefono: "",
  email_cliente: "",
  cf_piva: "",
  impianti: [{ descrizione: "", matricola: "" }],
  data_inizio: todayIso(),
  durata_mesi: 12,
  frequenza_mesi: 6,
  rinnovo_tacito: true,
  canone: "",
  pagamento: "",
  sconto_interventi: "",
  note: "",
  visite: [],
  stato: "attivo",
});

function Chips({ options, value, onChange, testId }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${value === v ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-700"}`}
          data-testid={`${testId}-${v}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Impianti({ list, onChange }) {
  const set = (i, k, v) => onChange(list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  return (
    <Section title="Impianti in manutenzione">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-2" data-testid={`contratto-impianto-${i}`}>
          <Input value={it.descrizione} onChange={(e) => set(i, "descrizione", e.target.value)} placeholder="Es. Serranda avvolgibile negozio" data-testid={`contratto-impianto-${i}-descrizione`} />
          <Input value={it.matricola} onChange={(e) => set(i, "matricola", e.target.value)} placeholder="Matricola" className="w-28" data-testid={`contratto-impianto-${i}-matricola`} />
          <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="p-1 text-stone-400" aria-label="Rimuovi impianto" data-testid={`contratto-impianto-${i}-remove`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { descrizione: "", matricola: "" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-[#4A5D23]" data-testid="contratto-impianto-add">
        <Plus className="h-4 w-4" /> Aggiungi impianto
      </button>
    </Section>
  );
}

function Visite({ form, onAdd, busy }) {
  const [data, setData] = useState(todayIso());
  const [nota, setNota] = useState("");
  const visite = [...(form.visite || [])].sort((a, b) => (a.data < b.data ? 1 : -1));
  return (
    <Section title="Visite eseguite">
      {form.prossima_visita && (
        <div className="rounded-lg bg-[#4A5D23]/10 px-3 py-2 text-sm text-[#4A5D23]" data-testid="contratto-prossima">
          Prossima visita: <b>{fmtDate(form.prossima_visita)}</b>
        </div>
      )}
      {form.id ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" data-testid="contratto-visita-data" />
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (facoltativa)" className="min-w-[8rem] flex-1" data-testid="contratto-visita-nota" />
          <Button type="button" disabled={busy || !data} onClick={() => onAdd({ data, nota }).then(() => setNota(""))} className="bg-[#4A5D23] text-white" data-testid="contratto-visita-add">
            <CalendarCheck className="h-4 w-4" /> Registra
          </Button>
        </div>
      ) : (
        <p className="text-xs text-stone-500">Salva il contratto per registrare le visite.</p>
      )}
      {visite.map((v, i) => (
        <div key={i} className="flex justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" data-testid={`contratto-visita-${i}`}>
          <b>{fmtDate(v.data)}</b>
          <span className="truncate pl-2 text-stone-500">{v.nota}</span>
        </div>
      ))}
    </Section>
  );
}

export default function ContrattoDialog({ open, onOpenChange, contratto, onSaved, onDeleted }) {
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (open) setForm(contratto ? { ...blank(), ...contratto } : blank());
  }, [open, contratto]);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    try {
      const res = form.id ? await api.put(`/contratti/${form.id}`, form) : await api.post("/contratti", form);
      setForm((p) => ({ ...p, ...res.data }));
      onSaved?.(res.data);
      return res.data;
    } catch {
      toast.error("Errore nel salvataggio");
      return null;
    }
  };
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  const addVisita = (v) =>
    run("visita", async () => {
      try {
        const res = await api.post(`/contratti/${form.id}/visite`, v);
        setForm((p) => ({ ...p, ...res.data }));
        onSaved?.(res.data);
        toast.success("Visita registrata");
      } catch {
        toast.error("Errore");
      }
    });
  const share = () =>
    run("share", async () => {
      const saved = await save();
      if (!saved) return;
      try {
        const { shareContratto } = await import("../lib/contrattoPdf");
        if ((await shareContratto(saved)) === "downloaded") toast.message("PDF scaricato");
      } catch (err) {
        if (err?.name !== "AbortError") toast.error("Impossibile creare il PDF");
      }
    });
  const remove = async () => {
    if (!form.id || !window.confirm("Eliminare questo contratto?")) return;
    try {
      await api.delete(`/contratti/${form.id}`);
      onDeleted?.(form.id);
      toast.success("Contratto eliminato");
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl bg-white p-5 pb-0 sm:max-w-2xl" style={{ scrollPaddingBottom: "25vh" }} data-testid="contratto-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <FileSignature className="h-5 w-5 text-[#4A5D23]" /> Contratto di manutenzione
            {form.numero ? <span className="text-sm font-semibold text-stone-400">n. {form.numero}/{form.anno}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("save", async () => {
              if (await save()) {
                toast.success("Contratto salvato");
                onOpenChange(false);
              }
            });
          }}
          onFocusCapture={focusScrollFix}
          className="space-y-5"
        >
          <Section title="Cliente">
            <Field id="cliente" label="Cliente" value={form.cliente} onChange={(v) => set("cliente", v)} />
            <Field id="indirizzo" label="Indirizzo" value={form.indirizzo} onChange={(v) => set("indirizzo", v)} />
            <Row>
              <Field id="comune" label="Comune" value={form.comune} onChange={(v) => set("comune", v)} />
              <Field id="telefono" label="Telefono" value={form.telefono} onChange={(v) => set("telefono", v)} />
            </Row>
            <Row>
              <Field id="email-cliente" label="Email cliente" value={form.email_cliente} onChange={(v) => set("email_cliente", v)} />
              <Field id="cf-piva" label="C.F. / P.IVA" value={form.cf_piva} onChange={(v) => set("cf_piva", v)} />
            </Row>
          </Section>
          <Impianti list={form.impianti} onChange={(v) => set("impianti", v)} />
          <Section title="Durata e visite">
            <Field id="data-inizio" label="Data di inizio" type="date" value={form.data_inizio} onChange={(v) => set("data_inizio", v)} />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Durata</div>
            <Chips options={[[12, "1 anno"], [24, "2 anni"], [36, "3 anni"]]} value={form.durata_mesi} onChange={(v) => set("durata_mesi", v)} testId="contratto-durata" />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Una visita ogni</div>
            <Chips options={[[3, "3 mesi"], [4, "4 mesi"], [6, "6 mesi"], [12, "12 mesi"]]} value={form.frequenza_mesi} onChange={(v) => set("frequenza_mesi", v)} testId="contratto-frequenza" />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Rinnovo</div>
            <Chips options={[[true, "Rinnovo automatico"], [false, "Senza rinnovo"]]} value={form.rinnovo_tacito} onChange={(v) => set("rinnovo_tacito", v)} testId="contratto-rinnovo" />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Stato</div>
            <Chips options={[["attivo", "Attivo"], ["disdetto", "Disdetto"]]} value={form.stato} onChange={(v) => set("stato", v)} testId="contratto-stato" />
          </Section>
          <Section title="Prezzo">
            <Row>
              <Field id="canone" label="Canone annuo (es. € 180,00)" value={form.canone} onChange={(v) => set("canone", v)} />
              <Field id="sconto" label="Sconto interventi (es. 10%)" value={form.sconto_interventi} onChange={(v) => set("sconto_interventi", v)} />
            </Row>
            <Field id="pagamento" label="Pagamento (es. anticipato alla firma)" value={form.pagamento} onChange={(v) => set("pagamento", v)} />
            <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Note" data-testid="contratto-note" />
          </Section>
          <Visite form={form} onAdd={addVisita} busy={busy === "visita"} />
          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-stone-200 bg-white px-5 py-3">
            {form.id && (
              <Button type="button" variant="ghost" onClick={remove} className="text-red-600" data-testid="contratto-delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={share} disabled={!!busy} className="flex-1" data-testid="contratto-share">
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} PDF contratto
            </Button>
            <Button type="submit" disabled={!!busy} className="flex-1 bg-[#4A5D23] text-white" data-testid="contratto-save">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
