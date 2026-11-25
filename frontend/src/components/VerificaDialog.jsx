import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Share2, Save, Loader2, Trash2, ClipboardCheck, ArrowRightCircle } from "lucide-react";
import { Section, Row, Field, focusScrollFix } from "./DocumentoDialog";
import { loadPhotosForPdf } from "./PraticaDialog";
import JobPhotos from "./JobPhotos";
import MicButton, { appendText } from "./MicButton";
import { sharePdf } from "../lib/documentiPdf";
import * as T from "../lib/praticaTesti";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const blank = () => ({
  kind: "verifica",
  cliente: "",
  indirizzo: "",
  data: todayIso(),
  fields: { tipo_chiusura: "avvolgibile", motorizzata: false, documenti: [], punti: {}, note_punti: {}, esito: "", interventi: "", parti: "", cliente_rifiuta: false },
});

const Lbl = ({ children }) => <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{children}</div>;

function Pick({ options, isOn, onTap, testId, cols = "grid-cols-1" }) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map(([k, l]) => (
        <button
          key={String(k)}
          type="button"
          onClick={() => onTap(k)}
          className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${isOn(k) ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-700"}`}
          data-testid={`${testId}-${k}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const ESITI = [["C", "OK"], ["NC", "NO"], ["NA", "N/A"]];

function Punti({ f, setField }) {
  const setP = (k, v) => setField("punti", { ...f.punti, [k]: f.punti[k] === v ? undefined : v });
  return (
    <Section title="3 · Verifiche">
      {T.VERIFICA_PUNTI.map(([k, label]) => (
        <div key={k} className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] leading-snug text-stone-700">{label}</span>
            <div className="flex shrink-0 gap-1">
              {ESITI.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setP(k, v)}
                  className={`h-8 w-10 rounded-md border text-xs font-bold ${f.punti[k] === v ? (v === "NC" ? "border-red-600 bg-red-600 text-white" : "border-[#4A5D23] bg-[#4A5D23] text-white") : "border-stone-300 bg-white text-stone-500"}`}
                  data-testid={`verifica-punto-${k}-${v}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {f.punti[k] === "NC" && (
            <Input value={f.note_punti[k] || ""} onChange={(e) => setField("note_punti", { ...f.note_punti, [k]: e.target.value })} placeholder="Cosa non va?" className="h-8 text-sm" data-testid={`verifica-punto-${k}-nota`} />
          )}
        </div>
      ))}
    </Section>
  );
}

