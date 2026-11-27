// Contenuti standard della Pratica impianto (da far controllare al titolare).

export const TIPI_CHIUSURA = {
  avvolgibile: "Serranda avvolgibile motorizzata",
  sezionale: "Porta sezionale motorizzata",
  basculante: "Porta basculante motorizzata",
  scorrevole: "Cancello scorrevole motorizzato",
  battente: "Cancello a battente motorizzato",
};

export const SICUREZZE = [
  ["fotocellule", "Fotocellule"],
  ["coste", "Bordi sensibili (coste)"],
  ["rilevamento", "Rilevamento ostacolo / limitazione forza della centralina"],
  ["lampeggiante", "Lampeggiante di movimento"],
  ["finecorsa", "Finecorsa di apertura e chiusura"],
  ["sblocco", "Sblocco manuale di emergenza"],
  ["paracadute", "Dispositivo anticaduta / paracadute"],
  ["battute", "Battute d'arresto meccaniche"],
  ["uomo_presente", "Comando a uomo presente"],
  ["differenziale", "Interruttore magnetotermico differenziale dedicato"],
  ["cartelli", "Segnaletica di avvertimento"],
];

const BASE = ["finecorsa", "sblocco", "fotocellule", "lampeggiante", "differenziale", "cartelli"];
export const SICUREZZE_DEFAULT = {
  avvolgibile: [...BASE, "paracadute"],
  sezionale: [...BASE, "paracadute", "coste", "rilevamento"],
  basculante: [...BASE, "paracadute", "rilevamento"],
  scorrevole: [...BASE, "coste", "rilevamento", "battute"],
  battente: [...BASE, "coste", "rilevamento", "battute"],
};

export const COMANDI = {
  impulsivo: "Impulsivo (radiocomando / selettore)",
  uomo_presente: "A uomo presente (pulsante tenuto premuto)",
  automatico: "Automatico (chiusura automatica temporizzata)",
};

const PORTE = ["avvolgibile", "sezionale", "basculante"];
const CANCELLI = ["scorrevole", "battente"];

// Voci del verbale di collaudo. `sic` = sicurezza da cui dipende, `types` = tipi a cui si applica.
export const CHECKLIST = [
  { id: "fissaggi", group: "Meccanica", label: "Fissaggi di struttura, guide e staffe saldi e idonei" },
  { id: "scorrimento", group: "Meccanica", label: "Bilanciamento e scorrimento regolari, senza attriti o punti duri" },
  { id: "paracadute", group: "Meccanica", label: "Dispositivo anticaduta / paracadute presente ed efficiente", sic: "paracadute", types: PORTE },
  { id: "battute", group: "Meccanica", label: "Battute d'arresto meccaniche presenti in apertura e chiusura", sic: "battute", types: CANCELLI },
  { id: "terra", group: "Impianto elettrico", label: "Collegamento a terra e continuità dei conduttori di protezione" },
  { id: "differenziale", group: "Impianto elettrico", label: "Linea protetta da interruttore magnetotermico differenziale", sic: "differenziale" },
  { id: "cavi", group: "Impianto elettrico", label: "Cavi e collegamenti protetti, centralina chiusa con grado IP adeguato" },
  { id: "finecorsa", group: "Sicurezze", label: "Finecorsa di apertura e chiusura regolati", sic: "finecorsa" },
  { id: "fotocellule", group: "Sicurezze", label: "Fotocellule: arresto / inversione con ostacolo nel varco", sic: "fotocellule" },
  { id: "coste", group: "Sicurezze", label: "Bordi sensibili: arresto e inversione al contatto", sic: "coste" },
  { id: "rilevamento", group: "Sicurezze", label: "Rilevamento ostacolo della centralina regolato (forza / sensibilità)", sic: "rilevamento" },
  { id: "uomo_presente", group: "Sicurezze", label: "Comando a uomo presente: arresto al rilascio del pulsante", sic: "uomo_presente" },
  { id: "lampeggiante", group: "Sicurezze", label: "Lampeggiante di movimento funzionante", sic: "lampeggiante" },
  { id: "sblocco", group: "Sicurezze", label: "Sblocco manuale di emergenza funzionante", sic: "sblocco" },
  { id: "comandi", group: "Sicurezze", label: "Comandi funzionanti e posizionati in vista della chiusura" },
  { id: "schiacciamento", group: "Sicurezze", label: "Assenza di punti di schiacciamento / cesoiamento non protetti" },
  { id: "cyber", group: "Sicurezze", label: "Comandi a distanza (radio / app / Wi-Fi) protetti da accessi non autorizzati: codici e password personalizzati", nuovo: true },
  { id: "segnaletica", group: "Sicurezze", label: "Segnaletica di avvertimento e targhetta CE applicate", sic: "cartelli" },
  { id: "documenti", group: "Consegna", label: "Consegnati manuale d'uso, dichiarazione di conformità e registro di manutenzione" },
  { id: "istruzione", group: "Consegna", label: "Cliente istruito su uso, sblocco di emergenza e rischi residui" },
];

