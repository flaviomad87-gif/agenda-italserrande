# Iter52: detect orphan '(segue)' pages (<3 content lines), footer overlap (y>~790), rischi signature wording, single-doc PDFs valid
import glob, re, sys
import fitz

TIPI = ["avvolgibile", "sezionale", "basculante", "scorrevole", "battente"]
KEYS = ["fascicolo", "ce", "collaudo", "rischi", "componenti", "dm37", "manuale", "informativa", "registro", "registro_righe", "targhetta"]
FOOT = ("Italserrande S.r.l. — Via Castino", "Pagina ")


def content_lines(pg):
    out = []
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            y = l["bbox"][3]
            if not t or "(segue)" in t or t.startswith(FOOT) or (y > 795 and "Pagina" in t):
                continue
            out.append((round(l["bbox"][1], 1), round(y, 1), t))
    return out


def check(path, label):
    doc = fitz.open(path)
    issues = []
    for i, pg in enumerate(doc):
        txt = pg.get_text()
        cl = content_lines(pg)
        drawings = [d for d in pg.get_drawings() if fitz.Rect(d["rect"]).height > 30]
        if "(segue)" in txt and len(cl) < 3:
            issues.append(f"p{i+1} ORPHAN segue: {len(cl)} lines {[c[2][:50] for c in cl]} boxes={len(drawings)} imgs={len(pg.get_images())}")
        # footer overlap: any content line bottom > 794 (footer baseline 804, ~8.5pt)
        low = [c for c in cl if c[1] > 795]
        if low:
            issues.append(f"p{i+1} TEXT NEAR FOOTER: {low}")
        # drawings crossing footer
        for d in pg.get_drawings():
            r = fitz.Rect(d["rect"])
            if r.y1 > 796 and r.y0 < 812 and r.height < 700:
                issues.append(f"p{i+1} DRAWING NEAR FOOTER {[round(x) for x in r]}")
                break
        if "ANALISI DEI RISCHI" in txt:
            t = re.sub(r"\s+", " ", txt)
            m = re.search(r"Il tecnico \(Italserrande S\.r\.l\.\) — data (\d{2}/\d{2}/\d{4})", t)
            if m:
                print(f"  [{label}] rischi p{i+1}: signature '{m.group(0)}' | separate 'Data:' line:", bool(re.search(r"(^|\n)Data: ", txt)))
    maxlast = max((c[1] for pg in doc for c in content_lines(pg)), default=0)
    print(f"[{label}] pages={doc.page_count} max content y={maxlast}", "OK" if not issues else "")
    for x in issues:
        print("   !!", x)
    return doc.page_count, issues


if __name__ == "__main__":
    tot = []
    for t in TIPI:
        check(f"/tmp/iter52_{t}_all.pdf", f"{t} FULL")
    print("---- singles")
    for t in TIPI:
        for k in KEYS:
            p = f"/tmp/iter52_{t}_{k}.pdf"
            try:
                n, iss = check(p, f"{t}/{k}")
            except Exception as e:
                print("MISSING/INVALID", p, e)
