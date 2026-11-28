# Iter68 segnaletica PDF check: 6 user cartelli (order per tipo), no old cartelli, no CARTELLI DA STAMPARE, firma same page, footer, overlap
import glob, re, sys
import fitz

SIX = ["PERICOLO D'INCIAMPO", "PERICOLO DI SCHIACCIAMENTO MANI E PIEDI", "PERICOLO - ATTENZIONE ALLE MANI",
       "PERICOLO DI SCIVOLAMENTO E CADUTA", "PERICOLO ELETTRICO", "VIETATO SALIRE"]
EXP = {t: SIX for t in ["avvolgibile", "sezionale", "basculante", "scorrevole", "battente"]}
EXP["tapparella"] = ["PERICOLO - ATTENZIONE ALLE MANI", "PERICOLO ELETTRICO"]
OLD = ["LAMPEGGIANTE", "BAMBINI", "TRANSITARE", "SBLOCCO", "URTO", "CHIUSURA AUTOMATICA", "NON INSERIRE LE MANI", "CARTELLI DA STAMPARE"]
FORBID = ["undefined", "NaN", "[object"]


def spans(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    out.append((fitz.Rect(s["bbox"]), s["text"]))
    return out


def overlaps(page):
    sp = spans(page)
    res = []
    for i in range(len(sp)):
        for j in range(i + 1, len(sp)):
            r = sp[i][0] & sp[j][0]
            if not r.is_empty and r.width > 1.5 and r.height > 3.5:
                res.append((sp[i][1][:25], sp[j][1][:25]))
    return res


for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/iter68/*.pdf")):
    doc = fitz.open(p)
    n = len(doc)
    name = p.split("/")[-1]
    issues, seg_pages = [], []
    for i, pg in enumerate(doc):
        t = pg.get_text()
        flat = t.replace("\n", " ")
        m = re.findall(r"Pagina (\d+) di (\d+)", t)
        if not m or m[-1] != (str(i + 1), str(n)):
            issues.append(f"p{i+1} footer={m}")
        if "SEGNALETICA DI SICUREZZA" in flat and "Significato:" in flat:
            seg_pages.append(i + 1)
            ov = overlaps(pg)
            if ov:
                issues.append(f"p{i+1} overlap {ov[:3]}")
        for f in FORBID:
            if f in t:
                issues.append(f"p{i+1} has {f}")
        for o in OLD:
            if o in flat.upper() and (i + 1) in seg_pages:
                issues.append(f"p{i+1} old cartello '{o}'")
        if "CARTELLI DA STAMPARE" in flat.upper():
            issues.append(f"p{i+1} CARTELLI DA STAMPARE present")
        for r, s in spans(pg):
            if r.x0 < 20 or r.x1 > pg.rect.width - 20 or r.y1 > pg.rect.height - 8:
                issues.append(f"p{i+1} edge text '{s[:20]}'")
    tipo = next((k for k in EXP if k in name), None)
    extra = ""
    if not seg_pages:
        issues.append("no segnaletica page")
    elif tipo:
        flat = " ".join(doc[k - 1].get_text().replace("\n", " ") for k in seg_pages)
        items = re.findall(r"(\d+)\. ((?:PERICOLO|VIETATO)[A-Z' \-]*?)(?= Significato| \d+\.|$)", flat)
        titles = [x[1].strip() for x in items]
        nums = [x[0] for x in items]
        extra = f" items={nums}"
        if titles != EXP[tipo]:
            issues.append(f"titles {titles} != {EXP[tipo]}")
        if nums != [str(k + 1) for k in range(len(EXP[tipo]))]:
            issues.append(f"numbering {nums}")
        if "UNI EN ISO 7010" not in flat:
            issues.append("no ISO 7010")
        if len(seg_pages) != 1:
            issues.append(f"segnaletica spans {seg_pages}")
        if "Il cliente per ricevuta e presa visione" not in doc[seg_pages[-1] - 1].get_text():
            issues.append("firma not on segnaletica page")
    print("FAIL" if issues else "PASS", n, "pp", name, "| seg", seg_pages, extra, issues[:8])
