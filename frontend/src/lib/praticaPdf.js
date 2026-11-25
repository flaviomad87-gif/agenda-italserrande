import { newDoc, pen, loadLogo, COMPANY, INK, BORDER, FILL, RED, GREY, BLUE, fmtDate, drawCe, drawManutenzione, isNuovoReg } from "./documentiPdf";
import * as T from "./praticaTesti";

const L = 51;
const R = 544.2;
const W = R - L;
const BOTTOM = 786;

// Impaginazione a flusso con intestazione Italserrande e salto pagina automatico.
export class Flow {
  constructor(doc, logo) {
    this.doc = doc;
    this.p = pen(doc);
    this.logo = logo;
    this.sections = [];
    this.used = false;
  }
  font(size, style = "normal", color = INK) {
    this.doc.setFont("helvetica", style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }
  fresh() {
    if (this.used) this.doc.addPage();
    this.used = true;
  }
  start(title, subtitle) {
    this.fresh();
    this.cur = { title, pages: [this.doc.getNumberOfPages()] };
    this.sections.push(this.cur);
    const { doc, p } = this;
    doc.addImage(this.logo, "JPEG", L, 32, 38, 58);
    p.text("Italserrande S.r.l.", 100, 52, 18, { bold: true });
    p.hline(100, R, 58, 1.3, RED);
    COMPANY.forEach((t, i) => p.text(t, R, 69 + i * 8.6, 7.5, { align: "right", color: [31, 41, 55] }));
    this.y = 130;
    this.font(13.5, "bold");
    doc.splitTextToSize(title, W).forEach((l) => {
      doc.text(l, L, this.y);
      this.y += 16;
    });
    if (subtitle) {
      this.font(9, "normal", GREY);
      doc.splitTextToSize(subtitle, W).forEach((l) => {
        doc.text(l, L, this.y);
        this.y += 11.5;
      });
    }
    this.y += 10;
  }
  ensure(h) {
    if (this.y + h <= BOTTOM) return false;
    this.doc.addPage();
    this.cur.pages.push(this.doc.getNumberOfPages());
    this.font(8, "italic", GREY);
    this.doc.text(`${this.cur.title} (segue)`, L, 40);
    this.y = 62;
    return true;
  }
  gap(n = 8) {
    this.y += n;
  }
  h2(t, align = "left", keep = 64) {
    this.ensure(keep);
    this.y += 4;
    this.font(10, "bold");
    this.doc.text(t, align === "center" ? L + W / 2 : L, this.y, { align });
    this.y += 12;
  }
  para(t, { size = 9, style = "normal", color = INK, indent = 0 } = {}) {
    this.font(size, style, color);
    this.doc.splitTextToSize(t, W - indent).forEach((l) => {
      this.ensure(size * 1.4);
      this.font(size, style, color);
      this.doc.text(l, L + indent, this.y);
      this.y += size * 1.38;
    });
    this.y += 4;
  }
  bullets(list) {
    list.forEach((t) => {
      this.font(9);
      const lines = this.doc.splitTextToSize(t, W - 14);
      this.ensure(lines.length * 12);
      this.font(9);
      this.doc.text("-", L + 3, this.y);
      lines.forEach((l) => {
        this.doc.text(l, L + 14, this.y);
        this.y += 12;
      });
      this.y += 1.5;
    });
    this.y += 3;
  }
  box(x, y, on) {
    const { doc } = this;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.rect(x, y - 8, 9, 9);
    if (on) this.p.cross(x, y - 8, 9);
  }
  checkLine(on, t) {
    this.font(9);
    const lines = this.doc.splitTextToSize(t, W - 18);
    this.ensure(lines.length * 12);
    this.box(L, this.y, on);
    this.font(9);
    lines.forEach((l) => {
      this.doc.text(l, L + 16, this.y);
      this.y += 12;
    });
    this.y += 2;
  }
  checks(items, perRow = 4) {
    const cw = W / perRow;
    for (let i = 0; i < items.length; i += perRow) {
      this.ensure(16);
      items.slice(i, i + perRow).forEach(([label, on], j) => {
        const noBox = on === null;
        if (!noBox) this.box(L + j * cw, this.y, on);
        this.font(9);
        this.doc.text(label, L + j * cw + (noBox ? 0 : 14), this.y);
      });
      this.y += 16;
    }
    this.y += 2;
  }
  // Tabella: cols = [[intestazione, larghezza]], rows = [[celle]] o { group: "titolo" }
  table(cols, rows, { blueCols = [] } = {}) {
    const { doc } = this;
    const pad = 5;
    const header = () => {
      const h = 17;
      let x = L;
      cols.forEach(([label, w]) => {
        doc.setFillColor(...FILL);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.75);
        doc.rect(x, this.y, w, h, "FD");
        this.font(8.5, "bold");
        doc.text(label, x + pad, this.y + 11.8);
        x += w;
      });
      this.y += h;
    };
    this.ensure(rows.length <= 6 ? 24 + rows.length * 22 : 44);
    header();
    rows.forEach((row) => {
      if (row.group) {
        if (this.ensure(36)) header();
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(...BORDER);
        doc.rect(L, this.y, W, 14, "FD");
        this.font(8, "bold", [0, 58, 140]);
        doc.text(row.group.toUpperCase(), L + pad, this.y + 10);
        this.y += 14;
        return;
      }
      const cells = row.map((c, i) => {
        this.font(8.5, blueCols.includes(i) ? "bold" : "normal");
        return doc.splitTextToSize(String(c ?? ""), cols[i][1] - pad * 2);
      });
      const h = Math.max(...cells.map((c) => c.length)) * 10.2 + 6;
      if (this.ensure(h)) header();
      let x = L;
      cells.forEach((lines, i) => {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.75);
        doc.rect(x, this.y, cols[i][1], h);
        this.font(8.5, blueCols.includes(i) ? "bold" : "normal", blueCols.includes(i) ? BLUE : INK);
        lines.forEach((l, k) => doc.text(l, x + pad, this.y + 11.2 + k * 10.2));
        x += cols[i][1];
      });
      this.y += h;
    });
    this.y += 8;
  }
  kv(rows) {
    this.table([["Dato", 150], ["Valore", W - 150]], rows.filter(([, v]) => v !== undefined), { blueCols: [1] });
  }
  // Dati su due colonne affiancate per risparmiare spazio
  kv2(rows) {
    const r = rows.filter(([, v]) => v !== undefined);
    const pairs = [];
    for (let i = 0; i < r.length; i += 2) pairs.push([r[i][0], r[i][1], r[i + 1]?.[0] || "", r[i + 1]?.[1] || ""]);
    this.table([["Dato", 95], ["Valore", W / 2 - 95], ["Dato", 95], ["Valore", W / 2 - 95]], pairs, { blueCols: [1, 3] });
  }
  signatures(labels) {
    this.ensure(64);
    this.y += 10;
    const cw = W / labels.length;
    labels.forEach((l, i) => {
      const x = L + i * cw;
      this.font(9, "bold");
      this.doc.text(l, x, this.y);
      this.doc.setDrawColor(...BORDER);
      this.doc.setLineWidth(0.6);
      this.doc.roundedRect(x, this.y + 5, cw - 16, 38, 3, 3);
    });
    this.y += 52;
  }
  finish() {
    this.sections.forEach(({ pages }) =>
      pages.forEach((pg, i) => {
        this.doc.setPage(pg);
        this.p.text("Italserrande S.r.l. — Via Castino 29, 00166 Roma (RM)", L, 804, 8.5, { color: GREY });
        this.p.text(`Pagina ${i + 1} di ${pages.length}`, R, 804, 8.5, { align: "right", color: GREY });
      }),
    );
  }
}

