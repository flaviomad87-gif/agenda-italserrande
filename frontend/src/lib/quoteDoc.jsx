// Documento preventivo: stessa impaginazione dell'app Preventivi originale (blocchi, auto-fit, multipagina, PDF A4).
import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const DEFAULT_LAYOUT = {
  logoHeightMm: 30, titleSizePt: 30, addressSizePt: 8, titlePosition: "above", logoAlign: "left", titleAlign: "left",
  showBorder: true, headerGapMm: 4, paymentSizePt: 10, paymentPosition: "below-totals", paymentAlign: "left",
  paymentGapMm: 6, paymentBold: false, autoFit: true, balancePages: true, minCompactScale: 0.7,
};
export const VAT_RATES = [0, 4, 5, 10, 22];
export const QUOTE_STATUS = [
  { value: "draft", label: "Bozza", cls: "bg-gray-100 text-gray-800 border-gray-300" },
  { value: "sent", label: "Inviato", cls: "bg-blue-50 text-blue-800 border-blue-300" },
  { value: "accepted", label: "Accettato", cls: "bg-green-50 text-green-800 border-green-300" },
  { value: "rejected", label: "Rifiutato", cls: "bg-red-50 text-red-800 border-red-300" },
];

const toNum = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const quoteTotal = (q) => (q?.lineItems || []).reduce((s, li) => s + toNum(li?.amount), 0);
export function money(v) {
  const t = toNum(v);
  const [i, d] = Math.abs(t).toFixed(2).split(".");
  return `${t < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}
export function qDate(v) {
  if (!v) return "";
  const s = String(v);
  const d = s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
export function quoteFileName(q) {
  const n = String(q.number || "").replace(/\D/g, "");
  const y = q.date ? String(q.date).slice(0, 4) : new Date().getFullYear();
  return `Preventivo-${n.replace(/^0+/, "") || n || "0"}-${y}.pdf`;
}

const G3 = "grid grid-cols-[1fr_110px_70px]";
const al = (a) => (a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left");

function buildBlocks(q, c, L) {
  const logo = c.logoDataUrl || "/italserrande-logo.png";
  const info = (
    <div className={`leading-snug text-black ${L.logoAlign === "right" ? "text-left" : "text-right"}`} style={{ fontSize: `${L.addressSizePt}pt` }}>
      {c.address && <div>{c.address}</div>}
      {(c.vat || c.fiscalCode) && <div>{c.vat && `P.iva ${c.vat}`}{c.vat && c.fiscalCode && " - "}{c.fiscalCode && `C.F. ${c.fiscalCode}`}</div>}
      {c.reaNumber && <div>Reg. imprese C.C.I.A.A. {c.reaNumber}</div>}
      {c.shareCapital && <div>Cap. Soc. {c.shareCapital}</div>}
      {(c.phone || c.office) && <div>{c.phone && `tel: ${c.phone}`}{c.phone && c.office && " / "}{c.office && `ufficio: ${c.office}`}</div>}
      {c.email && <div>e-mail: {c.email}</div>}
    </div>
  );
  const title = (
    <h1 className={`font-heading font-bold tracking-tight text-black whitespace-nowrap ${al(L.titleAlign)}`} style={{ fontSize: `${L.titleSizePt}pt`, lineHeight: 1.1, paddingTop: "4mm", paddingBottom: "2mm" }}>
      {c.name}
    </h1>
  );
  const img = <img src={logo} alt={c.name} className="w-auto flex-shrink-0 self-start object-contain" style={{ height: `${L.logoHeightMm}mm` }} />;
  const border = L.showBorder ? "border-b-2 border-black pb-2" : "";
  const rev = L.logoAlign === "right" ? "flex-row-reverse" : "";
  const header =
    L.titlePosition === "above" ? (
      <div>
        <div className={border} style={{ marginBottom: `${L.headerGapMm / 2}mm` }}>{title}</div>
        <div className={`flex items-start gap-4 ${rev}`} style={{ marginTop: `${L.headerGapMm}mm` }}>{img}<div className="min-w-0 flex-1">{info}</div></div>
      </div>
    ) : (
      <div className={`flex items-end gap-4 ${rev}`}>
        {img}
        <div className={`min-w-0 flex-1 ${border}`}><div className="mb-1" style={{ paddingBottom: "2mm" }}>{info}</div>{title}</div>
      </div>
    );
  const client = (
    <div className="grid grid-cols-[1fr_auto] gap-0 border-b border-gray-400" style={{ marginTop: `${L.headerGapMm}mm` }}>
      <div className="py-5 pr-6">
        <div className="flex gap-4">
          <div className="min-w-[70px] font-bold text-black">Cliente:</div>
          <div className="whitespace-pre-line text-black">
            {q.clientName || <span className="text-gray-400">—</span>}
            {q.clientAddress && `\n${q.clientAddress}`}
          </div>
        </div>
      </div>
      <div className="min-w-[220px] border-l border-gray-400 py-5 pl-6">
        <div className="mb-1 flex gap-3"><span className="font-bold">Preventivo:</span><span className="ml-auto font-mono">{q.number || "—"}</span></div>
        <div className="flex gap-3"><span className="font-bold">Data:</span><span className="ml-auto font-mono">{qDate(q.date)}</span></div>
      </div>
    </div>
  );
  const th = (
    <div className={`${G3} border-b border-gray-400`}>
      <div className="py-3 pr-6 font-bold text-black">Descrizione</div>
      <div className="border-l border-gray-400 px-3 py-3 text-right font-bold text-black">Importo €</div>
      <div className="border-l border-gray-400 px-3 py-3 text-right font-bold text-black">C. Iva</div>
    </div>
  );
  const cols = <><div className="border-l border-gray-400" /><div className="border-l border-gray-400" /></>;
  const subject = q.subject ? <div className={G3}><div className="pr-6 pt-4 font-semibold text-black">OGGETTO: {q.subject}.</div>{cols}</div> : null;
  const items = (q.lineItems || []).flatMap((li, idx) => {
    const lines = String(li.description || "").split("\n");
    const n = lines.length;
    const chunks = n <= 3 ? [lines] : [lines.slice(0, 2), ...lines.slice(2, n - 2).map((l) => [l]), lines.slice(n - 2)];
    return chunks.map((ch, ci) => {
      const first = ci === 0;
      const pad = `${first ? "pt-3" : ""} ${ci === chunks.length - 1 ? "pb-3" : ""}`;
      return {
        key: `item-${li.id || idx}-${ci}`,
        node: (
          <div className={G3}>
            <div className={`${pad} min-w-0 break-words pr-6 text-black [overflow-wrap:anywhere]`}>
              {n === 1 && !ch.join("").trim() ? <span className="text-gray-400">—</span> : ch.map((l, k) => <div key={k}>{l.trim() ? l : "\u00a0"}</div>)}
            </div>
            <div className={`${pad} border-l border-gray-400 px-3 text-right text-black`}>{first ? money(li.amount) : ""}</div>
            <div className={`${pad} border-l border-gray-400 px-3 text-right text-black`}>{first ? `${li.vatRate}%` : ""}</div>
          </div>
        ),
      };
    });
  });
  const footerNote = q.footerNote ? <div className={G3}><div className="pb-4 pr-6 pt-8 text-black">{q.footerNote}</div>{cols}</div> : null;
  const pay = q.paymentTerms ? (
    <div style={{ marginTop: `${L.paymentGapMm}mm` }} className={`pt-2 ${al(L.paymentAlign)}`}>
      <div className="mb-1 font-bold text-black">Modalità di pagamento:</div>
      <div className={`whitespace-pre-line leading-relaxed text-black ${L.paymentBold ? "font-semibold" : ""}`} style={{ fontSize: `${L.paymentSizePt}pt` }}>{q.paymentTerms}</div>
    </div>
  ) : null;
  const totals = (
    <div className="border-t-2 border-black">
      <div className="grid grid-cols-[1fr_auto] gap-6 py-3 font-bold">
        <div className="text-right">Tot. Imponibile (IVA ESCLUSA)</div>
        <div className="min-w-[120px] text-right font-mono">€ {money(quoteTotal(q))}</div>
      </div>
    </div>
  );
  const notes = q.notes ? (
    <div className="mt-4 border-t border-gray-300 pt-3">
      <div className="mb-1 font-bold text-black">Note:</div>
      <div className="whitespace-pre-line text-[10pt] text-black">{q.notes}</div>
    </div>
  ) : null;
  const repeat = [{ key: "header", node: header }, { key: "client", node: client }, { key: "table-header", node: th }];
  const content = [...(subject ? [{ key: "subject", node: subject }] : []), ...items, ...(footerNote ? [{ key: "footer-note", node: footerNote }] : [])];
  return {
    repeat, content, top: [...repeat, ...content],
    footer: [
      ...(L.paymentPosition === "above-totals" && pay ? [{ key: "pay-above", node: pay }] : []),
      { key: "totals", node: totals },
      ...(L.paymentPosition === "below-totals" && pay ? [{ key: "pay-below", node: pay }] : []),
      ...(notes ? [{ key: "notes", node: notes }] : []),
    ],
  };
}

// Stesso algoritmo dell'app originale: 1 pagina, 1 pagina ridotta (auto-fit) o piu' pagine bilanciate
function planPages(heights, footerH, L, repeatCount, contentCount, MAX = 985) {
  const sum = heights.reduce((a, b) => a + b, 0);
  const need = sum + footerH + 32;
  const all = heights.map((_, i) => i);
  if (need <= MAX) return { mode: "single", scale: 1, pages: [{ idx: all }] };
  if (L.autoFit) {
    const sc = 0.94 * (MAX / need);
    if (sc >= (L.minCompactScale ?? 0.7)) return { mode: "scaled", scale: sc, pages: [{ idx: all }] };
  }
  const rep = heights.slice(0, repeatCount).reduce((a, b) => a + b, 0);
  const ch = heights.slice(repeatCount, repeatCount + contentCount);
  const foot = footerH + 32;
  const cap = MAX - rep;
  const pages = [];
  let cur = { idx: [], h: 0 };
  ch.forEach((h, i) => {
    const lim = cap - (i === ch.length - 1 ? foot : 0);
    if (cur.idx.length && cur.h + h > lim) { pages.push(cur); cur = { idx: [], h: 0 }; }
    cur.idx.push(i);
    cur.h += h;
  });
  if (cur.idx.length) pages.push(cur);
  const last = pages[pages.length - 1];
  if (!last || last.h + foot > cap) pages.push({ idx: [], h: 0 });
  if (L.balancePages !== false && pages.length >= 2) {
    const e = pages.length - 1, lp = pages[e];
    const target = Math.max(0.55 * cap, foot + 0.15 * cap);
    let guard = 0;
    while (lp.h + foot < target && pages[e - 1]?.idx.length > 1 && guard++ < 50) {
      const prev = pages[e - 1], k = prev.idx[prev.idx.length - 1], h = ch[k] || 0;
      if (lp.h + h + foot > cap || prev.h - h < 0.55 * cap) break;
      prev.idx.pop(); prev.h -= h; lp.idx.unshift(k); lp.h += h;
    }
  }
  return { mode: "multi", scale: 1, pages };
}

const BASE_FONT = { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: "10.5pt", lineHeight: 1.45 };

// Misura i blocchi fuori schermo e disegna le pagine A4. pageClass: "a4-page" (schermo) o "a4-page-doc" (PDF)
export function QuotePages({ quote, company, pageClass = "a4-page", onReady }) {
  const L = { ...DEFAULT_LAYOUT, ...(company?.templateLayout || {}) };
  const B = buildBlocks(quote, company, L);
  const topRef = useRef(null);
  const footRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const sig = JSON.stringify([quote, company]);

  useLayoutEffect(() => {
    const measure = () => {
      if (!topRef.current || !footRef.current) return;
      const hs = Array.from(topRef.current.children).map((e) => e.offsetHeight);
      setPlan(planPages(hs, footRef.current.offsetHeight, L, B.repeat.length, B.content.length));
    };
    const imgs = Array.from(topRef.current?.querySelectorAll("img") || []);
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 2500); })))).then(measure);
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useLayoutEffect(() => {
    if (plan && onReady) onReady(plan);
  }, [plan, onReady]);

  const n = plan ? plan.pages.length : 1;
  const render = (blocks) => blocks.map((b) => <div key={b.key}>{b.node}</div>);
  return (
    <div style={BASE_FONT}>
      <div aria-hidden="true" style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", width: "178mm", left: -99999, top: 0, ...BASE_FONT }}>
        <div ref={topRef}>{render(B.top)}</div>
        <div ref={footRef}>{render(B.footer)}</div>
      </div>
      {(plan?.pages || [{ idx: B.top.map((_, i) => i) }]).map((p, i) => {
        const isLast = i === n - 1;
        const multi = plan?.mode === "multi";
        const blocks = (multi ? p.idx.map((k) => B.content[k]) : p.idx.map((k) => B.top[k])).filter(Boolean);
        const scaled = plan?.mode === "scaled";
        return (
          <div className={pageClass} key={i} data-testid={`quote-a4-page-${i + 1}`}>
            <div className="a4-page-content">
              {scaled ? (
                <div style={{ transform: `scale(${plan.scale})`, transformOrigin: "top left", width: `${100 / plan.scale}%`, height: `${100 / plan.scale}%`, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                  <div className="a4-page-top">{render(blocks)}</div>
                  <div className="a4-page-footer">{render(B.footer)}</div>
                </div>
              ) : (
                <>
                  <div className="a4-page-top">{multi && render(B.repeat)}{render(blocks)}</div>
                  {isLast && <div className="a4-page-footer">{render(B.footer)}</div>}
                </>
              )}
            </div>
            {n > 1 && pageClass === "a4-page" && <div className="a4-page-number">Pagina {i + 1} di {n}</div>}
          </div>
        );
      })}
    </div>
  );
}

// PDF identico all'app originale: ogni pagina A4 renderizzata e catturata come immagine
export async function buildQuotePdf(quote, company) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:210mm;background:#fff;color:#000;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await new Promise((resolve) => root.render(<QuotePages quote={quote} company={company} pageClass="a4-page-doc" onReady={resolve} />));
    await new Promise((r) => setTimeout(r, 400));
    if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pages = Array.from(host.querySelectorAll(".a4-page-doc"));
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: mobile ? 1.5 : 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794, logging: false, imageTimeout: 4000 });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }
}
