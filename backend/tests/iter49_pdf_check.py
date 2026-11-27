# Iter49: parse PDFs downloaded from the Pratica UI and check required pages/sections (fascicolo, componenti, informativa, registro a righe, collaudo)
import sys, glob, re
import fitz

REQ_FULL = ["FASCICOLO TECNICO DELL'IMPIANTO", "ELENCO COMPONENTI E ZONE DI PERICOLO", "INFORMATIVA AL COMMITTENTE",
            "REGISTRO DI MANUTENZIONE", "VERBALE DI COLLAUDO E PRESA IN CONSEGNA", "Verifiche preliminari", "Verifiche di montaggio",
            "Verifiche funzionali", "Prove prestazionali", "Consegna", "ANALISI DEI RISCHI", "MANUALE D'USO", "TARGHETTA CE",
            "D.M. 22 gennaio 2008", "Condominio", "Amm. TEST Rossi", "CameX", "BX-TEST", "SN12345", "FaacCost"]
ZONE = {"avvolgibile": "Zona di avvolgimento", "sezionale": "Giunti tra le sezioni", "basculante": "Bracci e contrappesi",
        "scorrevole": "Ruote e guida a pavimento", "battente": "Zona cerniere e pilastri"}


def text(p):
    doc = fitz.open(p)
    pages = [pg.get_text() for pg in doc]
    return doc.page_count, pages, "\n".join(pages)


for tipo, z in ZONE.items():
    n, pages, t = text(f"/tmp/iter49_{tipo}.pdf")
    flat = re.sub(r"\s+", " ", t)
    miss = [r for r in REQ_FULL + [z] if r not in flat]
    print(f"{tipo}: pages={n} missing={miss}")
    # registro a righe: page with REGISTRO DI MANUTENZIONE + 'Firma cliente'
    print("  registro righe page:", any("Firma cliente" in p and "Descrizione e sostituzioni" in p for p in pages))
    print("  fascicolo idx count rows:", flat.count("Sì"))
    # footer pagination check
    bad = [i for i, p in enumerate(pages) if "Pagina" not in p and "Italserrande" in p]
    print("  pages without footer:", bad[:10])

n, pages, t = text("/tmp/iter49_old.pdf")
flat = re.sub(r"\s+", " ", t)
print("OLD pages", n, "missing", [r for r in ["FASCICOLO TECNICO", "ELENCO COMPONENTI", "INFORMATIVA AL COMMITTENTE", "VERBALE DI COLLAUDO", "Giunti tra le sezioni", "Nice"] if r not in flat])
for f in sorted(glob.glob("/tmp/iter49_single_*.pdf")):
    n, pages, t = text(f)
    print(f.split("_single_")[1], "pages", n, "first:", re.sub(r"\s+", " ", pages[0])[:140])