const tipoLabel = (f) => T.TIPI_CHIUSURA[f.tipo_chiusura] || "Chiusura motorizzata";
const matricola = (d) => d.fields.matricola || (d.numero ? `${d.numero}/${d.anno}` : "");
const dimensioni = (f) => (f.larghezza || f.altezza ? `L ${f.larghezza || "-"} x H ${f.altezza || "-"} mm` : "");
const sicurezzeOn = (f) => T.SICUREZZE.filter(([k]) => (f.sicurezze || []).includes(k));
const ESITI = { C: "Conforme", NC: "Non conforme", NA: "Non applicabile" };

function datiImpianto(fl, d, extra = []) {
  const f = d.fields;
  fl.kv2([
    ["Cliente / Committente", d.cliente],
    ["Indirizzo di installazione", [d.indirizzo, f.comune].filter(Boolean).join(" - ")],
    ["Tipo di chiusura", tipoLabel(f)],
    ["Modello / dimensioni", [f.modello, dimensioni(f)].filter(Boolean).join(" - ")],
    ["Matricola", matricola(d)],
    ["Motore / centralina", [f.motore, f.centralina].filter(Boolean).join(" - ")],
    ["Tipo di comando", T.COMANDI[f.comando_tipo] || ""],
    ...extra,
  ]);
}

