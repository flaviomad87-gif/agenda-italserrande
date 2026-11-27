// Testi aggiuntivi della pratica (ispirati alla documentazione di settore, riscritti in stile Italserrande)

export const COMPONENTI = [
  ["motoriduttore", "Motoriduttore"],
  ["quadro", "Quadro di comando"],
  ["lampeggiatore", "Lampeggiatore"],
  ["fotocellule", "Fotocellule"],
  ["selettore", "Selettore / pulsantiera"],
  ["ricevitore", "Ricevitore radio"],
  ["antenna", "Antenna"],
  ["trasmettitore", "Trasmettitori"],
  ["costola", "Costola sensibile"],
  ["elettroserratura", "Elettroserratura / elettrofreno"],
  ["encoder", "Encoder / finecorsa"],
  ["pulsante", "Pulsante di comando"],
  ["spia", "Spia chiusura aperta"],
  ["cremagliera", "Cremagliera / accessori meccanici"],
  ["batterie", "Kit batterie tampone"],
];

export const MARCHE = ["ACM", "FAAC", "DEA", "NICE", "Elsamec", "Benincà", "CAME", "BFT", "Somfy"];
export const ALIMENTAZIONI = ["230 Vac", "24 Vdc", "400 Vac trifase"];

const BORDO_INF = [
  "Bordo inferiore di chiusura",
  "Protezione contro schiacciamento e impatto con dispositivi di rilevamento (fotocellule, costola sensibile) o comando a uomo presente; arresto e inversione del moto in caso di ostacolo.",
];
const PARTI = ["Conformazione della superficie del manto", "Eliminare o proteggere le parti sporgenti; superficie liscia, senza punti di uncinamento o taglio."];
const GUIDE = ["Guide laterali di scorrimento", "Assenza di bordi affilati e fessure accessibili; segnaletica per evitare l'introduzione delle mani."];

export const ZONE_PERICOLO = {
  avvolgibile: [
    BORDO_INF,
    ["Zona di avvolgimento (rullo e cassonetto)", "Per altezze di passaggio < 2,5 m proteggere il rullo con cassonetto o carter contro convogliamento, schiacciamento e taglio."],
    PARTI,
    GUIDE,
  ],
  sezionale: [
    BORDO_INF,
    ["Bordo superiore e guida di trascinamento", "Per altezze < 2,5 m installare protezioni sulla guida e sul punto di trascinamento."],
    GUIDE,
    ["Giunti tra le sezioni", "I pannelli devono avere profilo antipizzicamento: fessure che non consentano l'introduzione delle dita o franco di almeno 25 mm."],
    ["Molle, cavi e gruppo motoriduttore", "Molle e cavi protetti con dispositivi paracadute/anti-rottura; motoriduttore protetto e fuori dalla portata nelle zone di passaggio."],
  ],
  basculante: [
    BORDO_INF,
    ["Bracci e contrappesi laterali", "Proteggere i punti di cesoiamento tra bracci, telaio e contrappesi con carter o distanze di sicurezza."],
    ["Zona di rotazione del manto", "Segnalare e mantenere libera la zona di rotazione esterna; eventuale fotocellula esterna."],
    PARTI,
  ],
  scorrevole: [
    ["Bordo principale di chiusura", BORDO_INF[1]],
    ["Zona tra cancello e colonna / recinzione", "Distanza di sicurezza o rete di protezione contro cesoiamento durante l'apertura."],
    ["Ruote e guida a pavimento", "Proteggere le ruote e i punti di contatto con la guida contro lo schiacciamento dei piedi."],
    ["Fine corsa e rischio di uscita dalla guida", "Fermi meccanici di fine corsa e guida superiore anti-ribaltamento."],
  ],
  tapparella: [
    BORDO_INF,
    ["Zona di avvolgimento (rullo e cassonetto)", "Cassonetto chiuso e ispezionabile solo con attrezzo; rullo non accessibile durante l'uso."],
    GUIDE,
  ],
  battente: [
    ["Bordo di chiusura tra le ante", BORDO_INF[1]],
    ["Zona cerniere e pilastri", "Proteggere la zona tra anta e pilastro contro schiacciamento e cesoiamento (distanze minime o protezioni)."],
    ["Zona di manovra delle ante", "Fotocellule e segnaletica nella zona di rotazione; arresto in caso di ostacolo."],
    ["Bracci del motore", "Proteggere i punti di cesoiamento dei bracci articolati."],
  ],
};

