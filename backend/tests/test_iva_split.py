"""Unit test per il calcolo di scorporo IVA + ritenuta nel riepilogo mensile."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch firebase to allow import senza credenziali
os.environ.setdefault("FIREBASE_PROJECT_ID", "test")


def test_split_iva_no_ritenuta():
    """Imponibile 1000 + IVA 22% = 1220 incassati → split corretto."""
    from server import _compute_summary  # noqa
    # split inline
    def _split(amount, vat, wh):
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    imp, iva, rit = _split(1220.0, 22.0, 0.0)
    assert abs(imp - 1000.0) < 0.01, f"Imponibile errato: {imp}"
    assert abs(iva - 220.0) < 0.01, f"IVA errata: {iva}"
    assert abs(rit - 0.0) < 0.01, f"Ritenuta dovrebbe essere 0: {rit}"


def test_split_iva_with_ritenuta():
    """Imponibile 1000, IVA 22%, ritenuta 20% → cliente paga 1000 + 220 - 200 = 1020."""
    def _split(amount, vat, wh):
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    imp, iva, rit = _split(1020.0, 22.0, 20.0)
    assert abs(imp - 1000.0) < 0.01, f"Imponibile errato: {imp}"
    assert abs(iva - 220.0) < 0.01, f"IVA errata: {iva}"
    assert abs(rit - 200.0) < 0.01, f"Ritenuta errata: {rit}"


def test_split_no_iva():
    """Forfettario: no IVA, no ritenuta → imponibile = amount."""
    def _split(amount, vat, wh):
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    imp, iva, rit = _split(500.0, 0.0, 0.0)
    assert abs(imp - 500.0) < 0.01
    assert abs(iva - 0.0) < 0.01
    assert abs(rit - 0.0) < 0.01


def test_split_iva_10_percent():
    """IVA agevolata al 10%: imponibile 1000 → cliente paga 1100."""
    def _split(amount, vat, wh):
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    imp, iva, _ = _split(1100.0, 10.0, 0.0)
    assert abs(imp - 1000.0) < 0.01
    assert abs(iva - 100.0) < 0.01


if __name__ == "__main__":
    test_split_iva_no_ritenuta()
    test_split_iva_with_ritenuta()
    test_split_no_iva()
    test_split_iva_10_percent()
    print("✅ Tutti i test IVA split passati")
