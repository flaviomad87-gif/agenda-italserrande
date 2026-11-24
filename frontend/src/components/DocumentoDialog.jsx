import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { NORME, TIPI_INTERVENTO, buildCePdf, buildManutenzionePdf, documentoFileName, sharePdf } from "../lib/documentiPdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Share2, Save, Loader2, Trash2, ShieldCheck, Wrench } from "lucide-react";

export const KINDS = {
  ce: { title: "Dichiarazione CE", icon: ShieldCheck, build: buildCePdf },
  manutenzione: { title: "Registro di Manutenzione", icon: Wrench, build: buildManutenzionePdf },
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const blank = (kind) => ({
  kind,
  cliente: "",
  indirizzo: "",
  data: todayIso(),
  fields: kind === "ce" ? { norme: NORME.map(() => ({ applica: null, nota: "" })) } : { tipi: [], descrizione: "" },
});

export default function DocumentoDialog({ open, onOpenChange, kind, documento, onSaved, onDeleted }) {
  const [form, setForm] = useState(blank(kind));
  const [busy, setBusy] = useState("");
  const cfg = KINDS[kind];

  useEffect(() => {
    if (open) setForm(documento ? { ...blank(kind), ...documento, fields: { ...blank(kind).fields, ...documento.fields } } : blank(kind));
  }, [open, documento, kind]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setField = (k, v) => setForm((p) => ({ ...p, fields: { ...p.fields, [k]: v } }));

  const save = async () => {
    try {
      const res = form.id ? await api.put(`/documenti/${form.id}`, form) : await api.post("/documenti", form);
      setForm((p) => ({ ...p, ...res.data }));
      onSaved?.(res.data);
      return res.data;
    } catch {
      toast.error("Errore nel salvataggio");
      return null;
    }
  };

  const saveAndClose = async () => {
    setBusy("save");
    const saved = await save();
    setBusy("");
    if (saved) {
      toast.success("Documento salvato");
      onOpenChange(false);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const saved = await save();
      if (!saved) return;
      const blob = await cfg.build(saved);
      const how = await sharePdf(blob, documentoFileName(saved), cfg.title);
      if (how === "downloaded") toast.message("PDF scaricato");
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Impossibile creare il PDF");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!form.id || !window.confirm("Eliminare questo documento?")) return;
    try {
      await api.delete(`/documenti/${form.id}`);
      toast.success("Documento eliminato");
      onDeleted?.(form.id);
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  const Icon = cfg.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border-stone-200/70 bg-white p-5 pb-0 sm:max-w-2xl"
        style={{ scrollPaddingBottom: "25vh" }}
        data-testid="documento-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Icon className="h-5 w-5 text-[#4A5D23]" />
            {cfg.title}
            {form.numero ? <span className="text-sm font-semibold text-stone-400">n. {form.numero}/{form.anno}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveAndClose();
          }}
          onFocusCapture={focusScrollFix}
          className="space-y-5"
        >
          {kind === "ce" ? (
            <CeForm form={form} set={set} setField={setField} />
          ) : (
            <ManutenzioneForm form={form} set={set} setField={setField} />
          )}

          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-stone-200 bg-white px-5 py-3">
            {form.id && (
              <Button type="button" variant="ghost" onClick={remove} className="text-red-600 hover:bg-red-50" data-testid="documento-delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={share} disabled={!!busy} className="flex-1" data-testid="documento-share">
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} PDF / Condividi
            </Button>
            <Button type="submit" disabled={!!busy} className="flex-1 bg-[#4A5D23] text-white hover:bg-[#3C4C1C]" data-testid="documento-save">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CeForm({ form, set, setField }) {
  const f = form.fields;
  const setNorma = (i, patch) => setField("norme", f.norme.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  return (
    <>
      <Section title="Dati cliente e impianto">
        <Field id="cliente" label="Cliente / Committente" value={form.cliente} onChange={(v) => set("cliente", v)} />
        <Field id="indirizzo" label="Indirizzo di installazione" value={form.indirizzo} onChange={(v) => set("indirizzo", v)} />
        <Field id="tipologia" label="Tipologia chiusura / impianto" value={f.tipologia} onChange={(v) => setField("tipologia", v)} />
        <Row>
          <Field id="comune" label="Comune / Provincia" value={f.comune} onChange={(v) => setField("comune", v)} />
          <Field id="anno" label="Anno installazione" value={f.anno_installazione} onChange={(v) => setField("anno_installazione", v)} numeric />
        </Row>
        <Field id="matricola" label="Matricola / N° commessa o preventivo" value={f.matricola} onChange={(v) => setField("matricola", v)} />
      </Section>
      <Section title="Comando / sicurezza / identificazione">
        <Field id="comando" label="Comando / Motorizzazione" value={f.comando} onChange={(v) => setField("comando", v)} />
        <Row>
          <Field id="norma-rif" label="Norma di riferimento" value={f.norma_riferimento} onChange={(v) => setField("norma_riferimento", v)} />
          <Field id="collaudo" label="Collaudo / verbale N°" value={f.collaudo} onChange={(v) => setField("collaudo", v)} />
        </Row>
        <Row>
          <Field id="targhetta" label="Targhetta CE" value={f.targhetta_ce} onChange={(v) => setField("targhetta_ce", v)} />
          <Field id="uni-en" label="UNI EN 13241" value={f.uni_en_13241} onChange={(v) => setField("uni_en_13241", v)} />
        </Row>
      </Section>
      <Section title="Conformità alle direttive e norme">
        {NORME.map((label, i) => (
          <div key={label} className="space-y-2 rounded-lg border border-stone-200 bg-white p-2.5" data-testid={`ce-norma-${i + 1}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-stone-700">
                <b>{i + 1}.</b> {label}
              </span>
              <YesNo value={f.norme[i]?.applica} onChange={(v) => setNorma(i, { applica: v })} testId={`ce-norma-${i + 1}`} />
            </div>
            <Input
              value={f.norme[i]?.nota || ""}
              onChange={(e) => setNorma(i, { nota: e.target.value })}
              placeholder="Nota (facoltativa)"
              className="h-9 text-sm"
              data-testid={`ce-norma-${i + 1}-nota`}
            />
          </div>
        ))}
      </Section>
      <Section title="Data">
        <Field id="data" label="Data (accanto alla firma cliente)" type="date" value={form.data} onChange={(v) => set("data", v)} />
      </Section>
    </>
  );
}

function ManutenzioneForm({ form, set, setField }) {
  const f = form.fields;
  const toggle = (k) => setField("tipi", f.tipi.includes(k) ? f.tipi.filter((t) => t !== k) : [...f.tipi, k]);
  return (
    <>
      <Section title="Intervento">
        <Field id="cliente" label="Cliente (solo per archivio)" value={form.cliente} onChange={(v) => set("cliente", v)} />
        <Field id="indirizzo" label="Indirizzo intervento" value={form.indirizzo} onChange={(v) => set("indirizzo", v)} />
        <Field id="data" label="Data intervento" type="date" value={form.data} onChange={(v) => set("data", v)} />
      </Section>
      <Section title="Tipo di intervento">
        <div className="grid grid-cols-2 gap-2">
          {TIPI_INTERVENTO.map(([k, label]) => {
            const on = f.tipi.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  on ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-700"
                }`}
                data-testid={`man-tipo-${k}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Descrizione dell'intervento">
        <p className="text-xs text-stone-500">Descrivi l'intervento ed eventuali rischi residui e/o uso improprio prevedibile.</p>
        <Textarea
          rows={7}
          value={f.descrizione || ""}
          onChange={(e) => setField("descrizione", e.target.value)}
          data-testid="man-descrizione"
        />
      </Section>
    </>
  );
}

export function Section({ title, children }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[#4A5D23]">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export const Row = ({ children }) => <div className="grid grid-cols-2 gap-2">{children}</div>;

export function Field({ id, label, value, onChange, type = "text", numeric = false }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</Label>
      <Input
        type={type}
        inputMode={numeric ? "numeric" : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`documento-input-${id}`}
      />
    </div>
  );
}

export function YesNo({ value, onChange, testId }) {
  const opt = (val, text) => (
    <button
      type="button"
      onClick={() => onChange(value === val ? null : val)}
      className={`h-8 w-12 rounded-lg border text-sm font-semibold transition-colors ${
        value === val ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-600"
      }`}
      data-testid={`${testId}-${val ? "si" : "no"}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex shrink-0 gap-1.5">
      {opt(true, "Sì")}
      {opt(false, "No")}
    </div>
  );
}

export function focusScrollFix(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement) || !["INPUT", "TEXTAREA"].includes(t.tagName)) return;
  window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
}
