"""Endpoint riepiloghi mensili/annuali, dettaglio pagamenti per metodo, fornitori."""
from fastapi import APIRouter, Depends, HTTPException

from db import db
from firebase_auth import get_current_user
from summary_service import _compute_summary

router = APIRouter()


@router.get("/summary")
async def monthly_summary(month: str, user=Depends(get_current_user)):
    """Aggregated totals for a month (YYYY-MM)."""
    return await _compute_summary(user["uid"], month)


@router.get("/suppliers/summary")
async def suppliers_summary(month: str, user=Depends(get_current_user)):
    """Riepilogo materiali del mese raggruppati per fornitore.

    Serve all'utente per sapere quanto deve pagare ai fornitori a fine mese.
    Aggrega tutti i materiali di TUTTI i lavori del mese (inclusi preventivi,
    perché i materiali sono stati comunque acquistati/prenotati dal fornitore).
    Filtra per data del lavoro (client.date) nel mese YYYY-MM.

    Ritorna:
      - month, total, total_contanti, total_conto_aziendale, items_count
      - suppliers: lista ordinata per totale desc di
        {name, total, total_contanti, total_conto_aziendale, items_count,
         items: [{client_id, client_name, client_date, description, amount,
                  source, date, notes}]}
    """
    regex = {"$regex": f"^{month}"}
    clients = await db.clients.find(
        {
            "user_id": user["uid"],
            "date": regex,
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).to_list(5000)

    by_supplier: dict = {}
    total = 0.0
    total_contanti = 0.0
    total_conto = 0.0
    items_count = 0

    for c in clients:
        for m in (c.get("materials") or []):
            amt = float(m.get("amount") or 0)
            if amt <= 0:
                continue
            raw_supp = (m.get("supplier") or "").strip()
            supp_key = raw_supp if raw_supp else "__no_supplier__"
            supp_name = raw_supp if raw_supp else "Senza fornitore"
            src = m.get("source") or "conto_aziendale"
            if src not in ("contanti", "conto_aziendale"):
                src = "conto_aziendale"

            bucket = by_supplier.setdefault(supp_key, {
                "name": supp_name,
                "total": 0.0,
                "total_contanti": 0.0,
                "total_conto_aziendale": 0.0,
                "items_count": 0,
                "items": [],
            })
            bucket["total"] += amt
            if src == "contanti":
                bucket["total_contanti"] += amt
                total_contanti += amt
            else:
                bucket["total_conto_aziendale"] += amt
                total_conto += amt
            bucket["items_count"] += 1
            bucket["items"].append({
                "client_id": c.get("id"),
                "client_name": c.get("name") or "",
                "client_date": c.get("date") or "",
                "description": m.get("description") or "",
                "amount": round(amt, 2),
                "source": src,
                "date": m.get("date") or "",
                "notes": m.get("notes") or "",
            })
            total += amt
            items_count += 1

    suppliers = []
    for k, b in by_supplier.items():
        b["total"] = round(b["total"], 2)
        b["total_contanti"] = round(b["total_contanti"], 2)
        b["total_conto_aziendale"] = round(b["total_conto_aziendale"], 2)
        # ordina gli items per data lavoro desc
        b["items"].sort(key=lambda x: (x.get("client_date") or ""), reverse=True)
        suppliers.append(b)
    suppliers.sort(key=lambda s: (s["name"] == "Senza fornitore", -s["total"]))

    return {
        "month": month,
        "total": round(total, 2),
        "total_contanti": round(total_contanti, 2),
        "total_conto_aziendale": round(total_conto, 2),
        "items_count": items_count,
        "suppliers": suppliers,
    }


@router.get("/payments/by-method")
async def payments_by_method(month: str, method: str, user=Depends(get_current_user)):
    """Restituisce il dettaglio dei singoli pagamenti per metodo (contanti/pos/bonifico)
    per un dato mese. Allinea con il calcolo del Riepilogo:
    filtra i clienti per JOB DATE nel mese, poi elenca i pagamenti con quel metodo.

    Per ogni pagamento espone:
      - amount (lordo, IVA inclusa, già al netto di eventuale ritenuta)
      - imponibile (netto IVA = "margine" mostrato in Riepilogo)
      - iva (IVA incassata, da versare)
      - job_date / payment_date
    """
    if method not in ("contanti", "pos", "bonifico"):
        raise HTTPException(400, "Metodo non valido")
    regex = {"$regex": f"^{month}"}
    clients = await db.clients.find(
        {
            "user_id": user["uid"],
            "date": regex,
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).to_list(5000)

    def _split(amount: float, vat: float, wh: float) -> tuple[float, float, float]:
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    items = []
    for c in clients:
        job_date = c.get("date") or ""
        vat = float(c.get("vat_rate") or 0) if c.get("vat_rate") is not None else 0
        wh = float(c.get("withholding_rate") or 0) if c.get("withholding_rate") is not None else 0
        materials_total_c = sum(float(m.get("amount") or 0) for m in (c.get("materials") or []))
        payments = c.get("payments") or []
        if payments:
            # Pre-calcola imponibile totale cliente per distribuire materiali pro-quota
            client_imp_total = 0.0
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                imp_p, _, _ = _split(p_amt, vat, wh)
                client_imp_total += imp_p
            for p in payments:
                p_method = (p.get("method") or "").strip()
                if p_method != method:
                    continue
                amt = float(p.get("amount") or 0)
                imp, iva, _ = _split(amt, vat, wh)
                share = (imp / client_imp_total) if client_imp_total > 0 else 0
                mat_share = materials_total_c * share
                margin = imp - mat_share
                items.append({
                    "client_id": c.get("id"),
                    "client_name": c.get("name") or "",
                    "client_address": c.get("address") or "",
                    "job_date": job_date,
                    "payment_id": p.get("id"),
                    "payment_date": p.get("date") or job_date,
                    "payment_type": p.get("type") or "altro",
                    "amount": round(amt, 2),
                    "imponibile": round(imp, 2),
                    "iva": round(iva, 2),
                    "materials_share": round(mat_share, 2),
                    "margin": round(margin, 2),
                    "vat_rate": vat,
                    "invoice_number": p.get("invoice_number") or "",
                    "notes": p.get("notes") or "",
                    "legacy": False,
                })
        else:
            if c.get("status") == "lavoro_eseguito" and (c.get("payment_method") or "") == method:
                amt = float(c.get("amount") or 0)
                if amt > 0:
                    gross = amt * (1 + (vat - wh) / 100.0)
                    items.append({
                        "client_id": c.get("id"),
                        "client_name": c.get("name") or "",
                        "client_address": c.get("address") or "",
                        "job_date": job_date,
                        "payment_id": None,
                        "payment_date": job_date,
                        "payment_type": "saldo",
                        "amount": round(gross, 2),
                        "imponibile": round(amt, 2),
                        "iva": round(amt * vat / 100.0, 2),
                        "materials_share": round(materials_total_c, 2),
                        "margin": round(amt - materials_total_c, 2),
                        "vat_rate": vat,
                        "invoice_number": c.get("invoice_number") or "",
                        "notes": "",
                        "legacy": True,
                    })

    items.sort(key=lambda x: (x["payment_date"] or x["job_date"], x["client_name"]))
    total_gross = round(sum(it["amount"] for it in items), 2)
    total_imponibile = round(sum(it["imponibile"] for it in items), 2)
    total_iva = round(sum(it["iva"] for it in items), 2)
    total_margin = round(sum(it["margin"] for it in items), 2)
    total_materials = round(sum(it["materials_share"] for it in items), 2)
    return {
        "month": month,
        "method": method,
        "total": total_gross,                   # retro-compat
        "total_gross": total_gross,
        "total_imponibile": total_imponibile,
        "total_iva": total_iva,
        "total_margin": total_margin,
        "total_materials": total_materials,
        "count": len(items),
        "items": items,
    }


@router.get("/summary/year")
async def yearly_summary(year: int, user=Depends(get_current_user)):
    """Riepilogo annuale: 12 mesi (gen-dic) con guadagni/perdite + totali annuali."""
    uid = user["uid"]
    months_data = []
    for m in range(1, 13):
        key = f"{year:04d}-{m:02d}"
        s = await _compute_summary(uid, key)
        months_data.append(s)

    totals = {
        "total_incassi": round(sum(x["total_incassi"] for x in months_data), 2),
        "total_imponibile": round(sum(x["total_imponibile"] for x in months_data), 2),
        "total_iva": round(sum(x["total_iva"] for x in months_data), 2),
        "total_ritenuta": round(sum(x["total_ritenuta"] for x in months_data), 2),
        "total_executed": round(sum(x["total_executed"] for x in months_data), 2),
        "total_quotes": round(sum(x["total_quotes"] for x in months_data), 2),
        "total_spese": round(sum(x["total_spese"] for x in months_data), 2),
        "total_materials": round(sum(x["total_materials"] for x in months_data), 2),
        "total_advances": round(sum(x["total_advances"] for x in months_data), 2),
        "balance": round(sum(x["balance"] for x in months_data), 2),
    }

    # Trova il miglior e il peggior mese (per balance) tra quelli con almeno un'attività
    active = [m for m in months_data if m["counts"]["clients"] > 0 or m["counts"]["expenses"] > 0 or m["counts"]["advances"] > 0]
    best_month = max(active, key=lambda m: m["balance"])["month"] if active else None
    worst_month = min(active, key=lambda m: m["balance"])["month"] if active else None

    return {
        "year": year,
        "months": months_data,
        "totals": totals,
        "best_month": best_month,
        "worst_month": worst_month,
    }
