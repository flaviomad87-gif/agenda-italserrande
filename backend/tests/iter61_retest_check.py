# Iter61: fascicolo 4 pages + sez.5 row1 Applicazione text, CE avvertenze margin/signature overlap, registro 'Tipo' header, DM37 'Presente' header on /tmp/iter61
import glob, re, warnings
warnings.filterwarnings("ignore")
import fitz

def chk(label, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + label + (f"  [{extra}]" if extra else ""))

def lines(p):
    return [("".join(s["text"] for s in ln["spans"]), ln["bbox"]) for b in p.get_text("dict")["blocks"] for ln in b.get("lines", [])]

# 1. Fascicolo: 4 pages, no near-empty page, section 5 row 1
for path in sorted(glob.glob("/tmp/iter61/*fasc*.pdf")):
    n = path.split("/")[-1]
    d = fitz.open(path)
    chk(f"{n}: 4 pages", len(d) == 4, len(d))
    nuovo = "2027" in n
    exp_l = "Regolamento (UE) 2023/1230" if nuovo else "Direttiva Macchine 2006/42/CE"
    exp_r = "Sostituisce la Direttiva 2006/42/CE" if nuovo else "Dal 20/01/2027: Reg. (UE) 2023/1230"
    found = False
    for p in d:
        L = lines(p)
        for t, b in L:
            if exp_l in t and ("fino al" in t or "dal 20/01/2027" in t):
                same = [x for x, bb in L if abs(bb[1] - b[1]) < 3 and bb[0] > b[2]]
                found = True
                chk(f"{n}: sez5 row1 '{t.strip()[:45]}' appl={same}", any(exp_r in x for x in same))
    chk(f"{n}: sez5 row1 found", found)
    # A.3 last row 'Kit batterie' not alone on a page
    for i, p in enumerate(d):
        txt = p.get_text()
        if "Kit batterie" in txt and "A.3" not in txt and "Componenti" not in txt:
            chk(f"{n}: Kit batterie orphan p{i+1}", False)

# 2. CE avvertenze (pratica CE p2, solo CE p2, full PDF CE)
for path in ["/tmp/iter61/ce_avv_molle.pdf", "/tmp/iter61/soloce.pdf", "/tmp/iter61/full_tapparella.pdf", "/tmp/iter61/blank_2027_avvolgibile_all.pdf"]:
    d = fitz.open(path)
    for i, p in enumerate(d):
        L = lines(p)
        if not any(t.startswith("Avvertenze") for t, _ in L):
            continue
        av = [(t, b) for t, b in L if re.match(r"[1-9]\. ", t) and 230 < b[1] < 350]
        sig = min([b[1] for t, b in L if t.startswith("Firma e timbro")] or [999])
        if not av:
            continue
        mx = max(b[2] for t, b in av)
        last = max(b[3] for t, b in av)
        chk(f"{path.split('/')[-1]} p{i+1}: 7 avvertenze", len(av) == 7, len(av))
        chk(f"{path.split('/')[-1]} p{i+1}: avvertenze x_max<=544", mx <= 544.5, f"{mx:.1f}")
        chk(f"{path.split('/')[-1]} p{i+1}: no overlap with signature label", last < sig, f"last={last:.0f} sig={sig:.0f}")

# 3. Registro a righe header 'Tipo'
d = fitz.open("/tmp/iter61/registro_righe_avv_molle.pdf")
L = lines(d[0])
words = [w for w in d[0].get_text("words")]
chk("registro_righe: 'Tipo' whole word", any(w[4] == "Tipo" for w in words), [w[4] for w in words if w[4].startswith("Tip") or w[4] == "o"][:5])
chk("registro_righe: no 'Tip' fragment", not any(w[4] == "Tip" for w in words))
hdr = [(t, round(b[0]), round(b[1]), round(b[2])) for t, b in L if t.strip() in ("N°", "Data", "Ditta / tecnico", "Descrizione e sostituzioni", "Tipo", "Firma tecnico", "Firma cliente", "Firma", "tecnico", "cliente")]
print("   registro header:", hdr)

# 4. DM37 Allegati obbligatori header
d = fitz.open("/tmp/iter61/dm37_avv_molle.pdf")
for i, p in enumerate(d):
    L = lines(p)
    h = [b for t, b in L if "Allegati obbligatori" in t]
    if h:
        y = h[0][3]
        nxt = sorted([(b[1], t) for t, b in L if y < b[1] < y + 30])
        print("   dm37 header row:", nxt)
        chk("dm37: header contains 'Allegato' and 'Presente'", any("Allegato" == t.strip() for _, t in nxt) and any("Presente" == t.strip() for _, t in nxt))
