import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Share2, Save, Loader2, Trash2, FolderCheck, FileDown } from "lucide-react";
import { focusScrollFix } from "./DocumentoDialog";
import ComponentiSection from "./PraticaComponenti";
import { ClienteSection, ImpiantoSection, SicurezzeSection, CollaudoSection, NormeSection, RischiSection, Dm37Section, SchemaSection } from "./PraticaForm";
import { NORME, sharePdf } from "../lib/documentiPdf";
import * as T from "../lib/praticaTesti";

const TECNICO_LS = "pratica_tecnico_v1";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const blankPratica = () => ({
  kind: "pratica",
  cliente: "",
  indirizzo: "",
  data: todayIso(),
  fields: {
    tipo_chiusura: "avvolgibile",
    sicurezze: T.SICUREZZE_DEFAULT.avvolgibile,
    comando_tipo: "impulsivo",
    alimentazione: "230 V ~ 50 Hz",
    uso: "privato",
    uso_edificio: "civile",
    anno_installazione: String(new Date().getFullYear()),
    norme: NORME.map(() => ({ applica: true, nota: "" })),
    collaudo: {},
    esito: "positivo",
    rischi_residui: T.RISCHI_RESIDUI_DEFAULT,
    schema: T.SCHEMA_DEFAULT,
    dm37: { responsabile: localStorage.getItem(TECNICO_LS) || "", tipo: "nuovo", materiali: T.DM37_MATERIALI, allegati: { schema: true } },
    includi: Object.fromEntries(T.DOCUMENTI_PRATICA.map(([k]) => [k, true])),
  },
});

const toDataUrl = (blob) =>
  new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });

const imgSize = (src) =>
  new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = src;
  });

// Foto degli schemi allegate alla pratica, pronte per il PDF
export async function loadPhotosForPdf(clientId) {
  try {
    const list = (await api.get(`/clients/${clientId}/photos`)).data || [];
    const out = [];
    for (const ph of list) {
      const blob = (await api.get(`/photos/${ph.id}/file`, { responseType: "blob" })).data;
      const src = await toDataUrl(blob);
      const size = await imgSize(src);
      if (size && /^data:image\/(jpeg|png)/.test(src)) out.push({ src, ...size });
    }
    return out;
  } catch {
    return [];
  }
}

export default function PraticaDialog({ open, onOpenChange, documento, onSaved, onDeleted }) {
  const [form, setForm] = useState(blankPratica());
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!open) return;
    const b = blankPratica();
    setForm(documento ? { ...b, ...documento, fields: { ...b.fields, ...documento.fields } } : b);
  }, [open, documento]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setField = (k, v) => setForm((p) => ({ ...p, fields: { ...p.fields, [k]: v } }));
  const setTipo = (t) => setForm((p) => ({ ...p, fields: { ...p.fields, tipo_chiusura: t, sicurezze: T.SICUREZZE_DEFAULT[t], collaudo: {} } }));

  const save = async () => {
    if (form.fields.dm37?.responsabile) localStorage.setItem(TECNICO_LS, form.fields.dm37.responsabile);
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
      toast.success("Pratica salvata");
      onOpenChange(false);
    }
  };

  const share = async (only) => {
    setBusy(only || "all");
    try {
      const saved = await save();
      if (!saved) return;
      const { buildPraticaPdf, praticaFileName } = await import("../lib/praticaPdf");
      const photos = await loadPhotosForPdf(`pratica-${saved.id}`);
      const blob = await buildPraticaPdf({ ...saved, _photos: photos }, only);
      if ((await sharePdf(blob, praticaFileName(saved, only), "Documentazione impianto")) === "downloaded") toast.message("PDF scaricato");
    } catch (err) {
      if (err?.name !== "AbortError") toast.error("Impossibile creare il PDF");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!form.id || !window.confirm("Eliminare questa pratica?")) return;
    try {
      await api.delete(`/documenti/${form.id}`);
      api.delete(`/clients/pratica-${form.id}/photos`).catch(() => {});
      toast.success("Pratica eliminata");
      onDeleted?.(form.id);
      onOpenChange(false);
    } catch {
      toast.error("Errore");
    }
  };

  const incl = form.fields.includi || {};
  const props = { form, set, setField, setTipo };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border-stone-200/70 bg-white p-5 pb-0 sm:max-w-2xl"
        style={{ scrollPaddingBottom: "25vh" }}
        data-testid="pratica-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <FolderCheck className="h-5 w-5 text-[#4A5D23]" />
            Pratica impianto
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
          <ClienteSection {...props} />
          <ImpiantoSection {...props} />
          <SicurezzeSection {...props} />
          <ComponentiSection {...props} />
          <CollaudoSection {...props} />
          <NormeSection {...props} />
          <RischiSection {...props} />
          <Dm37Section {...props} />
          <SchemaSection {...props} onNeedSave={save} />

          <section className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-[#4A5D23]">8 · Documenti da generare</div>
            {T.DOCUMENTI_PRATICA.map(([k, label]) => (
              <div key={k} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5">
                <label className="flex flex-1 items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={incl[k] !== false}
                    onChange={(e) => setField("includi", { ...incl, [k]: e.target.checked })}
                    className="h-4 w-4 accent-[#0047ab]"
                    data-testid={`pratica-includi-${k}`}
                  />
                  {label}
                </label>
                <button type="button" onClick={() => share(k)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#4A5D23]" data-testid={`pratica-pdf-${k}`}>
                  {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
                </button>
              </div>
            ))}
          </section>

          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-stone-200 bg-white px-5 py-3">
            {form.id && (
              <Button type="button" variant="ghost" onClick={remove} className="text-red-600 hover:bg-red-50" data-testid="pratica-delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => share()} disabled={!!busy} className="flex-1" data-testid="pratica-share-all">
              {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Tutta la documentazione
            </Button>
            <Button type="submit" disabled={!!busy} className="flex-1 bg-[#4A5D23] text-white hover:bg-[#3C4C1C]" data-testid="pratica-save">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
