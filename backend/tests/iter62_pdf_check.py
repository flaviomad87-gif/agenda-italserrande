# Iter62: text sanity (no Cyrillic/$/II sottoscritto, 2014/30/UE one line), fascicolo graphic checkboxes (A.1, B.1, B.3, C.2, sez.4 vuoto),
# Dato|Valore headers, DM37 Verifiche strumentali table, CE title/avvertenza 7 margin, header/periodicità on /tmp/iter62/*.pdf
import glob, re, warnings
warnings.filterwarnings("ignore")
import fitz

D = "/tmp/iter62"
R = 544.2
FAILS = []

def chk(label, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + label + (f"  [{extra}]" if extra else ""))
    if not cond:
        FAILS.append(label)

def lines(p):
    return [("".join(s["text"] for s in ln["spans"]), ln["bbox"]) for b in p.get_text("dict")["blocks"] for ln in b.get("lines", [])]

def boxes(p):
    rs, xs = [], []
    for dr in p.get_drawings():
        for it in dr["items"]:
            if it[0] == "re":
                r = it[1]
                if 8 < r.width < 10.5 and 8 < r.height < 10.5:
                    rs.append(r)
            if it[0] == "l" and (dr.get("width") or 0) > 1.4:
                xs.append(it[1])
    out = []
    for r in rs:
        on = any(r.x0 - 1 <= pt.x <= r.x1 + 1 and r.y0 - 1 <= pt.y <= r.y1 + 1 for pt in xs)
        out.append((r, on))
    return out

def row_boxes(bx, bbox):
    cy = (bbox[1] + bbox[3]) / 2
    return sorted([(r, on) for r, on in bx if abs((r.y0 + r.y1) / 2 - cy) < 5], key=lambda z: z[0].x0)

pdfs = sorted(glob.glob(f"{D}/*.pdf"))
# 1. Text sanity on all PDFs
for path in pdfs:
    n = path.split("/")[-1]
    d = fitz.open(path)
    txt = "\n".join(p.get_text() for p in d)
    cyr = re.findall(r"[\u0400-\u04FF]", txt)
    bad = [x for x in ["$", "II sottoscritto"] if x in txt]
    split = []
    for p in d:
        L = [t for t, _ in lines(p)]
        for i, t in enumerate(L):
            if "2014/30/UE" in t and "Direttiva" not in t and "Dir." not in t and "Compatibilit" not in t:
                split.append(t[:60])
            if t.rstrip().endswith("Direttiva") and i + 1 < len(L) and L[i + 1].lstrip().startswith("2014/30"):
                split.append(t[-40:])
    chk(f"{n}: no cyrillic/$/II", not cyr and not bad, f"{cyr[:5]} {bad}")
    if "2014/30/UE" in txt:
        chk(f"{n}: 'Direttiva ... 2014/30/UE' unsplit", not split, split[:3])
    if "full_" in n or "blank" in n and "_all" in n:
        chk(f"{n}: 'straordinario' & 'Il sottoscritto'", "straordinario" in txt and "Il sottoscritto" in txt)
        chk(f"{n}: header aziendale & Comune di Roma", "Sede legale e operativa" in txt and "Interventi esclusivamente nel Comune di Roma" in txt)
        chk(f"{n}: periodicità 12/6 mesi", "12 mesi" in txt and "6 mesi" in txt)

