# Agenda Italserrande — PRD

## Original Problem Statement (verbatim)
> Dobbiamo creare un app che utilizzerò da mobile e anche da pc. Deve essere collegato da mail/password con firebase. E lapp di cui ho bisogno è che replichi un agenda che utilizzerò per lavoro, ovviamente deve essere giornaliera. Dentro ogni giorno devo avere modo di scrivere il nome del cliente, l'indirizzo, il numero di telefono e altre info che lo riguardano. Segnare ad ogni cliente se sia preventivo o lavoro eseguito e di segnare la modalità di pagamento effettuato così che a fine mese quando chiudo i conti riesco facilmente a leggere. Devo aver modo di segnare se i miei operai hanno preso acconti. Poi una sezione dove scrivo le spese fisse che ho, sia in contanti che dal conto aziendale. Design pulito e poso stressante alla vista. Intanto fai la prima bozza poi procediamo con altre modifiche. Ed ovviamente devo poter scaricarlo come applicazione, quindi PWA

## User Persona
Small-business owner (contractor / Italserrande) doing field work; needs a fast, calm tool to log clients, jobs, payments, worker advances and fixed expenses on mobile and desktop.

## Architecture
- **Frontend**: React (CRA + craco), Tailwind, shadcn/ui, Firebase Web SDK (Auth), react-router, date-fns, lucide-react. PWA (manifest + service worker + icons).
- **Backend**: FastAPI, Motor (MongoDB async), Firebase Admin SDK for ID-token verification (Bearer auth on every /api/* route).
- **DB**: MongoDB collections — `clients`, `expenses`, `advances`. Each doc carries `user_id` (Firebase uid).

## Core Requirements (static)
1. Firebase email/password auth (login, register, password reset, persistent session).
2. Daily agenda: clients per day with name, address, phone, notes, status (preventivo / lavoro_eseguito), payment method (contanti / pos / bonifico), amount.
3. Worker advances per day: free worker name + amount.
4. Fixed expenses: free category, amount, source (contanti / conto_aziendale).
5. Monthly summary: incassi by method, total spese by source, total advances, balance, total preventivi.
6. PWA installable, mobile + desktop responsive.
7. Italian UI, calm warm minimalist design.

## Implemented (2026-02 — Initial MVP)
- Backend: 12 endpoints under /api (clients, expenses, advances + summary) all gated by Firebase ID token, scoped per user.
- Frontend pages: Login, Register, Agenda, Spese, Riepilogo, Profilo + AppShell with mobile bottom nav and desktop sidebar.
- Reusable form dialogs (Client/Advance/Expense) with delete actions.
- DateNavigator with shadcn Calendar popover.
- PWA manifest + service worker + 192/512 icons.
- Tested end-to-end: 100% backend, 100% frontend pass.

## Backlog (P1)
- Search/filter clients by name across months.
- Export monthly summary as PDF/CSV.
- Client phone tap-to-call already wired; add tap-to-navigate (maps) on address.
- Multiple workers preset + acconti history per worker.
- Charts on Riepilogo (monthly trend).

## P2
- Push notifications for unpaid quotes ("preventivo aperto > 30 giorni").
- Multi-tenant / collaboratori invite.
- Photo attachments per cliente (object storage).

## Test Credentials
See `/app/memory/test_credentials.md`. Tests dynamically create Firebase users per run.

## Iteration 2 — 2026-04 (Feature Update)
Implemented:
- **Ricerca clienti** (GET /api/clients/search): cerca per nome / indirizzo / telefono, case-insensitive, max 50 risultati, ordinati per data desc. Barra di ricerca in cima alla pagina Agenda con dropdown live (debounce 250ms). Click su un risultato → naviga al giorno del cliente e apre il dialog di modifica.
- **Acconti per operaio** (GET /api/advances/by-worker?month=YYYY-MM): aggregazione mensile per worker_name (totale, conteggio, ultima data). Nuova sezione in Riepilogo che si "resetta" naturalmente all'inizio di ogni mese.

Testing: 20/20 backend test pass, frontend e2e 100%.

## Iteration 3 — 2026-02 (Feature Update — "Da incassare")
Implemented:
- **Endpoint `GET /api/clients/unpaid`**: ritorna i clienti con saldo aperto, ordinati dalla data più vecchia. Logica: include lavori eseguiti senza pagamenti, lavori con pagamenti parziali e preventivi che hanno ricevuto almeno un acconto; esclude preventivi vuoti e lavori legacy considerati saldati. Aggiunge campi calcolati `to_collect`, `paid`, `balance`.
- **Pagina `/incassi`** (`Incassi.jsx`): elenco clienti da incassare con totale aperto, conteggio, pill "X giorni in attesa" colorata per severità (>30g warn, >60g danger), CTA "Sollecita WhatsApp", click → apre il `ClientFormDialog` per registrare il pagamento.
- **Voce di menu "Da incassare"** in sidebar e bottom-nav con badge contatore live (refresh ogni 60s + on focus + post-save).
- **Indicatore "giorni in attesa"** sulla card cliente in Agenda (visibile solo per saldi aperti ≥1 giorno, con stessa codifica colore).
- Nuovi helper `daysSince` e `computeClientBalance` in `lib/utils.js` (single source of truth lato frontend).

Testing: 31/31 pytest backend pass (5 nuovi test su scenari unpaid + isolamento utente), frontend e2e 100% su flow registrazione → /incassi vuota → seeding lavoro → badge/totali/pill aggiornati → click → dialog.

## Iteration 4 — 2026-02 (Feature Update — "Spese fornitura per cliente")
Implemented:
- **Modello `Material`** + campo `materials: List[Material]` su `ClientBase` (id, description, amount, supplier, source contanti/conto_aziendale, date, notes).
- **`GET /api/summary`** ora restituisce `total_materials`, `materials_by_source` e bilancio aggiornato: `balance = total_incassi - total_spese - total_advances - total_materials`.
- **`GET /api/clients/unpaid`** aggiunge `materials_total` e `expected_margin` per ogni item (margine = imponibile − materiali).
- **`MaterialsList.jsx`** componente in stile `PaymentsList`: descrizione + importo + fornitore + sorgente (contanti/conto), totale e margine atteso live.
- **`ClientFormDialog`** integra la sezione "Spese fornitura / materiali" dopo i pagamenti.
- **`Agenda.jsx`** card cliente: nuova riga "Margine €X (Y%)" visibile quando ci sono materiali.
- **`Incassi.jsx`**: per ogni cliente da incassare mostra anche il margine atteso.
- **`Riepilogo.jsx`**: riga separata "Spese fornitura clienti" nel P&L e nella sezione Uscite con breakdown per sorgente (contanti/conto). Totale uscite include i materiali.

Testing: 41/41 pytest backend pass (10 nuovi test materials), frontend e2e 100% verificato (creazione, persistenza, rimozione live, badge su Agenda/Incassi/Riepilogo).

## Backlog (P1) — aggiornato
- Export Riepilogo mensile in PDF/CSV.
- Tap-to-maps sull'indirizzo cliente.
- Storico annuale per operaio (breakdown mese per mese).
- Indicatore "vs mese precedente" (+/- %) nel dashboard P&L.

## Refactoring futuro
- Split di `server.py` (>500 righe) in `routes/clients.py`, `routes/expenses.py`, `routes/advances.py`.
- Considerare un response model Pydantic dedicato per `/clients/unpaid`.
