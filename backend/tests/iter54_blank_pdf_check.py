# Iter54: blank (moduli vuoti) PDFs from StampaVuoto - no client data/dates, empty checkboxes & collaudo esiti, normative texts present; + regression of filled pratica
import glob, re, sys
import fitz

TIPI = ["avvolgibile", "sezionale", "basculante", "scorrevole", "battente"]
DOCS = ["all", "fascicolo", "ce", "collaudo", "rischi", "componenti", "dm37", "manuale", "informativa", "registro", "registro_righe", "targhetta"]
DATE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")
ZONA = {"avvolgibile": "avvolgimento", "sezionale": None, "basculante": None, "scorrevole": None, "battente": None}


def crosses(pg):
    """Return list of (x,y) of blue 1.6pt crosses (pairs of diagonal lines)."""
    out = []
    for d in pg.get_drawings():
        if d.get("width") and abs(d["width"] - 1.6) < 0.05:
            for it in d["items"]:
                if it[0] == "l":
                    a, b = it[1], it[2]
                    if abs(a.x - b.x) > 3 and abs(a.y - b.y) > 3:
                        out.append((round(min(a.x, b.x)), round(min(a.y, b.y))))
    return sorted(set(out))


def label_near(pg, x, y):
    best = None
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            bb = l["bbox"]
            if abs(bb[1] - y) < 9 and 0 <= bb[0] - x < 30:
                best = "".join(s["text"] for s in l["spans"])[:60]
    return best


def analyse(path):
    doc = fitz.open(path)
    txt = "\n".join(pg.get_text() for pg in doc)
    marks = []
    for i, pg in enumerate(doc):
        for x, y in crosses(pg):
            marks.append(f"p{i+1}:{label_near(pg, x, y)}")
    orphans = []
    for i, pg in enumerate(doc):
        lines = [l.strip() for l in pg.get_text().splitlines() if l.strip()]
        body = [l for l in lines if "(segue)" not in l and not l.startswith(("Italserrande S.r.l. — Via", "Pagina "))]
        if any("(segue)" in l for l in lines) and len(body) < 3:
            orphans.append(f"p{i+1}:{body}")
    return doc.page_count, txt, marks, orphans


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "blank"
    if mode == "blank":
        for t in TIPI:
            for k in DOCS:
                p = f"/tmp/iter54_blank_{t}_{k}.pdf"
                try:
                    n, txt, marks, orph = analyse(p)
                except Exception as e:
                    print("MISSING", p, e); continue
                dates = DATE.findall(txt)
                flags = []
                if dates: flags.append(f"DATES={dates[:5]}")
                for w in ("Conforme", "Non conforme", "Non applicabile"):
                    if k in ("collaudo",) and re.search(rf"\n{w}\n", txt): flags.append(f"ESITO:{w}")
                if "esito positivo" in txt.lower(): flags.append("TEXT 'esito positivo'")
                if orph: flags.append(f"ORPHAN {orph}")
                print(f"{t}/{k}: pages={n} crosses={len(marks)} {marks[:12]} {' '.join(flags)}")
    else:
        for p in sorted(glob.glob("/tmp/iter54_filled_*.pdf")):
            n, txt, marks, orph = analyse(p)
            print(p, "pages", n, "crosses", [m for m in marks if "Positivo" in (m or "") or "Negativo" in (m or "")], "ORPHANS" if orph else "no orphan", orph)