# 2. Fascicolo checks
fasc = [p for p in pdfs if "fascicolo_" in p or "_fasc" in p] + [p for p in pdfs if "full_" in p or "_all" in p]
for path in fasc:
    n = path.split("/")[-1]
    vuoto = "blank" in n
    d = fitz.open(path)
    pages = [i for i, p in enumerate(d) if "FASCICOLO TECNICO" in p.get_text() or "ALLEGATO A - Chiusura" in p.get_text() or "ALLEGATO B - Analisi" in p.get_text() or "ALLEGATO C - Collaudo" in p.get_text()]
    if "fasc" in n:
        chk(f"{n}: fascicolo pages == 4", len(d) == 4, len(d))
        if len(d) > 4:
            print("   last page:", d[-1].get_text()[:300].replace("\n", " | "))
    ft = "\n".join(d[i].get_text() for i in pages)
    chk(f"{n}: no '[ ]'/'[X]' in fascicolo", "[ ]" not in ft and "[X]" not in ft and "[x]" not in ft)
    found = {}
    yn_rows = {"A1": 0, "B3": 0, "C2": 0}
    for i in pages:
        p = d[i]
        L = lines(p)
        bx = boxes(p)
        txt = p.get_text()
        for t, b in L:
            if t.strip().startswith("Dichiarazione CE / DoP del fabbricante"):
                rb = row_boxes(bx, b)
                xs = [round(r.x0) for r, _ in rb]
                above = [bb[3] for tt, bb in L if bb[3] < b[1] and b[1] - bb[3] < 40]
                gap = b[1] - max(above) if above else None
                chk(f"{n}: A.1 DoP row has 2 boxes at ~434/494", len(rb) == 2 and abs(xs[0] - 434) < 3 and abs(xs[1] - 494) < 3, xs)
                chk(f"{n}: A.1 DoP row detached from table (gap>=5)", gap is not None and gap >= 5, f"gap={gap}")
                found["A1"] = True
            if t.strip().startswith("Esito: si tratta di modifica sostanziale"):
                rb = row_boxes(bx, b)
                xs = [round(r.x0) for r, _ in rb]
                chk(f"{n}: B.3 esito 2 aligned boxes", len(rb) == 2 and abs(xs[0] - 434) < 3 and abs(xs[1] - 494) < 3, xs)
                found["B3"] = True
            if t.strip().startswith("Tipo di comando adottato"):
                below = sorted([(r, on) for r, on in bx if b[3] < r.y0 < b[3] + 45], key=lambda z: (round(z[0].y0), z[0].x0))
                nchk = sum(on for _, on in below)
                chk(f"{n}: B.1 4 command boxes", len(below) == 4, [(round(r.x0), round(r.y0), on) for r, on in below])
                chk(f"{n}: B.1 checked={'0' if vuoto else '1'}", nchk == (0 if vuoto else 1), nchk)
                found["B1"] = True
        if "C.2 Consegna" in txt:
            h = [b for t, b in L if "C.2 Consegna" in t][0]
            h3 = [b for t, b in L if "C.3 Manuali" in t]
            yend = h3[0][1] if h3 else 9999
            rows = [(t, b) for t, b in L if h[3] < b[1] < yend and not t.strip() in ("Sì", "No")]
            ynr = []
            for t, b in rows:
                rb = row_boxes(bx, b)
                if len(rb) == 2:
                    ynr.append((t, [round(r.x0) for r, _ in rb]))
            aligned = all(abs(x[0] - 434) < 3 and abs(x[1] - 494) < 3 for _, x in ynr)
            seps = [dr for dr in p.get_drawings() for it in dr["items"] if it[0] == "l" and abs(it[1].y - it[2].y) < 0.1 and it[1].x < 55 and it[2].x > 540 and h[3] < it[1].y < yend]
            chk(f"{n}: C.2 9 yes/no rows aligned", len(ynr) == 9 and aligned, f"{len(ynr)} {[x for _, x in ynr][:2]}")
            chk(f"{n}: C.2 separator lines >= 9", len(seps) >= 9, len(seps))
            # label not reaching boxes
            mx = max([b[2] for t, b in rows if (b[0] < 420)] or [0])
            chk(f"{n}: C.2 labels end before boxes", mx < 430, f"{mx:.0f}")
            found["C2"] = True
        if vuoto and "4. Contenuto del fascicolo" in txt:
            h = [b for t, b in L if "4. Contenuto del fascicolo" in t][0]
            h5 = ([b for t, b in L if "5. Riferimenti normativi" in t] or [(0, 800, 0, 800)])[0]
            sec = [(t, b) for t, b in L if h[3] < b[1] < h5[1] and re.match(r"\d+\. ", t.strip())]
            bs = [(r, on) for r, on in bx if h[3] < r.y0 < h5[1]]
            colx = sorted(set(round(r.x0) for r, _ in bs))
            left = [(t, b) for t, b in sec if b[0] < 280]
            rightx = min([r.x0 for r, _ in bs if r.x0 > 200] or [999])
            over = [(t, round(b[2])) for t, b in left if b[2] > rightx - 2]
            chk(f"{n}: sez4 vuoto {len(sec)} items, {len(bs)} boxes, 2 cols {colx}", len(bs) == len(sec) and len(colx) == 2 and len(sec) >= 10)
            chk(f"{n}: sez4 vuoto left text doesn't overlap right column", not over, over)
            # right column within margin
            rmx = max([b[2] for t, b in sec] or [0])
            chk(f"{n}: sez4 right col within margin", rmx <= 548, f"{rmx:.0f}")
    for k in ["A1", "B1", "B3", "C2"]:
        chk(f"{n}: section {k} found", found.get(k, False))

