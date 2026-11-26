"""Server MCP (Model Context Protocol) dell'agenda: strumenti per Claude, ChatGPT o altri assistenti.
Lettura libera; ogni modifica è dichiarata come tale e registrata nell'attività. Nessuna cancellazione."""
import base64
import io
import json
import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from PIL import Image

from ai_auth import base_url, now, user_from_bearer
from db import db
from models import ClientCreate, Payment
from routes.clients import create_client, update_client
from routes.contratti import Visita, add_visita, compute
from routes.photos import photo_bytes

log = logging.getLogger(__name__)
router = APIRouter()
ROME = ZoneInfo("Europe/Rome")
VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]
NOP = {"_id": 0, "user_id": 0}

INSTRUCTIONS = """Sei l'assistente operativo di Italserrande S.r.l. (Roma): serrande avvolgibili, porte sezionali, basculanti,
cancelli e automazioni. Rispondi sempre in italiano, in modo pratico e breve.
Regole:
- Prima di OGNI strumento che modifica l'agenda (crea_lavoro, modifica_lavoro, registra_pagamento,
  registra_visita_manutenzione, prepara_preventivo) riepiloga cosa farai e attendi un "sì" esplicito dell'utente.
- Non puoi cancellare nulla: se te lo chiedono, spiega che va fatto dall'agenda. Bozze non ancora approvate:
  Ufficio → Assistente IA → Bozze di preventivo → Scarta. Preventivi già approvati (hanno un numero): si aprono da
  Lavori → Preventivi o dall'archivio preventivi e si eliminano con il cestino in basso nella pagina del preventivo.
- Prepara UNA sola bozza per richiesta. Prima di prepararne un'altra per lo stesso cliente, controlla con
  cerca_preventivi e chiedi se va sostituita.
- Preventivi: prepara solo le righe descrittive, i prezzi li inserisce il titolare. Diventano veri solo quando li approva
  nell'agenda (Ufficio → Assistente IA). Per lo stile guarda prima cerca_preventivi: nomi e indirizzi in MAIUSCOLO,
  descrizioni tecniche complete (tipo chiusura, misure, colore, motore, accessori, montaggio, smaltimento).
- Date nel formato AAAA-MM-GG, orari HH:MM, fuso Europa/Roma. Oggi lo ottieni da agenda senza parametri."""

LISTE = {
    "prossimi": {"pending": True, "awaiting_materials": False, "to_quote": False},
    "in_attesa": {"pending": True, "awaiting_materials": True},
    "da_preventivare": {"pending": True, "to_quote": True},
    "da_fatturare": {"pending": False, "to_invoice": True},
}


def _today() -> str:
    return datetime.now(ROME).date().isoformat()


def _rx(t: str) -> dict:
    return {"$regex": re.escape(t.strip()), "$options": "i"}


def _paid(c: dict) -> float:
    return round(sum(p.get("amount", 0) for p in c.get("payments", [])), 2)


def _lista(c: dict) -> str:
    if c.get("pending"):
        return "in_attesa" if c.get("awaiting_materials") else "da_preventivare" if c.get("to_quote") else "prossimi"
    return "agenda (da fatturare)" if c.get("to_invoice") else "agenda"


def _lavoro(c: dict) -> dict:
    return {
        "id": c["id"], "nome": c.get("name"), "indirizzo": c.get("address"), "telefono": c.get("phone"),
        "data": c.get("date"), "lista": _lista(c), "stato": c.get("status"), "appuntamento": c.get("appointment_at"),
        "nota_appuntamento": c.get("appointment_note"), "importo": c.get("amount", 0), "incassato": _paid(c),
        "note": (c.get("notes") or "")[:300],
    }


async def _log(user: dict, azione: str, dettaglio: str, ref: str = ""):
    await db.ai_attivita.insert_one({
        "id": uuid.uuid4().hex, "uid": user["uid"], "at": now().isoformat(), "azione": azione,
        "dettaglio": dettaglio[:300], "ref": ref, "assistente": user.get("client_name", ""),
    })


async def _job(user: dict, jid: str) -> dict:
    c = await db.clients.find_one({"id": jid, "user_id": user["uid"]}, NOP)
    if not c:
        raise ValueError("Lavoro non trovato: usa cerca_lavori per avere l'id giusto")
    return c


# ---------------- Strumenti di lettura ----------------

