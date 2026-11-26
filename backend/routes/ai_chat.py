"""Assistente IA dentro l'agenda: chat con Claude (Haiku o Sonnet) con la chiave Anthropic dell'utente.
Usa gli stessi strumenti del collegamento esterno; le modifiche partono solo dopo il tocco su Conferma."""
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Literal, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai_auth import now
from db import db
from firebase_auth import get_current_user
from routes.ai_mcp import CONF, INSTRUCTIONS, ROME, TOOLS, _call

log = logging.getLogger(__name__)
router = APIRouter(prefix="/assistente")

# Prezzi Anthropic in $ per milione di token (input, output, lettura cache, scrittura cache 5 min)
MODELS = {
    "haiku": {"id": "claude-haiku-5-5", "label": "Haiku 5.5", "price": (0.10, 0.50, 0.01, 0.125)},
    "sonnet": {"id": "claude-sonnet-5-5", "label": "Sonnet 5.5", "price": (2.00, 10.00, 0.10, 2.50)},
}
MAX_ROUNDS = 8
SYSTEM_EXTRA = """
Sei dentro l'app dell'agenda. Rispondi breve, con elenchi puntati quando servono. Data e ora attuali: {now}."""


CHAT_CONF = " Chiamalo direttamente: l'utente conferma o annulla con un pulsante nell'app."
CHAT_RULE = """- Per le modifiche (crea_lavoro, modifica_lavoro, registra_pagamento, registra_visita_manutenzione,
  prepara_preventivo) chiama subito lo strumento senza chiedere conferma a parole: l'app mostra all'utente un riquadro
  Conferma/Annulla e lo esegue solo dopo il suo tocco. Chiedi prima solo se mancano dati indispensabili."""
CHAT_INSTRUCTIONS = re.sub(r"- Prima di OGNI strumento.*?dell'utente\.", CHAT_RULE, INSTRUCTIONS, flags=re.S)


def _tools_for_claude() -> list:
    defs = [{"name": t["def"]["name"], "description": t["def"]["description"].replace(CONF, CHAT_CONF),
             "input_schema": t["def"]["inputSchema"]} for t in TOOLS.values()]
    defs[-1]["cache_control"] = {"type": "ephemeral"}
    return defs


TOOL_DEFS = _tools_for_claude()
WRITE = {n for n, t in TOOLS.items() if not t["def"]["annotations"]["readOnlyHint"]}


def _cost(model: str, u) -> float:
    pi, po, pr, pw = MODELS[model]["price"]
    return (u.input_tokens * pi + u.output_tokens * po + (u.cache_read_input_tokens or 0) * pr
            + (u.cache_creation_input_tokens or 0) * pw) / 1_000_000


async def _spend(uid: str, usd: float):
    month = datetime.now(ROME).strftime("%Y-%m")
    await db.ai_settings.update_one({"uid": uid}, {"$inc": {"speso": usd, f"mesi.{month}": usd}}, upsert=True)


