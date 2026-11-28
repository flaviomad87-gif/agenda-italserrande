// Cartelli di sicurezza (forma e colori secondo UNI EN ISO 7010) e disegno vettoriale

const ALL = ["avvolgibile", "sezionale", "basculante", "tapparella", "scorrevole", "battente"];

const NO_TAPP = ALL.filter((t) => t !== "tapparella");

export const SEGNALI = [
  { id: "inciampo", tipo: "pericolo", simbolo: "trip", titolo: "PERICOLO D'INCIAMPO", types: NO_TAPP,
    significato: "A terra ci sono guide, soglie o battute sporgenti: fare attenzione a dove si mettono i piedi.",
    dove: "Vicino alla guida a pavimento, alla soglia o alla battuta d'arresto." },
  { id: "schiacciamento", tipo: "pericolo", simbolo: "crush", titolo: "PERICOLO DI SCHIACCIAMENTO MANI E PIEDI", types: NO_TAPP,
    significato: "Tra la parte in movimento e le parti fisse (pavimento, pilastri, telaio) si possono schiacciare mani e piedi.",
    dove: "Vicino al bordo di chiusura e alle zone di chiusura laterali." },
  { id: "mani", tipo: "pericolo", simbolo: "hand", titolo: "PERICOLO - ATTENZIONE ALLE MANI", types: ALL,
    significato: "Guide, rulli, cerniere, cremagliera e bracci possono schiacciare o trascinare le dita: non appoggiare le mani durante il movimento.",
    dove: "Sulle guide laterali, sulle cerniere e vicino al motore o alla cremagliera." },
  { id: "scivolamento", tipo: "pericolo", simbolo: "slip", titolo: "PERICOLO DI SCIVOLAMENTO E CADUTA", types: NO_TAPP,
    significato: "Nella zona di passaggio il pavimento può essere scivoloso (pioggia, ghiaccio, rampe): procedere con cautela.",
    dove: "All'ingresso della zona di passaggio o sulla rampa." },
  { id: "elettrico", tipo: "pericolo", simbolo: "bolt", titolo: "PERICOLO ELETTRICO", types: ALL,
    significato: "All'interno ci sono parti in tensione (230 V): può aprire solo un tecnico qualificato, dopo aver tolto la corrente.",
    dove: "Sul quadro di comando / centralina e sulle scatole di derivazione." },
  { id: "salire", tipo: "divieto", simbolo: "step", titolo: "VIETATO SALIRE", types: NO_TAPP,
    significato: "Non salire, arrampicarsi o farsi trasportare dalla chiusura: rischio di caduta e di schiacciamento.",
    dove: "Sull'anta o sul telo, ad altezza occhi, su entrambi i lati." },
];

export const segnaliFor = (tipo) => SEGNALI.filter((s) => s.types.includes(tipo));

const YELLOW = [255, 204, 0];
const RED = [204, 0, 0];
const BLUE = [0, 82, 156];
const BLACK = [0, 0, 0];

function figure(doc, cx, cy, u, head, limbs) {
  doc.setFillColor(...BLACK);
  doc.circle(cx + head[0] * u, cy + head[1] * u, 0.13 * u, "F");
  doc.setDrawColor(...BLACK);
  doc.setLineCap("round");
  doc.setLineWidth(0.13 * u);
  limbs.forEach((pts) => {
    for (let i = 1; i < pts.length; i++) doc.line(cx + pts[i - 1][0] * u, cy + pts[i - 1][1] * u, cx + pts[i][0] * u, cy + pts[i][1] * u);
  });
  doc.setLineCap("butt");
}

