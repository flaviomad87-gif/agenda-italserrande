"""OAuth 2.1 (PKCE S256 + registrazione dinamica) per collegare un assistente IA all'agenda.
L'utente entra con email e password dell'agenda (Firebase) e autorizza il collegamento."""
import base64
import hashlib
import html
import logging
import os
import secrets
from datetime import timedelta
from typing import Optional
import re
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from ai_auth import base_url, issue_tokens, now, sha
from db import db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/oauth")
well_known = APIRouter()
CODE_TTL = timedelta(minutes=10)
MAX_FAILS = 5


def _as_meta(request: Request) -> dict:
    b = base_url(request)
    return {
        "issuer": b,
        "authorization_endpoint": f"{b}/api/oauth/authorize",
        "token_endpoint": f"{b}/api/oauth/token",
        "registration_endpoint": f"{b}/api/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["agenda", "offline_access"],
        "client_id_metadata_document_supported": True,
    }


def _pr_meta(request: Request) -> dict:
    b = base_url(request)
    return {
        "resource": f"{b}/api/mcp",
        "authorization_servers": [b],
        "scopes_supported": ["agenda", "offline_access"],
        "bearer_methods_supported": ["header"],
        "resource_name": "Agenda Italserrande",
    }


for _p in ("/.well-known/oauth-authorization-server", "/.well-known/openid-configuration",
           "/.well-known/oauth-authorization-server/api", "/.well-known/openid-configuration/api"):
    well_known.add_api_route(_p, _as_meta, methods=["GET"], include_in_schema=False)
for _p in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"):
    well_known.add_api_route(_p, _pr_meta, methods=["GET"], include_in_schema=False)


@router.post("/register")
async def register(request: Request):
    body = await request.json()
    uris = [u for u in body.get("redirect_uris", []) if isinstance(u, str) and u.startswith(("https://", "http://localhost", "http://127.0.0.1"))]
    if not uris:
        return JSONResponse({"error": "invalid_redirect_uri"}, status_code=400)
    client = {
        "client_id": secrets.token_urlsafe(16),
        "client_name": str(body.get("client_name") or "Assistente IA")[:80],
        "redirect_uris": uris,
        "created_at": now().isoformat(),
    }
    await db.ai_clients.insert_one(dict(client))
    return JSONResponse({**client, "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
                         "token_endpoint_auth_method": "none"}, status_code=201)


async def _client(client_id: str) -> Optional[dict]:
    doc = await db.ai_clients.find_one({"client_id": client_id}, {"_id": 0})
    if doc or not client_id.startswith("https://"):
        return doc
    host = urlparse(client_id).hostname or ""
    if host == "localhost" or host.endswith(".local") or "." not in host or re.fullmatch(r"[\d.:\[\]a-f]+", host):
        return None
    # Client ID Metadata Document: il client_id è un URL con i suoi dati
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            meta = (await c.get(client_id)).json()
    except Exception as e:
        log.warning("Metadati client non leggibili %s: %s", client_id, e)
        return None
    if meta.get("client_id") != client_id:
        return None
    return {"client_id": client_id, "client_name": str(meta.get("client_name") or "Assistente IA")[:80],
            "redirect_uris": meta.get("redirect_uris", [])}


def _page(req_id: str, client_name: str, error: str = "") -> HTMLResponse:
    err = f'<p class="err" data-testid="oauth-error">{html.escape(error)}</p>' if error else ""
    body = f"""<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collega assistente - Agenda Italserrande</title><style>
body{{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f3f5f9;color:#1c1c1a;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.card{{background:#fff;max-width:380px;width:100%;margin:16px;padding:28px;border-radius:20px;box-shadow:0 10px 30px rgba(0,40,100,.12)}}
h1{{font-size:20px;margin:0 0 6px}} p{{font-size:14px;line-height:1.5;color:#555}} ul{{font-size:13px;color:#333;padding-left:18px;line-height:1.6}}
label{{display:block;font-size:12px;font-weight:600;margin:14px 0 4px;color:#444}}
input{{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d5d9e0;border-radius:12px;font-size:15px}}
.row{{display:flex;gap:10px;margin-top:20px}} button{{flex:1;padding:12px;border-radius:12px;font-weight:700;font-size:15px;border:0;cursor:pointer}}
.ok{{background:#0047ab;color:#fff}} .no{{background:#eef1f6;color:#333}} .err{{color:#b42318;font-weight:600}}
.brand{{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#0047ab;font-weight:700;margin-bottom:10px}}</style></head>
<body><form class="card" method="post" action="/api/oauth/authorize" data-testid="oauth-form">
<div class="brand">Agenda Italserrande</div><h1>Collegare {html.escape(client_name)}?</h1>
<p>L'assistente potrà, chiedendoti conferma per ogni modifica:</p>
<ul><li>leggere appuntamenti, lavori, foto, preventivi, documenti e contratti</li>
<li>creare e spostare lavori e appuntamenti</li><li>registrare pagamenti e visite di manutenzione</li>
<li>preparare preventivi come bozze da approvare (senza prezzi)</li></ul>
<p>Non può cancellare nulla. Puoi scollegarlo quando vuoi da Ufficio → Assistente IA.</p>{err}
<input type="hidden" name="req" value="{html.escape(req_id)}">
<label>Email dell'agenda</label><input name="email" type="email" autocomplete="username" required data-testid="oauth-email">
<label>Password</label><input name="password" type="password" autocomplete="current-password" data-testid="oauth-password">
<div class="row"><button class="no" name="action" value="deny" formnovalidate data-testid="oauth-deny">Annulla</button>
<button class="ok" name="action" value="allow" data-testid="oauth-allow">Autorizza</button></div></form></body></html>"""
    return HTMLResponse(body, headers={"X-Frame-Options": "DENY", "Cache-Control": "no-store"})


