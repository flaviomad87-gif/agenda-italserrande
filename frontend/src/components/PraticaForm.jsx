import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Section, Row, Field, YesNo } from "./DocumentoDialog";
import JobPhotos from "./JobPhotos";
import MicButton, { appendText } from "./MicButton";
import { NORME, normaLabel, isNuovoReg } from "../lib/documentiPdf";
import * as T from "../lib/praticaTesti";
import { COLLAUDO_GRUPPI } from "../lib/praticaExtra";

export function Choice({ options, value, onChange, testId, multi = false, cols = 2 }) {
  const isOn = (k) => (multi ? (value || []).includes(k) : value === k);
  const tap = (k) => onChange(multi ? (isOn(k) ? value.filter((v) => v !== k) : [...(value || []), k]) : k);
  return (
    <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => tap(k)}
          className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
            isOn(k) ? "border-[#4A5D23] bg-[#4A5D23] text-white" : "border-stone-300 bg-white text-stone-700"
          }`}
          data-testid={`${testId}-${k}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Area({ id, label, value, onChange, rows = 3, placeholder }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="relative">
        <Textarea rows={rows} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="pr-12" data-testid={`pratica-${id}`} />
        <MicButton onText={(t) => onChange(appendText(value, t))} testId={`pratica-${id}-mic`} />
      </div>
    </div>
  );
}

export function RegimeNote({ iso }) {
  const nuovo = isNuovoReg(iso);
  return (
    <p className="rounded-lg bg-[#4A5D23]/10 px-3 py-2 text-xs text-[#4A5D23]" data-testid="regime-note">
      {nuovo
        ? "Dal 20/01/2027: documenti secondo il Regolamento Macchine (UE) 2023/1230 (Dichiarazione UE)."
        : "Fino al 19/01/2027: documenti secondo la Direttiva Macchine 2006/42/CE. Con data dal 20/01/2027 passano in automatico al nuovo Regolamento (UE) 2023/1230."}
    </p>
  );
}

export const Lbl = ({ children }) => <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{children}</div>;

export function ClienteSection({ form, set, setField }) {
  const f = form.fields;
  return (
    <Section title="1 · Cliente e luogo">
      <Field id="cliente" label="Cliente / Committente" value={form.cliente} onChange={(v) => set("cliente", v)} />
      <Field id="indirizzo" label="Via e numero civico" value={form.indirizzo} onChange={(v) => set("indirizzo", v)} />
      <Field id="comune" label="Comune (Provincia)" value={f.comune} onChange={(v) => setField("comune", v)} />
      <div className="grid grid-cols-3 gap-2">
        <Field id="scala" label="Scala" value={f.scala} onChange={(v) => setField("scala", v)} />
        <Field id="piano" label="Piano" value={f.piano} onChange={(v) => setField("piano", v)} />
        <Field id="interno" label="Interno" value={f.interno} onChange={(v) => setField("interno", v)} />
      </div>
      <Field id="proprietario" label="Proprietario (se diverso dal cliente)" value={f.proprietario} onChange={(v) => setField("proprietario", v)} />
      <Lbl>Edificio adibito ad uso</Lbl>
      <Choice options={Object.entries(T.DM37_USI)} value={f.uso_edificio} onChange={(v) => setField("uso_edificio", v)} testId="pratica-uso-edificio" />
      <Field id="data" label="Data installazione / collaudo" type="date" value={form.data} onChange={(v) => set("data", v)} />
      <RegimeNote iso={form.data} />
    </Section>
  );
}

