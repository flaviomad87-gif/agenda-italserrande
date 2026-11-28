# Iter65 informativa PDF check: title/sections/signature, footer, overlap, signature-only pages, no friend's data
import glob, re, sys
import fitz

SECT = ["Perché la manutenzione è obbligatoria", "Ogni quanto", "Cosa controlliamo", "Cosa deve fare l'utilizzatore",
        "Quanto costa la manutenzione", "Durata dei componenti", "Responsabilità e conseguenze", "Documenti da conservare",
        "Modifiche all'impianto", "Norme di riferimento"]
TITLE = "MANUTENZIONE DELLE CHIUSURE AUTOMATICHE: COSTI, OBBLIGHI E NORME"
FORBID = ["NOVA TECH", "NOVATECH", "Nova Tech", "Novatech", "undefined", "NaN", "[object"]


def overlaps(page):
    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    spans.append((fitz.Rect(s["bbox"]), s["text"]))
    out = []
    for i in range(len(spans)):
        for j in range(i + 1, len(spans)):
            a, b = spans[i][0], spans[j][0]
            r = a & b
            if not r.is_empty and r.width > 1.5 and r.height > 2.5:
                out.append((spans[i][1][:30], spans[j][1][:30]))
    return out


for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/iter65/*.pdf")):
    doc = fitz.open(p)
    n = len(doc)
    issues = []
    full = ""
    info_pages = []
    for i, pg in enumerate(doc):
        t = pg.get_text()
        full += t
        if TITLE in t.replace("\n", " "):
            info_pages.append(i + 1)
        m = re.findall(r"Pagina (\d+) di (\d+)", t)
        if not m or m[-1] != (str(i + 1), str(n)):
            issues.append(f"p{i+1} footer={m}")
        body = [l for l in t.split("\n") if l.strip() and not re.match(r"Pagina \d+ di \d+", l)]
        if len(body) < 12 and any("Il cliente per ricevuta" in l or "Firma" in l for l in body):
            issues.append(f"p{i+1} looks signature-only: {body}")
        ov = overlaps(pg)
        if ov:
            issues.append(f"p{i+1} overlap {ov[:3]}")
        for b in FORBID:
            if b in t:
                issues.append(f"p{i+1} has '{b}'")
    flat = full.replace("\n", " ")
    has_title = TITLE in flat
    missing = [s for s in SECT if s not in flat] if has_title else "no-title"
    sig = "Il cliente per ricevuta" in flat
    print(("FAIL" if issues else "PASS"), n, "pages", p.split("/")[-1], "| informativa pages", info_pages,
          "| missing sections", missing, "| sig", sig, issues[:6])
