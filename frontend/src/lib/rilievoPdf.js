import jsPDF from "jspdf";

const GREEN = [74, 93, 35];
const v = (x) => (x === undefined || x === null || x === "" ? "" : String(x));

function fmtDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return v(iso);
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function arrow(doc, x1, y1, x2, y2) {
  doc.line(x1, y1, x2, y2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = 1.6;
  const tip = (x, y, ang) =>
    doc.triangle(
      x, y,
      x - s * Math.cos(ang - 0.4), y - s * Math.sin(ang - 0.4),
      x - s * Math.cos(ang + 0.4), y - s * Math.sin(ang + 0.4),
      "F",
    );
  tip(x2, y2, a);
  tip(x1, y1, a + Math.PI);
}

function labeledBox(doc, x, y, w, label, value, labelW = 14) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, x, y + 4.2);
  doc.rect(x + labelW, y, w - labelW, 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(doc.splitTextToSize(v(value), w - labelW - 2)[0] || "", x + labelW + 1.5, y + 4.3);
}

function checkbox(doc, x, y, checked) {
  doc.rect(x, y, 3.5, 3.5);
  if (checked) {
    doc.setLineWidth(0.5);
    doc.line(x + 0.6, y + 1.9, x + 1.5, y + 2.9);
    doc.line(x + 1.5, y + 2.9, x + 3, y + 0.6);
    doc.setLineWidth(0.25);
  }
}

function drawHeader(doc, f) {
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("MODULO RILIEVI", 12, 17);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("PORTA SEZIONALE", 12, 22);
  doc.setTextColor(0, 0, 0);
  labeledBox(doc, 140, 10, 58, "RIF:", f.rif, 12);
  labeledBox(doc, 140, 18, 58, "DATA:", fmtDate(f.data), 12);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(12, 27, 198, 27);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  labeledBox(doc, 12, 31, 104, "Ditta:", f.ditta);
  labeledBox(doc, 12, 39, 104, "Via:", f.via);
  labeledBox(doc, 12, 47, 104, "Città:", f.citta);
  labeledBox(doc, 122, 31, 76, "Tel:", f.tel, 12);
  labeledBox(doc, 122, 39, 76, "Fax:", f.fax, 12);
  labeledBox(doc, 122, 47, 76, "e-mail:", f.email, 12);
}

function drawDiagram(doc, f) {
  const X0 = 12, Y0 = 58, W = 112, H = 86;
  doc.rect(X0, Y0, W, H);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text("VISTA INTERNA", X0 + 2, Y0 + 4.5);
  doc.setTextColor(0, 0, 0);

  const ceil = Y0 + 12, floor = Y0 + 60, archBot = Y0 + 24;
  const wl = X0 + 30, wr = X0 + 88, oL = wl + 10, oR = wr - 10;
  doc.setFillColor(225, 225, 220);
  doc.rect(wl, ceil, wr - wl, archBot - ceil, "FD");
  doc.rect(wl, archBot, oL - wl, floor - archBot, "FD");
  doc.rect(oR, archBot, wr - oR, floor - archBot, "FD");
  doc.rect(oL, archBot, oR - oL, floor - archBot);
  doc.setLineWidth(0.5);
  doc.line(X0 + 4, ceil, X0 + W - 4, ceil);
  doc.line(X0 + 4, floor, X0 + W - 4, floor);
  doc.setLineWidth(0.25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Architrave", (wl + wr) / 2, ceil + 7, { align: "center" });
  doc.text("Altezza foro muro", (oL + oR) / 2, (archBot + floor) / 2, { align: "center" });

  arrow(doc, X0 + 20, ceil, X0 + 20, floor);
  arrow(doc, wr + 6, ceil, wr + 6, archBot);
  arrow(doc, wr + 6, archBot, wr + 6, floor);
  arrow(doc, oL, floor + 4, oR, floor + 4);

  const val = (txt, x, y, align = "left") => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(txt, x, y, { align });
  };
  val(`HT: ${v(f.ht)}`, X0 + 3, (ceil + floor) / 2 + 1);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text("Alt. totale", X0 + 3, (ceil + floor) / 2 + 4.5);
  val(`h= ${v(f.architrave)}`, wr + 8, (ceil + archBot) / 2 + 1);
  val(`H= ${v(f.h)}`, wr + 8, (archBot + floor) / 2 + 1);
  val(`L= ${v(f.l)}`, (oL + oR) / 2, floor + 9, "center");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text("Larghezza foro muro", (oL + oR) / 2, floor + 12.5, { align: "center" });

  labeledBox(doc, X0 + 3, Y0 + H - 8, 52, "Mazz. SX:", f.mazzetta_sx, 15);
  labeledBox(doc, X0 + 57, Y0 + H - 8, 52, "Mazz. DX:", f.mazzetta_dx, 15);
}

