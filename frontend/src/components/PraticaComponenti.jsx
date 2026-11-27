import { Section, Row, Field } from "./DocumentoDialog";
import { COMPONENTI } from "../lib/praticaExtra";
import { BrandInput } from "./PraticaFascicolo";

export default function ComponentiSection({ form, setField }) {
  const c = form.fields.componenti || {};
  const set = (k, campo, v) => setField("componenti", { ...c, [k]: { ...c[k], [campo]: v } });
  return (
    <Section title="3b · Componenti installati (marca, modello, n. serie)">
      <details data-testid="componenti-details" className="group">
      <summary className="cursor-pointer text-sm font-semibold text-[#4A5D23]" data-testid="componenti-toggle">
        <span className="group-open:hidden">Apri elenco componenti</span>
        <span className="hidden group-open:inline">Chiudi elenco componenti</span>
      </summary>
      <p className="my-2 text-xs text-stone-500">Vuoto = usa motore, centralina e radiocomandi indicati sopra.</p>
      {COMPONENTI.map(([k, l]) => (
        <div key={k} className="space-y-1 border-b border-border pb-2" data-testid={`componente-${k}`}>
          <div className="text-sm font-semibold">{l}</div>
          <Row>
            <BrandInput id={`comp-${k}-marca`} label="Marca" value={c[k]?.marca} onChange={(v) => set(k, "marca", v)} />
            <Field id={`comp-${k}-modello`} label="Modello" value={c[k]?.modello} onChange={(v) => set(k, "modello", v)} />
          </Row>
          <Row>
            <Field id={`comp-${k}-serie`} label="N. serie" value={c[k]?.serie} onChange={(v) => set(k, "serie", v)} />
            <Field id={`comp-${k}-qta`} label="Q.tà" value={c[k]?.qta} onChange={(v) => set(k, "qta", v)} numeric />
          </Row>
        </div>
      ))}
      </details>
    </Section>
  );
}
