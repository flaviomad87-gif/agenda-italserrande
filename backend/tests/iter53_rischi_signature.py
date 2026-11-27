# Iter53: rischi signature must stay on same page as text end (no orphan '(segue)'), box 28pt, not touching footer (y 804); other signatures normal 38pt
import glob, re
import fitz

TIPI = ["sezionale", "scorrevole", "battente", "avvolgibile", "basculante"]
SIG = {"rischi": "Il tecnico (Italserrande", "collaudo": "Il tecnico collaudatore", "dm37": "Il dichiarante",
       "fascicolo": None, "componenti": "Il responsabile tecnico", "informativa": "Il cliente per ricevuta"}


def boxes_below(pg, y):
    out = []
    for d in pg.get_drawings():
        r = fitz.Rect(d["rect"])
        if r.y0 >= y - 1 and r.y0 <= y + 12 and 20 < r.height < 60 and r.width > 100:
            out.append((round(r.y0, 1), round(r.y1, 1), round(r.height, 1)))
    return out


def analyse(path, key, label):
    doc = fitz.open(path)
    orphan = []
    for i, pg in enumerate(doc):
        lines = [l for b in pg.get_text("dict")["blocks"] for l in b.get("lines", [])]
        txt = [("".join(s["text"] for s in l["spans"]).strip(), l["bbox"]) for l in lines]
        content = [t for t, bb in txt if t and "(segue)" not in t and not t.startswith(("Italserrande S.r.l. — Via", "Pagina ")) and bb[3] < 795]
        if any("(segue)" in t for t, _ in txt) and len(content) < 3:
            orphan.append(f"p{i+1}: {content}")
        lab = SIG.get(key)
        for t, bb in txt:
            if lab and t.startswith(lab):
                bx = boxes_below(pg, bb[3])
                prev = [b for b in content if b != t]
                print(f"  [{label}] sig p{i+1} '{t[:60]}' label_y={round(bb[3],1)} boxes={bx} content_lines_on_page={len(content)}")
    print(f"[{label}] pages={doc.page_count}", "ORPHANS: " + str(orphan) if orphan else "no orphan")
    return orphan


if __name__ == "__main__":
    bad = 0
    for t in TIPI:
        bad += len(analyse(f"/tmp/iter53_{t}_all.pdf", "rischi", f"{t} FULL"))
        for k in SIG:
            p = f"/tmp/iter53_{t}_{k}.pdf"
            try:
                bad += len(analyse(p, k, f"{t}/{k}"))
            except Exception as e:
                print("MISSING", p, e); bad += 1
    print("TOTAL ORPHANS/MISSING:", bad)
