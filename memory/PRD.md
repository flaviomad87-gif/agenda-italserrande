# Agenda Italserrande — PRD

## Problema originale
App per gestire agenda lavori, clienti, spese e acconti operai di una piccola impresa italiana di serrande/serramenti. Frontend React + FastAPI backend + MongoDB, hostato su Render free tier.

## Architettura
- Frontend: React (CRA), Tailwind, shadcn/ui, Firebase Auth
- Backend: FastAPI + Motor (MongoDB async)
- Hosting: Render free tier (750h/mese)
- Auth: Firebase ID Token (verificato server-side via `firebase_auth.py`)
- Offline-first: localStorage cache + coda offline + UUID idempotenti lato client

## Entità principali
- **Client** (lavoro/preventivo per una data) — supporta pending (backlog "Prossimi lavori"), payments[], materials[], IVA, ritenuta
- **Expense** (spesa fissa, mensile)
- **Advance** (acconto operaio per giorno)
- **RecurringExpense** (template spesa ricorrente)

## Pagine
- Agenda (giornaliera/settimanale)
- Prossimi Lavori (backlog pending)
- Incassi (clienti con saldo aperto)
- Spese (fisse mensili)
- Riepilogo (consuntivi mensili/annuali)
- Profilo

## Modifiche recenti

### Feb 2026 — Salvataggio ottimistico (CR slowness)
**Problema:** Render free tier va in sleep dopo 15 min → primo POST/PUT impiega 30-60s. UX percepita pessima.
**Fix:** Tutti i dialog di salvataggio (Client, Expense, Advance) ora chiudono il dialog e aggiornano la lista IMMEDIATAMENTE, poi inviano la richiesta in background. Su errore reale: toast + rollback dell'item ottimistico per le creazioni.
- File: `frontend/src/components/ClientFormDialog.jsx`, `ExpenseFormDialog.jsx`, `AdvanceFormDialog.jsx`, `frontend/src/lib/api.js` (export `newUUID`), `frontend/src/pages/Agenda.jsx` (upsert + onError per advance)
- Backend già idempotente (POST controlla id esistente)

### Feb 2026 — Keep-Alive Render ottimizzato
**Problema:** GitHub Action pingava 24/7 + cron-job.org → 750h Render bruciate, servizi sospesi.
**Fix:** `.github/workflows/keepalive.yml` aggiornato per pingare SOLO il main backend, Lun-Sab 6:00-20:00 IT (~364h/mese). Email backend lasciato on-demand.
- Documentazione: `/app/DEPLOY_KEEPALIVE.md`
- Utente deve mantenere `cron-job.org` DISABILITATO per evitare doppio ping

### Feb 2026 — Vista settimanale appuntamenti
**Richiesta:** poter vedere "dall'alto" tutti gli appuntamenti della settimana.
**Fix:** nuovo dialog `WeekAppointmentsDialog` con griglia 7 colonne (Lun→Dom), navigazione ← / →, bottone "Vai a oggi". Mostra solo lavori con `appointment_at` fissato, aggregando `pending + awaiting + to-quote`. Ogni card mostra ora, nome, indirizzo (link Maps), importo.
- File: `frontend/src/components/WeekAppointmentsDialog.jsx` (nuovo)
- Wiring: `frontend/src/pages/ProssimiLavori.jsx` → pulsante outline "Vista settimana" (icona `CalendarRange`) accanto a *Stampa*
- data-testid: `open-week-view-button`, `week-appointments-dialog`, `week-prev`, `week-next`, `week-today`, `week-appt-{id}`

### Feb 2026 — Striscia settimana in Agenda (mini-preview)
**Richiesta:** mini-preview della settimana in cima ad Agenda; al click su un giorno si aprono gli appuntamenti di quel giorno.
**Correzione:** l'utente ha chiarito che voleva la funzionalità NEL dialog "Vista settimana" già presente in Prossimi lavori, non in Agenda. La striscia `WeekStrip` è stata rimossa da Agenda ed eliminata.
**Fix definitivo:** rese cliccabili le colonne giorno del `WeekAppointmentsDialog`: ogni colonna è ora un `<button>` che apre `DayAppointmentsDialog` con la lista completa degli appuntamenti di quel giorno (ora, nome, indirizzo Maps, telefono, nota, importo).
- File: `frontend/src/components/DayAppointmentsDialog.jsx` (nuovo), `frontend/src/components/WeekAppointmentsDialog.jsx` (modificato)
- data-testid: `week-day-col-{yyyy-MM-dd}`, `day-appointments-dialog`, `day-appt-{id}`

