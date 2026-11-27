import { Section, Row, Field } from "./DocumentoDialog";
import { Choice, Lbl } from "./PraticaForm";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { MARCHE, ALIMENTAZIONI, MODIFICHE, CONSEGNA_DOMANDE } from "../lib/praticaExtra";

const SN = [["si", "Sì"], ["no", "No"]];

export function BrandInput({ id, label, value, onChange }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</Label>
      <Input list="marche-automazioni" value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={`documento-input-${id}`} />
      <datalist id="marche-automazioni">
        {MARCHE.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

function ChiusuraAutomazione({ f, setField }) {
  const ch = f.chiusura || {};
  const au = f.automazione || {};
  const setCh = (k, v) => setField("chiusura", { ...ch, [k]: v });
  const setAu = (k, v) => setField("automazione", { ...au, [k]: v });
  return (
    <>
      <Row>
        <Field id="cliente-tel" label="Telefono committente" value={f.cliente_tel} onChange={(v) => setField("cliente_tel", v)} />
        <Field id="cliente-cf" label="P.IVA / C.F. committente" value={f.cliente_cf} onChange={(v) => setField("cliente_cf", v)} />
      </Row>
      <Lbl>Chiusura (produttore / fornitore)</Lbl>
      <Row>
        <Field id="ch-produttore" label="Produttore" value={ch.produttore} onChange={(v) => setCh("produttore", v)} />
        <Field id="ch-anno" label="Anno fabbricazione" value={ch.anno} onChange={(v) => setCh("anno", v)} numeric />
      </Row>
      <Row>
        <Field id="ch-matricola" label="Matricola chiusura" value={ch.matricola} onChange={(v) => setCh("matricola", v)} />
        <Field id="ch-ante" label="N. ante / sezioni" value={ch.ante} onChange={(v) => setCh("ante", v)} numeric />
      </Row>
      <Field id="ch-peso" label="Peso totale kg" value={ch.peso} onChange={(v) => setCh("peso", v)} numeric />
      <Lbl>Dichiarazione CE del fabbricante della chiusura</Lbl>
      <Choice options={SN} value={ch.ce} onChange={(v) => setCh("ce", v)} testId="pratica-ch-ce" />
      <Lbl>Automatismo</Lbl>
      <Row>
        <BrandInput id="au-produttore" label="Produttore" value={au.produttore} onChange={(v) => setAu("produttore", v)} />
        <Field id="au-modello" label="Modello" value={au.modello} onChange={(v) => setAu("modello", v)} />
      </Row>
      <Field id="au-matricola" label="Matricola automatismo" value={au.matricola} onChange={(v) => setAu("matricola", v)} />
      <Lbl>Alimentazione</Lbl>
      <Choice options={ALIMENTAZIONI.map((a) => [a, a])} value={au.alimentazione} onChange={(v) => setAu("alimentazione", v)} testId="pratica-au-alim" cols={3} />
      {f.comando_tipo === "impulsivo" && (
        <>
          <Lbl>Chiusura in vista dal punto di comando?</Lbl>
          <Choice options={SN} value={f.in_vista} onChange={(v) => setField("in_vista", v)} testId="pratica-in-vista" />
        </>
      )}
    </>
  );
}

function Intervento({ f, setField }) {
  return (
    <>
      <Lbl>Tipo di intervento</Lbl>
      <Choice options={[["nuovo", "Nuova installazione"], ["esistente", "Impianto esistente"]]} value={f.intervento || "nuovo"} onChange={(v) => setField("intervento", v)} testId="pratica-intervento" />
      {f.intervento === "esistente" && (
        <>
          <Lbl>Modifiche eseguite</Lbl>
          <Choice options={MODIFICHE} value={f.modifiche || []} onChange={(v) => setField("modifiche", v)} testId="pratica-modifiche" multi cols={1} />
          <Lbl>È una modifica sostanziale?</Lbl>
          <Choice options={SN} value={f.modifica_sostanziale} onChange={(v) => setField("modifica_sostanziale", v)} testId="pratica-mod-sost" />
        </>
      )}
    </>
  );
}

function Consegna({ f, setField }) {
  const cs = f.consegna || {};
  return (
    <>
      <Lbl>Consegna al cliente</Lbl>
      <button
        type="button"
        onClick={() => setField("consegna", Object.fromEntries(CONSEGNA_DOMANDE.map(([k]) => [k, "si"])))}
        className="w-full rounded-lg border border-[#4A5D23] bg-[#4A5D23]/10 py-2 text-sm font-semibold text-[#4A5D23]"
        data-testid="pratica-consegna-tutto-si"
      >
        Segna tutto Sì
      </button>
      {CONSEGNA_DOMANDE.map(([k, l]) => (
        <div key={k} className="space-y-1">
          <div className="text-[13px] text-stone-700">{l}</div>
          <Choice options={SN} value={cs[k]} onChange={(v) => setField("consegna", { ...cs, [k]: v })} testId={`pratica-consegna-${k}`} />
        </div>
      ))}
    </>
  );
}

export default function FascicoloSection({ form, setField }) {
  const f = form.fields;
  return (
    <Section title="3c · Fascicolo tecnico (Allegati A, B, C)">
      <details className="group space-y-3" data-testid="fascicolo-details">
        <summary className="cursor-pointer text-sm font-semibold text-[#4A5D23]" data-testid="fascicolo-toggle">
          <span className="group-open:hidden">Apri dati del fascicolo</span>
          <span className="hidden group-open:inline">Chiudi dati del fascicolo</span>
        </summary>
        <div className="mt-3 space-y-3">
          <ChiusuraAutomazione f={f} setField={setField} />
          <Intervento f={f} setField={setField} />
          <Consegna f={f} setField={setField} />
        </div>
      </details>
    </Section>
  );
}