def _credito_out(s: Optional[dict]) -> dict:
    s = s or {}
    caricato, speso, soglia = s.get("caricato", 0.0), s.get("speso", 0.0), s.get("soglia", 2.0)
    residuo = round(caricato - speso, 4)
    month = datetime.now(ROME).strftime("%Y-%m")
    return {"caricato": caricato, "speso": round(speso, 4), "residuo": residuo, "soglia": soglia,
            "speso_mese": round(s.get("mesi", {}).get(month, 0.0), 4), "impostato": caricato > 0,
            "avviso": caricato > 0 and residuo <= soglia, "esaurito": caricato > 0 and residuo <= 0,
            "chiave": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@router.get("/credito")
async def credito(user=Depends(get_current_user)):
    return _credito_out(await db.ai_settings.find_one({"uid": user["uid"]}, {"_id": 0}))


class CreditoIn(BaseModel):
    ricarica: float = Field(0, ge=0, le=10000)
    soglia: float = Field(2, ge=0, le=1000)
    azzera: bool = False


@router.put("/credito")
async def set_credito(p: CreditoIn, user=Depends(get_current_user)):
    """ricarica: aggiunge credito caricato su Anthropic; azzera: riparte da zero con il nuovo importo."""
    upd: dict = {"$set": {"soglia": p.soglia}}
    if p.azzera:
        upd["$set"].update(caricato=p.ricarica, speso=0.0)
    elif p.ricarica:
        upd["$inc"] = {"caricato": p.ricarica}
    await db.ai_settings.update_one({"uid": user["uid"]}, upd, upsert=True)
    return _credito_out(await db.ai_settings.find_one({"uid": user["uid"]}, {"_id": 0}))


def _strip_images(messages: list) -> list:
    """Le foto restano solo nel turno in cui servono: in archivio diventano un segnaposto."""
    for m in messages:
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                if b.get("type") == "tool_result" and isinstance(b.get("content"), list):
                    b["content"] = [c if c.get("type") != "image" else {"type": "text", "text": "[foto mostrata]"} for c in b["content"]]
    return messages


def _visible(messages: list) -> list:
    out = []
    for m in messages:
        c = m["content"]
        if isinstance(c, str):
            out.append({"role": m["role"], "text": c})
        elif m["role"] == "assistant":
            txt = "\n".join(b["text"] for b in c if b.get("type") == "text").strip()
            if txt:
                out.append({"role": "assistant", "text": txt})
    return out


async def _exec(user: dict, name: str, args: dict) -> tuple:
    res = await _call(user, name, args)
    content = [{"type": "image", "source": {"type": "base64", "media_type": b["mimeType"], "data": b["data"]}} if b["type"] == "image" else b
               for b in res["content"]]
    return content, res.get("isError", False)


async def _run(chat: dict, user: dict, before: int) -> dict:
    """Ciclo con Claude finché risponde a parole o chiede una modifica da confermare."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "Chiave Anthropic non impostata sul server")
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model = chat["model"]
    system = [{"type": "text", "text": CHAT_INSTRUCTIONS + SYSTEM_EXTRA.format(now=datetime.now(ROME).strftime("%A %d/%m/%Y %H:%M")),
               "cache_control": {"type": "ephemeral"}}]
    cost = 0.0
    ok = False
    try:
        for _ in range(MAX_ROUNDS):
            resp = await client.messages.create(model=MODELS[model]["id"], max_tokens=2000, system=system, tools=TOOL_DEFS,
                                                messages=chat["messages"])
            c = _cost(model, resp.usage)
            cost += c
            await _spend(user["uid"], c)
            chat["messages"].append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in resp.content]})
            uses = [b for b in resp.content if b.type == "tool_use"]
            if resp.stop_reason != "tool_use" or not uses:
                break
            results, pending = [], []
            for u in uses:
                if u.name in WRITE:
                    pending.append({"id": u.id, "name": u.name, "input": u.input, "title": TOOLS[u.name]["def"]["title"]})
                else:
                    content, err = await _exec(user, u.name, u.input)
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": content, "is_error": err})
            if pending:
                chat["pending"] = {"results": results, "actions": pending}
                break
            chat["messages"].append({"role": "user", "content": results})
        ok = True
    except anthropic.AuthenticationError:
        raise HTTPException(502, "La chiave Anthropic non è valida: sostituiscila")
    except anthropic.RateLimitError:
        raise HTTPException(429, "Troppe richieste ad Anthropic: riprova tra un minuto")
    except anthropic.BadRequestError as e:
        msg = str(e)
        if "credit" in msg.lower():
            raise HTTPException(402, "Credito Anthropic esaurito: ricarica su console.anthropic.com")
        log.warning("Richiesta Anthropic rifiutata: %s", msg)
        raise HTTPException(502, "Anthropic ha rifiutato la richiesta, riprova")
    except anthropic.APIError as e:
        log.warning("Errore Anthropic: %s", e)
        raise HTTPException(502, "Assistente non raggiungibile al momento, riprova")
    finally:
        if not ok:
            # Errore: la conversazione torna com'era, senza mezze risposte
            chat["messages"], chat["pending"] = chat["messages"][:before], None
        chat["updated_at"] = now().isoformat()
        chat["costo"] = round(chat.get("costo", 0) + cost, 5)
        await db.ai_chats.update_one({"id": chat["id"]}, {"$set": {**chat, "messages": _strip_images(chat["messages"])}}, upsert=True)
    return await _out(chat, user["uid"], cost)


async def _out(chat: dict, uid: str, cost: float = 0.0) -> dict:
    return {"id": chat["id"], "model": chat["model"], "titolo": chat.get("titolo", ""), "messaggi": _visible(chat["messages"]),
            "in_attesa": (chat.get("pending") or {}).get("actions"), "costo_risposta": round(cost, 5), "costo_chat": chat.get("costo", 0),
            "credito": _credito_out(await db.ai_settings.find_one({"uid": uid}, {"_id": 0}))}


def _me(user: dict, model: str) -> dict:
    return {**user, "client_name": f"Chat agenda · {MODELS[model]['label']}"}


class ChatIn(BaseModel):
    id: Optional[str] = None
    model: Literal["haiku", "sonnet"] = "haiku"
    testo: str = Field(..., min_length=1, max_length=4000)


@router.post("/chat")
async def chat_send(p: ChatIn, user=Depends(get_current_user)):
    chat = await db.ai_chats.find_one({"id": p.id, "uid": user["uid"]}, {"_id": 0}) if p.id else None
    if p.id and not chat:
        raise HTTPException(404, "Conversazione non trovata")
    if chat and chat.get("pending"):
        raise HTTPException(409, "Prima conferma o annulla l'operazione in sospeso")
    chat = chat or {"id": uuid.uuid4().hex, "uid": user["uid"], "created_at": now().isoformat(), "messages": [], "titolo": p.testo[:60], "costo": 0}
    chat["model"] = p.model
    before = len(chat["messages"])
    chat["messages"].append({"role": "user", "content": p.testo})
    return await _run(chat, _me(user, p.model), before)


class ConfermaIn(BaseModel):
    ok: bool


@router.post("/chat/{cid}/conferma")
async def chat_confirm(cid: str, p: ConfermaIn, user=Depends(get_current_user)):
    chat = await db.ai_chats.find_one_and_update({"id": cid, "uid": user["uid"], "pending": {"$ne": None}}, {"$set": {"pending": None}})
    if not chat or not chat.get("pending"):
        raise HTTPException(404, "Nessuna operazione da confermare")
    chat.pop("_id", None)
    pend, me = chat["pending"], _me(user, chat["model"])
    results = list(pend["results"])
    for a in pend["actions"]:
        if p.ok:
            content, err = await _exec(me, a["name"], a["input"])
        else:
            content, err = [{"type": "text", "text": "L'utente ha toccato Annulla nel riquadro di conferma dell'app: l'operazione NON è stata eseguita e non è cambiato nulla. Prendine atto in una frase e chiedi se vuole cambiare qualcosa."}], False
        results.append({"type": "tool_result", "tool_use_id": a["id"], "content": content, "is_error": err})
    chat["pending"] = None
    chat["messages"].append({"role": "user", "content": results})
    return await _run(chat, me, len(chat["messages"]))


@router.get("/chat")
async def chat_list(user=Depends(get_current_user)):
    return await db.ai_chats.find({"uid": user["uid"]}, {"_id": 0, "id": 1, "titolo": 1, "model": 1, "updated_at": 1, "costo": 1}).sort("updated_at", -1).to_list(15)


@router.get("/chat/{cid}")
async def chat_get(cid: str, user=Depends(get_current_user)):
    chat = await db.ai_chats.find_one({"id": cid, "uid": user["uid"]}, {"_id": 0})
    if not chat:
        raise HTTPException(404, "Conversazione non trovata")
    return await _out(chat, user["uid"])
