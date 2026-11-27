# Iter59: fascicolo '(segue)' near-empty page check, C.3 note position, CE norme row-1 overlap check on /tmp/iter59/*.pdf
import glob, fitz

FOOT = ("Pagina", "Via Castino 29, 00166")
NOTE = "Le certificazioni e le dichiarazioni"

for path in sorted(glob.glob("/tmp/iter59/*.pdf")):
    name = path.split("/")[-1]
    doc = fitz.open(path)
    probs, info = [], []
    for i, p in enumerate(doc):
        txt = p.get_text()
        blocks = [b for b in p.get_text("blocks") if not (b[3] > 795 and any(x in b[4] for x in FOOT))]
        if "(segue)" in txt:
            content = [b for b in blocks if "(segue)" not in b[4]]
            last = max([b[3] for b in content] + [0])
            nlines = sum(len([l for l in b[4].splitlines() if l.strip()]) for b in content)
            if nlines <= 6 or last < 200:
                probs.append(f"p{i+1} '(segue)' near-empty: {nlines} lines, last y={last:.0f}, first={content[0][4][:60]!r}" if content else f"p{i+1} segue empty")
        if NOTE in txt:
            lines = [("".join(s["text"] for s in ln["spans"]), ln["bbox"][1]) for b in p.get_text("dict")["blocks"] for ln in b.get("lines", [])]
            ly = lambda s: next((y for t, y in lines if s in t), None)
            ny, c3, tab = ly(NOTE), ly("C.3 Manuali"), ly("Titolo del manuale")
            info.append(f"note p{i+1} y={ny:.0f} C3y={c3} tabY={tab}")
            if c3 is None or tab is None or not (c3 < ny < tab):
                probs.append(f"note not between C.3 heading and manuali table (p{i+1})")
            if "A.3" in txt and "Componenti installati" in txt and c3 is None:
                probs.append("note still under A.3")
        # CE overlap: line containing 'Chiusura' with 13241
        for b in p.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                t = "".join(s["text"] for s in ln["spans"])
                if "Chiusura" in t and ("13241" in t or "13659" in t) and "1." in t[:4]:
                    x1 = ln["bbox"][2]
                    # find Applicazione header x
                    hx = [w[0] for w in p.get_text("words") if w[4].startswith("Applicazione")]
                    info.append(f"CE row1 p{i+1} {t.strip()!r} x_end={x1:.0f} appl_x={hx[:1]}")
                    if hx and x1 >= hx[0] - 2:
                        probs.append(f"CE row1 overlaps Applicazione column ({x1:.0f} >= {hx[0]:.0f})")
    fills = []
    print(f"== {name}: {len(doc)}p {' | '.join(info)}")
    for x in probs:
        print("   PROBLEM", x)