async def cerca_lavori(user, testo: str = "", limite: int = 20):
    q: dict = {"user_id": user["uid"]}
    if testo.strip():
        q["$or"] = [{f: _rx(testo)} for f in ("name", "address", "phone", "notes")]
    docs = await db.clients.find(q, NOP).sort("date", -1).to_list(min(limite, 50))
    return {"lavori": [_lavoro(c) for c in docs]}


async def agenda(user, dal: str = "", al: str = ""):
    dal = dal or _today()
    al = al or (datetime.fromisoformat(dal) + timedelta(days=7)).date().isoformat()
    uid = user["uid"]
    lavori = await db.clients.find({"user_id": uid, "pending": {"$ne": True}, "date": {"$gte": dal, "$lte": al}}, NOP).sort("date", 1).to_list(300)
    app = await db.clients.find({"user_id": uid, "appointment_at": {"$gte": dal, "$lte": f"{al}T23:59"}}, NOP).sort("appointment_at", 1).to_list(300)
    return {"oggi": _today(), "dal": dal, "al": al, "lavori_in_agenda": [_lavoro(c) for c in lavori],
            "appuntamenti": [_lavoro(c) for c in app]}


async def elenco_lavori(user, lista: str = "prossimi"):
    if lista == "da_incassare":
        docs = await db.clients.find({"user_id": user["uid"], "pending": {"$ne": True}, "status": "lavoro_eseguito"}, NOP).to_list(2000)
        docs = [c for c in docs if c.get("amount", 0) - _paid(c) > 0.01]
    else:
        docs = await db.clients.find({"user_id": user["uid"], **LISTE[lista]}, NOP).sort("sort_order", 1).to_list(500)
    return {"lista": lista, "lavori": [_lavoro(c) for c in docs]}


async def scheda_lavoro(user, id: str):
    c = await _job(user, id)
    uid = user["uid"]
    foto = await db.job_photos.find({"user_id": uid, "client_id": id, "is_deleted": False}, {"_id": 0, "id": 1, "created_at": 1}).to_list(100)
    rilievi = await db.rilievi_sezionali.find({"user_id": uid, "client_id": id, "is_deleted": {"$ne": True}}, NOP).to_list(20)
    quote = await db.quotes.find_one({"user_id": uid, "$or": [{"id": c.get("quote_ref") or "-"}, {"client_id": id}]}, NOP)
    name = (c.get("name") or "").strip()
    docs, contratti = [], []
    if name:
        docs = await db.documenti.find({"user_id": uid, "is_deleted": {"$ne": True}, "cliente": _rx(name)},
                                       {"_id": 0, "id": 1, "kind": 1, "numero": 1, "data": 1, "cliente": 1, "indirizzo": 1}).to_list(30)
        contratti = [compute(x) for x in await db.contratti.find({"user_id": uid, "is_deleted": {"$ne": True}, "cliente": _rx(name)}, {**NOP, "reminded": 0}).to_list(10)]
    return {"lavoro": {**_lavoro(c), "note": c.get("notes"), "pagamenti": c.get("payments", []), "materiali": c.get("materials", []),
                       "iva": c.get("vat_rate"), "numero_preventivo": c.get("quote_number")},
            "foto": {"quante": len(foto), "nota": "usa foto_lavoro per vederle"}, "rilievi": rilievi, "preventivo": quote,
            "documenti": docs, "contratti": contratti}


