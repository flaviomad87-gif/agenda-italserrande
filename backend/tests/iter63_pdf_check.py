# Iter63 PDF regression: page count, 'Pagina X di N' footer, bad tokens (undefined/NaN/null/[object), odd chars
import glob, re, sys
import fitz

BAD = ["undefined", "NaN", "null", "[object", "Invalid Date", "$", "II sottoscritto"]
fails = 0
for p in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/iter63/*.pdf")):
    doc = fitz.open(p)
    n = len(doc)
    issues = []
    for i, pg in enumerate(doc):
        t = pg.get_text()
        m = re.findall(r"Pagina (\d+) di (\d+)", t)
        if n > 1 and (not m or m[-1] != (str(i + 1), str(n))):
            issues.append(f"p{i+1} footer={m}")
        for b in BAD:
            if b in t:
                issues.append(f"p{i+1} has '{b}'")
        odd = set(c for c in t if ord(c) > 0x24F and c not in "€–—‘’“”•…→←↑↓·✓✔□■☐☑☒°±×÷")
        if odd:
            issues.append(f"p{i+1} odd chars {sorted(odd)[:10]}")
        w = pg.rect.width
        for blk in pg.get_text("blocks"):
            if blk[2] > w - 10 or blk[0] < 10:
                issues.append(f"p{i+1} text near edge x0={blk[0]:.0f} x1={blk[2]:.0f} '{blk[4][:30]!r}'")
                break
    fails += bool(issues)
    print(("FAIL" if issues else "PASS"), n, "pages", p.split("/")[-1][:70], issues[:6])
print("files with issues:", fails)