# 3. Dato | Valore headers (kv2 tables)
for path in pdfs:
    n = path.split("/")[-1]
    d = fitz.open(path)
    bad = []
    for i, p in enumerate(d):
        L = lines(p)
        for t, b in L:
            if t.strip() == "Dato":
                same = [tt.strip() for tt, bb in L if abs(bb[1] - b[1]) < 2]
                if same.count("Dato") == 2 and same.count("Valore") != 2:
                    bad.append((i + 1, same))
                if same.count("Dato") == 1 and same.count("Valore") != 1:
                    bad.append((i + 1, same))
    chk(f"{n}: Dato|Valore headers paired", not bad, bad[:2])

# 4. DM37 Verifiche strumentali
for path in [p for p in pdfs if "dm37_" in p or "full_" in p or "_all" in p]:
    n = path.split("/")[-1]
    d = fitz.open(path)
    ok = False
    for p in d:
        L = lines(p)
        h = [b for t, b in L if "Verifiche strumentali eseguite" in t]
        if not h:
            continue
        ok = True
        y = h[0][3]
        hdr = [t.strip() for t, b in L if y < b[1] < y + 22]
        chk(f"{n}: DM37 cols Verifica|Esito|Valore misurato|Limite", all(x in hdr for x in ["Verifica", "Esito", "Valore misurato", "Limite"]), hdr)
        body = [(t.strip(), b) for t, b in L if y + 15 < b[1] < y + 130]
        units = [(t, round(b[1])) for t, b in body if t in ("Ohm", "MOhm", "ms") or re.match(r"^[\d.,]+ (Ohm|MOhm|ms)$", t)]
        cnc = [t for t, b in body if t.replace(" ", "") == "C/NC"]
        blank = "blank" in n
        if blank:
            chk(f"{n}: DM37 blank units Ohm/MOhm/ms on 2nd line", len(units) == 3, units)
            chk(f"{n}: DM37 blank esito 'C / NC' x4", len(cnc) == 4, len(cnc))
            # cell height: rect containing unit
            rects = [it[1] for dr in p.get_drawings() for it in dr["items"] if it[0] == "re" and 100 < it[1].width < 120]
            hs = [round(r.height) for r in rects if y < r.y0 < y + 130]
            print("   valore cell heights:", hs)
        else:
            print(f"   {n}: units/values:", units, "C/NC:", len(cnc))
            if "avv_molle" in n:
                chk(f"{n}: DM37 compiled values shown", any("0.15 Ohm" in t for t, _ in units) and any("250 MOhm" in t for t, _ in units) and any("22 ms" in t for t, _ in units), units)
    chk(f"{n}: DM37 table found", ok)

# 5. CE title & avvertenza 7
for path in [p for p in pdfs if "ce_" in p or "soloce" in p or "full_" in p or "_all" in p]:
    n = path.split("/")[-1]
    d = fitz.open(path)
    for i, p in enumerate(d):
        L = lines(p)
        for t, b in L:
            if "DICHIARAZIONE" in t and "DI CONFORMIT" in t and "DoP" in t:
                chk(f"{n} p{i+1}: CE title in margin '{t.strip()}'", b[2] <= 544.5 and "(DoP solo dove prevista)" in t, f"x1={b[2]:.0f}")
            if t.startswith("7. DoP"):
                sig = min([bb[1] for tt, bb in L if tt.startswith("Firma e timbro")] or [999])
                chk(f"{n} p{i+1}: avvertenza 7 margin & no sig overlap", b[2] <= 544.5 and "solo dove prevista" in t and b[3] < sig, f"x1={b[2]:.0f} y1={b[3]:.0f} sig={sig:.0f}")

print("\nTOTAL FAILS:", len(FAILS))
for f in FAILS:
    print(" -", f)
