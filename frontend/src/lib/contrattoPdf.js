import { newDoc, loadLogo, fmtDate, sharePdf } from "./documentiPdf";
import { Flow } from "./praticaPdf";

const W = 544.2 - 51;
const val = (v, alt = "________________") => (String(v ?? "").trim() ? String(v).trim() : alt);

// Testo standard del contratto (da far verificare al titolare).
const clausole = (c) => [
  ["1. Oggetto", [
    "Il Cliente affida a Italserrande S.r.l. (di seguito \"Manutentore\"), che accetta, il servizio di manutenzione programmata degli impianti indicati, " +
      "allo scopo di mantenerli in condizioni di sicurezza ed efficienza nel tempo, come previsto dal manuale d'uso e manutenzione e dalla norma UNI EN 12453.",
  ]],
  ["2. Visite programmate", [
    `Il Manutentore eseguirà una visita ogni ${c.frequenza_mesi} mesi (${Math.round(12 / c.frequenza_mesi)} visite all'anno), concordandone la data con il Cliente.`,
    "Durante ogni visita: verifica e serraggio dei fissaggi; controllo di guide, molle, funi, cerniere e organi di trasmissione; lubrificazione delle parti in movimento; " +
      "verifica di finecorsa, fotocellule, bordi sensibili, rilevamento ostacoli, lampeggiante e sblocco di emergenza; controllo della centralina e dell'impianto elettrico; " +
      "prova generale di funzionamento.",
    "Ogni visita viene annotata sul Registro di Manutenzione dell'impianto, che il Cliente conserva.",
  ]],
  ["3. Esclusioni", [
    "Sono esclusi dal canone e verranno preventivati a parte: ricambi e materiali; riparazioni dovute a usura straordinaria, urti, uso improprio, manomissioni, " +
      "atti vandalici, eventi atmosferici o mancanza di energia; modifiche e adeguamenti dell'impianto; interventi eseguiti da terzi.",
  ]],
  ["4. Interventi su chiamata", [
    `Gli interventi straordinari richiesti dal Cliente saranno eseguiti con priorità rispetto ai clienti senza contratto` +
      (String(c.sconto_interventi || "").trim() ? `, con uno sconto del ${c.sconto_interventi.trim()} sulla manodopera.` : "."),
  ]],
  ["5. Durata e rinnovo", [
    `Il contratto decorre dal ${fmtDate(c.data_inizio)} e ha durata di ${c.durata_mesi} mesi. ` +
      (c.rinnovo_tacito
        ? "Alla scadenza si rinnova tacitamente per un periodo di uguale durata, salvo disdetta di una delle parti da inviare per iscritto almeno 30 giorni prima della scadenza."
        : "Alla scadenza il contratto termina senza rinnovo automatico; potrà essere rinnovato per iscritto."),
  ]],
  ["6. Corrispettivo e pagamento", [
    `Il canone è di ${val(c.canone, "€ ______")} (IVA esclusa) ${val(c.pagamento, "")}`.trim() + ". " +
      "In caso di mancato pagamento il Manutentore può sospendere il servizio previo avviso scritto.",
  ]],
  ["7. Obblighi del Cliente", [
    "Utilizzare gli impianti secondo il manuale d'uso; non manometterli né farli modificare da terzi; segnalare subito guasti o anomalie e, " +
      "in caso di pericolo, non utilizzarli fino all'intervento; consentire l'accesso agli impianti nelle date concordate.",
  ]],
  ["8. Responsabilità", [
    "Il Manutentore risponde della corretta esecuzione degli interventi svolti. Non risponde di danni derivanti da uso improprio, manomissioni, " +
      "mancata segnalazione di guasti, mancata esecuzione degli interventi consigliati e non accettati dal Cliente, o da interventi di terzi.",
  ]],
  ["9. Recesso", [
    "Ciascuna parte può recedere con preavviso scritto di 30 giorni. Se il Cliente è un consumatore e il contratto è firmato fuori dai locali commerciali, " +
      "può recedere entro 14 giorni dalla firma senza penali (artt. 52 e seguenti del Codice del Consumo).",
  ]],
  ["10. Dati personali", [
    "I dati del Cliente sono trattati da Italserrande S.r.l. solo per eseguire il contratto e per gli obblighi di legge, secondo il Regolamento (UE) 2016/679 (GDPR).",
  ]],
  ["11. Foro competente", [
    "Per ogni controversia è competente il Foro di Roma, salvo il foro del consumatore quando previsto dalla legge.",
  ]],
];

export async function buildContrattoPdf(c) {
  const doc = newDoc();
  const fl = new Flow(doc, await loadLogo());
  fl.start("CONTRATTO DI MANUTENZIONE PROGRAMMATA", `Contratto n. ${c.numero || "-"}/${c.anno || ""} - chiusure e automazioni`);
  fl.h2("Cliente");
  fl.kv([
    ["Cliente", c.cliente],
    ["Indirizzo", [c.indirizzo, c.comune].filter(Boolean).join(" - ")],
    ["Codice fiscale / P.IVA", c.cf_piva],
    ["Telefono / email", [c.telefono, c.email_cliente].filter(Boolean).join(" - ")],
  ]);
  fl.h2("Impianti in manutenzione");
  const imp = (c.impianti || []).filter((i) => i.descrizione || i.matricola);
  fl.table(
    [["N.", 30], ["Impianto", W - 30 - 140], ["Matricola", 140]],
    imp.length ? imp.map((i, k) => [k + 1, i.descrizione, i.matricola]) : [["1", "", ""]],
    { blueCols: [1, 2] },
  );
  fl.kv([
    ["Data di inizio", fmtDate(c.data_inizio)],
    ["Durata", `${c.durata_mesi} mesi${c.rinnovo_tacito ? " - rinnovo tacito" : ""}`],
    ["Frequenza visite", `ogni ${c.frequenza_mesi} mesi`],
    ["Canone (IVA esclusa)", [c.canone, c.pagamento].filter(Boolean).join(" - ")],
  ]);
  clausole(c).forEach(([t, ps]) => {
    fl.h2(t);
    ps.forEach((p) => fl.para(p));
  });
  if (String(c.note || "").trim()) {
    fl.h2("Note");
    fl.para(c.note);
  }
  fl.para(`Roma, ${fmtDate(new Date().toISOString())}`);
  fl.signatures(["Italserrande S.r.l. (timbro e firma)", "Il Cliente"]);
  fl.para(
    "Ai sensi degli artt. 1341 e 1342 del Codice Civile il Cliente approva specificamente le clausole: 3 (Esclusioni), 5 (Durata e rinnovo), " +
      "6 (Corrispettivo e sospensione), 8 (Responsabilità), 11 (Foro competente).",
    { size: 9 },
  );
  fl.signatures(["Il Cliente"]);
  fl.finish();
  return doc.output("blob");
}

export async function shareContratto(c) {
  const blob = await buildContrattoPdf(c);
  const base = (c.cliente || "cliente").trim().replace(/[^\w-]+/g, "_").slice(0, 40);
  return sharePdf(blob, `Contratto-manutenzione-${c.numero || ""}-${base}.pdf`, "Contratto di manutenzione");
}
