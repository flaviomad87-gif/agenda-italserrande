import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { buildRilievoPdf, rilievoFileName } from "../lib/rilievoPdf";
import { PANEL_MODELS_IMG, PANEL_MODELS, panelCode } from "../lib/panelModelsImg";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Share2, Save, Loader2, Trash2, FileText } from "lucide-react";

// Modulo "MODULO RILIEVI" porta sezionale: stessi campi e ordine del modulo cartaceo.
export default function SezionaleRilievoDialog({ open, onOpenChange, rilievo, defaultValues, onSaved, onDeleted }) {
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (rilievo) {
      setForm({ ...blankForm(), ...rilievo });
      setSavedId(rilievo.id);
    } else {
      setForm({ ...blankForm(), ...loadHeader(), ...(defaultValues || {}), data: todayIso() });
      setSavedId(null);
    }
  }, [open, rilievo, defaultValues]);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const f = (key) => ({ value: form[key], onChange: (v) => update(key, v) });

  const save = async () => {
    setSaving(true);
    saveHeader(form);
    try {
      const res = savedId
        ? await api.put(`/rilievi-sezionali/${savedId}`, form)
        : await api.post("/rilievi-sezionali", form);
      toast.success(savedId ? "Rilievo salvato" : "Rilievo creato");
      setSavedId(res.data.id);
      onSaved?.(res.data);
      return true;
    } catch {
      toast.error("Errore nel salvataggio");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => {
    if (await save()) onOpenChange(false);
  };

  const sharePdf = async () => {
    setSharing(true);
    try {
      if (!(await save())) return;
      const pdfBlob = buildRilievoPdf(form);
      const fileName = rilievoFileName(form);
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Modulo rilievi" });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.message("PDF scaricato. Condividilo manualmente al fornitore.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Impossibile condividere");
    } finally {
      setSharing(false);
    }
  };

  const remove = async () => {
    if (!savedId || !window.confirm("Eliminare questo rilievo?")) return;
    try {
      await api.delete(`/rilievi-sezionali/${savedId}`);
      toast.success("Rilievo eliminato");
      onDeleted?.(savedId);
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  const busy = saving || sharing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border-stone-200/70 bg-white p-5 pb-0 sm:max-w-2xl"
        style={{ scrollPaddingBottom: "25vh", scrollPaddingTop: "2rem" }}
        data-testid="rilievo-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <FileText className="h-5 w-5 text-[#4A5D23]" />
            {savedId ? "Modifica rilievo" : "Modulo rilievi"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            saveAndClose();
          }}
          onFocusCapture={(e) => {
            e.stopPropagation();
            focusScrollFix(e);
          }}
          className="space-y-5"
        >
          <Section title="Intestazione">
            <Row>
              <Field label="RIF" {...f("rif")} />
              <Field label="Data" type="date" {...f("data")} />
            </Row>
            <Field label="Ditta" {...f("ditta")} />
            <Row>
              <Field label="Via" {...f("via")} />
              <Field label="Città" {...f("citta")} />
            </Row>
            <Row>
              <Field label="Tel" {...f("tel")} />
              <Field label="Fax" {...f("fax")} />
            </Row>
            <Field label="E-mail" {...f("email")} />
          </Section>

          <Section title="Vista interna">
            <Row>
              <Field label="h = Architrave" numeric {...f("architrave")} />
              <Field label="H = Altezza foro muro" numeric {...f("h")} />
            </Row>
            <Row>
              <Field label="L = Larghezza foro muro" numeric {...f("l")} />
              <Field label="HT = Altezza totale" numeric {...f("ht")} />
            </Row>
            <Row>
              <Field label="Mazzetta laterale SX" numeric {...f("mazzetta_sx")} />
              <Field label="Mazzetta laterale DX" numeric {...f("mazzetta_dx")} />
            </Row>
            <Field label="Pezzi No" numeric {...f("pezzi")} />
          </Section>

          <Section title="Tipo">
            <TipoPicker value={form.tipo} onChange={(t) => update("tipo", t)} />
          </Section>

          <Section title="Dettagli">
            <Row>
              <Field label="Modello" {...f("modello")} />
              <Field label="Colore" {...f("colore")} />
            </Row>
            <PanelPicker value={form.modello} onChange={(v) => update("modello", v)} />
            <Row3>
              <Field label="Oblò No" numeric {...f("oblo")} />
              <Field label="Oblò H" numeric {...f("oblo_h")} />
              <Field label="Oblò W" numeric {...f("oblo_w")} />
            </Row3>
            <YesNo label="Portina" {...f("portina")} />
            <Row>
              <Field label="Portina H" numeric {...f("portina_h")} />
              <Field label="Portina W" numeric {...f("portina_w")} />
            </Row>
            <Field label="h1 = Veletta" numeric {...f("veletta")} />
            <Row>
              <Field label="Spallette SX1 mm" numeric {...f("spallette_sx1")} />
              <Field label="Spallette DX1 mm" numeric {...f("spallette_dx1")} />
            </Row>
            <Field label="Profondità del garage mm" numeric {...f("profondita_garage")} />
            <Field label="Vs. riferimento cliente" {...f("riferimento_cliente")} />
            <Field label="Destinazione merce" {...f("destinazione_merce")} />
          </Section>

          <Section title="Accessori">
            <YesNo label="Maniglione antipanico" {...f("manigliore_antipanico")} />
            <YesNo label="Motore" {...f("motore")} />
            <YesNo label="Fotocellule" {...f("fotocell")} />
            <YesNo label="Lampeggiante" {...f("lampeg")} />
            <YesNo label="Montaggio" {...f("montag")} />
            <YesNo label="Sblocco" {...f("sblocco")} />
            <YesNo label="Maniglia" {...f("maniglia")} />
          </Section>

          <Section title="Note">
            <Textarea
              value={form.note || ""}
              onChange={(e) => update("note", e.target.value)}
              rows={3}
              placeholder="Note per il fornitore..."
              data-testid="rilievo-input-note"
            />
          </Section>

          <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-stone-200 bg-white px-5 py-3 sm:flex-row sm:justify-between">
            {savedId ? (
              <Button type="button" variant="ghost" onClick={remove} className="h-11 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700" data-testid="rilievo-delete">
                <Trash2 className="mr-1.5 h-4 w-4" /> Elimina
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="h-11 rounded-xl" data-testid="rilievo-cancel">
                Annulla
              </Button>
              <Button type="button" onClick={sharePdf} disabled={busy} className="h-11 rounded-xl bg-[#B8683D] px-4 text-white hover:bg-[#9F5630]" data-testid="rilievo-share">
                {sharing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Share2 className="mr-1.5 h-4 w-4" />}
                Invia PDF
              </Button>
              <Button type="submit" disabled={busy} className="h-11 rounded-xl bg-[#4A5D23] px-4 text-white hover:bg-[#3C4C1C]" data-testid="rilievo-save">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Salva
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Section({ title, children }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[#4A5D23]">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const Row = ({ children }) => <div className="grid grid-cols-2 gap-2">{children}</div>;
const Row3 = ({ children }) => <div className="grid grid-cols-3 gap-2">{children}</div>;

function Field({ label, value, onChange, type = "text", numeric = false }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</Label>
      <Input
        type={type}
        inputMode={numeric ? "decimal" : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={numeric ? "tabular-nums" : ""}
        data-testid={`rilievo-input-${slug(label)}`}
      />
    </div>
  );
}

// Si / No come sul modulo; ritoccare la scelta attiva la azzera.
function YesNo({ label, value, onChange }) {
  const opt = (val, text) => (
    <button
      type="button"
      onClick={() => onChange(value === val ? null : val)}
      className={`h-9 w-14 rounded-lg border text-sm font-semibold transition-colors ${
        value === val ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
      }`}
      data-testid={`rilievo-${slug(label)}-${text.toLowerCase()}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className="flex gap-1.5">
        {opt(true, "Sì")}
        {opt(false, "No")}
      </div>
    </div>
  );
}

// Disegni delle spalle come sul modulo: L = spalla con risvolto, I = spalla dritta
const TIPI = { A: ["L", "L"], B: ["I", "I"], C: ["L", "I"], D: ["I", "L"] };

function Jamb({ shape, mirror }) {
  const d = shape === "L" ? "M0 0 H22 V6 H8 V34 H0 Z" : "M0 2 H8 V34 H0 Z";
  return <path d={d} transform={mirror ? "translate(84 0) scale(-1 1)" : undefined} fill="#e5e5e5" stroke="currentColor" strokeWidth="1.2" />;
}

function TipoPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Object.entries(TIPI).map(([t, [l, r]]) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(value === t ? "" : t)}
          className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
            value === t ? "border-[#4A5D23] bg-[#4A5D23]/10 text-[#4A5D23]" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
          }`}
          data-testid={`rilievo-tipo-${t}`}
        >
          <span className="text-xs font-semibold">Tipo {t}</span>
          <svg viewBox="-2 -2 88 38" className="h-8 w-full">
            <Jamb shape={l} />
            <Jamb shape={r} mirror />
          </svg>
        </button>
      ))}
    </div>
  );
}

// Tocca un pannello sull'immagine per scriverne la sigla nel campo Modello
function PanelPicker({ value, onChange }) {
  const current = panelCode(value);
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        Modello pannello <span className="font-normal normal-case tracking-normal text-stone-400">· tocca per scegliere</span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-white">
        <img src={PANEL_MODELS_IMG} alt="Modello pannello" className="block w-full select-none" draggable={false} data-testid="rilievo-panel-models-img" />
        {PANEL_MODELS.map((m) => (
          <button
            key={m.code}
            type="button"
            onClick={() => onChange(current === m.code ? "" : m.code)}
            style={{ left: `${m.from * 100}%`, width: `${(m.to - m.from) * 100}%` }}
            className={`absolute inset-y-0 rounded-md border-2 transition-colors ${
              current === m.code ? "border-[#4A5D23] bg-[#4A5D23]/15" : "border-transparent active:bg-stone-900/5"
            }`}
            aria-label={`Modello ${m.code}`}
            data-testid={`rilievo-panel-${m.code}`}
          >
            {current === m.code && (
              <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-[#4A5D23] px-1.5 text-[11px] font-bold text-white">{m.code}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function blankForm() {
  return {
    rif: "", data: "", ditta: "", via: "", citta: "", tel: "", fax: "", email: "",
    ht: "", h: "", l: "", architrave: "", veletta: "",
    mazzetta_sx: "", mazzetta_dx: "", spallette_sx1: "", spallette_dx1: "", profondita_garage: "",
    pezzi: "", tipo: "", modello: "", colore: "", oblo: "", oblo_h: "", oblo_w: "",
    portina: null, portina_h: "", portina_w: "",
    manigliore_antipanico: null, motore: null, fotocell: null, lampeg: null, montag: null, sblocco: null, maniglia: null,
    riferimento_cliente: "", destinazione_merce: "", note: "",
    client_id: null,
  };
}

const HEADER_KEYS = ["ditta", "via", "citta", "tel", "fax", "email"];
const HEADER_LS = "rilievo_header_v1";

function loadHeader() {
  try {
    return JSON.parse(localStorage.getItem(HEADER_LS)) || {};
  } catch {
    return {};
  }
}

function saveHeader(form) {
  const h = Object.fromEntries(HEADER_KEYS.map((k) => [k, form[k] || ""]));
  if (HEADER_KEYS.some((k) => h[k])) localStorage.setItem(HEADER_LS, JSON.stringify(h));
}

function focusScrollFix(e) {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  window.setTimeout(() => {
    try {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }, 350);
}
