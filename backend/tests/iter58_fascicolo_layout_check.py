# Iter58: fascicolo layout check on /tmp/iter58/*.pdf: per-page fill, sec.5 kept together, Allegato A inline when sec.5 on p2, B/C on new page, Pagina X di Y, tapparella norms
import glob, re, fitz

FOOT = ("Pagina", "Via Castino 29, 00166")

def content_blocks(p):
    return [b for b in p.get_text("blocks") if not any(x in b[4] for x in FOOT) or b[1] < 790]

def first_y(p, text):
    for b in p.get_text("blocks"):
        if text in b[4]:
            return b[1]
    return None

for path in sorted(glob.glob("/tmp/iter58/*.pdf")):
    name = path.split("/")[-1]
    doc = fitz.open(path)
    pages = [p.get_text() for p in doc]
    probs = []
    # Pagina X di Y coherence per section
    nums = [re.findall(r"Pagina (\d+) di (\d+)", t) for t in pages]
    for i, n in enumerate(nums):
        if len(n) != 1:
            probs.append(f"p{i+1} pagina markers={n}")
    seq = [tuple(map(int, n[0])) for n in nums if len(n) == 1]
    j = 0
    while j < len(seq):
        x, y = seq[j]
        if x != 1:
            probs.append(f"numbering break at idx {j}: {seq[j]}"); j += 1; continue
        for k in range(y):
            if j + k >= len(seq) or seq[j + k] != (k + 1, y):
                probs.append(f"numbering mismatch at idx {j+k}"); break
        j += y
    # global near-empty pages (any document)
    for i, p in enumerate(doc):
        blocks = [b for b in p.get_text("blocks") if not (b[3] > 795 and any(x in b[4] for x in FOOT))]
        imgs = p.get_images()
        last = max([b[3] for b in blocks] + [0])
        if last < 300 and not imgs:
            probs.append(f"p{i+1} near-empty (last y={last:.0f}) first={blocks[0][4][:50]!r}" if blocks else f"p{i+1} empty")
    info = ""
    f0 = next((i for i, t in enumerate(pages) if "FASCICOLO TECNICO DI INSTALLAZIONE" in t), None)
    if f0 is not None:
        tot = int(nums[f0][0][1])
        fp = list(range(f0, f0 + tot))
        loc = lambda s: [i - f0 + 1 for i in fp if s in pages[i]]
        s5 = loc("5. Riferimenti normativi"); note = loc("Dal 20 gennaio 2027 il Regolamento")
        a = loc("ALLEGATO A - Chiusura"); b = loc("ALLEGATO B - Analisi"); c = loc("ALLEGATO C - Collaudo")
        if s5 != note: probs.append(f"SEC5 SPLIT heading p{s5} note p{note}")
        if s5 and s5[0] == 2 and a != [2]: probs.append(f"sec5 on p2 but Allegato A on p{a}")
        for lab, pg in (("B", b), ("C", c)):
            yy = first_y(doc[f0 + pg[0] - 1], f"ALLEGATO {lab} -")
            if yy is None or yy > 70: probs.append(f"Allegato {lab} not at top of page (y={yy})")
        ay = first_y(doc[f0 + a[0] - 1], "ALLEGATO A -")
        fills = []
        for i in fp:
            bl = [bk for bk in doc[i].get_text("blocks") if not (bk[3] > 795 and any(x in bk[4] for x in FOOT))]
            fills.append(round(max(bk[3] for bk in bl) / 786 * 100))
        p1 = pages[f0]
        s1 = p1.split("1. Installatore")[1].split("2. Committente")[0] if "1. Installatore" in p1 else ""
        hdr = [l for l in ["Via Castino", "P.IVA", "337743730", "italserrande@"] if l in p1.split("FASCICOLO TECNICO")[0]]
        info = (f"fasc {tot}p sec5=p{s5} A=p{a}@y{ay:.0f} B=p{b} C=p{c} fill%={fills} | sec1={' / '.join(x.strip() for x in s1.strip().splitlines())!r} | header={hdr}")
        if any(v < 45 for v in fills[:-1]): probs.append(f"fascicolo page fill low {fills}")
    norms = sorted(set(l.strip() for l in "\n".join(pages).splitlines() if "13241" in l or "13659" in l))
    print(f"== {name}: {len(pages)}p {info}")
    if "tappar" in name or "ver_" in name:
        print("   norms:", norms)
    for x in probs:
        print("   PROBLEM", x)