function drawTipoAndOptions(doc, f) {
  const X = 130, Y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREEN);
  doc.text("TIPO", X, Y + 4);
  doc.setTextColor(0, 0, 0);
  ["A", "B", "C", "D"].forEach((t, i) => {
    const bx = X + i * 17;
    const sel = f.tipo === t;
    if (sel) doc.setFillColor(...GREEN);
    doc.rect(bx, Y + 7, 14, 10, sel ? "FD" : "S");
    doc.setTextColor(...(sel ? [255, 255, 255] : [0, 0, 0]));
    doc.setFontSize(11);
    doc.text(t, bx + 7, Y + 13.8, { align: "center" });
  });
  doc.setTextColor(0, 0, 0);

  const opts = [
    ["Maniglione antipanico", f.manigliore_antipanico],
    ["Motore", f.motore],
    ["Fotocellule", f.fotocell],
    ["Lampeggiante", f.lampeg],
    ["Montaggio", f.montag],
    ["Sblocco", f.sblocco],
    ["Maniglia", f.maniglia],
  ];
  let y = Y + 25;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("si", X + 50, y - 1.5);
  doc.text("no", X + 58, y - 1.5);
  opts.forEach(([label, on]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(label, X, y + 2.8);
    checkbox(doc, X + 49.5, y, !!on);
    checkbox(doc, X + 58, y, !on);
    y += 7;
  });
}

function drawTable(doc, f) {
  const X = 12, W = 186, half = W / 2;
  let y = 150;
  const cell = (x, w, label, value) => {
    doc.rect(x, y, w, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(label, x + 1.5, y + 3.2);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(v(value), w - 3)[0] || "", x + 1.5, y + 7);
  };
  const row = (a, b) => {
    if (b) {
      cell(X, half, ...a);
      cell(X + half, half, ...b);
    } else cell(X, W, ...a);
    y += 8;
  };
  const portinaDim = f.portina ? [f.portina_h && `H= ${f.portina_h}`, f.portina_w && `W= ${f.portina_w}`].filter(Boolean).join("   ") : "";
  row(["Modello", f.modello], ["Colore", f.colore]);
  row(["N° pezzi", f.pezzi], ["Oblò N°", f.oblo]);
  row(["Larghezza foro muro (L) mm", f.l], ["Altezza foro muro (H) mm", f.h]);
  row(["Altezza totale (HT) mm", f.ht], ["Architrave (h) mm", f.architrave]);
  row(["Veletta mm", f.veletta], ["Profondità del garage mm", f.profondita_garage]);
  row(["Mazzetta SX mm", f.mazzetta_sx], ["Mazzetta DX mm", f.mazzetta_dx]);
  row(["Spallette SX mm", f.spallette_sx], ["Spallette DX mm", f.spallette_dx]);
  row(["Spallette SX1 mm", f.spallette_sx1], ["Spallette DX1 mm", f.spallette_dx1]);
  row(["Portina", f.portina ? "Sì" : "No"], ["Misure portina", portinaDim]);
  row(["Vs. riferimento cliente", f.riferimento_cliente]);
  row(["Destinazione merce", f.destinazione_merce]);

  const noteH = Math.max(18, 285 - y);
  doc.rect(X, y, W, noteH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text("Note", X + 1.5, y + 3.2);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(v(f.note), W - 3);
  const maxLines = Math.floor((noteH - 5) / 4);
  lines.slice(0, maxLines).forEach((ln, i) => doc.text(ln, X + 1.5, y + 7.5 + i * 4));
}

export function buildRilievoPdf(f) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setLineWidth(0.25);
  drawHeader(doc, f);
  drawDiagram(doc, f);
  drawTipoAndOptions(doc, f);
  drawTable(doc, f);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text("Generato con Agenda Italserrande", 105, 291, { align: "center" });
  return doc.output("blob");
}

export function rilievoFileName(f) {
  const base = (f.riferimento_cliente || f.ditta || "nuovo").trim().replace(/[^\w\-]+/g, "_");
  return `rilievo-sezionale-${base}.pdf`;
}