export const COLLAUDO_GRUPPI = [
  ["Verifiche preliminari", ["Completezza e integrità del prodotto", "Integrità delle sicurezze intrinseche", "Assenza di difetti visibili"]],
  ["Verifiche di montaggio", ["Corretto assemblaggio dei componenti", "Apposizione della marcatura (targhetta)", "Protezioni meccaniche", "Segnaletica pericoli elettrici, meccanici e rischi residui"]],
  ["Verifiche funzionali", ["Movimenti di apertura e chiusura", "Dispositivi di avviamento e arresto", "Dispositivi di emergenza e sblocco", "Dispositivi di sicurezza", "Regolazioni e impostazioni della centralina"]],
  ["Prove prestazionali", ["Prestazioni corrispondenti a quanto previsto", "Rumorosità limitata e accettabile", "Assenza di emissioni pericolose", "Assenza di danni e deformazioni dopo le prove"]],
];

export const CONSEGNA =
  "L'esito positivo delle prove sopra indicate attesta l'idoneità all'uso dell'impianto e costituisce l'atto di consegna definitiva " +
  "nel luogo di installazione. Firmando il presente verbale il Committente: 1) conferma che l'impianto corrisponde a quanto richiesto e lo accetta; " +
  "2) dichiara di aver ricevuto le istruzioni d'uso e manutenzione, di averne preso visione e di metterle a disposizione di tutti gli utilizzatori; " +
  "3) dichiara di aver ricevuto l'informativa sugli obblighi di legge e sulla manutenzione periodica.";

export const FASCICOLO_INTRO =
  "Il fascicolo tecnico raccoglie la documentazione con cui l'installatore, che assembla e mette in servizio la chiusura motorizzata, " +
  "dimostra la conformità dell'impianto ai requisiti essenziali di sicurezza. È conservato da Italserrande S.r.l. per almeno 10 anni " +
  "dalla messa in servizio e messo a disposizione delle autorità che ne facciano richiesta. Al Committente vengono consegnati i documenti indicati.";

export const INFORMATIVA = [
  ["Perché la manutenzione è obbligatoria",
    "Porte, serrande e cancelli motorizzati sono macchine: il proprietario (o l'amministratore, per i condomini) è responsabile del loro uso sicuro. " +
    "La norma UNI EN 12453 e le istruzioni del fabbricante prevedono controlli periodici dei dispositivi di sicurezza. In caso di incidente, " +
    "la mancanza di manutenzione documentata ricade sul responsabile dell'impianto, anche ai fini assicurativi."],
  ["Ogni quanto",
    "Manutenzione programmata almeno ogni 12 mesi per uso privato e ogni 6 mesi per uso condominiale, commerciale o intensivo, come indicato nel manuale d'uso. " +
    "Ogni intervento va annotato sul Registro di manutenzione consegnato con l'impianto."],
  ["Cosa controlliamo",
    "Fotocellule, costole e dispositivi di arresto; forze e inversione del moto; sblocco di emergenza; fine corsa; molle, cavi, guide e fissaggi; " +
    "lubrificazione; stato della parte elettrica, del lampeggiante e dei radiocomandi; leggibilità di targhetta e segnaletica."],
  ["Cosa deve fare l'utilizzatore",
    "Non transitare durante il movimento; non lasciare i radiocomandi ai bambini; tenere libera la zona di manovra; sospendere l'uso e chiamarci " +
    "in caso di rumori anomali, movimenti a scatti o sicurezze che non intervengono; non manomettere o escludere le sicurezze."],
  ["Modifiche all'impianto",
    "Qualsiasi modifica sostanziale (sostituzione del motore, nuove funzioni, rimozione di sicurezze) fatta da altri fa decadere la presente dichiarazione: " +
    "chi interviene se ne assume la responsabilità e deve aggiornare la documentazione."],
  ["Norme di riferimento",
    "Direttiva Macchine 2006/42/CE (dal 20/01/2027 Regolamento UE 2023/1230); Direttive 2014/30/UE (compatibilità elettromagnetica) e 2014/35/UE " +
    "(bassa tensione); UNI EN 13241 (porte e cancelli) o UNI EN 13659 (tapparelle) come norme di prodotto; UNI EN 12453 (sicurezza in uso delle porte motorizzate); D.M. 37/2008 per l'impianto elettrico."],
];

