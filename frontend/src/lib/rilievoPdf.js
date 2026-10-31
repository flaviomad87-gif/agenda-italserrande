import jsPDF from "jspdf";
import { PANEL_MODELS_IMG, PANEL_MODELS, panelCode } from "./panelModelsImg";

// Ricostruzione vettoriale del "MODULO RILIEVI" originale (coordinate in pt
// del foglio originale 716x1000, scalate su A4).
const S = 595.28 / 716;
const OY = (841.89 - 1000 * S) / 2;
const BLUE = [20, 50, 140];

const v = (x) => (x === undefined || x === null ? "" : String(x));

export function fmtDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return v(iso);
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function makePen(doc) {
  const X = (x) => x * S;
  const Y = (y) => y * S + OY;
  const pen = {
    line: (x1, y1, x2, y2, w = 0.8) => {
      doc.setLineWidth(w * S);
      doc.line(X(x1), Y(y1), X(x2), Y(y2));
    },
    rect: (x1, y1, x2, y2, w = 0.8) => {
      doc.setLineWidth(w * S);
      doc.rect(X(x1), Y(y1), (x2 - x1) * S, (y2 - y1) * S);
    },
    fillRect: (x1, y1, x2, y2) => {
      doc.setFillColor(225, 225, 225);
      doc.setLineWidth(0.8 * S);
      doc.rect(X(x1), Y(y1), (x2 - x1) * S, (y2 - y1) * S, "FD");
    },
    poly: (pts) => {
      doc.setFillColor(225, 225, 225);
      doc.setLineWidth(0.8 * S);
      const [x0, y0] = pts[0];
      const segs = pts.slice(1).map(([x, y], i) => [(x - pts[i][0]) * S, (y - pts[i][1]) * S]);
      doc.lines(segs, X(x0), Y(y0), [1, 1], "FD", true);
    },
    text: (t, x, y, size = 9, opts = {}) => {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size * S);
      doc.text(t, X(x), Y(y), { align: opts.align || "left" });
    },
    // Valore compilato, ridotto finche' entra nella larghezza disponibile
    value: (t, x, y, maxW, size = 10, align = "left") => {
      const s = v(t);
      if (!s) return;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLUE);
      let fs = size;
      doc.setFontSize(fs * S);
      while (fs > 5 && doc.getTextWidth(s) > maxW * S) {
        fs -= 0.5;
        doc.setFontSize(fs * S);
      }
      doc.text(s, X(x), Y(y), { align });
      doc.setTextColor(0, 0, 0);
    },
    arrow: (x1, y1, x2, y2) => {
      pen.line(x1, y1, x2, y2, 0.7);
      const a = Math.atan2(y2 - y1, x2 - x1);
      const tip = (x, y, ang) =>
        doc.triangle(
          X(x), Y(y),
          X(x - 5 * Math.cos(ang - 0.35)), Y(y - 5 * Math.sin(ang - 0.35)),
          X(x - 5 * Math.cos(ang + 0.35)), Y(y - 5 * Math.sin(ang + 0.35)),
          "F",
        );
      doc.setFillColor(0, 0, 0);
      tip(x2, y2, a);
      tip(x1, y1, a + Math.PI);
    },
    cross: (x1, y1, x2, y2) => {
      doc.setDrawColor(...BLUE);
      pen.line(x1 + 3, y1 + 3, x2 - 3, y2 - 3, 1.4);
      pen.line(x1 + 3, y2 - 3, x2 - 3, y1 + 3, 1.4);
      doc.setDrawColor(0, 0, 0);
    },
    ellipse: (cx, cy, rx, ry) => {
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(1.4 * S);
      doc.ellipse(X(cx), Y(cy), rx * S, ry * S);
      doc.setDrawColor(0, 0, 0);
    },
    image: (data, x1, y1, x2, y2) =>
      doc.addImage(data, "JPEG", X(x1), Y(y1), (x2 - x1) * S, (y2 - y1) * S),
  };
  return pen;
}

