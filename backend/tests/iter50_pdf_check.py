# Iter50: verify Pratica PDFs (verbale collaudo consegna checks + order, Tipo di sito = Utilizzo, registro righe header/nota, full PDF for 5 tipi)
import re
import fitz

GRUPPI = {
    "Verifiche preliminari": ["Completezza e integrità del prodotto", "Integrità delle sicurezze intrinseche", "Assenza di difetti visibili"],
    "Verifiche di montaggio": ["Corretto assemblaggio dei componenti", "Apposizione della marcatura (targhetta)", "Protezioni meccaniche", "Segnaletica pericoli elettrici, meccanici e rischi residui"],
    "Verifiche funzionali": ["Movimenti di apertura e chiusura", "Dispositivi di avviamento e arresto", "Dispositivi di emergenza e sblocco", "Dispositivi di sicurezza", "Regolazioni e impostazioni della centralina"],
    "Prove prestazionali": ["Prestazioni corrispondenti a quanto previsto", "Rumorosità limitata e accettabile", "Assenza di emissioni pericolose", "Assenza di danni e deformazioni dopo le prove"],
}
PARTIAL_ON = {"Completezza e integrità del prodotto", "Apposizione della marcatura (targhetta)", "Dispositivi di sicurezza", "Assenza di emissioni pericolose"}


def box_states(path):
    """For every consegna label return True if a cross is drawn in the 9x9 box left of the label."""
    doc = fitz.open(path)
    out = {}
    for pg in doc:
        draws = pg.get_drawings()
        for items in GRUPPI.values():
            for t in items:
                for r in pg.search_for(t):
                    # box is ~14pt left of label
                    bx = fitz.Rect(r.x0 - 16, r.y0 - 3, r.x0 - 2, r.y1 + 3)
                    lines = [d for d in draws if fitz.Rect(d["rect"]).intersects(bx) and fitz.Rect(d["rect"]).width < 10 and fitz.Rect(d["rect"]).height < 10
                             and any(it[0] == "l" for it in d["items"])]
                    rect_inside = [d for d in draws if bx.contains(fitz.Rect(d["rect"]))]
                    if t not in out and (rect_inside or lines):
                        out[t] = bool(lines)
    return out


def order_check(path):
    doc = fitz.open(path)
    t = re.sub(r"\s+", " ", "\n".join(p.get_text() for p in doc))
    i = t.find("VERBALE DI COLLAUDO")
    t = t[i:]
    keys = ["Verifiche eseguite", "Modalità di funzionamento", "Verifiche preliminari", "Verifiche di montaggio", "Verifiche funzionali", "Prove prestazionali",
            "Esito del collaudo", "Consegna L'esito", "Il tecnico collaudatore"]
    pos = [t.find(k) for k in keys]
    return pos, all(p >= 0 for p in pos) and pos == sorted(pos)


for name in ("coll_partial", "coll_all"):
    p = f"/tmp/iter50_{name}.pdf"
    st = box_states(p)
    print(name, "boxes found", len(st), "on:", sorted(k for k, v in st.items() if v))
    if name == "coll_partial":
        print("  partial match:", {k for k, v in st.items() if v} == PARTIAL_ON)
    else:
        print("  all on:", all(st.values()) and len(st) == 16)
    print("  order:", order_check(p))
    t = re.sub(r"\s+", " ", "".join(pg.get_text() for pg in fitz.open(p)))
    m = re.search(r"Tipo di sito (.{0,30})", t)
    print("  tipo di sito:", m.group(0) if m else None, "| responsabile:", "Amm. TEST Bianchi" in t)

t = re.sub(r"\s+", " ", "".join(pg.get_text() for pg in fitz.open("/tmp/iter50_fascicolo.pdf")))
m = re.search(r"Tipo di sito (.{0,30})", t)
print("fascicolo tipo di sito:", m.group(0) if m else None)

doc = fitz.open("/tmp/iter50_registro_righe.pdf")
pg = doc[0]
print("registro: 'Firma tecnico' found", pg.search_for("Firma tecnico"), "'Firma cliente'", pg.search_for("Firma cliente"))
for w in pg.get_text("words"):
    if w[4] in ("Firma", "tecnico", "cliente", "Tipo"):
        print("  word", w[4], [round(x, 1) for x in w[:4]])
nota = pg.search_for("Tipo di intervento")
print("  nota rect", nota)
for d in pg.get_drawings():
    r = fitz.Rect(d["rect"])
    if nota and abs(r.y1 - nota[0].y0) < 20 and r.width > 50:
        print("  drawing near nota (above?)", [round(x, 1) for x in r])

for tipo in ("avvolgibile", "sezionale", "basculante", "scorrevole", "battente"):
    d = fitz.open(f"/tmp/iter50_{tipo}.pdf")
    t = re.sub(r"\s+", " ", "".join(pg.get_text() for pg in d))
    req = ["FASCICOLO TECNICO", "ELENCO COMPONENTI", "INFORMATIVA AL COMMITTENTE", "REGISTRO DI MANUTENZIONE", "VERBALE DI COLLAUDO", "ANALISI DEI RISCHI",
           "MANUALE D'USO", "TARGHETTA CE", "D.M. 22 gennaio 2008", "CameX50", "SN50", "Amm. TEST Bianchi"]
    print(tipo, "pages", d.page_count, "missing", [r for r in req if r not in t], "sito rows:", re.findall(r"Tipo di sito (\S+)", t), "order ok:", order_check(f"/tmp/iter50_{tipo}.pdf")[1])
    st = box_states(f"/tmp/iter50_{tipo}.pdf")
    print("  consegna on:", sorted(k for k, v in st.items() if v) == sorted(PARTIAL_ON), len(st))