export const toCe = (d) => {
  const f = d.fields;
  return {
    cliente: d.cliente,
    indirizzo: d.indirizzo,
    data: d.data,
    fields: {
      tipologia: [tipoLabel(f), f.modello].filter(Boolean).join(" - "),
      comune: f.comune,
      matricola: matricola(d),
      anno_installazione: f.anno_installazione,
      comando: f.motore,
      norma_riferimento: "UNI EN 13241",
      collaudo: d.numero ? `${d.numero}/${d.anno}` : "",
      targhetta_ce: "Applicata",
      uni_en_13241: "Conforme",
      norme: f.norme,
    },
  };
};

export const toRegistro = (d) => {
  const f = d.fields;
  const sic = sicurezzeOn(f).map(([, l]) => l.toLowerCase()).join(", ");
  return {
    numero: d.numero,
    anno: d.anno,
    indirizzo: [d.indirizzo, f.comune].filter(Boolean).join(" - "),
    data: d.data,
    fields: {
      tipi: ["installazione", "avviamento", "regolazioni"],
      descrizione:
        `Installazione e messa in servizio in data ${d.data ? fmtDate(d.data) : "[Data]"}: ${tipoLabel(f)}${f.modello ? ` ${f.modello}` : ""}, ` +
        `matricola ${String(f.matricola || "").trim() || "[Matricola]"}. ` +
        `Collaudo con esito ${f.esito === "negativo" ? "negativo" : "positivo"}. Dispositivi di sicurezza verificati: ${sic || "-"}. ` +
        `Rischi residui: ${f.rischi_residui || T.RISCHI_RESIDUI_DEFAULT}`,
    },
  };
};

function collaudo(fl, d) {
  const f = d.fields;
  fl.start("VERBALE DI COLLAUDO E PRESA IN CONSEGNA", tipoLabel(f));
  datiImpianto(fl, d, [["Data collaudo", fmtDate(d.data)]]);
  fl.h2("Verifiche eseguite");
  const items = T.checklistFor(f.tipo_chiusura, isNuovoReg(d.data)).map((c) => [c.label, ESITI[(f.collaudo || {})[c.id]] || ""]);
  const half = Math.ceil(items.length / 2);
  const rows = items.slice(0, half).map((a, i) => [...a, ...(items[half + i] || ["", ""])]);
  fl.table([["Verifica", W / 2 - 62], ["Esito", 62], ["Verifica", W / 2 - 62], ["Esito", 62]], rows, { blueCols: [1, 3] });
  fl.h2("Modalità di funzionamento e protezione contro schiacciamento e impatto");
  const nf = T.notaForze(f);
  fl.para(nf.testo, { size: 8.8, style: nf.ok ? "normal" : "bold", color: nf.ok ? INK : RED });
  fl.h2("Esito del collaudo");
  fl.checks([["Positivo", f.esito !== "negativo"], ["Negativo", f.esito === "negativo"], [`Radiocomandi consegnati: ${f.n_radiocomandi || "-"}`, null]], 3);
  if (f.note_collaudo) fl.para(`Note: ${f.note_collaudo}`);
  fl.para(
    "Il cliente dichiara di aver ricevuto l'impianto funzionante, la documentazione sopra indicata e le istruzioni su uso, " +
      "sblocco di emergenza, manutenzione e rischi residui.",
  );
  fl.signatures(["Il tecnico collaudatore", "Il cliente per presa in consegna"]);
}

