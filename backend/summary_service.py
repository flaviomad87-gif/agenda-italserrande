"""Servizio di aggregazione mensile.

Ospita `_compute_summary` (nome preservato per retro-compatibilità con i test
che importano da `server`) che è la logica core condivisa tra `/summary` e
`/summary/year`. Nessun endpoint qui: solo la funzione.
"""
from db import db


async def _compute_summary(uid: str, month: str) -> dict:
    """Calcola i totali per un mese (YYYY-MM). Logica condivisa tra summary mensile e annuale.

    Per i pagamenti incassati scorpora IVA e ritenuta d'acconto in base al
    `vat_rate` e `withholding_rate` del cliente. Formula:
        divisor   = 1 + (vat - withholding) / 100
        imponibile = amount / divisor
        iva        = imponibile * vat / 100
        ritenuta   = imponibile * withholding / 100
    L'IVA incassata e la ritenuta NON contano nel "guadagno del mese": l'IVA va
    versata allo Stato, la ritenuta è acconto IRPEF già trattenuto.
    """
    regex = {"$regex": f"^{month}"}

    clients = await db.clients.find(
        {
            "user_id": uid,
            "date": regex,
            "$or": [{"pending": {"$exists": False}}, {"pending": False}],
        },
        {"_id": 0},
    ).to_list(5000)
    expenses = await db.expenses.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)
    advances = await db.advances.find(
        {"user_id": uid, "date": regex}, {"_id": 0}
    ).to_list(5000)

    def _split(amount: float, vat: float, wh: float) -> tuple[float, float, float]:
        """Scorpora amount in (imponibile, iva, ritenuta)."""
        divisor = 1 + (vat - wh) / 100.0
        if divisor <= 0:
            divisor = 1.0
        imp = amount / divisor
        return imp, imp * vat / 100.0, imp * wh / 100.0

    incassi = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_net = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_iva = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    incassi_margine = {"contanti": 0.0, "pos": 0.0, "bonifico": 0.0}
    total_executed = 0.0       # lordo (= imponibile + iva − ritenuta) — cash flow
    total_imponibile = 0.0     # ricavo netto IVA (vero ricavo)
    total_iva = 0.0            # IVA incassata, da versare
    total_ritenuta = 0.0       # ritenuta d'acconto trattenuta dal cliente
    total_quotes = 0.0
    for c in clients:
        amt = float(c.get("amount") or 0)
        vat = float(c.get("vat_rate") or 0) if c.get("vat_rate") is not None else 0
        wh = float(c.get("withholding_rate") or 0) if c.get("withholding_rate") is not None else 0
        materials_total_c = sum(float(m.get("amount") or 0) for m in (c.get("materials") or []))
        payments = c.get("payments") or []
        if payments:
            # Pre-calcola imponibile totale del cliente per distribuire i materiali pro-quota
            client_imp_total = 0.0
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                imp_p, _, _ = _split(p_amt, vat, wh)
                client_imp_total += imp_p
            for p in payments:
                p_amt = float(p.get("amount") or 0)
                method = (p.get("method") or "").strip()
                imp, iva_p, rit_p = _split(p_amt, vat, wh)
                # Quota materiali attribuita a questo pagamento (pro-rata su imponibile)
                share = (imp / client_imp_total) if client_imp_total > 0 else 0
                materials_share = materials_total_c * share
                margine_p = imp - materials_share
                if method in incassi:
                    incassi[method] += p_amt
                    incassi_net[method] += imp
                    incassi_iva[method] += iva_p
                    incassi_margine[method] += margine_p
                total_executed += p_amt
                total_imponibile += imp
                total_iva += iva_p
                total_ritenuta += rit_p
        else:
            if c.get("status") == "lavoro_eseguito":
                # Legacy: nessun array payments → considera amt come imponibile
                gross = amt * (1 + (vat - wh) / 100.0)
                iva_l = amt * vat / 100.0
                total_executed += gross
                total_imponibile += amt
                total_iva += iva_l
                total_ritenuta += amt * wh / 100.0
                pm = c.get("payment_method") or ""
                if pm in incassi:
                    incassi[pm] += gross
                    incassi_net[pm] += amt
                    incassi_iva[pm] += iva_l
                    incassi_margine[pm] += amt - materials_total_c
            else:
                total_quotes += amt

    spese_by_source = {"contanti": 0.0, "conto_aziendale": 0.0}
    for e in expenses:
        spese_by_source[e.get("source", "contanti")] += float(e.get("amount") or 0)

    materials_by_source = {"contanti": 0.0, "conto_aziendale": 0.0}
    total_materials = 0.0
    for c in clients:
        # I materiali entrano nel bilancio SOLO se il cliente ha effettivamente
        # generato ricavi nel mese (lavoro eseguito o almeno un pagamento).
        # Per i preventivi puri (nessun pagamento, status != lavoro_eseguito)
        # i materiali sono un promemoria interno alla scheda e NON vengono
        # sottratti dal margine, altrimenti il bilancio del mese risulterebbe
        # penalizzato da materiali di lavori non ancora eseguiti. Quando il
        # preventivo verrà eseguito (o riceverà un pagamento), i materiali
        # entreranno automaticamente nel calcolo.
        has_payments_c = bool(c.get("payments"))
        is_executed = c.get("status") == "lavoro_eseguito"
        if not (is_executed or has_payments_c):
            continue
        for m in (c.get("materials") or []):
            m_amt = float(m.get("amount") or 0)
            src = m.get("source") or "conto_aziendale"
            if src not in materials_by_source:
                src = "conto_aziendale"
            materials_by_source[src] += m_amt
            total_materials += m_amt

    total_advances = sum(float(a.get("amount") or 0) for a in advances)
    total_incassi = sum(incassi.values())
    total_spese = sum(spese_by_source.values())

    # Guadagno reale = imponibile − spese fisse − materiali.
    # NOTA: gli acconti operaio NON si sottraggono qui perché lo stipendio
    # è già contabilizzato nelle spese fisse mensili. L'acconto è solo un
    # promemoria: quando l'utente fa il bonifico dello stipendio a fine mese,
    # sottrae l'acconto già dato in contanti (fuori app). Sottrarlo qui
    # provocherebbe una doppia contabilizzazione.
    balance = total_imponibile - total_spese - total_materials

    return {
        "month": month,
        "incassi_by_method": incassi,
        "incassi_net_by_method": {k: round(v, 2) for k, v in incassi_net.items()},
        "incassi_iva_by_method": {k: round(v, 2) for k, v in incassi_iva.items()},
        "incassi_margine_by_method": {k: round(v, 2) for k, v in incassi_margine.items()},
        "total_incassi": round(total_incassi, 2),
        "total_quotes": round(total_quotes, 2),
        "total_executed": round(total_executed, 2),
        "total_imponibile": round(total_imponibile, 2),
        "total_iva": round(total_iva, 2),
        "total_ritenuta": round(total_ritenuta, 2),
        "spese_by_source": spese_by_source,
        "total_spese": round(total_spese, 2),
        "materials_by_source": materials_by_source,
        "total_materials": round(total_materials, 2),
        "total_advances": round(total_advances, 2),
        "balance": round(balance, 2),
        "counts": {
            "clients": len(clients),
            "expenses": len(expenses),
            "advances": len(advances),
        },
    }