export const NORME_FASCICOLO = (nuovo, tipo) => [
  [nuovo ? "Regolamento (UE) 2023/1230 — Macchine (dal 20/01/2027)" : "Direttiva Macchine 2006/42/CE (fino al 19/01/2027)", "Requisiti essenziali di sicurezza"],
  ["Direttiva 2014/35/UE — Bassa tensione", "Parte elettrica dell'automazione"],
  ["Direttiva 2014/30/UE — Compatibilità elettromagnetica", "Motore, centralina e accessori"],
  tipo === "tapparella"
    ? ["UNI EN 13659 — Chiusure oscuranti esterne", "Norma di prodotto"]
    : ["UNI EN 13241 — Porte e cancelli industriali, commerciali e da garage", "Norma di prodotto"],
  ["UNI EN 12453 — Sicurezza in uso delle porte motorizzate", "Requisiti e livelli di protezione"],
  ["Reg. (UE) 305/2011 (CPR) — Dichiarazione di Prestazione (DoP)", "Porte UNI EN 13241, ove applicabile"],
  ["UNI EN 12604 — Aspetti meccanici", "Ove applicabile (resistenza, guide, sospensione)"],
  ["UNI EN 12445 — Metodi di prova", "Misura strumentale delle forze: non eseguita"],
  ["D.M. 37/2008 — Impianti negli edifici", "Impianto elettrico di alimentazione e comando"],
];

export const GRUPPI = [
  ["g1", "Gruppo 1", "Persone informate, area privata"],
  ["g2", "Gruppo 2", "Persone informate, area pubblica"],
  ["g3", "Gruppo 3", "Persone non informate, uso illimitato"],
];
export const USO_GRUPPO = { privato: "g1", condominiale: "g2", commerciale: "g2", industriale: "g2", pubblico: "g3" };

export const PROTEZIONE = [
  ["uomo", "A uomo presente", ["A", "B", "Non ammesso"]],
  ["vista", "A impulsi, chiusura in vista", ["C oppure E", "C oppure E", "C e D, oppure E"]],
  ["nonvista", "A impulsi, chiusura non in vista", ["C oppure E", "C e D, oppure E", "C e D, oppure E"]],
  ["auto", "Automatico", ["C e D, oppure E", "C e D, oppure E", "C e D, oppure E"]],
];

export const LEGENDA_PROTEZIONE = [
  "A: comando a uomo presente con pulsante.",
  "B: comando a uomo presente con selettore a chiave o dispositivo personale.",
  "C: limitazione delle forze del bordo principale (centralina / limitatore di coppia).",
  "D: dispositivi che rilevano la presenza di persone senza contatto (es. fotocellule).",
  "E: dispositivi sensibili che impediscono il contatto o l'impatto (es. coste sensibili).",
];

export const PERICOLI = [
  "Schiacciamento", "Cesoiamento", "Convogliamento e trascinamento", "Urto / impatto", "Sollevamento di persone",
  "Guasti dei dispositivi di sicurezza", "Movimentazione manuale dell'anta", "Intrappolamento", "Superamento dei finecorsa", "Contatti elettrici",
];

export const MODIFICHE = [
  ["motorizzazione", "Motorizzazione di una chiusura nata manuale"],
  ["motore", "Sostituzione del motore con prestazioni o logica diverse"],
  ["sicurezze", "Rimozione o modifica della logica dei dispositivi di sicurezza"],
  ["struttura", "Modifica di dimensioni, peso o struttura del manto"],
  ["equivalenti", "Sostituzione di componenti con ricambi equivalenti"],
];

export const CONSEGNA_DOMANDE = [
  ["integra", "Installazione completa e in buono stato, senza difetti visibili"],
  ["funziona", "L'installazione funziona normalmente in tutte le manovre"],
  ["sicura", "Le sicurezze intervengono senza rischi per l'utilizzatore"],
  ["istr_uso", "Istruzioni per l'uso e per lo sblocco manuale spiegate al cliente"],
  ["istr_sic", "Uso dei dispositivi di emergenza e di sicurezza spiegato"],
  ["istr_man", "Spiegata la periodicità della manutenzione (12 mesi privato, 6 mesi altri usi)"],
  ["doc_tec", "Consegnati i documenti tecnici e le dichiarazioni di conformità"],
  ["contratto", "Proposto al cliente un contratto di manutenzione"],
  ["contratto_ok", "Il cliente accetta il contratto di manutenzione"],
];

export const RESPONSABILITA = [
  "Analisi completa dei rischi della chiusura installata e adozione delle misure previste dalla UNI EN 12453.",
  "Installazione secondo le istruzioni dei fabbricanti, usando componenti con marcatura CE.",
  "Collaudo funzionale dell'automazione e dei singoli dispositivi di protezione, con esiti documentati.",
  "Redazione e conservazione del fascicolo tecnico per almeno 10 anni, a disposizione delle autorità.",
  "Applicazione della marcatura sulla chiusura motorizzata e consegna della dichiarazione di conformità.",
  "Consegna al cliente di istruzioni d'uso e registro di manutenzione e proposta di un contratto di manutenzione.",
];