async def foto_lavoro(user, id: str, max: int = 4):
    docs = await db.job_photos.find({"user_id": user["uid"], "client_id": id, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(min(max, 6))
    if not docs:
        return {"foto": [], "nota": "Nessuna foto per questo lavoro"}
    blocks: list = [{"type": "text", "text": f"{len(docs)} foto del lavoro {id}, dalla più recente."}]
    for d in docs:
        try:
            img = Image.open(io.BytesIO(await photo_bytes(d))).convert("RGB")
            img.thumbnail((1024, 1024))
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=75)
            blocks.append({"type": "image", "data": base64.b64encode(buf.getvalue()).decode(), "mimeType": "image/jpeg"})
        except Exception as e:
            log.warning("Foto %s non leggibile: %s", d["id"], e)
    return blocks


async def cerca_preventivi(user, testo: str = "", limite: int = 10):
    q: dict = {"user_id": user["uid"]}
    if testo.strip():
        q["$or"] = [{f: _rx(testo)} for f in ("clientName", "clientAddress", "subject", "number", "lineItems.description")]
    docs = await db.quotes.find(q, NOP).sort("createdAt", -1).to_list(min(limite, 30))
    return {"preventivi": [{"id": d["id"], "numero": d.get("number"), "data": d.get("date"), "cliente": d.get("clientName"),
                            "indirizzo": d.get("clientAddress"), "oggetto": d.get("subject"), "stato": d.get("status"),
                            "righe": [{"descrizione": r.get("description"), "importo": r.get("amount"), "iva": r.get("vatRate")} for r in d.get("lineItems", [])]}
                           for d in docs]}


async def cerca_documenti(user, testo: str = "", tipo: str = ""):
    uid = user["uid"]
    out = []
    if tipo in ("", "rilievo"):
        q = {"user_id": uid, "is_deleted": {"$ne": True}}
        if testo.strip():
            q["$or"] = [{f: _rx(testo)} for f in ("ditta", "via", "citta", "rif")]
        for r in await db.rilievi_sezionali.find(q, NOP).sort("created_at", -1).to_list(20):
            out.append({"id": r["id"], "tipo": "rilievo", "cliente": r.get("ditta"), "indirizzo": f"{r.get('via') or ''} {r.get('citta') or ''}".strip(),
                        "data": r.get("data") or str(r.get("created_at", ""))[:10], "lavoro_id": r.get("client_id")})
    if tipo != "rilievo":
        q = {"user_id": uid, "is_deleted": {"$ne": True}}
        if tipo:
            q["kind"] = tipo
        if testo.strip():
            q["$or"] = [{"cliente": _rx(testo)}, {"indirizzo": _rx(testo)}]
        for d in await db.documenti.find(q, {"_id": 0, "id": 1, "kind": 1, "numero": 1, "data": 1, "cliente": 1, "indirizzo": 1}).sort("data", -1).to_list(30):
            out.append({**d, "tipo": d.pop("kind")})
    return {"documenti": out}


async def leggi_documento(user, id: str):
    d = await db.documenti.find_one({"id": id, "user_id": user["uid"], "is_deleted": {"$ne": True}}, {**NOP, "public_token": 0})
    d = d or await db.rilievi_sezionali.find_one({"id": id, "user_id": user["uid"]}, NOP)
    if not d:
        raise ValueError("Documento non trovato")
    return d


async def contratti_manutenzione(user, testo: str = "", solo_in_scadenza: bool = False):
    q: dict = {"user_id": user["uid"], "is_deleted": {"$ne": True}}
    if testo.strip():
        q["$or"] = [{"cliente": _rx(testo)}, {"indirizzo": _rx(testo)}, {"comune": _rx(testo)}]
    items = [compute(c) for c in await db.contratti.find(q, {**NOP, "reminded": 0}).to_list(500)]
    if solo_in_scadenza:
        items = [c for c in items if c["scadenze"]]
    items.sort(key=lambda c: c["prossima_visita"])
    return {"oggi": _today(), "contratti": items}


# ---------------- Strumenti di modifica ----------------

def _place(data: dict, lista: str, data_agenda: str = ""):
    flags = {"pending": True, "awaiting_materials": False, "to_quote": False, "to_invoice": False}
    if lista == "agenda":
        flags["pending"] = False
        data["date"] = data_agenda or data.get("date") or _today()
    elif lista == "in_attesa":
        flags["awaiting_materials"] = True
    elif lista == "da_preventivare":
        flags["to_quote"] = True
    elif lista == "da_fatturare":
        flags.update(pending=False, to_invoice=True)
    elif lista != "prossimi":
        raise ValueError("lista non valida")
    data.update(flags)


async def crea_lavoro(user, nome: str, indirizzo: str = "", telefono: str = "", note: str = "", lista: str = "prossimi",
                      data: str = "", appuntamento: str = "", nota_appuntamento: str = "", importo: float = 0):
    if not nome.strip():
        raise ValueError("Serve il nome del cliente")
    d = {"name": nome.strip(), "address": indirizzo, "phone": telefono, "notes": note, "date": data or _today(),
         "appointment_at": appuntamento or None, "appointment_note": nota_appuntamento, "amount": importo}
    _place(d, lista, data)
    c = await create_client(ClientCreate(**d), user)
    c = c if isinstance(c, dict) else c.model_dump()
    await _log(user, "Nuovo lavoro", f"{nome} → {lista}" + (f", appuntamento {appuntamento}" if appuntamento else ""), c["id"])
    return {"creato": _lavoro(c)}


async def modifica_lavoro(user, id: str, nome: Optional[str] = None, indirizzo: Optional[str] = None, telefono: Optional[str] = None,
                          aggiungi_nota: str = "", appuntamento: Optional[str] = None, nota_appuntamento: Optional[str] = None,
                          importo: Optional[float] = None, stato: Optional[str] = None, sposta_in: str = "", data: str = ""):
    c = await _job(user, id)
    changes = []
    for key, val, label in (("name", nome, "nome"), ("address", indirizzo, "indirizzo"), ("phone", telefono, "telefono"),
                            ("appointment_note", nota_appuntamento, "nota appuntamento"), ("amount", importo, "importo"), ("status", stato, "stato")):
        if val is not None:
            c[key] = val
            changes.append(f"{label}: {val}")
    if appuntamento is not None:
        c["appointment_at"] = appuntamento or None
        changes.append(f"appuntamento: {appuntamento or 'tolto'}")
    if aggiungi_nota.strip():
        c["notes"] = f"{(c.get('notes') or '').rstrip()}\n{aggiungi_nota.strip()}".strip()
        changes.append("nota aggiunta")
    if sposta_in:
        _place(c, sposta_in, data)
        changes.append(f"spostato in {sposta_in}" + (f" il {c['date']}" if sposta_in == "agenda" else ""))
    elif data:
        c["date"] = data
        changes.append(f"data: {data}")
    if not changes:
        raise ValueError("Nessuna modifica indicata")
    res = await update_client(id, ClientCreate(**c), user)
    await _log(user, "Lavoro modificato", f"{c.get('name')}: " + "; ".join(changes), id)
    return {"aggiornato": _lavoro(res), "modifiche": changes}


async def registra_pagamento(user, id: str, importo: float, tipo: str = "acconto", metodo: str = "", data: str = ""):
    if importo <= 0:
        raise ValueError("L'importo deve essere maggiore di zero")
    c = await _job(user, id)
    c.setdefault("payments", []).append(Payment(type=tipo, amount=importo, method=metodo, date=data or _today()).model_dump())
    res = await update_client(id, ClientCreate(**c), user)
    await _log(user, "Pagamento registrato", f"{c.get('name')}: € {importo:.2f} {tipo} {metodo}".strip(), id)
    return {"aggiornato": _lavoro(res)}


async def registra_visita_manutenzione(user, contratto_id: str, data: str = "", nota: str = ""):
    try:
        res = await add_visita(contratto_id, Visita(data=data or _today(), nota=nota), user)
    except HTTPException as e:
        raise ValueError(e.detail)
    await _log(user, "Visita manutenzione", f"{res.get('cliente')}: {data or _today()} {nota}".strip(), contratto_id)
    return {"contratto": res["cliente"], "ultima_visita": res["ultima_visita"], "prossima_visita": res["prossima_visita"]}


async def prepara_preventivo(user, cliente: str, righe: list, indirizzo: str = "", oggetto: str = "OFFERTA", note: str = "", lavoro_id: str = ""):
    if isinstance(righe, str):
        righe = righe.splitlines()
    righe = [str(r).strip() for r in righe if str(r).strip()]
    if not righe:
        raise ValueError("Servono le righe del preventivo")
    if lavoro_id:
        await _job(user, lavoro_id)
    p = {"id": uuid.uuid4().hex, "uid": user["uid"], "stato": "da_approvare", "created_at": now().isoformat(),
         "cliente": cliente.strip().upper(), "indirizzo": indirizzo.strip().upper(), "oggetto": oggetto.strip() or "OFFERTA",
         "righe": righe, "note": note, "lavoro_id": lavoro_id or None, "assistente": user.get("client_name", "")}
    await db.ai_proposte.insert_one(dict(p))
    await _log(user, "Bozza preventivo", f"{p['cliente']}: {len(righe)} righe", p["id"])
    return {"bozza": p["id"], "messaggio": "Bozza salvata. Il titolare la trova in Ufficio → Assistente IA, inserisce i prezzi e la approva."}


# ---------------- Catalogo ----------------

S, I, B = {"type": "string"}, {"type": "integer"}, {"type": "boolean"}
N = {"type": "number"}
LISTA = {"type": "string", "enum": ["prossimi", "in_attesa", "da_preventivare", "agenda", "da_fatturare"]}
RO = {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}
RW = {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False}
CONF = " Modifica l'agenda: riepiloga e chiedi conferma esplicita all'utente PRIMA di chiamarlo."


def _t(fn: Callable, title: str, desc: str, props: dict, req: list, ann: dict) -> dict:
    return {"fn": fn, "def": {"name": fn.__name__, "title": title, "description": desc, "annotations": {**ann, "title": title},
                              "inputSchema": {"type": "object", "properties": props, "required": req, "additionalProperties": False}}}


TOOLS = {t["def"]["name"]: t for t in [
    _t(cerca_lavori, "Cerca lavori", "Cerca lavori/clienti per nome, indirizzo, telefono o note. Restituisce id, lista, data, appuntamento, importi.",
       {"testo": S, "limite": I}, [], RO),
    _t(agenda, "Agenda e appuntamenti", "Lavori in agenda e appuntamenti in un intervallo di date (default: da oggi per 7 giorni). Restituisce anche la data di oggi.",
       {"dal": {**S, "description": "AAAA-MM-GG"}, "al": {**S, "description": "AAAA-MM-GG"}}, [], RO),
    _t(elenco_lavori, "Elenco lavori per lista", "Lavori di una lista: prossimi, in_attesa (materiali), da_preventivare, da_fatturare, da_incassare.",
       {"lista": {"type": "string", "enum": ["prossimi", "in_attesa", "da_preventivare", "da_fatturare", "da_incassare"]}}, ["lista"], RO),
    _t(scheda_lavoro, "Scheda lavoro", "Scheda completa di un lavoro: note, pagamenti, materiali, rilievi, preventivo collegato, documenti e contratti del cliente.",
       {"id": S}, ["id"], RO),
    _t(foto_lavoro, "Foto del lavoro", "Mostra le foto di un lavoro (max 6).", {"id": S, "max": I}, ["id"], RO),
    _t(cerca_preventivi, "Cerca preventivi", "Preventivi esistenti con righe e importi: usali anche come esempi di stile.", {"testo": S, "limite": I}, [], RO),
    _t(cerca_documenti, "Cerca documenti", "Pratiche impianto, dichiarazioni CE, registri di manutenzione, verifiche e rilievi sezionali.",
       {"testo": S, "tipo": {"type": "string", "enum": ["", "pratica", "ce", "manutenzione", "verifica", "rilievo"]}}, [], RO),
    _t(leggi_documento, "Leggi documento", "Contenuto completo di un documento o rilievo per id.", {"id": S}, ["id"], RO),
    _t(contratti_manutenzione, "Contratti di manutenzione", "Contratti con ultima e prossima visita; solo_in_scadenza = entro 15 giorni.",
       {"testo": S, "solo_in_scadenza": B}, [], RO),
    _t(crea_lavoro, "Crea lavoro", "Crea un nuovo lavoro in una lista (default prossimi) con eventuale appuntamento AAAA-MM-GGTHH:MM." + CONF,
       {"nome": S, "indirizzo": S, "telefono": S, "note": S, "lista": LISTA, "data": S, "appuntamento": S, "nota_appuntamento": S, "importo": N}, ["nome"], RW),
    _t(modifica_lavoro, "Modifica o sposta lavoro", "Modifica dati, appuntamento (stringa vuota per toglierlo), stato (preventivo|lavoro_eseguito) o sposta il lavoro in un'altra lista/data. Le note vengono solo aggiunte." + CONF,
       {"id": S, "nome": S, "indirizzo": S, "telefono": S, "aggiungi_nota": S, "appuntamento": S, "nota_appuntamento": S, "importo": N,
        "stato": {"type": "string", "enum": ["preventivo", "lavoro_eseguito"]}, "sposta_in": LISTA, "data": S}, ["id"], RW),
    _t(registra_pagamento, "Registra pagamento", "Aggiunge un pagamento a un lavoro." + CONF,
       {"id": S, "importo": N, "tipo": {"type": "string", "enum": ["acconto", "saldo", "altro"]},
        "metodo": {"type": "string", "enum": ["contanti", "pos", "bonifico", ""]}, "data": S}, ["id", "importo"], RW),
    _t(registra_visita_manutenzione, "Registra visita di manutenzione", "Segna eseguita una visita su un contratto: ricalcola la prossima scadenza." + CONF,
       {"contratto_id": S, "data": S, "nota": S}, ["contratto_id"], RW),
    _t(prepara_preventivo, "Prepara bozza di preventivo", "Salva una BOZZA (solo descrizioni, niente prezzi) che il titolare approva nell'agenda." + CONF,
       {"cliente": S, "indirizzo": S, "oggetto": S, "righe": {"type": "array", "items": S}, "note": S, "lavoro_id": S}, ["cliente", "righe"], RW),
]}


def _ok(rid, result) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _fail(rid, code: int, msg: str) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": msg}}


TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list}