function rischi(fl, d) {
  const f = d.fields;
  const on = f.sicurezze || [];
  const nuovo = isNuovoReg(d.data);
  fl.start(
    "ANALISI DEI RISCHI",
    `Valutazione dei pericoli secondo ${nuovo ? "Regolamento (UE) 2023/1230 (Allegato III)" : "Direttiva Macchine 2006/42/CE (Allegato I)"} e UNI EN 12453`,
  );
  datiImpianto(fl, d, [["Utilizzo", T.USI_IMPIANTO[f.uso] || T.USI_IMPIANTO.privato]]);
  fl.h2("Pericoli individuati e misure adottate");
  const lab = Object.fromEntries(T.SICUREZZE);
  const rows = T.RISCHI.filter((r) => !r.nuovo || nuovo).map((r) => {
    const present = r.sic.filter((k) => on.includes(k)).map((k) => lab[k]);
    const misure = [...present, r.fisso].filter(Boolean).join("; ");
    return [r.pericolo, r.zona(f.tipo_chiusura), misure || "-", present.length || r.fisso ? "Ridotto" : "Da valutare"];
  });
  fl.table([["Pericolo", 108], ["Zona", 128], ["Misure adottate", W - 108 - 128 - 72], ["Esito", 72]], rows, { blueCols: [3] });
  fl.h2("Dispositivi di sicurezza installati");
  fl.para(sicurezzeOn(f).map(([, l]) => l).join("; ") + ".");
  fl.h2("Rischi residui");
  fl.para(f.rischi_residui || T.RISCHI_RESIDUI_DEFAULT);
  fl.para(`Data: ${fmtDate(d.data)}`);
  fl.signatures(["Il tecnico (Italserrande S.r.l.)"]);
}

function manuale(fl, d) {
  const f = d.fields;
  fl.start("MANUALE D'USO E MANUTENZIONE", tipoLabel(f));
  datiImpianto(fl, d, [
    ["Anno di installazione", f.anno_installazione],
    ["Alimentazione", f.alimentazione],
    ["Installatore", "Italserrande S.r.l. - tel. 337743730 / ufficio 06-6240259"],
  ]);
  T.manualeSezioni(f.tipo_chiusura, isNuovoReg(d.data)).forEach(([title, items], i) => {
    fl.h2(`${i + 1}. ${title}`);
    fl.bullets(items);
  });
  fl.h2("8. Dispositivi di sicurezza installati");
  fl.bullets(sicurezzeOn(f).map(([, l]) => l));
  fl.h2("9. Rischi residui");
  fl.para(f.rischi_residui || T.RISCHI_RESIDUI_DEFAULT);
  fl.h2("10. Assistenza");
  fl.para("Per assistenza, manutenzione e ricambi: Italserrande S.r.l. - Via Castino 29, 00166 Roma (RM) - tel. 337743730 / ufficio 06-6240259 - italserrande@libero.it");
}

