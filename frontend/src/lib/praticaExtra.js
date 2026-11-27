// Testi aggiuntivi della pratica (ispirati alla documentazione di settore, riscritti in stile Italserrande)

export const SITI = { privato: "Privato", condominio: "Condominio", azienda: "Azienda", altro: "Altro" };

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
];

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
    "Consigliamo una manutenzione ordinaria ogni 6 mesi e comunque almeno una volta l'anno; più spesso in caso di uso intenso (condomini, attività commerciali). " +
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
    "(bassa tensione); UNI EN 13241 (norma di prodotto); UNI EN 12453 (sicurezza in uso delle porte motorizzate); D.M. 37/2008 per l'impianto elettrico."],
];
