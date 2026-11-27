# Iter60: content checks (targhetta note, DM37 text, verifiche strumentali, periodicità, CPR/DoP, molle/freno) on /tmp/iter60
import re, warnings
warnings.filterwarnings("ignore")
import fitz

def txt(name):
    return "\n".join(p.get_text() for p in fitz.open(f"/tmp/iter60/{name}.pdf"))

def flat(s):
    return re.sub(r"\s+", " ", s)

def chk(label, cond):
    print(("PASS " if cond else "FAIL ") + label)

m = flat(txt("full_avv_molle")); t = flat(txt("full_avv_tubolare")); s = flat(txt("full_sezionale")); tp = flat(txt("full_tapparella")); sc = flat(txt("full_scorrevole")); b = flat(txt("blank_avv_all"))
chk("targhetta poliestere note", "Stampare su etichetta in poliestere o resina con stampante a trasferimento termico" in m)
chk("targhetta no carta adesiva/plastific", not re.search(r"carta adesiva|plastific", m, re.I))
chk("DM37 'Il sottoscritto'", "Il sottoscritto TEST_Mario" in m)
chk("DM37 CCIAA Roma n. 1152580", "Camera di Commercio (C.C.I.A.A.) di Roma n. 1152580" in m)
for k in ["nuovo impianto", "trasformazione", "ampliamento", "manutenzione straordinaria"]:
    chk(f"DM37 tipo '{k}'", k in m.lower())
chk("FG16OR16 present, no FG160R16", "FG16OR16" in m and "FG160R16" not in m)
chk("continuità 0.15 Ohm", "0.15 Ohm" in m)
chk("isolamento 250 MOhm", "250 MOhm" in m)
chk("diff 22 ms", "22 ms" in m)
chk("tubolare: '______ Ohm'", "______ Ohm" in t)
chk("blank: '______ Ohm'", "______ Ohm" in b)
for nm, x in [("molle", m), ("tubolare", t), ("sez", s), ("tapp", tp), ("scorr", sc), ("blank", b)]:
    chk(f"{nm}: periodicità 12/6 in CE", "almeno ogni 12 mesi per uso privato, ogni 6 mesi per uso condominiale, commerciale o intensivo" in x)
    chk(f"{nm}: CE avvertenza 7 CPR/DoP", "Reg. (UE) 305/2011 (CPR) con la DoP" in x)
    chk(f"{nm}: norme riga 7 CPR - DoP", "7. Reg. (UE) 305/2011 (CPR) - DoP" in x)
    mesi = sorted(set(re.findall(r"\d+ mesi", x)))
    print("   mesi found:", mesi, "| 'annual'/'semestral':", re.findall(r"annual\w*|semestral\w*|ogni anno", x, re.I)[:5])
    chk(f"{nm}: fascicolo CPR row", len(re.findall(r"305/2011", x)) >= 3)
chk("molle: voce Molle in collaudo", "Molle di bilanciamento integre" in m)
chk("molle: voce Elettrofreno", "Elettrofreno / freno del motore" in m)
chk("tubolare: no voce Molle", "Molle di bilanciamento integre" not in t)
chk("tubolare: voce Elettrofreno", "Elettrofreno / freno del motore" in t)
chk("tapparella: voce Elettrofreno", "Elettrofreno / freno del motore" in tp)
chk("tapparella: no Molle", "Molle di bilanciamento integre" not in tp)
chk("sezionale: Molle present, no Elettrofreno", "Molle di bilanciamento integre" in s and "Elettrofreno / freno del motore" not in s)
chk("blank avvolgibile: Molle present (config not set)", "Molle di bilanciamento integre" in b)
for nm, x in [("molle", m), ("blank", b)]:
    chk(f"{nm}: no old 'Pagina 1 di 2'/'Pagina 1 di 1'", not re.search(r"Pagina \d+ di [12](?!\d)", x))
so = flat(txt("soloce")); sr = flat(txt("soloreg"))
chk("Solo CE keeps 'Pagina 1 di 2' + 'Pagina 2 di 2'", "Pagina 1 di 2" in so and "Pagina 2 di 2" in so)
chk("Solo Registro keeps 'Pagina 1 di 1'", "Pagina 1 di 1" in sr)