function dm37(fl, d) {
  const f = d.fields;
  const m = f.dm37 || {};
  const all = m.allegati || {};
  fl.start("DICHIARAZIONE DI CONFORMITÀ DELL'IMPIANTO ALLA REGOLA DELL'ARTE", "Art. 7 del D.M. 22 gennaio 2008 n. 37 - Allegato I");
  fl.para(
    `Il sottoscritto ${m.responsabile || "______________________"}, titolare o legale rappresentante dell'impresa Italserrande S.r.l., ` +
      "operante nel settore impianti elettrici (art. 1, comma 2, lettera a), con sede in Via Castino 29, 00166 Roma (RM), " +
      "tel. 337743730, P.IVA 09270881007,",
  );
  fl.checkLine(true, "iscritta nel registro delle imprese (D.P.R. 7/12/1995 n. 581) della Camera C.I.A.A. di Roma n. 1152580");
  fl.checkLine(false, "iscritta all'Albo Provinciale delle imprese artigiane (L. 8/8/1985 n. 443)");
  fl.para(`esecutrice dell'impianto (descrizione schematica): ${m.descrizione || T.DM37_DESCRIZIONE(f.tipo_chiusura)}`);
  fl.para("inteso come:");
  fl.checks(Object.entries(T.DM37_TIPI).map(([k, l]) => [l, (m.tipo || "nuovo") === k]), 4);
  const b = (v) => (String(v || "").trim() ? String(v).trim() : "____________________");
  fl.para(
    `commissionato da: ${b(d.cliente)}, installato nei locali siti nel comune di ${b(f.comune)}, in ${b(d.indirizzo)}` +
      `, scala ${f.scala || "____"}, piano ${f.piano || "____"}, interno ${f.interno || "____"}, ` +
      `di proprietà di ${b(f.proprietario || d.cliente)}, in edificio adibito ad uso:`,
  );
  fl.checks(Object.entries(T.DM37_USI).map(([k, l]) => [l, (f.uso_edificio || "civile") === k]), 4);
  fl.h2("DICHIARA", "center");
  fl.para(
    "sotto la propria personale responsabilità, che l'impianto è stato realizzato in modo conforme alla regola dell'arte, secondo " +
      "quanto previsto dall'art. 6, tenuto conto delle condizioni di esercizio e degli usi a cui è destinato l'edificio, avendo in particolare:",
  );
  fl.checkLine(!!m.progetto, `rispettato il progetto redatto ai sensi dell'art. 5 da: ${m.progetto ? m.progettista || "-" : "(progetto non obbligatorio)"}`);
  fl.checkLine(true, `seguito la normativa tecnica applicabile all'impiego: ${T.DM37_NORME}`);
  fl.checkLine(true, "installato componenti e materiali adatti al luogo di installazione (artt. 5 e 6);");
  fl.checkLine(true, "controllato l'impianto ai fini della sicurezza e della funzionalità con esito positivo, avendo eseguito le verifiche richieste dalle norme e dalle disposizioni di legge.");
  fl.h2("Allegati obbligatori");
  fl.table(
    [["Allegato", W - 110], ["Allegato", 110]],
    [
      ["Relazione con tipologie dei materiali utilizzati (in fondo a questa dichiarazione)", "Sì"],
      ["Schema di impianto realizzato (pagina seguente)", "Sì"],
      ["Copia del certificato di riconoscimento dei requisiti tecnico-professionali (visura camerale aggiornata)", "Sì"],
      ["Progetto ai sensi degli articoli 5 e 7", m.progetto ? "Sì" : "Non obbligatorio"],
      ["Riferimento a dichiarazioni di conformità precedenti o parziali", all.precedenti ? "Sì" : "No"],
      ["Attestazione per materiali o sistemi non normalizzati", "Non necessaria"],
    ],
    { blueCols: [1] },
  );
  fl.para(
    "DECLINA ogni responsabilità per sinistri a persone o a cose derivanti da manomissione dell'impianto da parte di terzi " +
      "ovvero da carenze di manutenzione o riparazione.",
    { style: "bold" },
  );
  fl.para(`Data: ${fmtDate(d.data)}`);
  fl.signatures(["Il responsabile tecnico (timbro e firma)", "Il dichiarante (timbro e firma)"]);
  fl.dm37Avvertenze = () => {
    fl.h2("Avvertenze per il committente (art. 8)", "left", 50);
    fl.para(
    "Il committente è tenuto ad affidare i lavori di installazione, trasformazione, ampliamento e manutenzione straordinaria degli " +
      "impianti a imprese abilitate. Il proprietario dell'impianto adotta le misure necessarie per conservarne le caratteristiche di " +
      "sicurezza previste dalla normativa vigente, tenendo conto delle istruzioni per l'uso e la manutenzione predisposte " +
      "dall'impresa installatrice e dai fabbricanti delle apparecchiature installate.",
    { size: 8.5 },
  );
  };
}

// Sigla cavo scritta sempre correttamente (FG16OR16 con la O maiuscola)
const fixCavo = (v) => String(v ?? "").replace(/FG16[0O]R16/gi, "FG16OR16");