export default function VerificaDialog({ open, onOpenChange, documento, onSaved, onDeleted, onCreatePratica }) {
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!open) return;
    const b = blank();
    setForm(documento ? { ...b, ...documento, fields: { ...b.fields, ...documento.fields } } : b);
  }, [open, documento]);
  const f = form.fields;
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
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  const share = () =>
    run("share", async () => {
      const saved = await save();
      if (!saved) return;
      try {
        const { buildVerificaPdf } = await import("../lib/praticaPdf");
        const blob = await buildVerificaPdf({ ...saved, _photos: await loadPhotosForPdf(`verifica-${saved.id}`) });
        const name = `Verbale-verifica-${saved.numero || ""}-${(saved.cliente || "impianto").replace(/[^\w-]+/g, "_").slice(0, 40)}.pdf`;
        if ((await sharePdf(blob, name, "Verbale di verifica")) === "downloaded") toast.message("PDF scaricato");
      } catch (err) {
        if (err?.name !== "AbortError") toast.error("Impossibile creare il PDF");
      }
    });
  const toPratica = () =>
    run("pratica", async () => {
      const saved = await save();
      if (!saved) return;
      onOpenChange(false);
      onCreatePratica?.({
        kind: "pratica",
        cliente: saved.cliente,
        indirizzo: saved.indirizzo,
        fields: {
          comune: f.comune,
          tipo_chiusura: f.tipo_chiusura,
          sicurezze: T.SICUREZZE_DEFAULT[f.tipo_chiusura],
          modello: f.modello,
          note_collaudo: `Adeguamento a seguito del verbale di verifica n. ${saved.numero}/${saved.anno}.`,
          dm37: { tipo: "trasformazione" },
        },
      });
    });
  const remove = async () => {
    if (!form.id || !window.confirm("Eliminare questo verbale?")) return;
    try {
      await api.delete(`/documenti/${form.id}`);
      api.delete(`/clients/verifica-${form.id}/photos`).catch(() => {});
      onDeleted?.(form.id);
      toast.success("Verbale eliminato");
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl bg-white p-5 pb-0 sm:max-w-2xl" style={{ scrollPaddingBottom: "25vh" }} data-testid="verifica-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <ClipboardCheck className="h-5 w-5 text-[#4A5D23]" /> Verifica impianto esistente
            {form.numero ? <span className="text-sm font-semibold text-stone-400">n. {form.numero}/{form.anno}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("save", async () => {
              if (await save()) {
                toast.success("Verbale salvato");
                onOpenChange(false);
              }
            });
          }}
          onFocusCapture={focusScrollFix}
          className="space-y-5"
        >
          <Section title="1 · Cliente e impianto">
            <Field id="cliente" label="Cliente" value={form.cliente} onChange={(v) => set("cliente", v)} />
            <Field id="indirizzo" label="Indirizzo" value={form.indirizzo} onChange={(v) => set("indirizzo", v)} />
            <Field id="comune" label="Comune (Provincia)" value={f.comune} onChange={(v) => setField("comune", v)} />
            <Lbl>Tipo di chiusura</Lbl>
            <Pick options={Object.entries(T.TIPI_CHIUSURA).map(([k, l]) => [k, l.replace(/ motorizzat[ao]/, "")])} isOn={(k) => f.tipo_chiusura === k} onTap={(k) => setField("tipo_chiusura", k)} testId="verifica-tipo" cols="grid-cols-2" />
            <Field id="modello" label="Modello / descrizione" value={f.modello} onChange={(v) => setField("modello", v)} />
            <Row>
              <Field id="anno-stimato" label="Anno (anche stimato)" value={f.anno_stimato} onChange={(v) => setField("anno_stimato", v)} numeric />
              <Field id="installatore" label="Installatore originale" value={f.installatore} onChange={(v) => setField("installatore", v)} />
            </Row>
            <Pick options={[[false, "Manuale"], [true, "Già motorizzata"]]} isOn={(k) => f.motorizzata === k} onTap={(k) => setField("motorizzata", k)} testId="verifica-motorizzata" cols="grid-cols-2" />
            <Field id="data" label="Data della verifica" type="date" value={form.data} onChange={(v) => set("data", v)} />
          </Section>
          <Section title="2 · Documenti presenti">
            <Pick
              options={T.DOC_ESISTENTI}
              isOn={(k) => f.documenti.includes(k)}
              onTap={(k) => setField("documenti", f.documenti.includes(k) ? f.documenti.filter((x) => x !== k) : [...f.documenti, k])}
              testId="verifica-doc"
              cols="grid-cols-2"
            />
          </Section>
          <Punti f={f} setField={setField} />
          <Section title="4 · Esito e interventi">
            <Pick options={Object.entries(T.ESITI_VERIFICA)} isOn={(k) => f.esito === k} onTap={(k) => setField("esito", k)} testId="verifica-esito" />
            <Lbl>Interventi necessari o consigliati</Lbl>
            <div className="relative">
              <Textarea rows={3} value={f.interventi} onChange={(e) => setField("interventi", e.target.value)} className="pr-12" data-testid="verifica-interventi" />
              <MicButton onText={(t) => setField("interventi", appendText(f.interventi, t))} testId="verifica-interventi-mic" />
            </div>
            <Lbl>Parti da sostituire</Lbl>
            <div className="relative">
              <Textarea rows={2} value={f.parti} onChange={(e) => setField("parti", e.target.value)} className="pr-12" data-testid="verifica-parti" />
              <MicButton onText={(t) => setField("parti", appendText(f.parti, t))} testId="verifica-parti-mic" />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-sm text-stone-700">
              <input type="checkbox" checked={!!f.cliente_rifiuta} onChange={(e) => setField("cliente_rifiuta", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0047ab]" data-testid="verifica-cliente-rifiuta" />
              Il cliente non vuole fare gli interventi indicati
            </label>
          </Section>
          <Section title="5 · Foto dello stato di fatto">
            {form.id ? (
              <JobPhotos clientId={`verifica-${form.id}`} title="Foto della verifica" emptyText="Fotografa ruggine, molle, guide e tutto ciò che non va: finiscono nel PDF." />
            ) : (
              <button type="button" onClick={() => run("save", save)} className="w-full py-2 text-sm font-semibold text-[#4A5D23]" data-testid="verifica-save-for-photos">
                Salva il verbale per aggiungere le foto
              </button>
            )}
          </Section>
          {f.esito && f.esito !== "non_idonea" && (
            <button type="button" onClick={toPratica} disabled={!!busy} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#4A5D23] py-2.5 text-sm font-bold text-[#4A5D23]" data-testid="verifica-crea-pratica">
              {busy === "pratica" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />} Crea pratica di adeguamento
            </button>
          )}
          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-stone-200 bg-white px-5 py-3">
            {form.id && (
              <Button type="button" variant="ghost" onClick={remove} className="text-red-600" data-testid="verifica-delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={share} disabled={!!busy} className="flex-1" data-testid="verifica-share">
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} PDF verbale
            </Button>
            <Button type="submit" disabled={!!busy} className="flex-1 bg-[#4A5D23] text-white" data-testid="verifica-save">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