// freccia con punta in (x, y)
function arrow(doc, x, y, u, down) {
  const d = down ? -1 : 1;
  doc.triangle(x - 0.1 * u, y + d * 0.1 * u, x + 0.1 * u, y + d * 0.1 * u, x, y, "F");
  const y1 = y + d * 0.09 * u;
  const y2 = y + d * 0.22 * u;
  doc.rect(x - 0.035 * u, Math.min(y1, y2), 0.07 * u, Math.abs(y2 - y1), "F");
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
    const u = s * 0.5;
    const c = top + h * 0.64;
    if (sg.simbolo === "bolt") {
      const v = s * 0.16;
      const pts = [[0.3, -1.45], [-0.6, 0.2], [0.02, 0.2], [-0.3, 1.1], [0.62, -0.3], [0.0, -0.3]].map(([x, y]) => [cx + x * v, sy + y * v]);
      doc.lines(pts.slice(1).map(([x, y], i) => [x - pts[i][0], y - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], "F", true);
      doc.triangle(cx - 0.55 * v, sy + 0.95 * v, cx - 0.05 * v, sy + 1.05 * v, cx - 0.42 * v, sy + 1.5 * v, "F");
    } else if (sg.simbolo === "crush") {
      const k = top + h * 0.6;
      doc.rect(cx - 0.02 * u, k - 0.15 * u, 0.48 * u, 0.1 * u, "F");
      doc.rect(cx - 0.02 * u, k + 0.1 * u, 0.48 * u, 0.1 * u, "F");
      arrow(doc, cx + 0.22 * u, k - 0.17 * u, u, true);
      arrow(doc, cx + 0.22 * u, k + 0.22 * u, u, false);
      doc.rect(cx - 0.48 * u, k - 0.1 * u, 0.32 * u, 0.17 * u, "F");
      doc.rect(cx - 0.48 * u, k + 0.09 * u, 0.4 * u, 0.06 * u, "F");
    } else if (sg.simbolo === "hand") {
      doc.rect(cx - 0.42 * u, c - 0.2 * u, 0.4 * u, 0.06 * u, "F");
      doc.rect(cx - 0.42 * u, c + 0.17 * u, 0.4 * u, 0.06 * u, "F");
      arrow(doc, cx - 0.26 * u, c - 0.22 * u, u, true);
      doc.roundedRect(cx - 0.06 * u, c - 0.12 * u, 0.36 * u, 0.26 * u, 0.06 * u, 0.06 * u, "F");
      [-0.08, 0.0, 0.08].forEach((dy) => doc.roundedRect(cx - 0.34 * u, c + dy * u - 0.025 * u, 0.32 * u, 0.05 * u, 0.025 * u, 0.025 * u, "F"));
    } else if (sg.simbolo === "trip") {
      figure(doc, cx, c, u, [0.3, -0.28], [[[0.18, -0.2], [-0.12, -0.05], [-0.4, -0.02]], [[0.05, -0.15], [0.1, -0.35], [-0.1, -0.38]], [[-0.12, -0.05], [-0.05, 0.2], [-0.2, 0.32]], [[0.18, -0.2], [0.3, 0.05]]]);
      doc.rect(cx - 0.02 * u, c + 0.22 * u, 0.3 * u, 0.12 * u, "F");
    } else if (sg.simbolo === "slip") {
      figure(doc, cx, c, u, [0.18, -0.38], [[[0.08, -0.28], [-0.08, -0.02], [-0.42, 0.12]], [[-0.08, -0.02], [-0.25, 0.26]], [[0.06, -0.24], [-0.06, -0.48]], [[0.06, -0.24], [0.35, -0.42]]]);
      doc.rect(cx - 0.45 * u, c + 0.33 * u, 0.9 * u, 0.06 * u, "F");
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
    const u = s * 0.5;
    figure(doc, cx, cy, u, [0.02, -0.5], [[[0.0, -0.38], [-0.05, 0.05]], [[-0.05, 0.05], [-0.28, 0.05], [-0.3, 0.3]], [[-0.05, 0.05], [0.05, 0.45]], [[0.0, -0.3], [-0.3, -0.15]], [[0.0, -0.3], [0.25, -0.1]]]);
    doc.setLineWidth(0.06 * u);
    doc.line(cx - 0.5 * u, cy + 0.32 * u, cx - 0.22 * u, cy + 0.32 * u);
    doc.line(cx - 0.22 * u, cy + 0.32 * u, cx - 0.22 * u, cy + 0.45 * u);
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