function schemaImpianto(fl, d, continua = false) {
  const f = d.fields;
  const raw = { ...T.SCHEMA_DEFAULT, ...f.schema };
  const sc = { ...raw, cavo: fixCavo(raw.cavo), tensione: String(raw.tensione || "").replace(/\s*~\s*/, " AC ") };
  const on = f.sicurezze || [];
  if (continua) {
    fl.ensure(330);
    fl.h2("Allegato - Schema dell'impianto elettrico realizzato (unifilare)");
  } else {
    fl.start("SCHEMA DELL'IMPIANTO ELETTRICO REALIZZATO", "Allegato obbligatorio alla Dichiarazione di conformità D.M. 37/2008 - schema unifilare");
  }
  const { doc, p } = fl;
  const y0 = fl.y + 10;
  const blk = (x, y, w, h, lines) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.rect(x, y, w, h);
    lines.forEach((t, i) => {
      const size = i ? 7.5 : 8.5;
      doc.setFont("helvetica", i ? "normal" : "bold");
      doc.setFontSize(size);
      const fit = Math.min(size, (size * (w - 8)) / Math.max(1, doc.getTextWidth(t)));
      p.text(t, x + w / 2, y + 14 + i * 11, fit, { bold: !i, align: "center" });
    });
  };
  const wire = (x1, y1, x2, y2) => fl.p.line(x1, y1, x2, y2, 1.4);

  // Riga principale: quadro -> interruttore -> linea -> centralina
  blk(L, y0, 92, 46, ["QUADRO", "esistente", "punto di origine"]);
  blk(L + 122, y0, 112, 46, ["INT. MT + DIFF.", `${sc.poli} ${sc.corrente} curva ${sc.curva}`, `Idn ${sc.idn} tipo ${sc.tipo_diff} - ${sc.potere}`]);
  blk(R - 110, y0, 110, 46, ["CENTRALINA", f.centralina || "di comando", sc.tensione]);
  wire(L + 92, y0 + 23, L + 122, y0 + 23);
  wire(L + 234, y0 + 23, R - 110, y0 + 23);
  const mid = (L + 234 + R - 110) / 2;
  p.text(`${sc.cavo} ${sc.formazione}`, mid, y0 + 16, 8, { bold: true, align: "center" });
  p.text(sc.lunghezza ? `L = ${sc.lunghezza} m` : "L = ____ m", mid, y0 + 36, 8, { align: "center" });
  // Conduttore di protezione
  doc.setLineDashPattern([3, 2], 0);
  fl.p.line(L + 46, y0 + 46, L + 46, y0 + 70, 0.9, [0, 120, 60]);
  fl.p.line(L + 46, y0 + 70, R - 55, y0 + 70, 0.9, [0, 120, 60]);
  fl.p.line(R - 55, y0 + 70, R - 55, y0 + 46, 0.9, [0, 120, 60]);
  doc.setLineDashPattern([], 0);
  p.text("PE - conduttore di protezione giallo/verde (unico, dal quadro alla centralina)", (L + R) / 2, y0 + 80, 7.5, { align: "center", color: [0, 120, 60] });
  [0, 4, 8].forEach((k, i) => fl.p.line(L + 40 + i * 2, y0 + 74 + k / 2, L + 52 - i * 2, y0 + 74 + k / 2, 1, [0, 120, 60]));

  // Dispositivi collegati alla centralina
  const devices = [
    ["MOTORE", [f.motore, sc.motore_potenza && `${sc.motore_potenza} W`].filter(Boolean).join(" - ") || "", sc.cavo_motore],
    ...T.SCHEMA_DISPOSITIVI.filter(([k]) => on.includes(k)).map(([, l]) => [l.toUpperCase(), "", sc.cavo_accessori]),
    ["COMANDI", T.COMANDI[f.comando_tipo] || "", sc.cavo_accessori],
  ];
  const bx = R - 230;
  let dy = y0 + 100;
  wire(R - 55, y0 + 46, R - 55, y0 + 90);
  wire(bx - 20, y0 + 90, R - 55, y0 + 90);
  wire(bx - 20, y0 + 90, bx - 20, y0 + 100 + (devices.length - 1) * 33 + 14);
  devices.forEach(([title, sub, cavo]) => {
    wire(bx - 20, dy + 14, bx, dy + 14);
    blk(bx, dy, 230, 28, [sub && title === "MOTORE" ? `${title} - ${sub}` : title, cavo ? `cavo ${cavo}` : sub]);
    dy += 33;
  });
  fl.y = dy + 10;

  fl.h2("Dati della linea");
  fl.kv([
    ["Origine della linea", sc.origine],
    ["Protezione", `Interruttore magnetotermico differenziale ${sc.poli}, In ${sc.corrente}, curva ${sc.curva}, Idn ${sc.idn} tipo ${sc.tipo_diff}, potere di interruzione ${sc.potere}`],
    ["Linea di alimentazione", `Cavo ${sc.cavo} ${sc.formazione}${sc.lunghezza ? `, lunghezza ${sc.lunghezza} m` : ""}; posa: ${sc.posa}`],
    ...(sc.percorso ? [["Percorso", sc.percorso]] : []),
    ["Collegamenti motore / accessori", `Motore: ${sc.cavo_motore}; accessori: ${sc.cavo_accessori}`],
    ...(continua ? [["Relazione materiali utilizzati", fixCavo(f.dm37?.materiali || T.DM37_MATERIALI)]] : []),
  ]);
  fl.h2("Verifiche strumentali eseguite (CEI 64-8 parte 6)", "left", 120);
  fl.table(
    [["Verifica", W - 150], ["Esito / valore", 150]],
    [
      ["Continuità dei conduttori di protezione (PE)", sc.continuita === "NC" ? "Non conforme" : "Conforme"],
      ["Resistenza di isolamento (valore minimo 1 MOhm)", sc.isolamento ? `${sc.isolamento} MOhm` : "______ MOhm"],
      ["Prova interruttore differenziale: tempo di intervento a Idn (max 300 ms)", sc.tempo_diff ? `${sc.tempo_diff} ms` : "______ ms"],
      ["Prova funzionale del tasto di test del differenziale", "Conforme"],
    ],
    { blueCols: [1] },
  );
  if ((d._photos || []).length) fl.para("Gli schemi di collegamento del fabbricante sono allegati in fotografia nelle pagine seguenti.", { size: 8.5, style: "italic", color: GREY });
  fl.signatures(["Il responsabile tecnico (timbro e firma)"]);
  if (continua) fl.dm37Avvertenze();
}