export function ImpiantoSection({ form, setField, setTipo }) {
  const f = form.fields;
  return (
    <Section title="2 · Impianto">
      <Lbl>Tipo di chiusura</Lbl>
      <Choice options={Object.entries(T.TIPI_CHIUSURA)} value={f.tipo_chiusura} onChange={setTipo} testId="pratica-tipo" cols={1} />
      {f.tipo_chiusura === "avvolgibile" && (
        <>
          <Lbl>Configurazione serranda</Lbl>
          <Choice options={Object.entries(T.CONFIG_SERRANDA)} value={f.config_serranda} onChange={(v) => setField("config_serranda", v)} testId="pratica-config-serranda" cols={1} />
        </>
      )}
      <Field id="modello" label="Modello / descrizione" value={f.modello} onChange={(v) => setField("modello", v)} />
      <Row>
        <Field id="larghezza" label="Larghezza mm" value={f.larghezza} onChange={(v) => setField("larghezza", v)} numeric />
        <Field id="altezza" label="Altezza mm" value={f.altezza} onChange={(v) => setField("altezza", v)} numeric />
      </Row>
      <Row>
        <Field id="matricola" label="Matricola (vuoto = n. pratica)" value={f.matricola} onChange={(v) => setField("matricola", v)} />
        <Field id="anno" label="Anno installazione" value={f.anno_installazione} onChange={(v) => setField("anno_installazione", v)} numeric />
      </Row>
      <Row>
        <Field id="motore" label="Motore (marca e modello)" value={f.motore} onChange={(v) => setField("motore", v)} />
        <Field id="centralina" label="Centralina" value={f.centralina} onChange={(v) => setField("centralina", v)} />
      </Row>
      <Row>
        <Field id="alimentazione" label="Alimentazione" value={f.alimentazione} onChange={(v) => setField("alimentazione", v)} />
        <Field id="radiocomandi" label="Radiocomandi consegnati" value={f.n_radiocomandi} onChange={(v) => setField("n_radiocomandi", v)} numeric />
      </Row>
      <Lbl>Tipo di comando</Lbl>
      <Choice options={Object.entries(T.COMANDI)} value={f.comando_tipo} onChange={(v) => setField("comando_tipo", v)} testId="pratica-comando" cols={1} />
      <Lbl>Utilizzo</Lbl>
      <Choice options={Object.entries(T.USI_IMPIANTO)} value={f.uso} onChange={(v) => setField("uso", v)} testId="pratica-uso" cols={1} />
      <Field id="responsabile" label="Responsabile impianto (proprietario / amministratore)" value={f.responsabile} onChange={(v) => setField("responsabile", v)} />
    </Section>
  );
}

export function SicurezzeSection({ form, setField }) {
  return (
    <Section title="3 · Dispositivi di sicurezza installati">
      <Choice options={T.SICUREZZE} value={form.fields.sicurezze} onChange={(v) => setField("sicurezze", v)} testId="pratica-sic" multi cols={1} />
    </Section>
  );
}

const ESITI = [["C", "OK"], ["NC", "NO"], ["NA", "N/A"]];