export const checklistFor = (tipo, nuovo) => CHECKLIST.filter((c) => (!c.types || c.types.includes(tipo)) && (!c.nuovo || nuovo));

export const USI_IMPIANTO = {
  privato: "Privato / residenziale",
  condominiale: "Condominiale",
  commerciale: "Commerciale (negozio, ufficio)",
  industriale: "Industriale / capannone",
  pubblico: "Pubblico / uso intensivo",
};

// Modalità di funzionamento adottata e verificata (protezione contro schiacciamento e impatto, UNI EN 12453)
export function notaForze(f) {
  const on = f.sicurezze || [];
  const lab = { fotocellule: "fotocellule", coste: "bordi sensibili", rilevamento: "rilevamento ostacolo con sensibilità della centralina regolata" };
  const dev = ["fotocellule", "coste", "rilevamento"].filter((k) => on.includes(k)).map((k) => lab[k]);
  if (f.comando_tipo === "uomo_presente") {
    return {
      ok: true,
      testo:
        "Modalità adottata e verificata: comando a uomo presente, con il movimento solo a comando mantenuto e la chiusura in vista dal punto di comando. " +
        "Con questa modalità la protezione contro schiacciamento e impatto è garantita dal comando stesso e la misura delle forze secondo UNI EN 12445 non è richiesta.",
    };
  }
  const modo = f.comando_tipo === "automatico" ? "comando automatico (chiusura automatica temporizzata)" : "comando impulsivo (radiocomando / selettore)";
  const presenza = on.includes("fotocellule") || on.includes("coste");
  if (!dev.length || (f.comando_tipo === "automatico" && !presenza)) {
    return {
      ok: false,
      testo:
        `Modalità adottata: ${modo}. ATTENZIONE: non risultano dispositivi di protezione sufficienti. ` +
        "Per questa modalità servono dispositivi di rilevamento presenza (fotocellule e/o bordi sensibili) oppure la misura delle forze d'impatto secondo UNI EN 12445.",
    };
  }
  return {
    ok: true,
    testo:
      `Modalità adottata e verificata: ${modo}, con protezione contro schiacciamento e impatto affidata a: ${dev.join(", ")}, ` +
      "verificati con prova di arresto e inversione in questo verbale. La misura strumentale delle forze d'impatto secondo UNI EN 12445 non è stata eseguita.",
  };
}

const ZONA_CONVOGLIAMENTO = {
  avvolgibile: "Rullo di avvolgimento, cassonetto e guide",
  sezionale: "Giunti tra i pannelli, molle, funi e carrucole",
  basculante: "Bracci, contrappesi e molle laterali",
  scorrevole: "Ruote, binario e cremagliera / pignone",
  battente: "Cerniere e bracci dell'attuatore",
};
const ZONA_CADUTA = {
  avvolgibile: "Telo avvolgibile (rottura molle o albero)",
  sezionale: "Manto (rottura molle o funi)",
  basculante: "Anta (rottura molle o bracci)",
  scorrevole: "Anta (fuoriuscita dal binario / ribaltamento)",
  battente: "Ante (sgancio dalle cerniere)",
};

