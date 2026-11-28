# Iter66 segnaletica PDF check: titles/list per tipo, footer, overlap, cartelli pages, informativa 1-page, render PNG
import glob, re, sys
import fitz

EXP = {
    "avvolgibile": ["movimento", "schiacciamento", "mani", "elettrico", "lampeggiante", "transito", "bambini", "sblocco"],
    "battente": ["movimento", "schiacciamento", "urto", "elettrico", "lampeggiante", "transito", "bambini", "sblocco"],
    "tapparella": ["movimento", "schiacciamento", "mani", "elettrico", "bambini", "sblocco"],
    "sezionale": ["movimento", "schiacciamento", "mani", "elettrico", "lampeggiante", "transito", "bambini", "sblocco"],
    "scorrevole": ["movimento", "schiacciamento", "mani", "elettrico", "lampeggiante", "transito", "bambini", "sblocco"],
    "basculante": ["movimento", "schiacciamento", "mani", "urto", "elettrico", "lampeggiante", "transito", "bambini", "sblocco"],
}
TIT = {"movimento": "ATTENZIONE - CHIUSURA AUTOMATICA", "schiacciamento": "PERICOLO DI SCHIACCIAMENTO",
       "mani": "NON INSERIRE LE MANI", "urto": "PERICOLO DI URTO", "elettrico": "PERICOLO ELETTRICO",
       "lampeggiante": "LUCE LAMPEGGIANTE", "transito": "VIETATO TRANSITARE", "bambini": "VIETATO AI BAMBINI",
       "sblocco": "SBLOCCO DI EMERGENZA"}
FORBID = ["undefined", "NaN", "[object", "NOVA TECH"]


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


for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/iter66/*.pdf")):
    doc = fitz.open(p)
    n = len(doc)
    name = p.split("/")[-1]
    issues = []
    seg_pages, cart_pages, inf_pages = [], [], []
    for i, pg in enumerate(doc):
        t = pg.get_text()
        flat = t.replace("\n", " ")
        m = re.findall(r"Pagina (\d+) di (\d+)", t)
        if not m or m[-1] != (str(i + 1), str(n)):
            issues.append(f"p{i+1} footer={m}")
        if "SEGNALETICA DI SICUREZZA" in flat and "Significato:" in flat:
            seg_pages.append(i + 1)
        if "CARTELLI DA STAMPARE E APPLICARE" in flat:
            cart_pages.append(i + 1)
        if "MANUTENZIONE DELLE CHIUSURE AUTOMATICHE" in flat:
            inf_pages.append(i + 1)
        body = [l for l in t.split("\n") if l.strip() and not re.match(r"Pagina \d+ di \d+", l) and not l.startswith("Italserrande S.r.l. —")]
        if len(body) < 6:
            issues.append(f"p{i+1} near-empty page: {body}")
        for f in FORBID:
            if f in t:
                issues.append(f"p{i+1} has {f}")
        # text outside page
        for r, s in spans(pg):
            if r.x0 < 20 or r.x1 > pg.rect.width - 20 or r.y1 > pg.rect.height - 8:
                issues.append(f"p{i+1} edge text '{s[:20]}' {tuple(round(v) for v in r)}")
        if i + 1 in seg_pages + cart_pages:
            ov = overlaps(pg)
            if ov:
                issues.append(f"p{i+1} overlap {ov[:3]}")
    tipo = next((k for k in EXP if k in name), None)
    extra = ""
    if seg_pages and tipo:
        flat = " ".join(doc[k - 1].get_text().replace("\n", " ") for k in seg_pages)
        found = [k for k, v in TIT.items() if v in flat]
        exp = EXP[tipo]
        if set(found) != set(exp):
            issues.append(f"cartelli {found} != {exp}")
        nums = re.findall(r"(\d+)\. (?:ATTENZIONE|PERICOLO|NON|LUCE|VIETATO|SBLOCCO)", flat)
        extra += f" list#={nums}"
        if "UNI EN ISO 7010" not in flat:
            issues.append("no ISO 7010")
        if "Il cliente per ricevuta e presa visione" not in flat:
            issues.append("no firma")
        cflat = " ".join(doc[k - 1].get_text().replace("\n", " ") for k in cart_pages)
        cnt = cflat.count("Italserrande S.r.l. - Tel.")
        extra += f" big-cartelli={cnt} on {len(cart_pages)} pages"
        if cnt != len(exp):
            issues.append(f"big cartelli {cnt} != {len(exp)}")
        for k in cart_pages:
            c = doc[k - 1].get_text().count("Italserrande S.r.l. - Tel.")
            if c > 2 or (c < 2 and k != cart_pages[-1]):
                issues.append(f"p{k} has {c} cartelli")
    print("FAIL" if issues else "PASS", n, "pp", name, "| seg", seg_pages, "cart", cart_pages, "inf", inf_pages, extra, issues[:8])
