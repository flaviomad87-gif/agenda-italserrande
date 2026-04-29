# Keep-alive del backend Render

Il backend è deployato su **Render free tier** (`https://agenda-italserrande-api.onrender.com`) e si addormenta dopo ~15 minuti di inattività. Il primo risveglio dopo lo sleep richiede 30-60 secondi, durante i quali l'app sembra "rotta".

Per evitarlo servono **ping periodici** dall'esterno. Ti lascio due opzioni — basta sceglierne una.

---

## Opzione 1 ⭐ — cron-job.org (consigliato, gratis, 2 minuti)

Servizio esterno gratuito. Non tocca il codice, niente account dev necessari.

1. Vai su **https://cron-job.org** → "Sign up" (basta una email).
2. Verifica l'email e accedi.
3. Click su **"CREATE CRONJOB"** in alto a destra.
4. Compila:
   - **Title**: `Agenda Italserrande – keep alive`
   - **URL**: `https://agenda-italserrande-api.onrender.com/api/`
   - **Schedule**:
     - **Every**: `13 minutes` (oppure scegli "Custom" → minuti `*/13`)
   - **Notifications** (opzionale):
     - "Notify on failure" → ON così se Render cade ti arriva una mail
   - Lascia tutto il resto al default (GET, no auth).
5. **CREATE**. Fatto. Vedi nel dashboard quando ha pingato l'ultima volta e il tempo di risposta.

> **Why 13 minuti?** Render addormenta dopo 15 min — 13 lascia un margine di sicurezza ma riduce gli sprechi.

---

## Opzione 2 — GitHub Action (vive nel repo)

Ho già creato il file `.github/workflows/keepalive.yml`. Si attiva da solo appena fai push del repo su GitHub. Schedule: ogni 13 minuti.

### Pro/Contro
- ✅ Vive insieme al codice, version-controlled
- ✅ Gratis su repo **pubblico** (minuti illimitati)
- ⚠️ Su repo **privato**: ~110 run/giorno × ~10s = ~5.500 min/mese → **supera il limite gratuito di 2.000 min/mese**. In quel caso usa l'Opzione 1.

### Come attivarlo
1. Push del repo su GitHub (puoi usare il bottone "Save to GitHub" nella chat di Emergent).
2. Su GitHub: **Actions tab** → vedrai il workflow "Keep Render backend awake" → primo run partirà al prossimo `*/13`.
3. Per testarlo subito: Actions → Keep Render backend awake → "Run workflow".

---

## Verifica rapida

Per controllare se Render è sveglio in qualunque momento, basta:

```bash
curl -i https://agenda-italserrande-api.onrender.com/api/
```

Risposta attesa:

```
HTTP/2 200
content-type: application/json

{"message":"Agenda Italserrande API"}
```

Se torna 502 o impiega 30+ secondi → era addormentato. Dopo che il keep-alive è attivo, dovresti sempre vedere risposta < 1 secondo.