// Righe dell'analisi dei rischi: `sic` = sicurezze che riducono il rischio.
export const RISCHI = [
  { pericolo: "Schiacciamento in chiusura", zona: () => "Bordo di chiusura contro pavimento / battuta", sic: ["fotocellule", "coste", "rilevamento", "uomo_presente"] },
  { pericolo: "Schiacciamento e cesoiamento", zona: () => "Tra anta e parti fisse (montanti, architrave, pilastri)", sic: ["coste", "rilevamento", "uomo_presente"], fisso: "Distanze di sicurezza / protezioni fisse" },
  { pericolo: "Convogliamento e trascinamento", zona: (t) => ZONA_CONVOGLIAMENTO[t], sic: [], fisso: "Carter e protezioni fisse sugli organi in movimento" },
  { pericolo: "Impatto con persone o veicoli", zona: () => "Area di movimento dell'anta", sic: ["fotocellule", "lampeggiante", "rilevamento"] },
  { pericolo: "Caduta o ribaltamento dell'anta", zona: (t) => ZONA_CADUTA[t], sic: ["paracadute", "battute"], fisso: "Fissaggi verificati in collaudo" },
  { pericolo: "Sollevamento di persone aggrappate", zona: () => "Anta in apertura", sic: ["uomo_presente", "rilevamento"], fisso: "Istruzioni d'uso e segnaletica" },
  { pericolo: "Contatti elettrici diretti e indiretti", zona: () => "Motore, centralina e linea di alimentazione", sic: ["differenziale"], fisso: "Messa a terra, involucri IP, cavi protetti" },
  { pericolo: "Mancanza di energia / emergenza", zona: () => "Intero impianto", sic: ["sblocco"] },
  { pericolo: "Manomissione o accesso non autorizzato ai comandi a distanza", zona: () => "Radiocomandi, ricevente, app e Wi-Fi", sic: [], fisso: "Codici radio a rotazione, password personalizzate, software aggiornato", nuovo: true },
  { pericolo: "Uso improprio prevedibile", zona: () => "Bambini, transito durante il movimento", sic: ["cartelli", "lampeggiante"], fisso: "Istruzioni d'uso, comandi fuori portata dei bambini" },
];

export const RISCHI_RESIDUI_DEFAULT =
  "Possibile rischio residuo di urto e schiacciamento in caso di transito durante il movimento o di manomissione dei dispositivi " +
  "di sicurezza. Non transitare mai durante la manovra, non lasciare i comandi ai bambini, sorvegliare sempre la chiusura.";

const USO = {
  avvolgibile: [
    "Azionare la serranda solo con i comandi previsti (radiocomando, pulsante o selettore a chiave), con il vano libero e in vista.",
    "Attendere che il telo sia completamente aperto prima di transitare; non passare mai sotto la serranda in movimento.",
    "Non forzare il telo a mano quando il motore è inserito e non appoggiare oggetti nelle guide.",
  ],
  sezionale: [
    "Azionare la porta solo con i comandi previsti, con il vano libero e la porta in vista.",
    "Attendere l'apertura completa prima di transitare; non sostare sotto il manto in movimento.",
    "Non infilare le dita tra i pannelli né toccare molle, funi e carrucole.",
  ],
  basculante: [
    "Azionare la porta solo con i comandi previsti, con il vano libero e la porta in vista.",
    "Durante la manovra l'anta sporge verso l'esterno: tenere libera l'area davanti alla porta.",
    "Non toccare bracci, contrappesi e molle laterali durante il movimento.",
  ],
  scorrevole: [
    "Azionare il cancello solo con i comandi previsti, con il passaggio libero e il cancello in vista.",
    "Non transitare durante il movimento e attendere l'apertura completa.",
    "Tenere libera la zona di scorrimento dell'anta e il binario da sassi, foglie o neve.",
  ],
  battente: [
    "Azionare il cancello solo con i comandi previsti, con il passaggio libero e il cancello in vista.",
    "Non sostare nell'area di rotazione delle ante e non transitare durante il movimento.",
    "Tenere libera l'area di apertura delle ante da ostacoli.",
  ],
};

