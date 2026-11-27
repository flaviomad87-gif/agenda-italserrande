import jsPDF from "jspdf";

// Ricostruzione vettoriale dei moduli originali Italserrande (coordinate in pt su A4).
export const INK = [17, 24, 39];
export const BORDER = [55, 65, 81];
export const FILL = [243, 244, 246];
export const RED = [127, 29, 29];
export const GREY = [100, 116, 139];
export const BLUE = [20, 50, 140];

export const COMPANY = [
  "Sede legale e operativa: Via Castino 29 - 00166 Roma (RM)",
  "P.IVA / C.F. 09270881007",
  "C.C.I.A.A. 1152580 - Cap. Soc. 10.000,00 €",
  "Tel. 06-6240259 / Cell. 337 743730",
  "Email: italserrande@libero.it",
  "Interventi esclusivamente nel Comune di Roma",
];

export const NORME = [
  "Serranda / Chiusura — UNI EN 13241",
  "Serranda motorizzata / Automazione",
  "Direttiva Macchine 2006/42/CE",
  "Direttiva Bassa Tensione 2014/35/UE",
  "Direttiva Compatibilità Elettromagnetica 2014/30/UE",
  "Sicurezza in uso — UNI EN 12453",
  "Regolamento Prodotti da Costruzione (CPR)",
  "Manutenzione e verifiche periodiche",
];

export const TIPI_INTERVENTO = [
  ["installazione", "Installazione", 50, 233],
  ["avviamento", "Avviamento", 130, 233],
  ["regolazioni", "Regolazioni", 210, 233],
  ["manutenzione_ordinaria", "Manutenzione Ordinaria", 290, 233],
  ["manutenzione_straordinaria", "Manutenzione Straordinaria", 420, 233],
  ["riparazione", "Riparazione", 50, 253],
  ["modifiche", "Modifiche", 130, 253],
];

const s = (x) => (x === undefined || x === null ? "" : String(x));

// Dal 20/01/2027 si applica il Regolamento Macchine (UE) 2023/1230 al posto della Direttiva 2006/42/CE
export const REG_DATE = "2027-01-20";
export const isNuovoReg = (iso) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10) >= REG_DATE;
export const regMacchine = (iso) => (isNuovoReg(iso) ? "Regolamento Macchine (UE) 2023/1230" : "Direttiva Macchine 2006/42/CE");
export const normaLabel = (i, iso) => (i === 2 ? regMacchine(iso) : NORME[i]);

let blankDates = false;
export const setBlankDates = (v) => {
  blankDates = v;
};

export function fmtDate(iso) {
  if (blankDates) return "";
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return s(iso);
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

let logoCache = null;
export async function loadLogo() {
  if (logoCache) return logoCache;
  const blob = await fetch("/doc-logo.jpg").then((r) => r.blob());
  logoCache = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
  return logoCache;
}

export function pen(doc) {
  const font = (size, bold, color = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  return {
    text(t, x, y, size, { bold = false, align = "left", color } = {}) {
      font(size, bold, color);
      doc.text(t, x, y, { align });
    },
    // Testo con parti in grassetto: [[testo, bold], ...]
    rich(parts, x, y, size) {
      let cx = x;
      parts.forEach(([t, b]) => {
        font(size, b);
        doc.text(t, cx, y);
        cx += doc.getTextWidth(t);
      });
    },
    value(t, x, y, maxW, size = 10, align = "left") {
      const v = s(t).trim();
      if (!v) return;
      let fs = size;
      font(fs, true, BLUE);
      while (fs > 5.5 && doc.getTextWidth(v) > maxW) {
        fs -= 0.5;
        doc.setFontSize(fs);
      }
      doc.text(v, x, y, { align });
    },
    hline(x1, x2, y, w = 0.75, color = BORDER) {
      doc.setFillColor(...color);
      doc.rect(x1, y - w / 2, x2 - x1, w, "F");
    },
    line(x1, y1, x2, y2, w = 1, color = [0, 0, 0]) {
      doc.setDrawColor(...color);
      doc.setLineWidth(w);
      doc.line(x1, y1, x2, y2);
    },
    box(x1, y1, x2, y2, fill) {
      if (fill) {
        doc.setFillColor(...FILL);
        doc.rect(x1, y1, x2 - x1, y2 - y1, "F");
      }
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.75);
      doc.rect(x1, y1, x2 - x1, y2 - y1);
    },
    cross(x, y, size) {
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(1.6);
      doc.line(x + 1.5, y + 1.5, x + size - 1.5, y + size - 1.5);
      doc.line(x + 1.5, y + size - 1.5, x + size - 1.5, y + 1.5);
    },
  };
}

function ceFooter(p, page) {
  p.text("Italserrande S.r.l. — Via Castino 29, 00166 Roma (RM)", 51, 804, 8.5, { color: GREY });
  p.text(`Pagina ${page} di 2`, 544.2, 804, 8.5, { align: "right", color: GREY });
}

function normaRow(p, f, i, y, iso) {
  p.box(51, y, 297.4, y + 24);
  p.box(297.4, y, 544.2, y + 24);
  p.rich([[`${i + 1}.`, true], [` ${normaLabel(i, iso)}`, false]], 57.8, y + 15.3, 9.5);
  const n = (f.norme || [])[i] || {};
  const yn = n.applica === true ? "Sì" : n.applica === false ? "No" : "";
  const txt = [yn, s(n.nota).trim()].filter(Boolean).join(" — ");
  p.value(txt, 304, y + 15.3, 234, 9.5);
}

// Corregge sempre la sigla del cavo (FG16OR16 con la O maiuscola) in ogni testo del PDF
const fixText = (t) => (typeof t === "string" ? t.replace(/FG16[0O]R16/gi, "FG16OR16") : Array.isArray(t) ? t.map(fixText) : t);

export const newDoc = () => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const text = doc.text.bind(doc);
  doc.text = (t, ...rest) => text(fixText(t), ...rest);
  return doc;
};