### Feb 2026 — Riepilogo nascosto dalla nav (temporaneo)
**Richiesta:** "Siccome continuano a non tornare i conti, eliminiamo la sezione riepilogo". Opzione scelta: solo nascondere dalla nav (codice preservato).
**Fix:** commentata la voce `/riepilogo` in `secondaryNav` di `AppShell.jsx`. La rotta è ancora servita (raggiungibile via URL diretto) e le API `/summary` e `/summary/year` restano attive. Per riabilitare basta rimuovere il commento.
- File: `frontend/src/layouts/AppShell.jsx` linea 35

### Feb 2026 — Verifica calcoli Riepilogo + fix bug materiali preventivi
**Richiesta:** "Devi controllare se i calcoli che esegue l'app siano corretti".
**Verifica iter14:** 143/143 PASS su tutti i test formula (scorporo IVA, ritenuta, acconti, materiali pro-quota, best/worst month, ecc.).
**BUG SCOPERTO IN ITER15 (dopo che l'utente ha fornito dati concreti):** in `_compute_summary` i materiali dei clienti **preventivo puro** (status≠lavoro_eseguito e senza pagamenti) venivano sommati in `total_materials` mentre il loro `amount` andava in `total_quotes` (non in imponibile). Risultato asimmetrico: il ricavo del preventivo non c'era ma il costo dei materiali sì, gonfiando la perdita mensile.
**Fix:** aggiunto guard nel loop materiali: `if not (is_executed or has_payments_c): continue`. I materiali di un preventivo entrano nel bilancio automaticamente non appena il preventivo diventa eseguito o riceve un acconto.
- File: `backend/server.py` linea 940-961
- Test: `/app/backend/tests/test_iter15_preventivo_materials.py` (9 test dedicati)
- Regressione: 152/152 PASS. Aggiornato 1 test legacy in `backend_test.py` che asseriva il vecchio comportamento buggato.

### Feb 2026 — Dettaglio mese cliccabile in Riepilogo annuale
**Richiesta:** cliccando su una card mese nel Riepilogo annuale, mostrare il dettaglio del mese.
**Fix:** ogni card mensile ora è un `<button>` che apre `MonthDetailsDialog` con: guadagno/perdita del mese, imponibile+IVA+ritenuta, spese fisse, materiali, acconti (promemoria), incassi per metodo (contanti/POS/bonifico), preventivi ancora aperti, conteggi lavori/spese/acconti. I dati sono già presenti nella response di `/api/summary/year` (nessuna chiamata aggiuntiva).
- File: `frontend/src/components/MonthDetailsDialog.jsx` (nuovo), `frontend/src/components/YearlyView.jsx` (card mensili convertite in button)
- data-testid: `year-month-open-{yyyy-MM}`, `month-details-dialog`, `month-details-balance`


## Backlog (P2)
- Notifica email automatica quando il GitHub Action fallisce N volte di fila
- Indicatore visivo "in sync..." per item ottimistici non ancora confermati dal server
- Possibilità di retry manuale dal toast di errore

## API endpoints chiave
- `POST/PUT/DELETE /api/clients[/{id}]`
- `GET /api/clients?date=YYYY-MM-DD` (esclude pending)
- `GET /api/clients/pending`
- `GET /api/clients/unpaid`
- `POST /api/clients/{id}/execute` (sposta da pending a agenda)
- `POST/PUT/DELETE /api/expenses[/{id}]`
- `POST /api/advances`, `GET /api/advances?date=...&worker=...`
- `GET /api/summary?month=YYYY-MM`

## Hosting
- Main API: `https://agenda-italserrande-api.onrender.com`
- Bulk email: `https://bulk-email-backend-kcny.onrender.com`