const SBLOCCO = {
  avvolgibile: "Ruotare la manovella o azionare lo sblocco del motore (cordino o chiave), quindi sollevare o abbassare il telo a mano senza strattoni. Al ritorno della corrente ripristinare il blocco prima di usare il motore.",
  sezionale: "Tirare la maniglia di sblocco del carrello (cordino rosso) e muovere il manto a mano dalla maniglia. Per riagganciare, rilasciare lo sblocco e muovere la porta finché il carrello si innesta.",
  basculante: "Inserire la chiave di sblocco nella serratura o nell'attuatore e ruotarla; muovere l'anta a mano accompagnandola fino a fine corsa. Ripristinare il blocco prima di riattivare il motore.",
  scorrevole: "Aprire lo sportellino del motore con la chiave personalizzata e ruotare la leva di sblocco; spingere il cancello a mano lentamente. Richiudere la leva per ripristinare il funzionamento automatico.",
  battente: "Inserire la chiave di sblocco su ciascun attuatore e ruotarla; muovere le ante a mano accompagnandole. Ripristinare il blocco su ogni anta prima di usare il comando.",
};

export const manualeSezioni = (tipo, nuovo) => [
  ["Avvertenze generali di sicurezza", [
    "Leggere attentamente questo manuale e conservarlo per tutta la vita dell'impianto; consegnarlo a eventuali nuovi utenti.",
    "L'impianto deve essere utilizzato solo per lo scopo per cui è stato installato. Ogni altro uso è improprio e pericoloso.",
    "Non permettere ai bambini di giocare con la chiusura o con i comandi; tenere i radiocomandi fuori dalla loro portata.",
    "Non manomettere né escludere i dispositivi di sicurezza. In caso di guasto o funzionamento anomalo togliere l'alimentazione e chiamare l'assistenza.",
    "Riparazioni, modifiche e regolazioni devono essere eseguite solo da personale qualificato.",
    ...(nuovo
      ? ["Non modificare password e impostazioni dei comandi a distanza (app, Wi-Fi) senza l'assistenza dell'installatore; non condividere i codici di accesso.",
         "Una copia di queste istruzioni è conservata da Italserrande S.r.l. per almeno 10 anni ed è disponibile gratuitamente su richiesta."]
      : []),
  ]],
  ["Uso corretto", USO[tipo]],
  ["Usi impropri vietati", [
    "Transitare o sostare nell'area di movimento durante la manovra.",
    "Aggrapparsi, salire o farsi sollevare dalla chiusura.",
    "Usare la chiusura con dispositivi di sicurezza guasti, scollegati o con l'impianto danneggiato.",
    "Azionare la chiusura senza averla in vista.",
  ]],
  ["Manovra manuale di emergenza", [
    "In caso di mancanza di corrente o guasto: " + SBLOCCO[tipo],
    "Eseguire lo sblocco solo con la chiusura ferma.",
  ]],
  ["Controlli a cura dell'utente (ogni mese)", [
    "Verificare che fotocellule e bordi sensibili arrestino o invertano il movimento in presenza di un ostacolo.",
    "Pulire le lenti delle fotocellule e tenere pulite guide, binari e zone di scorrimento.",
    "Controllare che non ci siano rumori anomali, parti allentate o danneggiate.",
    "Sostituire le batterie dei radiocomandi quando la portata si riduce.",
  ]],
  ["Manutenzione periodica programmata", [
    "Almeno ogni 6 mesi per uso intensivo o pubblico, almeno ogni 12 mesi per uso privato: controllo da parte di un tecnico qualificato di fissaggi, organi meccanici, molle, sicurezze e impianto elettrico.",
    "Ogni intervento deve essere annotato sul Registro di Manutenzione consegnato con l'impianto.",
    `La mancata manutenzione fa decadere la garanzia e la Dichiarazione ${nuovo ? "UE" : "CE"} di conformità.`,
  ]],
  ["Smaltimento", [
    "A fine vita smaltire motore, centralina e componenti elettronici come rifiuti RAEE, e le altre parti secondo la normativa vigente sui rifiuti.",
  ]],
];

export const DM37_DESCRIZIONE = (tipo) =>
  `Impianto elettrico di alimentazione e comando dell'automazione della ${(TIPI_CHIUSURA[tipo] || "chiusura").toLowerCase()}: ` +
  "linea dedicata a valle del quadro esistente, motore, centralina, dispositivi di comando e di sicurezza.";

export const DM37_MATERIALI =
  "Cavi multipolari a doppio isolamento tipo FG16OR16 / H07RN-F di sezione adeguata; tubazioni e canaline in PVC; " +
  "interruttore magnetotermico differenziale Id 30 mA; scatole di derivazione con grado di protezione IP55; " +
  "motore, centralina e accessori marcati CE.";

