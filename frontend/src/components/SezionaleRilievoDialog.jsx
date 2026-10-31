import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { buildRilievoPdf, rilievoFileName } from "../lib/rilievoPdf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import {
  Share2,
  Save,
  X,
  Loader2,
  Trash2,
  Ruler,
  Package,
  DoorOpen,
  Zap,
  Truck,
  FileText,
} from "lucide-react";

/**
 * Dialog per compilare o modificare un Rilievo Porte Sezionali.
 * Il form segue il modulo cartaceo del fornitore (misure foro muro,
 * tipologia pannello, portina, accessori, consegna).
 * - Salvataggio su DB
 * - Generazione PDF client-side (jsPDF) e condivisione via Web Share API
 *
 * Props:
 *  - open, onOpenChange, rilievo (eventuale), onSaved, onDeleted,
 *    defaultValues (per prefill da lavoro)
 */
export default function SezionaleRilievoDialog({
  open,
  onOpenChange,
  rilievo,
  defaultValues,
  onSaved,
  onDeleted,
}) {
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const idRef = useRef(null);

  // Inizializza il form all'apertura
  useEffect(() => {
    if (!open) return;
    if (rilievo) {
      setForm({ ...blankForm(), ...rilievo });
      idRef.current = rilievo.id;
    } else {
      setForm({ ...blankForm(), ...loadHeader(), ...(defaultValues || {}), data: todayIso() });
      idRef.current = null;
    }
  }, [open, rilievo, defaultValues]);

  const update = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    saveHeader(form);
    try {
      if (idRef.current) {
        const res = await api.put(`/rilievi-sezionali/${idRef.current}`, form);
        toast.success("Rilievo salvato");
        onSaved?.(res.data);
      } else {
        const res = await api.post("/rilievi-sezionali", form);
        idRef.current = res.data.id;
        toast.success("Rilievo creato");
        onSaved?.(res.data);
      }
      return true;
    } catch {
      toast.error("Errore nel salvataggio");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => {
    const ok = await save();
    if (ok) onOpenChange(false);
  };

  const sharePdf = async () => {
    setSharing(true);
    try {
      const ok = await save();
      if (!ok) return;
      const pdfBlob = buildRilievoPdf(form);
      const fileName = rilievoFileName(form);
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });
      if (
        navigator.canShare &&
        navigator.canShare({ files: [file] }) &&
        navigator.share
      ) {
        await navigator.share({
          files: [file],
          title: "Rilievo porta sezionale",
          text: `Rilievo per ${form.riferimento_cliente || form.ditta || ""}`.trim(),
        });
      } else {
        // Fallback: download diretto
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.message("PDF scaricato. Condividilo manualmente al fornitore.");
      }
    } catch (err) {
      // AbortError = l'utente ha chiuso lo sheet di condivisione, ignora
      if (err?.name !== "AbortError") toast.error("Impossibile condividere");
    } finally {
      setSharing(false);
    }
  };

  const remove = async () => {
    if (!idRef.current) return;
    if (!window.confirm("Eliminare questo rilievo?")) return;
    try {
      await api.delete(`/rilievi-sezionali/${idRef.current}`);
      toast.success("Rilievo eliminato");
      onDeleted?.(idRef.current);
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border-stone-200/70 bg-white p-5 sm:max-w-2xl"
        style={{ scrollPaddingBottom: "25vh", scrollPaddingTop: "2rem" }}
        data-testid="rilievo-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <FileText className="h-5 w-5 text-[#4A5D23]" />
            {rilievo ? "Modifica rilievo" : "Nuovo rilievo sezionale"}
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
          {/* HEADER */}
          <Section icon={FileText} title="Riferimento">
            <Row>
              <Field label="Rif." value={form.rif} onChange={(v) => update("rif", v)} />
              <Field label="Data" type="date" value={form.data} onChange={(v) => update("data", v)} />
            </Row>
            <Field label="Ditta" value={form.ditta} onChange={(v) => update("ditta", v)} />
            <Row>
              <Field label="Via" value={form.via} onChange={(v) => update("via", v)} />
              <Field label="Citta'" value={form.citta} onChange={(v) => update("citta", v)} />
            </Row>
            <Row>
              <Field label="Telefono" value={form.tel} onChange={(v) => update("tel", v)} />
              <Field label="Fax" value={form.fax} onChange={(v) => update("fax", v)} />
            </Row>
            <Field label="Email" value={form.email} onChange={(v) => update("email", v)} />
          </Section>

          {/* MISURE */}
          <Section icon={Ruler} title="Misure foro muro (mm)">
            <Row>
              <Field label="HT (Altezza totale)" value={form.ht} onChange={(v) => update("ht", v)} numeric />
              <Field label="H (Altezza foro)" value={form.h} onChange={(v) => update("h", v)} numeric />
            </Row>
            <Field label="L (Larghezza foro)" value={form.l} onChange={(v) => update("l", v)} numeric />
            <Row>
              <Field label="h architrave" value={form.architrave} onChange={(v) => update("architrave", v)} numeric />
              <Field label="h1 veletta" value={form.veletta} onChange={(v) => update("veletta", v)} numeric />
            </Row>
            <Row>
              <Field label="Mazzetta SX" value={form.mazzetta_sx} onChange={(v) => update("mazzetta_sx", v)} numeric />
              <Field label="Mazzetta DX" value={form.mazzetta_dx} onChange={(v) => update("mazzetta_dx", v)} numeric />
            </Row>
            <Row>
              <Field label="Spallette SX" value={form.spallette_sx} onChange={(v) => update("spallette_sx", v)} numeric />
              <Field label="Spallette DX" value={form.spallette_dx} onChange={(v) => update("spallette_dx", v)} numeric />
            </Row>
            <Row>
              <Field label="Spallette SX1" value={form.spallette_sx1} onChange={(v) => update("spallette_sx1", v)} numeric />
              <Field label="Spallette DX1" value={form.spallette_dx1} onChange={(v) => update("spallette_dx1", v)} numeric />
            </Row>
            <Field label="Profondita' garage" value={form.profondita_garage} onChange={(v) => update("profondita_garage", v)} numeric />
          </Section>

          {/* PANNELLO */}
          <Section icon={Package} title="Pannello">
            <Row>
              <Field label="Pezzi" value={form.pezzi} onChange={(v) => update("pezzi", v)} numeric />
              <Field label="Oblo'" value={form.oblo} onChange={(v) => update("oblo", v)} numeric />
            </Row>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                Tipo
              </Label>
              <div className="flex gap-2">
                {["A", "B", "C", "D"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update("tipo", form.tipo === t ? "" : t)}
                    className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition ${
                      form.tipo === t
                        ? "border-[#4A5D23] bg-[#4A5D23] text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                    data-testid={`rilievo-tipo-${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Row>
              <Field label="Modello (S1-S5)" value={form.modello} onChange={(v) => update("modello", v)} />
              <Field label="Colore" value={form.colore} onChange={(v) => update("colore", v)} />
            </Row>
          </Section>

          {/* PORTINA */}
          <Section icon={DoorOpen} title="Portina pedonale">
            <Toggle
              label="Portina presente"
              checked={form.portina}
              onChange={(v) => update("portina", v)}
            />
            {form.portina && (
              <>
                <Row>
                  <Field label="Altezza H" value={form.portina_h} onChange={(v) => update("portina_h", v)} numeric />
                  <Field label="Larghezza W" value={form.portina_w} onChange={(v) => update("portina_w", v)} numeric />
                </Row>
                <Toggle
                  label="Maniglia"
                  checked={form.maniglia}
                  onChange={(v) => update("maniglia", v)}
                />
                <Toggle
                  label="Maniglione antipanico"
                  checked={form.manigliore_antipanico}
                  onChange={(v) => update("manigliore_antipanico", v)}
                />
              </>
            )}
          </Section>

          {/* MOTORIZZAZIONE */}
          <Section icon={Zap} title="Motorizzazione e accessori">
            <Toggle label="Motore" checked={form.motore} onChange={(v) => update("motore", v)} />
            <Toggle label="Fotocellule" checked={form.fotocell} onChange={(v) => update("fotocell", v)} />
            <Toggle label="Lampeggiante" checked={form.lampeg} onChange={(v) => update("lampeg", v)} />
            <Toggle label="Montaggio" checked={form.montag} onChange={(v) => update("montag", v)} />
            <Toggle label="Sblocco" checked={form.sblocco} onChange={(v) => update("sblocco", v)} />
          </Section>

          {/* CONSEGNA */}
          <Section icon={Truck} title="Consegna e note">
            <Field
              label="Vs. riferimento cliente"
              value={form.riferimento_cliente}
              onChange={(v) => update("riferimento_cliente", v)}
            />
            <Field
              label="Destinazione merce"
              value={form.destinazione_merce}
              onChange={(v) => update("destinazione_merce", v)}
            />
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                Note
              </Label>
              <Textarea
                value={form.note || ""}
                data-testid="rilievo-input-note"
                onChange={(e) => update("note", e.target.value)}
                rows={3}
                placeholder="Note aggiuntive per il fornitore..."
              />
            </div>
          </Section>

          {/* FOOTER */}
          <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-stone-200 bg-white px-5 pt-3 sm:flex-row sm:justify-between">
            {rilievo ? (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                className="h-11 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                data-testid="rilievo-delete"
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Elimina
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving || sharing}
                className="h-11 rounded-xl"
                data-testid="rilievo-cancel"
              >
                Annulla
              </Button>
              <Button
                type="button"
                onClick={sharePdf}
                disabled={saving || sharing}
                className="h-11 rounded-xl bg-[#B8683D] px-4 text-white hover:bg-[#9F5630]"
                data-testid="rilievo-share"
              >
                {sharing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="mr-1.5 h-4 w-4" />
                )}
                Invia PDF
              </Button>
              <Button
                type="submit"
                disabled={saving || sharing}
                className="h-11 rounded-xl bg-[#4A5D23] px-4 text-white hover:bg-[#3C4C1C]"
                data-testid="rilievo-save"
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Salva
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Helpers di layout ----------------------------------------------------
function Section({ icon: Icon, title, children }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[#4A5D23]">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Field({ label, value, onChange, type = "text", numeric = false }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">
        {label}
      </Label>
      <Input
        type={type}
        inputMode={numeric ? "numeric" : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={numeric ? "tabular-nums" : ""}
        data-testid={`rilievo-input-${slug(label)}`}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <Checkbox
        checked={!!checked}
        onCheckedChange={onChange}
        data-testid={`rilievo-toggle-${slug(label)}`}
        className="h-5 w-5 border-stone-300 data-[state=checked]:bg-[#4A5D23] data-[state=checked]:text-white"
      />
    </label>
  );
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// --- Builders -------------------------------------------------------------
function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function blankForm() {
  return {
    rif: "", data: "",
    ditta: "", via: "", citta: "", tel: "", fax: "", email: "",
    ht: "", h: "", l: "",
    architrave: "", veletta: "",
    mazzetta_sx: "", mazzetta_dx: "",
    spallette_sx: "", spallette_dx: "", spallette_sx1: "", spallette_dx1: "",
    profondita_garage: "",
    pezzi: "", tipo: "", modello: "", colore: "", oblo: "",
    portina: false, portina_h: "", portina_w: "",
    manigliore_antipanico: false, maniglia: false,
    motore: false, fotocell: false, lampeg: false, montag: false, sblocco: false,
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

function saveHeader(f) {
  const h = Object.fromEntries(HEADER_KEYS.map((k) => [k, f[k] || ""]));
  if (HEADER_KEYS.some((k) => h[k])) localStorage.setItem(HEADER_LS, JSON.stringify(h));
}

function focusScrollFix(e) {
  const target = e.target;
  if (!target || !(target instanceof HTMLElement)) return;
  if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  window.setTimeout(() => {
    try {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }, 350);
}