export function CollaudoSection({ form, setField }) {
  const f = form.fields;
  const items = T.checklistFor(f.tipo_chiusura, isNuovoReg(form.data), f.config_serranda);
  const set = (id, v) => setField("collaudo", { ...f.collaudo, [id]: f.collaudo?.[id] === v ? undefined : v });
  const allOk = () =>
    setField("collaudo", Object.fromEntries(items.map((c) => [c.id, !c.sic || f.sicurezze.includes(c.sic) ? "C" : "NA"])));
  const vc = f.verifiche_consegna || {};
  const allVc = () => setField("verifiche_consegna", Object.fromEntries(COLLAUDO_GRUPPI.flatMap(([, it]) => it).map((t) => [t, true])));
  return (
    <Section title="4 · Collaudo (check-list sicurezze)">
      <button type="button" onClick={allOk} className="w-full rounded-lg border border-[#4A5D23] bg-[#4A5D23]/10 py-2 text-sm font-semibold text-[#4A5D23]" data-testid="pratica-collaudo-tutto-ok">
        Segna tutto conforme
      </button>
      {items.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-2">
          <span className="text-[13px] leading-snug text-stone-700">{c.label}</span>
          <div className="flex shrink-0 gap-1">
            {ESITI.map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set(c.id, v)}
                className={`h-8 w-10 rounded-md border text-xs font-bold ${
                  f.collaudo?.[c.id] === v ? (v === "NC" ? "border-red-600 bg-red-600 text-white" : "border-[#4A5D23] bg-[#4A5D23] text-white") : "border-stone-300 bg-white text-stone-500"
                }`}
                data-testid={`pratica-collaudo-${c.id}-${v}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
      <ForzeNote f={f} />
      <Lbl>Verifiche di consegna (spunta solo quelle eseguite)</Lbl>
      <button type="button" onClick={allVc} className="w-full rounded-lg border border-[#4A5D23] bg-[#4A5D23]/10 py-2 text-sm font-semibold text-[#4A5D23]" data-testid="pratica-consegna-tutte">
        Segna tutte eseguite
      </button>
      {COLLAUDO_GRUPPI.map(([g, it]) => (
        <div key={g} className="space-y-1">
          <div className="text-xs font-semibold text-stone-600">{g}</div>
          {it.map((t, i) => (
            <label key={t} className="flex items-center gap-2 text-[13px] text-stone-700">
              <input type="checkbox" checked={!!vc[t]} onChange={() => setField("verifiche_consegna", { ...vc, [t]: !vc[t] })} data-testid={`pratica-consegna-${g.split(" ")[0].toLowerCase()}-${g.split(" ").pop().toLowerCase()}-${i}`} />
              {t}
            </label>
          ))}
        </div>
      ))}
      <Lbl>Esito del collaudo</Lbl>
      <Choice options={[["positivo", "Positivo"], ["negativo", "Negativo"]]} value={f.esito} onChange={(v) => setField("esito", v)} testId="pratica-esito" />
      <Area id="note-collaudo" label="Note collaudo" value={f.note_collaudo} onChange={(v) => setField("note_collaudo", v)} rows={2} />
    </Section>
  );
}

function ForzeNote({ f }) {
  const n = T.notaForze(f);
  return (
    <p className={`rounded-lg px-3 py-2 text-xs ${n.ok ? "bg-stone-100 text-stone-600" : "bg-red-50 font-semibold text-red-700"}`} data-testid="pratica-nota-forze">
      {n.testo}
    </p>
  );
}

export function NormeSection({ form, setField }) {
  const norme = form.fields.norme;
  const setN = (i, patch) => setField("norme", norme.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  return (
    <Section title={`5 · Norme della Dichiarazione ${isNuovoReg(form.data) ? "UE" : "CE"}`}>
      {NORME.map((label, i) => (
        <div key={label} className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-stone-700"><b>{i + 1}.</b> {normaLabel(i, form.data)}</span>
            <YesNo value={norme[i]?.applica} onChange={(v) => setN(i, { applica: v })} testId={`pratica-norma-${i + 1}`} />
          </div>
          <Input value={norme[i]?.nota || ""} onChange={(e) => setN(i, { nota: e.target.value })} placeholder="Nota (facoltativa)" className="h-8 text-sm" data-testid={`pratica-norma-${i + 1}-nota`} />
        </div>
      ))}
    </Section>
  );
}

export function RischiSection({ form, setField }) {
  return (
    <Section title="6 · Rischi residui">
      <p className="text-xs text-stone-500">L'analisi dei rischi viene compilata in automatico dai dispositivi di sicurezza scelti. Qui scrivi i rischi che restano.</p>
      <Area id="rischi-residui" label="Rischi residui e uso improprio prevedibile" value={form.fields.rischi_residui} onChange={(v) => setField("rischi_residui", v)} rows={4} />
    </Section>
  );
}

export function Dm37Section({ form, setField }) {
  const m = form.fields.dm37;
  const setM = (k, v) => setField("dm37", { ...m, [k]: v });
  const all = m.allegati || {};
  return (
    <Section title="7 · Dichiarazione DM 37/08">
      <Field id="responsabile" label="Responsabile tecnico (nome e cognome)" value={m.responsabile} onChange={(v) => setM("responsabile", v)} />
      <Lbl>Lavoro inteso come</Lbl>
      <Choice options={Object.entries(T.DM37_TIPI)} value={m.tipo} onChange={(v) => setM("tipo", v)} testId="pratica-dm37-tipo" />
      <Area id="dm37-descrizione" label="Descrizione dell'impianto" value={m.descrizione} onChange={(v) => setM("descrizione", v)} placeholder={T.DM37_DESCRIZIONE(form.fields.tipo_chiusura)} />
      <Area id="dm37-materiali" label="Materiali utilizzati (relazione)" value={m.materiali} onChange={(v) => setM("materiali", v)} rows={4} />
      <Choice
        options={[["progetto", "C'è un progetto"], ["precedenti", "Ci sono dichiarazioni precedenti"]]}
        value={[m.progetto && "progetto", all.precedenti && "precedenti"].filter(Boolean)}
        onChange={(v) => setField("dm37", { ...m, progetto: v.includes("progetto"), allegati: { schema: true, precedenti: v.includes("precedenti") } })}
        testId="pratica-dm37-allegati"
        multi
        cols={1}
      />
      {m.progetto && <Field id="progettista" label="Progetto redatto da" value={m.progettista} onChange={(v) => setM("progettista", v)} />}
    </Section>
  );
}

export function SchemaSection({ form, setField, onNeedSave }) {
  const sc = { ...T.SCHEMA_DEFAULT, ...form.fields.schema };
  const f = (k) => ({ value: sc[k], onChange: (v) => setField("schema", { ...sc, [k]: v }) });
  return (
    <Section title="7b · Schema dell'impianto realizzato">
      <p className="text-xs text-stone-500">
        Lo schema viene disegnato in automatico con questi dati (linea dal quadro fino alla centralina e dispositivi collegati) e allegato alla DM 37/08.
      </p>
      <Field id="schema-origine" label="Origine della linea" {...f("origine")} />
      <Lbl>Interruttore magnetotermico differenziale</Lbl>
      <div className="grid grid-cols-3 gap-2">
        <Field id="schema-poli" label="Poli" {...f("poli")} />
        <Field id="schema-corrente" label="Corrente In" {...f("corrente")} />
        <Field id="schema-curva" label="Curva" {...f("curva")} />
        <Field id="schema-idn" label="Sensibilità IΔn" {...f("idn")} />
        <Field id="schema-tipo-diff" label="Tipo diff." {...f("tipo_diff")} />
        <Field id="schema-potere" label="Potere int." {...f("potere")} />
      </div>
      <Lbl>Linea di alimentazione</Lbl>
      <Row>
        <Field id="schema-cavo" label="Tipo cavo" {...f("cavo")} />
        <Field id="schema-formazione" label="Formazione / sezione" {...f("formazione")} />
      </Row>
      <Row>
        <Field id="schema-lunghezza" label="Lunghezza (m)" {...f("lunghezza")} numeric />
        <Field id="schema-tensione" label="Tensione" {...f("tensione")} />
      </Row>
      <Field id="schema-posa" label="Tipo di posa" {...f("posa")} />
      <Field id="schema-percorso" label="Percorso della linea (es. dal quadro garage, lungo parete sx)" {...f("percorso")} />
      <Row>
        <Field id="schema-potenza" label="Potenza motore (W)" {...f("motore_potenza")} numeric />
        <Field id="schema-cavo-motore" label="Cavo motore" {...f("cavo_motore")} />
      </Row>
      <Field id="schema-cavo-accessori" label="Cavi accessori (fotocellule, coste...)" {...f("cavo_accessori")} />
      <Lbl>Verifiche strumentali (CEI 64-8 parte 6)</Lbl>
      <Choice
        options={[["C", "Continuità PE: OK"], ["NC", "Continuità PE: NO"]]}
        value={sc.continuita}
        onChange={(v) => setField("schema", { ...sc, continuita: v })}
        testId="pratica-schema-continuita"
      />
      <Row>
        <Field id="schema-continuita-ohm" label="Continuità PE (Ohm)" {...f("continuita_ohm")} numeric />
        <Field id="schema-isolamento" label="Isolamento (MΩ, min 1)" {...f("isolamento")} numeric />
        <Field id="schema-tempo-diff" label="Intervento diff. (ms)" {...f("tempo_diff")} numeric />
      </Row>
      {(!sc.isolamento || !sc.tempo_diff) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" data-testid="pratica-schema-misure-mancanti">
          Inserisci i valori misurati di isolamento e intervento del differenziale: se restano vuoti nel PDF esce lo spazio da compilare a mano.
        </p>
      )}
      <div className="rounded-lg border border-stone-200 bg-white p-2.5">
        {form.id ? (
          <JobPhotos
            clientId={`pratica-${form.id}`}
            title="Foto schemi del fabbricante"
            emptyText="Fotografa le pagine del libretto del motore con lo schema dei collegamenti: finiscono in coda alla DM 37/08."
          />
        ) : (
          <button type="button" onClick={onNeedSave} className="w-full py-2 text-sm font-semibold text-[#4A5D23]" data-testid="pratica-save-for-photos">
            Salva la pratica per allegare le foto del libretto
          </button>
        )}
      </div>
    </Section>
  );
}
