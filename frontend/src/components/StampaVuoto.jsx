import { useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildPraticaPdf } from "../lib/praticaPdf";
import { NORME } from "../lib/documentiPdf";
import * as T from "../lib/praticaTesti";

const blankPratica = (tipo, data) => ({
  vuoto: true,
  cliente: "",
  indirizzo: "",
  data,
  fields: {
    tipo_chiusura: tipo,
    sicurezze: [],
    norme: NORME.map(() => ({ applica: true, nota: "" })),
    collaudo: {},
    esito: "",
    rischi_residui: T.RISCHI_RESIDUI_DEFAULT,
    schema: T.SCHEMA_DEFAULT,
    dm37: { responsabile: "", tipo: "", materiali: T.DM37_MATERIALI, allegati: { schema: true } },
  },
});

export default function StampaVuoto() {
  const [tipo, setTipo] = useState("avvolgibile");
  const [only, setOnly] = useState("");
  const [busy, setBusy] = useState(false);
  const [regime, setRegime] = useState(new Date() >= new Date("2027-01-20") ? "2027-01-20" : "2026-01-01");

  const scarica = async () => {
    setBusy(true);
    try {
      const blob = await buildPraticaPdf(blankPratica(tipo, regime), only || undefined);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Modulo-vuoto-${tipo}${only ? `-${only}` : ""}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      toast.error("Errore nella creazione del PDF");
    } finally {
      setBusy(false);
    }
  };

  const sel = "h-10 w-full rounded-xl border border-stone-300 bg-white px-2 text-sm";
  return (
    <details className="rounded-2xl border border-stone-200 bg-white p-3" data-testid="stampa-vuoto">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#4A5D23]" data-testid="stampa-vuoto-toggle">
        <Printer className="h-4 w-4" /> Stampa moduli vuoti da compilare a mano
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <select value={regime} onChange={(e) => setRegime(e.target.value)} className={sel} data-testid="stampa-vuoto-regime">
          <option value="2026-01-01">Installazioni fino al 19/01/2027 (Direttiva 2006/42/CE)</option>
          <option value="2027-01-20">Installazioni dal 20/01/2027 (Regolamento UE 2023/1230)</option>
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={sel} data-testid="stampa-vuoto-tipo">
          {Object.entries(T.TIPI_CHIUSURA).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select value={only} onChange={(e) => setOnly(e.target.value)} className={sel} data-testid="stampa-vuoto-documento">
          <option value="">Tutta la documentazione</option>
          {T.DOCUMENTI_PRATICA.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <button
          onClick={scarica}
          disabled={busy}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4A5D23] px-4 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="stampa-vuoto-scarica"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Scarica PDF
        </button>
      </div>
    </details>
  );
}
