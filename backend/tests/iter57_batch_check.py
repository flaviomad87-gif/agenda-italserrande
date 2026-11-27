# Iter57: batch check of fascicolo/full/blank PDFs in /tmp/iter57: page numbering, page-2 fill, B.1 tick, B.3 marks, CE norms, text overflow
import glob, re, fitz

for path in sorted(glob.glob("/tmp/iter57/*.pdf")):
    doc = fitz.open(path)
    pages = [p.get_text() for p in doc]
    full = "\n".join(pages)
    nums = [re.findall(r"Pagina (\d+) di (\d+)", t) for t in pages]
    issues = []
    for i, p in enumerate(doc):
        for b in p.get_text("blocks"):
            if b[2] > 560 or (b[3] > 800 and "Pagina" not in b[4] and "Via Castino 29, 00166" not in b[4]):
                issues.append(f"p{i+1} out of margin {b[:4]} {b[4][:40]!r}")
    # fascicolo pages
    fasc = [i for i, t in enumerate(pages) if "FASCICOLO TECNICO DI INSTALLAZIONE" in t]
    info = ""
    if fasc:
        f0 = fasc[0]
        tot = [n for n in nums[f0]]
        p2 = doc[f0 + 1]
        ys = [b[3] for b in p2.get_text("blocks") if "Pagina" not in b[4] and "Via Castino 29, 00166" not in b[4]]
        sec5_p1 = "5. Riferimenti normativi" in pages[f0]
        p2_sec5 = "(segue)" in pages[f0 + 1]
        bpage = next(t for t in pages if "ALLEGATO B - Analisi" in t)
        tick = re.findall(r"\[X\] ([^\n]+)", bpage)
        esito = re.search(r"Esito: modifica sostanziale\n([^\n]+)", bpage)
        info = f"fasc start p{f0+1} num={tot} sec5_on_p1={sec5_p1} p2_is_segue={p2_sec5} p2_last_y={max(ys):.0f} B1_tick={tick} esito={esito.group(1) if esito else None}"
    ce = [l for l in full.splitlines() if "13241" in l or "13659" in l]
    last = [n[-1] if n else None for n in nums]
    tots = set(x[1] for x in last if x)
    print(f"== {path.split('/')[-1]}: {len(pages)}p totals={tots} {info}")
    print("   norm lines:", sorted(set(ce))[:8])
    for x in issues[:5]:
        print("   ISSUE", x)