function drawHeader(p, f) {
  p.text("MODULO RILIEVI", 322, 34, 21, { bold: true, align: "center" });
  p.text("RIF:", 510, 28, 13);
  p.text("DATA", 510, 50, 7.5);
  p.rect(550, 8, 658, 54, 1);
  p.line(550, 34, 658, 34, 1);
  p.value(f.rif, 604, 27, 100, 12, "center");
  p.value(fmtDate(f.data), 604, 49, 100, 11, "center");

  [["Ditta:", 97, f.ditta], ["Via:", 112, f.via], ["Citta:", 127, f.citta]].forEach(([l, y, val]) => {
    p.text(l, 114, y, 8.5, { align: "right" });
    p.value(val, 120, y, 284, 10);
  });
  p.rect(116, 86, 408, 132);
  p.line(116, 101, 408, 101);
  p.line(116, 116, 408, 116);

  [["Tel:", 91, f.tel], ["Fax:", 107, f.fax], ["e mail", 124, f.email]].forEach(([l, y, val]) => {
    p.text(l, 448, y, 8.5, { align: "right" });
    p.value(val, 469, y, 124, 9.5);
  });
  p.rect(466, 78, 596, 128);
  p.line(466, 95, 596, 95);
  p.line(466, 111, 596, 111);
}

function drawVistaInterna(p, f) {
  p.text("VISTA INTERNA", 382, 162, 9, { bold: true, align: "center" });
  p.line(347, 164, 417, 164, 0.6);

  // Stanza in prospettiva
  p.line(84, 158, 142, 186);
  p.line(640, 150, 586, 184);
  p.line(142, 186, 586, 184);
  p.line(142, 186, 142, 465);
  p.line(586, 184, 586, 465);
  p.line(142, 465, 84, 494);
  p.line(586, 465, 636, 490);
  p.line(142, 465, 210, 465);
  p.line(496, 465, 586, 465);

  // Vano con spessore muro
  p.line(210, 228, 512, 228);
  p.line(230, 248, 492, 248);
  p.line(210, 228, 230, 248);
  p.line(512, 228, 492, 248);
  p.line(210, 228, 210, 465);
  p.line(230, 248, 230, 446);
  p.line(230, 446, 210, 465);
  p.line(512, 228, 512, 465);
  p.line(492, 248, 492, 446);
  p.line(492, 446, 512, 465);

  // Quote
  p.line(120, 186, 140, 186, 0.6);
  p.line(120, 465, 140, 465, 0.6);
  p.arrow(126, 187, 126, 464);
  p.arrow(252, 187, 252, 227);
  p.arrow(252, 229, 252, 464);
  p.arrow(231, 420, 491, 420);

  const box = (label, txt, y1, val) => {
    p.text(label, 296, y1 + 15, 9, { align: "right" });
    p.rect(298, y1, 344, y1 + 22);
    p.text(txt, 347, y1 + 13, 8.5);
    p.value(val, 321, y1 + 15.5, 42, 10, "center");
  };
  box("h=", "Architrave", 186, f.architrave);
  box("H=", "Altezza foro muro", 290, f.h);
  box("L=", "Larghezza foro muro", 394, f.l);

  p.text("Altezza totale", 44, 306, 8.5);
  p.text("HT:", 70, 325, 8.5, { align: "right" });
  p.rect(72, 312, 116, 330);
  p.value(f.ht, 94, 325.5, 40, 10, "center");

  p.rect(134, 478, 230, 498);
  p.text("Mazzetta laterale SX:", 140, 507, 8.5);
  p.value(f.mazzetta_sx, 182, 492, 90, 10, "center");
  p.rect(526, 474, 596, 494);
  p.text("Mazzetta laterale DX:", 526, 503, 8.5);
  p.value(f.mazzetta_dx, 561, 488, 66, 10, "center");

  p.text("Pezzi No:", 404, 522, 8.5, { align: "right" });
  p.rect(410, 506, 464, 530);
  p.value(f.pezzi, 437, 522.5, 50, 11, "center");
}