def _check(schema: dict, args: dict):
    """Controllo leggero degli argomenti con messaggi chiari per l'assistente."""
    props = schema["properties"]
    for k, v in args.items():
        p = props.get(k)
        if p is None:
            raise ValueError(f"Argomento sconosciuto '{k}'. Ammessi: {', '.join(props)}")
        if p["type"] == "array" and isinstance(v, str):
            continue
        if not isinstance(v, TYPES[p["type"]]) or (p["type"] in ("integer", "number") and isinstance(v, bool)):
            raise ValueError(f"'{k}' deve essere di tipo {p['type']}")
        if "enum" in p and v not in p["enum"]:
            raise ValueError(f"'{k}' non valido: usa {' | '.join(x for x in p['enum'] if x) }")
        if p["type"] == "integer" and v < 1:
            raise ValueError(f"'{k}' deve essere almeno 1")
    missing = [r for r in schema["required"] if r not in args]
    if missing:
        raise ValueError(f"Mancano: {', '.join(missing)}")


async def _call(user: dict, name: str, args: dict) -> dict:
    tool = TOOLS.get(name)
    if not tool:
        return {"content": [{"type": "text", "text": f"Strumento sconosciuto: {name}"}], "isError": True}
    try:
        _check(tool["def"]["inputSchema"], args or {})
        out: Any = await tool["fn"](user, **(args or {}))
    except (ValueError, TypeError) as e:
        return {"content": [{"type": "text", "text": f"Errore: {e}"}], "isError": True}
    except Exception as e:
        log.exception("Strumento %s fallito", name)
        return {"content": [{"type": "text", "text": f"Errore interno ({type(e).__name__}), riprova"}], "isError": True}
    if isinstance(out, list):
        return {"content": out}
    return {"content": [{"type": "text", "text": json.dumps(out, ensure_ascii=False, default=str)}]}


