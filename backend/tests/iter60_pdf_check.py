# Iter60: global page numbering, footer, overlaps, right-margin overflow and content checks on /tmp/iter60/*.pdf
import glob, re, sys, warnings
warnings.filterwarnings("ignore")
import fitz

def lines_of(p):
    out = []
    for b in p.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"])
            if t.strip():
                out.append((t, ln["bbox"]))
    return out

def overlaps(lines):
    res = []
    for i in range(len(lines)):
        t1, a = lines[i]
        for j in range(i + 1, len(lines)):
            t2, b = lines[j]
            ix = min(a[2], b[2]) - max(a[0], b[0])
            iy = min(a[3], b[3]) - max(a[1], b[1])
            if ix > 2 and iy > 3:
                res.append(f"{t1[:40]!r}@{a[1]:.0f} x {t2[:40]!r}@{b[1]:.0f}")
    return res

for path in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/iter60/*.pdf")):
    name = path.split("/")[-1]
    doc = fitz.open(path)
    tot = len(doc)
    probs = []
    titles = []
    for i, p in enumerate(doc):
        L = lines_of(p)
        foot = [(t, b) for t, b in L if re.search(r"Pagina \d+ di \d+", t)]
        if len(foot) != 1:
            probs.append(f"p{i+1}: {len(foot)} 'Pagina' footers {[ (t, round(b[1])) for t,b in foot]}")
        else:
            t, b = foot[0]
            m = re.search(r"Pagina (\d+) di (\d+)", t)
            if (int(m[1]), int(m[2])) != (i + 1, tot):
                probs.append(f"p{i+1}: footer says {t!r}")
            left = [x for x, bb in L if x.startswith("Italserrande S.r.l. —") and abs(bb[1] - b[1]) < 4]
            titles.append(f"{i+1}:{(left[0][22:] if left else '??')}@{b[3]:.0f}")
            if not left:
                probs.append(f"p{i+1}: no left footer title")
        for t, b in L:
            if b[2] > 548:
                probs.append(f"p{i+1}: text past right margin x={b[2]:.0f} {t[:60]!r}")
        ov = overlaps(L)
        for o in ov:
            probs.append(f"p{i+1}: OVERLAP {o}")
    print(f"== {name}: {tot} pages")
    print("   footers:", " | ".join(titles))
    for x in probs:
        print("   PROBLEM", x)