function drawTipi(p, f) {
  const tipi = {
    A: { box: [96, 151], arrow: [94, 145], left: "L", right: "L", lx: 66, rx: 146 },
    B: { box: [234, 285], arrow: [234, 288], left: "I", right: "I", lx: 223, rx: 288 },
    C: { box: [385, 436], arrow: [390, 443], left: "L", right: "I", lx: 361, rx: 443 },
    D: { box: [530, 581], arrow: [526, 580], left: "I", right: "L", lx: 515, rx: 580 },
  };
  Object.entries(tipi).forEach(([t, c]) => {
    p.rect(c.box[0], 547, c.box[1], 559);
    p.text(`Tipo:  ${t}`, c.box[0] + 3, 556.5, 8.5);
    if (f.tipo === t) p.ellipse((c.box[0] + c.box[1]) / 2, 553, (c.box[1] - c.box[0]) / 2 + 6, 11);
    p.text("L", (c.arrow[0] + c.arrow[1]) / 2, 573, 8.5, { align: "center" });
    p.arrow(c.arrow[0] + 1, 583, c.arrow[1] - 1, 583);
    // Spalla sinistra
    if (c.left === "L") p.poly([[c.lx, 580], [c.lx + 27, 580], [c.lx + 27, 587], [c.lx + 10, 587], [c.lx + 10, 623], [c.lx, 623]]);
    else p.fillRect(c.lx, 577, c.lx + 11, 619);
    // Spalla destra
    if (c.right === "L") p.poly([[c.rx, 580], [c.rx + 26, 580], [c.rx + 26, 623], [c.rx + 16, 623], [c.rx + 16, 587], [c.rx, 587]]);
    else p.fillRect(c.rx, 577, c.rx + 11, 619);
  });

  p.text("TIPO :", 334, 664, 10, { bold: true, align: "right" });
  p.rect(342, 650, 410, 668);
  p.value(f.tipo, 376, 664, 60, 12, "center");
}