async def _handle(user: dict, msg: dict) -> Optional[dict]:
    rid, method, params = msg.get("id"), msg.get("method", ""), msg.get("params") or {}
    if rid is None:
        return None
    if method == "initialize":
        v = params.get("protocolVersion")
        return _ok(rid, {"protocolVersion": v if v in VERSIONS else VERSIONS[1], "capabilities": {"tools": {"listChanged": False}},
                         "serverInfo": {"name": "agenda-italserrande", "title": "Agenda Italserrande", "version": "1.0.0"},
                         "instructions": INSTRUCTIONS})
    if method == "ping":
        return _ok(rid, {})
    if method == "tools/list":
        return _ok(rid, {"tools": [t["def"] for t in TOOLS.values()]})
    if method == "tools/call":
        return _ok(rid, await _call(user, params.get("name", ""), params.get("arguments") or {}))
    if method in ("resources/list", "prompts/list"):
        return _ok(rid, {method.split("/")[0]: []})
    return _fail(rid, -32601, f"Metodo non supportato: {method}")


@router.post("/mcp")
async def mcp(request: Request):
    user = await user_from_bearer(request)
    if not user:
        meta = f"{base_url(request)}/api/.well-known/oauth-protected-resource"
        return JSONResponse({"error": "unauthorized"}, status_code=401,
                            headers={"WWW-Authenticate": f'Bearer resource_metadata="{meta}", scope="agenda offline_access"'})
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(_fail(None, -32700, "JSON non valido"), status_code=400)
    if isinstance(body, list):
        out = [r for r in [await _handle(user, m) for m in body] if r]
        return JSONResponse(out) if out else Response(status_code=202)
    res = await _handle(user, body)
    return JSONResponse(res) if res else Response(status_code=202)


@router.get("/mcp")
async def mcp_get():
    return Response(status_code=405, headers={"Allow": "POST"})