function fotoAllegati(fl, d, title = "ALLEGATO - SCHEMI DI COLLEGAMENTO DEL FABBRICANTE", sub = "Fotografie del libretto di istruzioni di motore e centralina") {
  const photos = d._photos || [];
  if (!photos.length) return;
  fl.start(title, sub);
  photos.forEach(({ src, w, h }, i) => {
    if (i) fl.ensure(BOTTOM);
    const s = Math.min(W / w, (BOTTOM - fl.y - 10) / h);
    const pw = w * s;
    const ph = h * s;
    fl.doc.addImage(src, /^data:image\/png/.test(src) ? "PNG" : "JPEG", L + (W - pw) / 2, fl.y, pw, ph);
    fl.y += ph + 14;
  });
}

function ceMark(doc, x, y, h) {
  const r = h / 2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(h * 0.13);
  doc.setLineCap("butt");
  const arc = (cx) => {
    const pts = [];
    for (let a = 60; a <= 300; a += 6) pts.push([cx + r * 0.93 * Math.cos((a * Math.PI) / 180), y + r - r * 0.93 * Math.sin((a * Math.PI) / 180)]);
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  };
  arc(x + r);
  arc(x + r * 2.5);
  doc.line(x + r * 1.6, y + r, x + r * 2.9, y + r);
}

function targhetta(fl, d) {
  const f = d.fields;
  fl.start("TARGHETTA CE", "Stampare su carta adesiva o plastificare e applicare sulla chiusura in posizione ben visibile.");
  const { doc, p } = fl;
  const draw = (y) => {
    const x = L;
    const w = 300;
    const h = 170;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1.2);
    doc.roundedRect(x, y, w, h, 6, 6);
    p.text("Italserrande S.r.l.", x + 12, y + 22, 13, { bold: true, color: [0, 0, 0] });
    p.text("Via Castino 29 - 00166 Roma (RM) - tel. 337743730", x + 12, y + 34, 7.5, { color: [0, 0, 0] });
    p.hline(x + 12, x + w - 12, y + 41, 0.8, INK);
    [
      ["Tipo", tipoLabel(f)],
      ["Modello", f.modello],
      ["Matricola", matricola(d)],
      ["Anno", f.anno_installazione || (d.data || "").slice(0, 4)],
      ["Dimensioni", dimensioni(f)],
      ["Alimentazione", f.alimentazione],
      ["Norma", `UNI EN 13241 - ${isNuovoReg(d.data) ? "Reg. (UE) 2023/1230" : "Dir. 2006/42/CE"}`],
    ].forEach(([k, v], i) => {
      p.text(`${k}:`, x + 12, y + 56 + i * 14.5, 8.5, { bold: true, color: [0, 0, 0] });
      p.value(v, x + 78, y + 56 + i * 14.5, 150, 8.5);
    });
    ceMark(doc, x + w - 70, y + h - 52, 40);
  };
  draw(fl.y);
  draw(fl.y + 200);
}

