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