export async function buildCePdf(d) {
  const doc = newDoc();
  await drawCe(doc, d);
  return doc.output("blob");
}

export async function buildManutenzionePdf(d) {
  const doc = newDoc();
  await drawManutenzione(doc, d);
  return doc.output("blob");
}

const CE_AVVERTENZE = [
  "La dichiarazione vale per l'impianto indicato, così come installato e collaudato da Italserrande S.r.l.",
  "Modifiche successive sono coperte solo se autorizzate e controfirmate da Italserrande S.r.l.",
  "Modifiche, riparazioni e manutenzioni devono essere eseguite da personale tecnico qualificato.",
  "Le sostituzioni devono utilizzare ricambi originali o equivalenti per caratteristiche e sicurezza.",
  "L'impianto va mantenuto secondo le istruzioni e le norme vigenti, con almeno un controllo ogni 6 mesi.",
  "Manutenzioni e interventi vanno annotati nel Registro di manutenzione consegnato con l'impianto.",
];

export async function drawCe(doc, d) {
  const f = d.fields || {};
  const p = pen(doc);
  doc.addImage(await loadLogo(), "JPEG", 51, 51, 97, 148);

  p.text("Italserrande S.r.l.", 169.4, 70.3, 22, { bold: true });
  p.hline(169.5, 544.5, 78.75, 1.5, RED);
  COMPANY.forEach((t, i) => p.text(t, 544.2, 93 + i * 12.8, 9.5, { align: "right", color: [31, 41, 55] }));

  const nuovo = isNuovoReg(d.data);
  const sigla = nuovo ? "UE" : "CE";
  p.text(`DICHIARAZIONE ${sigla} DI CONFORMITÀ / DICHIARAZIONE DI PRESTAZIONE`, 51, 212.6, 13.5, { bold: true });
  if (nuovo) {
    p.rich([["La conformità della chiusura motorizzata è attestata secondo la norma ", false], ["EN 13241", true], [" e il ", false], ["Regolamento", true]], 51, 237, 11);
    p.rich([["(UE) 2023/1230", true], [" relativo alle macchine, con riferimento ai requisiti applicabili all'impianto installato.", false]], 51, 253.4, 11);
  } else {
    p.rich([["La conformità della chiusura motorizzata è attestata secondo la norma ", false], ["EN 13241", true], [" e la ", false], ["Direttiva", true]], 51, 237, 11);
    p.rich([["Macchine 2006/42/CE", true], [", con riferimento ai requisiti applicabili all'impianto installato.", false]], 51, 253.4, 11);
  }

  // Dati cliente e impianto
  p.box(51, 273.4, 238.8, 297.4, true);
  p.box(238.8, 273.4, 544.2, 297.4, true);
  p.text("Dati Cliente e Impianto", 57.8, 288, 9.5, { bold: true });
  p.text("Riferimento / Compilazione", 244.9, 288, 9.5, { bold: true });
  const rows = [
    [["Cliente / Committente:"], d.cliente, 297.4, 321.4],
    [["Indirizzo di installazione:"], d.indirizzo, 321.4, 345.4],
    [["Tipologia chiusura / impianto:"], f.tipologia, 345.4, 369.4],
    [["Comune / Provincia (RM):"], f.comune, 369.4, 393.4],
    [["Matricola / N° Commessa o", "Preventivo:"], f.matricola, 393.4, 431.6],
    [["Anno di installazione / messa in", "servizio:"], f.anno_installazione, 431.6, 469.8],
  ];
  rows.forEach(([labels, val, y1, y2]) => {
    p.box(51, y1, 238.8, y2);
    p.box(238.8, y1, 544.2, y2);
    labels.forEach((l, i) => p.text(l, 57.8, y1 + 14.6 + i * 14.3, 9.5, { bold: true }));
    p.hline(245.2, 537.8, y2 - 5.5);
    p.value(val, 247, y2 - 9, 288, 10.5);
  });

  // Comando / sicurezza
  p.box(51, 485.6, 297.4, 509.6, true);
  p.box(297.4, 485.6, 544.2, 509.6, true);
  p.text("Comando / Sicurezza / Identificazione", 57.8, 500.3, 9.5, { bold: true });
  p.text("Norma di Riferimento e Prescrizioni", 304, 500.3, 9.5, { bold: true });
  p.box(51, 509.6, 297.4, 576.4);
  p.box(297.4, 509.6, 544.2, 576.4);
  p.text("Comando / Motorizzazione:", 57.8, 531.8, 9.5, { bold: true });
  p.hline(183, 250.5, 535.9);
  p.value(f.comando, 184, 533.5, 108, 9.5);
  p.text("Norma di riferimento:", 57.8, 546, 9.5, { bold: true });
  p.hline(156.8, 224.2, 550.1);
  p.value(f.norma_riferimento, 158, 547.8, 134, 9.5);
  p.text("Riferimento collaudo / verbale N° ", 57.8, 560.4, 9);
  p.hline(192, 237, 564.4);
  p.value(f.collaudo, 193, 562, 100, 9.5);
  p.text("Targhetta CE:", 304, 524, 9.5, { bold: true });
  p.hline(368.2, 435.8, 528.4);
  p.value(f.targhetta_ce, 369, 526, 170, 9.5);
  p.text("UNI EN 13241", 304, 538.4, 9.5, { bold: true });
  p.hline(367.5, 420, 542.6);
  p.value(f.uni_en_13241, 368.5, 540.3, 170, 9.5);
  p.text("Verificati i dispositivi di sicurezza e la manovra di", 304, 552.6, 9);
  p.text("sblocco/emergenza dell'impianto.", 304, 566.9, 9);

  p.box(51, 576.4, 544.2, 600.4, true);
  p.text("Conformità alle Direttive e Norme Applicabili", 297.6, 591, 9.5, { bold: true, align: "center" });
  p.box(51, 600.4, 297.4, 624.4, true);
  p.box(297.4, 600.4, 544.2, 624.4, true);
  p.text("N° — Norma / Direttiva", 57.8, 615, 9.5, { bold: true });
  p.text("Applicazione / Note", 304, 615, 9.5, { bold: true });
  for (let i = 0; i < 6; i++) normaRow(p, f, i, 624.4 + i * 24, d.data);
  ceFooter(p, 1);

  // Pagina 2
  doc.addPage();
  p.box(51, 51.4, 297.4, 75.4, true);
  p.box(297.4, 51.4, 544.2, 75.4, true);
  p.text("Comando / Sicurezza / Identificazione", 57.8, 66, 9.5, { bold: true });
  p.text("Norma di Riferimento e Prescrizioni", 304, 66, 9.5, { bold: true });
  normaRow(p, f, 6, 75.4, d.data);
  normaRow(p, f, 7, 99.4, d.data);

  if (nuovo) {
    p.rich([["La presente ", false], ["Dichiarazione UE di Conformità", true], [" è rilasciata ai sensi del ", false], ["Regolamento (UE) 2023/1230", true], [" e della norma", false]], 51, 148.6, 9.5);
    p.rich([["UNI EN 13241", true], [" sotto la responsabilità esclusiva del fabbricante ", false], ["Italserrande S.r.l.", true]], 51, 162.1, 9.5);
  } else {
    p.rich([["La presente ", false], ["Dichiarazione CE di Conformità", true], [" è rilasciata ai sensi della ", false], ["Direttiva Macchine 2006/42/CE", true], [" e della", false]], 51, 148.6, 9.5);
    p.rich([["norma ", false], ["UNI EN 13241", true], [" sotto la responsabilità di ", false], ["Italserrande S.r.l.", true]], 51, 162.1, 9.5);
  }
  p.text("L'impianto deve essere utilizzato correttamente e sottoposto a controlli e manutenzioni periodiche; la dichiarazione", 51, 180.8, 9.5);
  p.text("decade in caso di modifiche non autorizzate o manomissioni.", 51, 194.3, 9.5);
  if (f.responsabile) p.rich([["Responsabile dell'impianto: ", true], [f.responsabile, false]], 51, 213, 9.5);
  p.text("Avvertenze", 51, 236, 10, { bold: true });
  CE_AVVERTENZE.forEach((t, i) => p.text(`${i + 1}. ${t}`, 51, 251 + i * 13.5, 8.8));

  // Riquadri firma ben distinti
  const sigBox = (x, y, w, h, label) => {
    p.text(label, x, y - 6, 9.5, { bold: true });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, w, h, 4, 4);
  };
  sigBox(51, 352, 236, 80, "Firma e timbro per accettazione:");
  sigBox(308.2, 352, 236, 80, "Firma Italserrande S.r.l. (timbro e firma):");
  sigBox(51, 470, 110, 44, "Data:");
  p.value(fmtDate(d.data), 106, 497, 100, 11, "center");
  sigBox(180, 470, 364.2, 44, "Firma cliente:");
  ceFooter(p, 2);
}

