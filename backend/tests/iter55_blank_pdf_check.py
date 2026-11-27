# Iter55: blank PDFs with regime selector - regime cited, no dates/years, no pre-crossed boxes, blank fields; usage: python iter55_blank_pdf_check.py
import glob, re, sys
sys.path.insert(0, "/app/backend/tests")
from iter54_blank_pdf_check import analyse

DATE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")
YEAR = re.compile(r"\b20(2[5-9]|3\d)\b")

for p in sorted(glob.glob("/tmp/iter55_blank_*.pdf")):
    reg = p.split("_")[2]
    n, txt, marks, orph = analyse(p)
    flags = []
    dates = DATE.findall(txt.replace("19/01/2027", "").replace("20/01/2027", ""))
    if dates: flags.append(f"DATES={dates[:5]}")
    yrs = sorted(set(m.group(0) for m in YEAR.finditer(txt)))
    if yrs: flags.append(f"YEARS={yrs}")
    old = "2006/42" in txt
    new = "2023/1230" in txt
    flags.append(f"CE2006={old} UE2023={new}")
    low = txt.lower()
    for w in ("esito positivo", "applicata", "privato / residenziale", "comando impulsivo", "ridotto  [", "____/____/________", "radiocomandi consegnati: ______", "installazione e messa in servizio"):
        if w in low: flags.append(f"'{w}'")
    if orph: flags.append(f"ORPHAN {orph}")
    print(f"{p.split('/')[-1]}: pages={n} crosses={len(marks)} {marks[:8]} {' '.join(flags)}")
