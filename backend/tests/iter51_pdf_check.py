# Iter51: verify CE (wording, responsabile, avvertenze, no overlap with signature boxes), doc order + fascicolo index, collaudo groups not split
import re, sys
import fitz

ORDER = ["FASCICOLO TECNICO", "DICHIARAZIONE", "VERBALE DI COLLAUDO", "ANALISI DEI RISCHI", "ELENCO COMPONENTI", "D.M. 22 gennaio 2008",
         "MANUALE D'USO", "INFORMATIVA AL COMMITTENTE", "REGISTRO DI MANUTENZIONE", "REGISTRO MANUTENZIONI", "TARGHETTA CE"]
GRUPPI = ["Verifiche preliminari", "Verifiche di montaggio", "Verifiche funzionali", "Prove prestazionali"]
LAST = {"Verifiche preliminari": "Assenza di difetti visibili", "Verifiche di montaggio": "Segnaletica pericoli",
        "Verifiche funzionali": "Regolazioni e impostazioni", "Prove prestazionali": "Assenza di danni e deformazioni"}


def norm(t):
    return re.sub(r"\s+", " ", t)


def ce_check(doc, label):
    # find CE page 1
    for i, pg in enumerate(doc):
        if "DI CONFORMITÀ / DICHIARAZIONE DI PRESTAZIONE" in pg.get_text():
            t1 = norm(pg.get_text())
            p2 = doc[i + 1]
            t2 = norm(p2.get_text())
            print(f"[{label}] CE p{i+1}: 'chiusura motorizzata':", "conformità della chiusura motorizzata" in t1, "| 'serranda' in intro:", "conformità della serranda" in t1)
            print(f"  p2 responsabile:", re.search(r"Responsabile dell'impianto: ([^0-9]{0,30})", t2).group(0) if "Responsabile dell'impianto" in t2 else None)
            nums = [bool(re.search(rf"\b{n}\. ", t2)) for n in range(1, 7)]
            print("  Avvertenze present:", "Avvertenze" in t2, "numbered 1-6:", all(nums))
            # bottom of text blocks above signature labels
            labels = {}
            for lab in ["Firma e timbro per accettazione", "Firma Italserrande", "Data:", "Firma cliente:"]:
                r = p2.search_for(lab)
                labels[lab] = r[0] if r else None
            av_bottom = max((r.y1 for r in p2.search_for("6. ")), default=0)
            lines6 = [b for b in p2.get_text("blocks") if "Registro di manutenzione" in b[4]]
            if lines6:
                av_bottom = max(av_bottom, max(b[3] for b in lines6))
            sig_top = labels["Firma e timbro per accettazione"].y0 if labels["Firma e timbro per accettazione"] else None
            print("  avvertenze bottom y=%.1f, first sig label top y=%s" % (av_bottom, round(sig_top, 1) if sig_top else None), "NO OVERLAP" if sig_top and av_bottom < sig_top else "OVERLAP?")
            # signature boxes (rounded rects) and anything outside page
            W, H = p2.rect.width, p2.rect.height
            out = [b for b in p2.get_text("blocks") if b[2] > W - 20 or b[3] > H - 10 or b[0] < 20]
            print("  text out of page/margins:", out)
            maxx = max(b[2] for b in p2.get_text("blocks"))
            print("  max text x1 p2=%.1f (page %.1f)" % (maxx, W))
            # check rounded rect boxes do not contain avvertenze text
            boxes = [fitz.Rect(d["rect"]) for d in p2.get_drawings() if fitz.Rect(d["rect"]).height > 40 and fitz.Rect(d["rect"]).width > 100]
            print("  sig boxes:", [[round(x) for x in b] for b in boxes])
            for b in p2.get_text("blocks"):
                for bx in boxes:
                    if fitz.Rect(b[:4]).intersects(bx) and b[1] > 300:
                        print("  !! text inside sig box:", b[4][:60])
            return
    print(f"[{label}] CE not found")


def order_check(doc, label):
    t = norm("\n".join(p.get_text() for p in doc))
    pos = [t.find(k) for k in ORDER]
    print(f"[{label}] pages={doc.page_count} order positions ok:", all(p >= 0 for p in pos) and pos == sorted(pos), [(k, p) for k, p in zip(ORDER, pos) if p < 0])


def index_check(doc, label):
    t = norm(doc[0].get_text() + (doc[1].get_text() if doc.page_count > 1 else ""))
    want = ["Dichiarazione CE", "Verbale di collaudo", "Analisi dei rischi", "Elenco componenti", "Dichiarazione DM 37/08", "Manuale d'uso", "Informativa obblighi",
            "Registro di manutenzione (primo", "Registro manutenzioni a righe", "Targhetta CE da stampare"]
    pos = [t.find(k) for k in want]
    print(f"[{label}] fascicolo index order ok:", all(p >= 0 for p in pos) and pos == sorted(pos), [(k, p) for k, p in zip(want, pos)])


def collaudo_groups(doc, label):
    start = None
    for i, pg in enumerate(doc):
        if "VERBALE DI COLLAUDO" in pg.get_text():
            start = i
            break
    res = {}
    for g in GRUPPI:
        gp = lp = None
        for i in range(start, min(start + 4, doc.page_count)):
            t = norm(doc[i].get_text())
            if gp is None and g in t:
                gp = i
            if lp is None and gp is not None and LAST[g] in t:
                lp = i
        res[g] = (gp, lp, gp == lp)
    print(f"[{label}] collaudo groups (head page, last item page, same):", res)


for name in sys.argv[1:]:
    doc = fitz.open(f"/tmp/iter51_{name}.pdf")
    if name.startswith("full"):
        order_check(doc, name)
        index_check(doc, name)
        ce_check(doc, name)
        collaudo_groups(doc, name)
    elif name in ("single_ce", "standalone_ce"):
        print(name, "pages", doc.page_count)
        ce_check(doc, name)
    elif name == "single_collaudo":
        collaudo_groups(doc, name)
    elif name == "single_fascicolo":
        index_check(doc, name)
