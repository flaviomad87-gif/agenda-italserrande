# Keep-alive del backend Render (versione "smart")

Il backend è deployato su **Render free tier** (`https://agenda-italserrande-api.onrender.com`). Il piano gratuito di Render dà **750 ore/mese totali** sull'intero workspace e mette i servizi a dormire dopo ~15 minuti di inattività.

> ⚠️ **Importante**: pingare un servizio 24/7 lo fa consumare ~744h/mese da solo. Con 2 servizi attivi 24/7 (~1.488h) si supera il limite e Render sospende tutto fino al mese successivo. Per questo motivo questo workflow **non è più 24/7** ma limitato agli orari di lavoro.

---

## 🟢 Setup attuale (file `.github/workflows/keepalive.yml`)

| Parametro | Valore |
|---|---|
| Servizio pingato | `agenda-italserrande-api` (servizio principale) |
| Giorni attivi | Lun–Sab |
| Orario (Italia) | 06:00 – 20:00 |
| Frequenza | Ogni 13 minuti |
| Lancio manuale | Sì (tab Actions → "Run workflow") |

### Consumi stimati

| Voce | Ore/mese |
|---|---|
| Backend principale (pingato) | ~364 |
| Email service (si sveglia on-demand) | ~30-50 |
| **Totale** | **~400 / 750** ✅ |

Margine libero: ~46%. Sicurezza anche se l'app viene usata di più del previsto.

### Consumi GitHub Actions

~325 min/mese, ben sotto il limite gratuito di 2.000 min/mese su repo privato.

---

## 🛠️ Come modificare gli orari

Apri `.github/workflows/keepalive.yml` e modifica la riga:

```yaml
- cron: "*/13 4-19 * * 1-6"
```

Sintassi: `minuti ore giorni-mese mesi giorni-settimana`

GitHub Actions cron è **in UTC**. Italia è UTC+1 (inverno) / UTC+2 (estate).

| Voglio in Italia | Metto in UTC |
|---|---|
| 06:00-20:00 Lun-Sab (attuale) | `*/13 4-19 * * 1-6` |
| 07:00-20:00 Lun-Ven | `*/13 5-19 * * 1-5` |
| 08:00-19:00 Lun-Ven (più stretto) | `*/13 6-18 * * 1-5` |
| Pingaggio H24 (rischioso!) | `*/13 * * * *` |

---

## ▶️ Come si attiva

1. **Push del repo su GitHub** (usa il bottone "Save to GitHub" nella chat di Emergent).
2. Su GitHub: **Actions** → "Keep Render backend awake" → primo run partirà al prossimo slot orario nel range configurato.
3. Per testare subito: **Actions → Keep Render backend awake → "Run workflow"** (bottone in alto a destra).

---

## ❓ Verifica rapida

```bash
curl -i https://agenda-italserrande-api.onrender.com/api/
```

Risposta attesa:
```
HTTP/2 200
content-type: application/json

{"message":"Agenda Italserrande API"}
```

Se torna 502 o impiega 30+ secondi → era addormentato (normale fuori orario di lavoro, o se il workflow non si è ancora attivato).

---

## 🆘 Se Render sospende di nuovo i servizi

Vai sulla dashboard Render → controlla la sezione **"Usage"** del workspace per vedere quante ore hai consumato. Se sei vicino al limite:

1. Riduci ulteriormente la finestra oraria (es. 8:00-18:00)
2. Oppure rimuovi il sabato (cron `* * 1-5` invece di `1-6`)
3. Oppure aggiungi una carta di credito su Render (ti dà 750h + paghi solo l'eccedenza)