const BUILDERS = {
  ce: async (fl, d) => {
    fl.fresh();
    await drawCe(fl.doc, toCe(d));
  },
  collaudo,
  rischi,
  manuale,
  dm37: (fl, d) => {
    dm37(fl, d);
    schemaImpianto(fl, d, true);
    fotoAllegati(fl, d);
  },
  registro: async (fl, d) => {
    fl.fresh();
    await drawManutenzione(fl.doc, toRegistro(d));
  },
  targhetta,
};

// `only` = chiave di un singolo documento; altrimenti tutti quelli inclusi nella pratica.
export async function buildPraticaPdf(d, only) {
  const doc = newDoc();
  const fl = new Flow(doc, await loadLogo());
  const incl = d.fields.includi || {};
  const keys = only ? [only] : T.DOCUMENTI_PRATICA.map(([k]) => k).filter((k) => incl[k] !== false);
  for (const k of keys) await BUILDERS[k](fl, d);
  fl.finish();
  return doc.output("blob");
}

export function praticaFileName(d, only) {
  const base = (d.cliente || d.indirizzo || "impianto").trim().replace(/[^\w-]+/g, "_").slice(0, 40);
  const name = only ? T.DOCUMENTI_PRATICA.find(([k]) => k === only)[1].replace(/[^\w]+/g, "-") : "Documentazione-impianto";
  return `${name}-${d.numero || ""}-${base}.pdf`;
}

const ESITO_PUNTO = { C: "Conforme", NC: "Non conforme", NA: "Non applicabile" };

export async function buildVerificaPdf(d) {
  const f = d.fields || {};
  const doc = newDoc();
  const fl = new Flow(doc, await loadLogo());
  fl.start("VERBALE DI VERIFICA IMPIANTO ESISTENTE", `Stato di fatto rilevato prima dell'intervento - n. ${d.numero || "-"}/${d.anno || ""}`);
  fl.kv([
    ["Cliente", d.cliente],
    ["Indirizzo", [d.indirizzo, f.comune].filter(Boolean).join(" - ")],
    ["Tipo di chiusura", T.TIPI_CHIUSURA[f.tipo_chiusura]?.replace(" motorizzata", "").replace(" motorizzato", "") || ""],
    ["Modello / descrizione", f.modello],
    ["Anno di installazione (stimato)", f.anno_stimato],
    ["Stato attuale", f.motorizzata ? "Già motorizzata" : "Manuale"],
    ["Installatore originale", f.installatore || "Non noto"],
    ["Data della verifica", fmtDate(d.data)],
  ]);
  fl.h2("Documentazione presente");
  fl.checks(T.DOC_ESISTENTI.map(([k, l]) => [l, (f.documenti || []).includes(k)]), 3);
  fl.h2("Verifiche eseguite");
  fl.table(
    [["Verifica", W - 200], ["Esito", 80], ["Note", 120]],
    T.VERIFICA_PUNTI.map(([k, l]) => [l, ESITO_PUNTO[(f.punti || {})[k]] || "", (f.note_punti || {})[k] || ""]),
    { blueCols: [1, 2] },
  );
  fl.h2("Esito della verifica");
  Object.entries(T.ESITI_VERIFICA).forEach(([k, l]) => fl.checkLine(f.esito === k, l));
  fl.h2("Interventi necessari o consigliati");
  fl.para(f.interventi || "-");
  fl.h2("Parti da sostituire");
  fl.para(f.parti || "-");
  fl.para(
    "Il Cliente dichiara di essere stato informato dello stato dell'impianto, delle non conformità rilevate e degli interventi necessari " +
      "per renderlo sicuro e conforme alle norme UNI EN 13241 e UNI EN 12453.",
  );
  fl.checkLine(!!f.cliente_rifiuta, "Il Cliente NON intende eseguire gli interventi indicati e solleva Italserrande S.r.l. da ogni responsabilità per i rischi segnalati.");
  fl.signatures(["Il tecnico (Italserrande S.r.l.)", "Il Cliente"]);
  fotoAllegati(fl, d, "ALLEGATO - FOTOGRAFIE DELLO STATO DI FATTO", "Fotografie scattate durante la verifica");
  fl.finish();
  return doc.output("blob");
}