export async function drawManutenzione(doc, d) {
  const f = d.fields || {};
  const p = pen(doc);
  doc.addImage(await loadLogo(), "JPEG", 100, 20, 59, 90);

  p.text("Italserrande S.r.l.", 220, 41.6, 24, { bold: true, color: [0, 0, 0] });
  p.line(220, 50, 545.3, 50, 1.5);
  COMPANY.forEach((t, i) => p.text(t, 545.3, 58.9 + i * 10, 8, { align: "right", color: [0, 0, 0] }));

  p.text("REGISTRO DI MANUTENZIONE", 50, 137.8, 16, { bold: true, color: [0, 0, 0] });
  p.text("Nr.", 480, 133.6, 10, { color: [0, 0, 0] });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1);
  doc.rect(510, 120, 50, 20);
  p.value(d.numero ? `${d.numero}/${d.anno}` : "", 535, 134, 46, 10, "center");
  p.line(50, 160, 545.3, 160);

  p.text("Descrizione dell'intervento", 50, 183.4, 12, { bold: true, color: [0, 0, 0] });
  p.text("(Barrare la casella corrispondente all'intervento fatto. Descrivere gli eventuali rischi residui e/o l'uso improprio prevedibile)", 50, 198.9, 8, { color: [0, 0, 0] });
  p.text("Indirizzo intervento:", 50, 218.8, 9, { bold: true, color: [0, 0, 0] });
  p.line(145, 225, 545.3, 225);
  p.value(d.indirizzo, 148, 222, 395, 10);

  const tipi = f.tipi || [];
  TIPI_INTERVENTO.forEach(([key, label, x, y]) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.rect(x, y, 10, 10);
    p.text(label, x + 15, y + 8.4, 9, { color: [0, 0, 0] });
    if (tipi.includes(key)) p.cross(x, y, 10);
  });

  const LINES = 32;
  for (let i = 0; i < LINES; i++) p.line(50, 285 + i * 15, 545.3, 285 + i * 15);
  const txt = s(f.descrizione).trim();
  if (txt) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.splitTextToSize(txt, 493).slice(0, LINES).forEach((ln, i) => doc.text(ln, 52, 282 + i * 15));
  }

  p.text("Data intervento", 50, 773.7, 9, { color: [0, 0, 0] });
  p.line(120, 780, 240, 780);
  p.value(fmtDate(d.data), 123, 777, 115, 10);
  p.text("Firma del tecnico", 50, 793.7, 9, { color: [0, 0, 0] });
  p.line(130, 800, 240, 800);
  p.text("Firma del cliente", 350, 773.7, 9, { color: [0, 0, 0] });
  p.line(440, 780, 545.3, 780);
  p.text("Pagina 1 di 1", 545.3, 790.9, 7, { align: "right", color: [0, 0, 0] });
}

export function documentoFileName(d) {
  const base = (d.cliente || d.indirizzo || "documento").trim().replace(/[^\w-]+/g, "_").slice(0, 40);
  const pre = d.kind === "ce" ? "Dichiarazione-CE" : `Registro-Manutenzione-${d.numero || ""}`;
  return `${pre}-${base}.pdf`;
}

export async function sharePdf(blob, fileName, title) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
