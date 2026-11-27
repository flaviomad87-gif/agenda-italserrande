# Iter56: checks for Fascicolo tecnico (Allegati A/B/C) PDF + company header lines. Usage: python iter56_fascicolo_pdf_check.py file.pdf [--blank] [--dump]
import re, sys, fitz

COMPANY = ["Sede legale e operativa: Via Castino 29 - 00166 Roma (RM)", "P.IVA / C.F. 09270881007",
           "C.C.I.A.A. 1152580 - Cap. Soc. 10.000,00 €", "Tel. 06-6240259 / Cell. 337 743730",
           "Email: italserrande@libero.it", "Interventi esclusivamente nel Comune di Roma"]


def check(path, blank=False, dump=False):
    doc = fitz.open(path)
    pages = [p.get_text() for p in doc]
    full = "\n".join(pages)
    print(f"== {path}: {len(pages)} pages")
    issues = []
    for i, t in enumerate(pages):
        m = re.findall(r"Pagina (\d+) di (\d+)", t)
        first = t.strip().splitlines()[:2]
        print(f"  p{i+1}: {m} | {first}")
        # overflow below bottom margin
        for b in doc[i].get_text("blocks"):
            if b[3] > 800 and "Pagina" not in b[4] and "Italserrande S.r.l. —" not in b[4]:
                issues.append(f"p{i+1} text below bottom margin y={b[3]:.0f}: {b[4][:60]!r}")
    if "\\." in full or "\\" in full:
        issues.append("backslash escape found")
    for u in re.findall(r"_{4,}[^\n]*", full):
        print("  UNDERSCORE:", u[:80])
    if "Trcinamento" in full:
        issues.append("Trcinamento typo")
    for c in COMPANY:
        if c not in full:
            issues.append(f"missing company line: {c}")
    dates = re.findall(r"\b\d{2}/\d{2}/\d{4}\b", full)
    print("  dates:", sorted(set(dates)))
    print("  [X] count:", full.count("[X]"))
    for s in ["S.r.l", "Srl", "SRL", "s.r.l."]:
        print(f"  '{s}' occurrences:", len(re.findall(re.escape(s), full)))
    if dump:
        print(full)
    for x in issues:
        print("  ISSUE:", x)
    return full


if __name__ == "__main__":
    check(sys.argv[1], "--blank" in sys.argv, "--dump" in sys.argv)