export const DM37_NORME = "CEI 64-8; CEI EN 60335-2-103; CEI EN 60204-1 (per quanto applicabile)";

export const DM37_TIPI = { nuovo: "nuovo impianto", trasformazione: "trasformazione", ampliamento: "ampliamento", manutenzione: "manutenzione straordinaria" };
export const DM37_USI = { civile: "civile", industriale: "industriale", commercio: "commercio", altri: "altri usi" };

export const DOCUMENTI_PRATICA = [
  ["fascicolo", "Indice del fascicolo tecnico"],
  ["ce", "Dichiarazione CE (UE dal 2027) / Prestazione"],
  ["collaudo", "Verbale di collaudo e consegna"],
  ["rischi", "Analisi dei rischi"],
  ["componenti", "Elenco componenti e zone di pericolo"],
  ["dm37", "Dichiarazione DM 37/08"],
  ["manuale", "Manuale d'uso e manutenzione"],
  ["informativa", "Informativa obblighi e manutenzione"],
  ["registro", "Registro di manutenzione (primo intervento)"],
  ["registro_righe", "Registro manutenzioni a righe (per il cliente)"],
  ["targhetta", "Targhetta CE da stampare"],
];

export const SCHEMA_DEFAULT = {
  origine: "Quadro elettrico esistente dell'utenza",
  poli: "2P (F+N)",
  corrente: "10 A",
  curva: "C",
  idn: "30 mA",
  tipo_diff: "A",
  potere: "4,5 kA",
  cavo: "FG16OR16",
  formazione: "3G1,5 mm²",
  lunghezza: "",
  posa: "Tubo PVC sotto traccia / canalina a vista",
  percorso: "",
  tensione: "230 V ~ 50 Hz",
  motore_potenza: "",
  cavo_motore: "4G1,5 mm²",
  cavo_accessori: "2x0,5 / 4x0,5 mm² (bassissima tensione)",
  continuita: "C",
  isolamento: "",
  tempo_diff: "",
};

// Dispositivi collegati alla centralina (per lo schema): [chiave sicurezza o null, etichetta]
export const SCHEMA_DISPOSITIVI = [
  ["fotocellule", "Fotocellule TX / RX"],
  ["coste", "Bordi sensibili (coste)"],
  ["lampeggiante", "Lampeggiante"],
  ["finecorsa", "Finecorsa"],
];

// Verbale di verifica di un impianto esistente (stato di fatto prima dell'intervento)
export const VERIFICA_PUNTI = [
  ["struttura", "Struttura, telo / anta e fissaggi integri (senza ruggine passante, deformazioni o rotture)"],
  ["guide", "Guide, binari e cerniere allineati e in buono stato"],
  ["molle", "Molle, albero e bilanciamento efficienti (anta bilanciata)"],
  ["anticaduta", "Dispositivo anticaduta / paracadute o battute antiribaltamento presenti o installabili"],
  ["spazio_sicurezze", "Possibile installare fotocellule, finecorsa, sblocco ed eventuali bordi sensibili"],
  ["schiacciamento", "Punti di schiacciamento, cesoiamento e convogliamento protetti o proteggibili"],
  ["motore", "Motore e centralina esistenti in buono stato (se già motorizzata)"],
  ["sicurezze_presenti", "Dispositivi di sicurezza esistenti funzionanti (se già motorizzata)"],
  ["elettrico", "Linea protetta da interruttore differenziale e collegamento a terra presenti"],
  ["segnaletica", "Targhetta identificativa e segnaletica di avvertimento presenti"],
];

export const DOC_ESISTENTI = [
  ["ce", "Dichiarazione CE"],
  ["manuale", "Manuale d'uso"],
  ["registro", "Registro di manutenzione"],
  ["dm37", "Dichiarazione DM 37/08"],
  ["targhetta", "Targhetta CE"],
];

export const ESITI_VERIFICA = {
  idonea: "Idonea: si può intervenire / motorizzare senza sostituzioni",
  adeguamento: "Idonea previa sostituzione o adeguamento delle parti indicate",
  non_idonea: "Non idonea: la chiusura va sostituita",
};
