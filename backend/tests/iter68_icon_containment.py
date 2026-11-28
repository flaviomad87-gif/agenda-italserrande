# Iter68: verify icon glyph vector points lie inside inner yellow triangle / white disc of each cartello
import sys, glob, math
import fitz


def pts_of(d):
    out = []
    for it in d["items"]:
        for p in it[1:]:
            if isinstance(p, fitz.Point):
                out.append(p)
            elif isinstance(p, fitz.Rect):
                out += [p.tl, p.tr, p.bl, p.br]
            elif isinstance(p, fitz.Quad):
                out += [p.ul, p.ur, p.ll, p.lr]
    return out


def inside_tri(p, a, b, c, tol=0.6):
    # signed distance to each edge (inward positive) must be >= -tol
    cen = fitz.Point((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)
    for p1, p2 in ((a, b), (b, c), (c, a)):
        ex, ey = p2.x - p1.x, p2.y - p1.y
        L = math.hypot(ex, ey)
        dp = (ex * (p.y - p1.y) - ey * (p.x - p1.x)) / L
        dc = (ex * (cen.y - p1.y) - ey * (cen.x - p1.x)) / L
        if dp * (1 if dc > 0 else -1) < -tol:
            return False
    return True


for f in sorted(glob.glob(sys.argv[1])):
    pg = fitz.open(f)[0]
    dr = pg.get_drawings()
    yellow = [d for d in dr if d.get("fill") and tuple(round(c, 2) for c in d["fill"]) == (1.0, 0.8, 0.0)]
    white_disc = [d for d in dr if d.get("fill") == (1.0, 1.0, 1.0) and d["rect"].width > 20 and abs(d["rect"].width - d["rect"].height) < 1 and d["rect"].x0 < 120]
    res = []
    for y in yellow:
        tri = []
        for p in pts_of(y):
            if all(abs(p.x - q.x) + abs(p.y - q.y) > 0.5 for q in tri):
                tri.append(p)
        tri = tri[:3]
        if len(tri) < 3:
            continue
        a, b, c = tri
        box = y["rect"]
        bad = 0
        tot = 0
        for d in dr:
            if d is y or d.get("fill") not in [(0.0, 0.0, 0.0)] and d.get("color") not in [(0.0, 0.0, 0.0)]:
                continue
            if d["rect"].width > box.width * 1.02:  # outer black triangle
                continue
            if not d["rect"].intersects(box):
                continue
            for p in pts_of(d):
                tot += 1
                # account for stroke width
                if not inside_tri(p, a, b, c, tol=(d.get("width") or 0) / 2 + 0.3):
                    bad += 1
        res.append(f"tri@y{round(box.y0)}: {tot - bad}/{tot} glyph pts inside")
    for w in white_disc:
        r = w["rect"]
        cx, cy, rad = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.width / 2
        bad = tot = 0
        for d in dr:
            if d.get("fill") != (0.0, 0.0, 0.0) and d.get("color") != (0.0, 0.0, 0.0):
                continue
            if not d["rect"].intersects(r):
                continue
            for p in pts_of(d):
                tot += 1
                if math.hypot(p.x - cx, p.y - cy) > rad - (d.get("width") or 0) / 2 + 0.3:
                    bad += 1
        res.append(f"disc@y{round(r.y0)}: {tot - bad}/{tot} glyph pts inside")
    print(f.split("/")[-1], res)