function drawTabella(p, f) {
  const yn = (b) => (b === true ? "SI" : b === false ? "NO" : "");

  // Riga Modello / Colore / Oblo
  p.text("Modello:", 112, 694, 8.5, { align: "right" });
  p.rect(114, 680, 228, 700);
  p.value(f.modello, 117, 694, 108, 10);
  p.text("Colore:", 238, 694, 8.5);
  p.rect(276, 680, 408, 700);
  p.value(f.colore, 279, 694, 126, 10);
  const hw = (y1, y2, label, main, hh, ww) => {
    p.text(label, 462, y2 - 5, 8.5, { align: "right" });
    p.rect(466, y1, 530, y2);
    p.value(main, 498, y2 - 5, 60, 10, "center");
    p.text("H=", 536, y2 - 5, 8.5);
    p.rect(552, y1, 592, y2);
    p.value(hh, 572, y2 - 5, 38, 10, "center");
    p.text("W=", 600, y2 - 5, 8.5);
    p.rect(620, y1, 658, y2);
    p.value(ww, 639, y2 - 5, 36, 10, "center");
  };
  hw(680, 700, "Oblo No:", f.oblo, f.oblo_h, f.oblo_w);
  hw(700, 718, "Portina:", yn(f.portina), f.portina_h, f.portina_w);

  // Griglia misure a sinistra
  const rows = [702, 720, 738, 754, 770, 786, 800, 814, 828, 846];
  p.line(24, 702, 296, 702);
  p.line(24, 846, 692, 846);
  p.line(296, 828, 692, 828);
  p.line(692, 828, 692, 846);
  p.line(24, 702, 24, 846);
  p.line(68, 702, 68, 770);
  p.line(228, 702, 228, 846);
  p.line(296, 702, 296, 846);
  rows.slice(1, -1).forEach((y) => p.line(24, y, 296, y));

  const left = [
    ["L", "Larghezza foro muro:", f.l],
    ["H", "Altezza foro muro:", f.h],
    ["h", "Architrave:", f.architrave],
    ["h1", "Veletta", f.veletta],
  ];
  left.forEach(([k, label, val], i) => {
    const yb = rows[i + 1] - 5;
    p.text(k, 46, yb, 8.5, { align: "center" });
    p.text(label, 72, yb, 8.5);
    p.value(val, 262, yb, 64, 10, "center");
  });
  p.text("Mazzette", 72, 781, 8.5);
  p.text("SX mm", 160, 781, 8.5);
  p.value(f.mazzetta_sx, 262, 781, 64, 10, "center");
  p.text("Spallette", 72, 796, 8.5);
  p.text("SX1 mm", 160, 796, 8.5);
  p.value(f.spallette_sx1, 262, 796, 64, 10, "center");
  p.text("Profondita del garage mm:", 96, 810, 8.5);
  p.value(f.profondita_garage, 262, 810, 64, 10, "center");
  p.text("Vs.riferimento Cliente:", 72, 824, 8.5);
  p.value(f.riferimento_cliente, 262, 824, 64, 10, "center");
  p.text("Destinazione merce:", 80, 841, 8.5);
  p.value(f.destinazione_merce, 300, 841, 388, 10);

  p.text("DX mm", 298, 781, 8.5);
  p.rect(342, 771, 408, 786);
  p.value(f.mazzetta_dx, 375, 783, 62, 10, "center");
  p.text("DX1 mm", 298, 796, 8.5);
  p.rect(342, 786, 408, 800);
  p.value(f.spallette_dx1, 375, 797.5, 62, 10, "center");

  // Si / No
  const opts = [
    ["Manigliore antipanico:", f.manigliore_antipanico],
    ["Motore:", f.motore],
    ["Fotocell:", f.fotocell],
    ["Lampeg.", f.lampeg],
    ["Montag.", f.montag],
    ["Sblocco", f.sblocco],
    ["Maniglia", f.maniglia],
  ];
  const sy = [720, 736, 752, 768, 784, 800, 814, 828];
  opts.forEach(([label, val], i) => {
    const y1 = sy[i], y2 = sy[i + 1];
    p.text(label, 462, y2 - 4, 8.5, { align: "right" });
    p.rect(466, y1, 484, y2);
    p.rect(484, y1, 508, y2);
    p.rect(508, y1, 526, y2);
    p.text("si", 487, y2 - 4, 8.5);
    p.text("no", 529, y2 - 4, 8.5);
    if (val === true) p.cross(466, y1, 484, y2);
    if (val === false) p.cross(508, y1, 526, y2);
  });
}

function drawNote(p, doc, f) {
  p.text("Note:", 34, 860, 8.5);
  const txt = v(f.note).trim();
  if (txt) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5 * S);
    doc.setTextColor(...BLUE);
    const lines = doc.splitTextToSize(txt, 320 * S).slice(0, 10);
    lines.forEach((ln, i) => doc.text(ln, 34 * S, (874 + i * 12) * S + OY));
    doc.setTextColor(0, 0, 0);
  }
  p.text("MODELLO PANNELLO", 552, 872, 8.5, { align: "center" });
  p.image(PANEL_MODELS_IMG, 362, 878, 700, 1000);
  const sel = PANEL_MODELS.find((m) => m.code === panelCode(f.modello));
  if (sel) {
    const x1 = 362 + sel.from * 338, x2 = 362 + sel.to * 338;
    p.ellipse((x1 + x2) / 2 - 10, 936, (x2 - x1) / 2 + 14, 60);
  }
}

export function buildRilievoPdf(f) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setDrawColor(0, 0, 0);
  const p = makePen(doc);
  drawHeader(p, f);
  drawVistaInterna(p, f);
  drawTipi(p, f);
  drawTabella(p, f);
  drawNote(p, doc, f);
  return doc.output("blob");
}

export function rilievoFileName(f) {
  const base = (f.riferimento_cliente || f.ditta || "nuovo").trim().replace(/[^\w-]+/g, "_");
  return `rilievo-sezionale-${base}.pdf`;
}