def _bad(msg: str) -> HTMLResponse:
    return HTMLResponse(f"<p style='font-family:sans-serif;padding:24px'>{html.escape(msg)}</p>", status_code=400)


@router.get("/authorize")
async def authorize(
    request: Request, client_id: str = "", redirect_uri: str = "", response_type: str = "", state: str = "",
    code_challenge: str = "", code_challenge_method: str = "", scope: str = "", resource: str = "",
):
    client = await _client(client_id)
    if not client:
        return _bad("Applicazione non riconosciuta.")
    if redirect_uri not in client["redirect_uris"]:
        return _bad("Indirizzo di ritorno non valido.")
    if response_type != "code" or code_challenge_method != "S256" or not code_challenge:
        return RedirectResponse(f"{redirect_uri}?{urlencode({'error': 'invalid_request', 'state': state})}", 302)
    req_id = secrets.token_urlsafe(16)
    await db.ai_oauth_requests.insert_one({
        "id": req_id, "client_id": client_id, "client_name": client["client_name"], "redirect_uri": redirect_uri,
        "state": state, "code_challenge": code_challenge, "scope": scope, "exp": (now() + CODE_TTL).isoformat(),
        "exp_at": now() + CODE_TTL,
    })
    return _page(req_id, client["client_name"])


async def _firebase_login(email: str, password: str) -> Optional[dict]:
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={os.environ['FIREBASE_WEB_API_KEY']}"
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json={"email": email, "password": password, "returnSecureToken": True})
    if r.status_code != 200:
        return None
    d = r.json()
    return {"uid": d["localId"], "email": d.get("email", email)}


@router.post("/authorize")
async def authorize_submit(req: str = Form(...), action: str = Form(...), email: str = Form(""), password: str = Form("")):
    pend = await db.ai_oauth_requests.find_one({"id": req}, {"_id": 0})
    if not pend or pend["exp"] < now().isoformat():
        return _bad("Richiesta scaduta: ricomincia il collegamento dall'assistente.")
    back = pend["redirect_uri"]
    if action != "allow":
        await db.ai_oauth_requests.delete_one({"id": req})
        return RedirectResponse(f"{back}?{urlencode({'error': 'access_denied', 'state': pend['state']})}", 302)
    mail = email.strip().lower()
    if await db.ai_login_fail.count_documents({"email": mail}) >= MAX_FAILS:
        return _page(req, pend["client_name"], "Troppi tentativi: riprova tra 15 minuti.")
    user = await _firebase_login(mail, password)
    if not user:
        await db.ai_login_fail.insert_one({"email": mail, "exp_at": now() + timedelta(minutes=15)})
        return _page(req, pend["client_name"], "Email o password non corretti.")
    code = secrets.token_urlsafe(32)
    await db.ai_oauth_codes.insert_one({
        "code_hash": sha(code), "uid": user["uid"], "email": user["email"], "client_id": pend["client_id"],
        "client_name": pend["client_name"], "redirect_uri": back, "code_challenge": pend["code_challenge"],
        "exp": (now() + CODE_TTL).isoformat(), "exp_at": now() + CODE_TTL,
    })
    await db.ai_oauth_requests.delete_one({"id": req})
    return RedirectResponse(f"{back}?{urlencode({'code': code, 'state': pend['state']})}", 302)


def _err(code: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": code}, status_code=status, headers={"Cache-Control": "no-store"})


@router.post("/token")
async def token(
    grant_type: str = Form(...), code: str = Form(""), redirect_uri: str = Form(""), client_id: str = Form(""),
    code_verifier: str = Form(""), refresh_token: str = Form(""),
):
    if grant_type == "authorization_code":
        doc = await db.ai_oauth_codes.find_one_and_delete({"code_hash": sha(code)})
        if not doc or doc["exp"] < now().isoformat() or doc["redirect_uri"] != redirect_uri or (client_id and doc["client_id"] != client_id):
            return _err("invalid_grant")
        challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).rstrip(b"=").decode()
        if challenge != doc["code_challenge"]:
            return _err("invalid_grant")
        return JSONResponse(await issue_tokens(doc["uid"], doc["email"], doc["client_id"], doc["client_name"]),
                            headers={"Cache-Control": "no-store"})
    if grant_type == "refresh_token":
        doc = await db.ai_tokens.find_one({"refresh_hash": sha(refresh_token), "revoked": False}, {"_id": 0})
        if not doc or doc["refresh_exp"] < now().isoformat() or (client_id and doc["client_id"] != client_id):
            return _err("invalid_grant")
        return JSONResponse(await issue_tokens(doc["uid"], doc["email"], doc["client_id"], doc["client_name"], doc["id"]),
                            headers={"Cache-Control": "no-store"})
    return _err("unsupported_grant_type")
