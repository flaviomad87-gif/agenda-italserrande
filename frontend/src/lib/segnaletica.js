// Cartelli di sicurezza (forma e colori secondo UNI EN ISO 7010) e disegno vettoriale

const ALL = ["avvolgibile", "sezionale", "basculante", "tapparella", "scorrevole", "battente"];

export const SEGNALI = [
  { id: "movimento", tipo: "pericolo", simbolo: "!", titolo: "ATTENZIONE - CHIUSURA AUTOMATICA", types: ALL,
    significato: "La chiusura si muove da sola, anche comandata a distanza (radiocomando, pulsante, richiusura automatica).",
    dove: "Su entrambi i lati della chiusura, ad altezza occhi, ben visibile da chi si avvicina." },
  { id: "schiacciamento", tipo: "pericolo", simbolo: "crush", titolo: "PERICOLO DI SCHIACCIAMENTO", types: ALL,
    significato: "Tra la parte in movimento e le parti fisse (pavimento, pilastri, telaio) si possono schiacciare mani, piedi o il corpo.",
    dove: "Vicino al bordo di chiusura e alle zone di chiusura laterali." },
  { id: "mani", tipo: "pericolo", simbolo: "!", titolo: "NON INSERIRE LE MANI - PERICOLO DI CONVOGLIAMENTO", types: ["avvolgibile", "sezionale", "basculante", "tapparella", "scorrevole"],
    significato: "Guide, rulli, molle, cinghie, cremagliera e bracci possono trascinare e ferire le dita.",
    dove: "Sulle guide laterali e vicino a cassonetto, motore o cremagliera." },
  { id: "urto", tipo: "pericolo", simbolo: "!", titolo: "PERICOLO DI URTO - ANTE IN ROTAZIONE", types: ["battente", "basculante"],
    significato: "Le ante, girando, possono colpire persone o veicoli che sostano nella zona di apertura.",
    dove: "Su ciascuna anta, dal lato della zona di rotazione." },
  { id: "elettrico", tipo: "pericolo", simbolo: "bolt", titolo: "PERICOLO ELETTRICO - TENSIONE 230 V", types: ALL,
    significato: "All'interno ci sono parti in tensione: può aprire solo un tecnico qualificato, dopo aver tolto la corrente.",
    dove: "Sul quadro di comando / centralina e sulle scatole di derivazione." },
  { id: "lampeggiante", tipo: "pericolo", simbolo: "!", titolo: "LUCE LAMPEGGIANTE = CHIUSURA IN MOVIMENTO", types: ["avvolgibile", "sezionale", "basculante", "scorrevole", "battente"],
    significato: "Quando la luce lampeggia la chiusura si sta muovendo o sta per muoversi: tenersi a distanza.",
    dove: "Sotto o accanto al lampeggiante." },
  { id: "transito", tipo: "divieto", simbolo: "person", titolo: "VIETATO TRANSITARE DURANTE IL MOVIMENTO", types: ["avvolgibile", "sezionale", "basculante", "scorrevole", "battente"],
    significato: "Attraversare il passaggio solo quando la chiusura è completamente aperta e ferma.",
    dove: "Su entrambi i lati del passaggio, pedonale e carrabile." },
  { id: "bambini", tipo: "divieto", simbolo: "child", titolo: "VIETATO AI BAMBINI GIOCARE CON LA CHIUSURA E I COMANDI", types: ALL,
    significato: "I bambini non devono usare radiocomandi e pulsanti né sostare nella zona di manovra.",
    dove: "Vicino a pulsanti, selettori e zona di manovra." },
  { id: "sblocco", tipo: "obbligo", simbolo: "i", titolo: "SBLOCCO DI EMERGENZA - LEGGERE LE ISTRUZIONI", types: ALL,
    significato: "Senza corrente la chiusura si sblocca a mano solo seguendo il manuale d'uso; dopo lo sblocco accompagnare l'anta senza lasciarla libera.",
    dove: "Vicino al dispositivo di sblocco (maniglia, chiave, cordino o asta di manovra)." },
];

export const segnaliFor = (tipo) => SEGNALI.filter((s) => s.types.includes(tipo));

const YELLOW = [255, 204, 0];
const RED = [204, 0, 0];
const BLUE = [0, 82, 156];
const BLACK = [0, 0, 0];

function person(doc, cx, cy, s, child = false) {
  const k = child ? 0.7 : 1;
  doc.setFillColor(...BLACK);
  doc.circle(cx, cy - s * 0.32 * k, s * 0.08 * k, "F");
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(s * 0.07 * k);
  doc.line(cx, cy - s * 0.22 * k, cx, cy + s * 0.08 * k);
  doc.line(cx, cy - s * 0.12 * k, cx - s * 0.14 * k, cy + s * 0.02 * k);
  doc.line(cx, cy - s * 0.12 * k, cx + s * 0.14 * k, cy - s * 0.04 * k);
  doc.line(cx, cy + s * 0.08 * k, cx - s * 0.12 * k, cy + s * 0.32 * k);
  doc.line(cx, cy + s * 0.08 * k, cx + s * 0.12 * k, cy + s * 0.32 * k);
}

// cx, cy = centro; s = lato del cartello
export function drawSign(doc, sg, cx, cy, s) {
  doc.setLineJoin("round");
  if (sg.tipo === "pericolo") {
    const h = s * 0.866;
    const top = cy - h / 2;
    doc.setFillColor(...BLACK);
    doc.triangle(cx, top, cx - s / 2, top + h, cx + s / 2, top + h, "F");
    const b = s * 0.08;
    doc.setFillColor(...YELLOW);
    doc.triangle(cx, top + b * 2, cx - s / 2 + b * 1.73, top + h - b, cx + s / 2 - b * 1.73, top + h - b, "F");
    const sy = top + h * 0.62;
    doc.setFillColor(...BLACK);
    doc.setDrawColor(...BLACK);
    if (sg.simbolo === "bolt") {
      const u = s * 0.12;
      doc.lines([[u * 0.9, -u * 1.6], [-u * 0.1, u * 1.1], [u * 0.9, 0], [-u * 1.9, u * 2.2], [u * 0.3, -u * 1.3], [-u * 0.9, 0]], cx - u * 0.4, sy, [1, 1], "F", true);
    } else if (sg.simbolo === "crush") {
      const u = s * 0.1;
      doc.rect(cx - u * 2, sy + u * 0.9, u * 4, u * 0.45, "F");
      doc.triangle(cx - u * 0.7, sy - u * 1.3, cx + u * 0.7, sy - u * 1.3, cx, sy + u * 0.3, "F");
      doc.rect(cx - u * 0.25, sy - u * 2.2, u * 0.5, u * 1, "F");
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(s * 0.55);
      doc.setTextColor(...BLACK);
      doc.text("!", cx, sy + s * 0.17, { align: "center" });
    }
  } else if (sg.tipo === "divieto") {
    const r = s / 2;
    doc.setFillColor(...RED);
    doc.circle(cx, cy, r, "F");
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, r * 0.78, "F");
    person(doc, cx, cy, s, sg.simbolo === "child");
    doc.setDrawColor(...RED);
    doc.setLineWidth(r * 0.2);
    doc.line(cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55);
  } else {
    doc.setFillColor(...BLUE);
    doc.circle(cx, cy, s / 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(s * 0.6);
    doc.setTextColor(255, 255, 255);
    doc.text(sg.simbolo, cx, cy + s * 0.2, { align: "center" });
  }
  doc.setLineWidth(0.75);
  doc.setTextColor(...BLACK);
}
