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

### Feb 2026 — Aggiunta clienti tramite dettatura vocale
**Richiesta:** poter creare nuovi clienti dettando i dati con la voce (utile in cantiere/auto). Campi: nome, indirizzo, telefono.
**Fix:** nuovo `VoiceClientDialog` a 3 step sequenziali:
1. "Dimmi il nome e cognome"
2. "Dimmi l'indirizzo"
3. "Dimmi il numero di telefono"

Ogni step ha: pulsante microfono grande (Parla/Ferma), area trascrizione live, input testuale di fallback, indicatore step precedenti, Avanti/Indietro.
Usa `SpeechRecognition` / `webkitSpeechRecognition` (lang="it-IT") — gratis, browser-native. Post-processing: capitalize sul nome, `cleanPhone()` sul telefono (solo cifre + eventuale +).
Al termine dei 3 step, apre `ClientFormDialog` pre-riempito con i 3 valori per la **preview obbligatoria**: l'utente rilegge, corregge se serve e schiaccia Salva.
**File:** `frontend/src/components/VoiceClientDialog.jsx` (nuovo), `frontend/src/pages/ProssimiLavori.jsx` (nuovo bottone "Voce" accanto a "Nuovo lavoro" + wiring `onComplete` a `ClientFormDialog`)
**Verifica:** `CI=true yarn build` PASS, screenshot mobile 390px zero overflow, `speechSupported: true` su Chromium.
**data-testid:** `voice-add-button`, `voice-client-dialog`, `voice-transcript-area`, `voice-mic-button`, `voice-text-input`, `voice-back-button`, `voice-next-button`
**Fallback browser non supportati:** messaggio esplicito in rosso "Usa Chrome recente su Android/desktop o Safari 14.5+ su iOS".

### Feb 2026 — Pagina Margine (guadagno mensile per metodo)
**Richiesta:** rimettere il resoconto che mostra il margine di guadagno mensile con somma dei margini di ogni lavoro eseguito, diviso tra pagamenti in contanti e pagamenti tracciabili (bonifico/POS).
**Fix:** nuova pagina `/margine` (voce hamburger "Margine", icona TrendingUp). Selettore mese/anno. Contenuto:
- Card totale grande: `+/- X.XXX,XX €` con formula esplicita "Imponibile (senza IVA) − Materiali"
- 2 card metodo: **Contanti** (verde) e **Bonifico / POS** (blu, con dettaglio Bonifico X · POS Y)
- Elenco compatto dei lavori del mese con nome, data e margine per riga
- Solo lavori con `status='lavoro_eseguito'`
**Attribuzione margine per metodo:** se `c.payments[]` ha metodi definiti, margine distribuito pro-quota; altrimenti tutto sul `c.payment_method` principale; fallback contanti.
**Riuso:** endpoint `GET /api/clients?month=YYYY-MM` esistente. Nessuna modifica backend.
**Verifica:** `CI=true yarn build` PASS, screenshot mobile 390px zero overflow, selettore mese/anno funzionante.
**File:** `frontend/src/pages/Margine.jsx` (nuovo), `frontend/src/App.js` (route), `frontend/src/layouts/AppShell.jsx` (nav)
**data-testid:** `nav-margine`, `margine-month-select`, `margine-year-select`, `margine-total-card`, `margine-method-contanti`, `margine-method-tracciabile`, `margine-row-{id}`

### Feb 2026 — Orario contrattuale come default nel dialog timbratura
**Richiesta:** all'apertura del dialog "Timbra ingresso/uscita" l'orario di default deve essere l'orario contrattuale (08:00 / 17:00) e non l'ora attuale. Serve anche poter modificare se attaccano prima o dopo.
**Fix:** aggiunti campi `default_clock_in` (default "08:00") e `default_clock_out` (default "17:00") al modello `Employee`. Il widget Agenda ora usa `emp.default_clock_in` / `emp.default_clock_out` come default nel dialog invece di `nowTime()`. Aggiunto pulsante rapido **"Adesso"** accanto al campo orario per timbrare l'ora attuale con un tap se serve. Configurazione dei default (ingresso/uscita/pausa) direttamente dal dialog "Dipendenti" con onBlur.
**Retrocompat:** dipendenti già presenti in DB senza questi campi ricevono 08:00 / 17:00 come default via Pydantic.
**File:** `backend/server.py` (Employee/EmployeeCreate/EmployeeUpdate), `frontend/src/components/TimeTrackerWidget.jsx` (default da emp + pulsante Adesso), `frontend/src/pages/OreLavoro.jsx` (EmployeesDialog con 3 nuovi campi: Ingresso/Uscita/Pausa)
**Verifica:** `CI=true yarn build` PASS; curl end-to-end OK (GET restituisce 08:00/17:00, PUT `{"default_clock_in":"07:30","default_clock_out":"16:30"}` viene persistito e riletto correttamente).
**data-testid:** `emp-in-{id}`, `emp-out-{id}`, `emp-break-{id}`, `tracker-now-{id}`

### Feb 2026 — Fix build Vercel (react-hooks/exhaustive-deps)
**Bug:** deploy Vercel del frontend falliva con `Failed to compile` su `TimeTrackerWidget.jsx:45` e `OreLavoro.jsx:54` — `useEffect has missing dependency 'refresh'`. In CRA con `CI=true` i warning ESLint diventano errori.
**Fix:** `refresh` wrappato in `useCallback` con deps memo-stabili (`[today]` per il widget, `[firstDay, lastDay]` per la pagina). `useEffect` ora ha `[refresh]` come dep e non triggera loop. Rimosso `monthKey` inutilizzato.
**Verifica:** `CI=true yarn build` → `Compiled successfully`. Testing agent iter21 → 7/7 PASS, network call counting conferma nessun loop (1 chiamata per mount + 1 per cambio filtro).
**File:** `frontend/src/components/TimeTrackerWidget.jsx`, `frontend/src/pages/OreLavoro.jsx`

### Feb 2026 — Ore Lavoro (banca ore dipendenti)
**Richiesta:** tracking ore lavoro per 2 dipendenti (Alfonso Pomponio + Bruno Pucci) con pulsante unico ingresso/uscita in Agenda, modificabile a mano. Base 8h/giorno con 1h pausa. Pagina hamburger `/ore-lavoro` con banca ore + calendario mensile + stampa report. Ore configurabili per dipendente.
**Backend:** modelli `Employee` (name, daily_hours, default_break_minutes, sort_order, active) e `TimeEntry` (employee_id, date, clock_in, clock_out, break_minutes). Endpoint CRUD `/api/employees` e `/api/time-entries` con auto-seed alla prima GET (crea Alfonso e Bruno). Filtri per `date`, `from_date/to_date`, `employee_id`. Scoping stretto per user_id.
**Frontend:**
- `TimeTrackerWidget` in cima Agenda: stato oggi per ogni dipendente ("A casa" / "Al lavoro da HH:MM" / "HH:MM–HH:MM · Xh Y'") + pulsanti Timbra ingresso/uscita → dialog con checkbox e time picker per ciascuno
- `OreLavoro.jsx` pagina `/ore-lavoro`: banca ore per dipendente (delta cumulativo mese), calendario giorno-per-giorno editabile inline, pulsante Stampa (layout diario B/N), dialog gestione dipendenti (aggiungi/rinomina/cambia ore base/rimuovi)
- Utility `lib/hours.js`: workedMinutes, dayDelta, formatMinutes, isoToTime, buildIso, employeeStatusToday
- Voce nav "Ore Lavoro" (icona BriefcaseBusiness) in secondaryNav
**Testing:**
- iter19: 15/15 backend PASS, T6-T13 frontend PASS. 3 defect trovati (clear Uscita ignorato, mobile overflow, PUT storm su rename).
- iter20 (fix retest): 21/21 backend PASS, 100% frontend PASS. Fix applicati:
  1. `PUT /api/time-entries` accetta null espliciti (rimosso `if v is not None`)
  2. Mobile CSS stacked su <640px (0 rows overflow su 390px)
  3. `EmployeesDialog` usa `defaultValue+onBlur` (0 PUT durante typing, 1 al blur)
**File nuovi:** `backend/server.py` (modelli+CRUD linee 1160-1360), `frontend/src/lib/hours.js`, `frontend/src/components/TimeTrackerWidget.jsx`, `frontend/src/pages/OreLavoro.jsx`
**Data-testid:** `time-tracker-widget`, `tracker-row-{id}`, `tracker-clock-in-button`, `tracker-clock-out-button`, `tracker-dialog`, `nav-ore-lavoro`, `ore-month-select`, `ore-year-select`, `ore-bank-{id}`, `ore-row-{empId}-{date}`, `ore-edit/save/delete/in/out-{empId}-{date}`, `employees-dialog`, `emp-name/hours/delete-{id}`, `emp-new-name/hours/submit`

### Feb 2026 — Pagina Clienti (rubrica lavori annuale)
**Richiesta:** nuova sezione "Clienti" con lista lavori eseguiti per anno, raggruppati per mese Gennaio → Dicembre, una riga per lavoro, ricerca nome/telefono, pulsante Stampa. Voce nel menu hamburger.
**Fix:** nuova pagina `/clienti` che fetch annuale via `GET /api/clients?from_date=YYYY-01-01&to_date=YYYY-12-31`, filtra `status=lavoro_eseguito`, raggruppa per MM. Ogni riga: data · nome (+ indirizzo) · telefono cliccabile (link tel:) · notes come lavoro eseguito · prezzo lordo (con IVA). Voce "Clienti" in `secondaryNav`. Riuso endpoint esistente, no modifiche backend.
- File: `frontend/src/pages/Clienti.jsx` (nuovo), `frontend/src/App.js` (route), `frontend/src/layouts/AppShell.jsx` (nav)
- CSS responsive: layout stacked su mobile (<640px, evita overflow orizzontale), griglia print-oriented su desktop e stampa
- data-testid: `nav-clienti`, `clienti-year-select`, `clienti-search-input`, `clienti-print-button`, `clienti-month-{MM}`, `clienti-row-{id}`
**Testing:** testing agent iter18 → 12/12 test funzionali PASS. Trovato bug responsive (colonna Prezzo overflow mobile) → fixato con media query <640px stacked; verifica mobile 390px con `docSW==vw==390`, `badRows=0`.

### Feb 2026 — Margine sempre visibile su card lavoro eseguito
**Bug segnalato:** su card di clienti con IVA e senza materiali (es. Fabrizio 158,60€ IVA 22%, Farmacia vigna clara 73,20€) l'utente vedeva solo l'importo lordo, non il margine di guadagno escluso IVA.
**Root cause:** in `Agenda.jsx` linea 315 il blocco margine aveva `if (materialsTotal <= 0) return null;` → nascondeva il margine quando non c'erano materiali (comune per lavori piccoli).
**Fix:** cambiata condizione in `if (c.status !== "lavoro_eseguito") return null;`. Ora il margine si mostra sempre per lavori eseguiti (anche con materiali=0, in quel caso Margine = imponibile). La riga "−X materiali" resta condizionale su materialsTotal > 0.
**File:** `frontend/src/pages/Agenda.jsx` linea 313-335
**Testing:** bug_testing_agent iter17 → verdict **fixed** (100% frontend). Verificati Fabrizio-like → "Margine 130,00 € (100%)", Farmacia-like → "Margine 60,00 € (100%)", cliente con materiali → "−300,00 € materiali · Margine 700,00 € (70%)", preventivi → blocco margine nascosto.

### Feb 2026 — Stampa archivio: fix colonne + orientamento libero
**Richiesta:** su stampa vera l'utente ha visto (1) colonna Pagamento vuota (tutti '—'), (2) mancano prezzo materiale e margine, (3) selezionando orientamento orizzontale la pagina viene tagliata a metà.
**Fix:**
- `paymentLabelOf(c)`: fallback su `c.payments[].method` (dedup + join `' + '`) quando `c.payment_method` è vuoto
- Aggiunte due nuove colonne **Mat.** (`computeMaterialsTotal`) e **Margine** (`c.amount − materialsTotal`)
- Rimosso `@page { size: A4 portrait }` hardcoded: ora rispetta la scelta utente dal dialog di stampa (portrait o landscape). Rimane solo `margin: 12mm 10mm`.
- `.archive-sheet` in stampa: `width: 100%` per adattarsi al foglio scelto
**File:** `frontend/src/pages/PrintArchive.jsx` (colonne + CSS)
**Testing:** testing agent iter16 → **10/10 PASS**. Verificati tutti gli scenari (fallback pagamento, mix contanti+bonifico, priorità payment_method, materiali/margine con segno negativo, no @page size, flusso continuo giorni).

### Feb 2026 — Stampa archivio lavori per mese
**Richiesta:** poter stampare tutti i lavori eseguiti divisi per mese, come un'agenda.
**Fix:** nuova pagina `/archivio/:month` che elenca i lavori eseguiti del mese. Redesign in stile **diario cartaceo**: raggruppamento giorno-per-giorno (solo giorni con lavori), intestazione ampia con numero + nome giorno + mese, sotto le righe lavoro (ora, nome cliente, indirizzo, nota, metodo pagamento, importo). Formato **A4 orizzontale** via `@page`, **bianco e nero** elegante in stampa (tutto forzato a #000), nessun totale in fondo. Riusa endpoint `GET /api/clients?month=YYYY-MM`.
- File: `frontend/src/pages/PrintArchive.jsx` (diario B/N landscape), `frontend/src/App.js` (route), `frontend/src/pages/Profilo.jsx` (card "Stampa archivio lavori")
- data-testid: `print-archive-card`, `archive-month-select`, `archive-year-select`, `open-archive-button`, `archive-print-button`, `archive-day-{yyyy-MM-dd}`, `archive-row-{id}`

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


### Feb 2026 — Nuova pagina "Fornitori" (riepilogo materiali per fornitore)
**Richiesta:** "una parte dove mi riassuma anche le spese che io inserisco del materiale su ogni lavoro. Così da saper quanto dovrei pagare ai fornitori a fine mese." Utente sceglie opzione B (pagina dedicata, senza toggle pagato/da pagare).
**Fix:**
- Backend: nuovo endpoint `GET /api/suppliers/summary?month=YYYY-MM` (server.py ~1007) che aggrega tutti i `materials[]` dei clienti del mese raggruppandoli per `supplier`. Ritorna totali per fonte (contanti/conto_aziendale), items count e dettaglio per fornitore. "Senza fornitore" ordinato in fondo.
- Frontend: nuova pagina `/fornitori` (`pages/Fornitori.jsx`) con navigazione mese, 3 card totali, elenco fornitori espandibili con dettaglio materiali (descrizione, cliente, data, importo, fonte). Voce menu "Fornitori" in `secondaryNav` (hamburger).
- Fix bug (via testing agent): shadowing di `it` (locale date-fns) con iterator `.map((it,j)...)` → rinominato a `item`.
- Test: 12/12 PASS (`test_iter22_suppliers_summary.py`). Frontend OK dopo fix shadowing.

### Feb 2026 — Fix overflow pulsanti Prossimi lavori su mobile
**Richiesta:** "Metti meglio le opzioni perché quella a sinistra è tagliata". Utente sceglie opzione B (icone su mobile).
**Fix:** in `ProssimiLavori.jsx` i pulsanti "Vista settimana", "Stampa", "Voce" mostrano solo l'icona sotto 640px (con `aria-label`/`title`); "Nuovo lavoro" resta con testo essendo il CTA principale. `shrink-0` + `flex-nowrap` per evitare taglio.


### Feb 2026 — Fix bug Margine: mostrava più contanti di quelli incassati
**Bug:** utente: "questo mese è iniziato da sette giorni e il margine mi dà più contante di quelli che ho incassato". `Margine.jsx` calcolava `imp − mat` sul lavoro INTERO (anche solo con acconto) e lo attribuiva tutto al metodo dell'acconto → se eseguito €1000 con acconto €300 contanti, mostrava €1000 contanti anziché €300 (meno quota materiali).
**Fix in `pages/Margine.jsx`:**
- Totali per metodo e totale complessivo ora letti da `/api/summary.incassi_margine_by_method` (stesso calcolo del Riepilogo: scorporo IVA + materiali pro-quota solo sui pagamenti INCASSATI)
- Dettaglio per lavoro ricalcolato dal frontend con stessa logica (specchio del backend)
- Badge in testa: "+ X€ ancora da incassare · saldo Y€" quando ci sono acconti pendenti
- Nella lista: tag "acconto" (giallo) per lavori parzialmente pagati, "non incassato" (rosso) per quelli a zero; mostra margine incassato + atteso sotto
- Nessun cambio backend: il backend già faceva il calcolo giusto, era il frontend a divergere


### Feb 2026 — Fix logout imprevisto nella PWA Android (persistenza login)
**Bug:** Utente segnalava che a volte riaprendo l'app installata come PWA sulla home del telefono doveva rifare login (iniziato in questa settimana, 2 volte). Nessuna impostazione "clear on exit" attiva.
**Causa più probabile:** la persistenza era `browserLocalPersistence` (basata su `localStorage`), applicata con `setPersistence` ASINCRONO dopo `getAuth`. In contesto PWA Android:
- Gli aggiornamenti del service worker (ogni deploy) possono invalidare il contesto storage temporaneamente
- Android può pulire aggressivamente `localStorage` delle PWA quando ha poca memoria
- Race condition: se il primo login avveniva prima che `setPersistence` risolvesse, veniva salvato in modalità default che poteva non essere `local`
**Fix in `lib/firebase.js`:**
- `getAuth()` + `setPersistence(browserLocalPersistence)` sostituiti con `initializeAuth({ persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] })`
- Catena di fallback: IndexedDB (più durevole su PWA) → localStorage → memoria
- Nessuna race: la persistenza è configurata al momento della creazione dell'istanza, prima di qualunque `signIn`
**Nota utente:** alla prossima apertura potrebbe essere richiesto un ulteriore login per applicare la nuova configurazione.


### Feb 2026 — Fix scroll Android Chrome su dialog "Nuovo cliente"
**Bug:** Utente su Android segnalava che scrivendo l'imponibile e scendendo per toccare l'input "importo pagamento", la tastiera si apriva ma il dialog "scattava" tornando sopra (vicino all'imponibile). Pattern tipico di Chrome Android con dialog `position:fixed` + `overflow-y-auto` + `vh`: quando appare la tastiera il viewport si riduce ma `vh` resta calcolato sul viewport pre-tastiera, confondendo il meccanismo native di scroll-into-view.
**Fix in `ClientFormDialog.jsx` + preventivo in `ExpenseFormDialog.jsx` e `RecurringExpensesDialog.jsx`:**
1. `max-h-[92vh]` → `max-h-[92dvh]` (dynamic viewport height, si adatta alla tastiera)
2. `scroll-padding-bottom: 25vh` e `scroll-padding-top: 2rem` così lo scrollIntoView lascia margine sopra la tastiera
3. In `ClientFormDialog`, aggiunto `onFocusCapture` sul `<form>` che dopo 350ms (apertura tastiera) richiama `scrollIntoView({block:"center"})` sull'input focalizzato — rimedia all'eventuale reset-to-top che Android Chrome fa talvolta


### Feb 2026 — Ricerca vocale clienti esistenti
**Richiesta:** "Possibile aggiungere una ricerca vocale dei clienti esistenti?"
**Fix:** creato componente riutilizzabile `VoiceSearchButton.jsx` che usa Web Speech API (it-IT, native browser API, nessuna chiave). Il pulsante microfono è ora accanto all'input di ricerca in due posizioni:
- `components/ClientSearch.jsx` (header Agenda, dropdown risultati live)
- `pages/Clienti.jsx` (rubrica annuale)
Durante l'ascolto il pulsante pulsa in arancione (icona `MicOff`), il testo intermedio riempie in tempo reale l'input di ricerca. Su browser non supportati il pulsante non viene mostrato (fallback graceful).
- data-testid: `voice-search-button`, `client-search-voice`, `clienti-search-voice`


### Feb 2026 — Refactor backend: `server.py` (1473 → 68 righe) in moduli
**Richiesta:** utente ha accettato il refactor proposto ("Ok allora procedi. Spero che non vada perso nulla sennò mi trovo nei guai").
**Motivazione:** `server.py` cresciuto a 1473 righe con auth+clienti+spese+acconti+dipendenti+riepiloghi+fornitori tutti insieme → difficile manutenzione.
**Approccio zero-rischio:**
1. Baseline test PRE-refactor: 185/185 PASS
2. Spostato codice senza modificare UNA riga di logica in:
   - `db.py` (client MongoDB + load_dotenv)
   - `models.py` (tutti i Pydantic model + type aliases + DEFAULT_EMPLOYEES)
   - `summary_service.py` (`_compute_summary`)
   - `routes/health.py`, `routes/clients.py`, `routes/expenses.py`, `routes/advances.py`, `routes/summary.py`, `routes/employees.py`
   - `server.py` slim: solo FastAPI app + include_router + middleware + shutdown hook
3. `_compute_summary` re-esportato da `server.py` per compat con `from server import _compute_summary` (usato da `test_iva_split.py`)
4. Baseline test POST-refactor: **185/185 PASS** — nessuna regressione, tutte le 47 route esposte come prima
- File: `backend/server.py` (riscritto), `backend/db.py` (nuovo), `backend/models.py` (nuovo), `backend/summary_service.py` (nuovo), `backend/routes/*.py` (nuovi)
- data-testid: N/A (solo cambiamenti backend interni)


## Backlog (P2)
- Notifica email automatica quando il GitHub Action fallisce N volte di fila
- Indicatore visivo "in sync..." per item ottimistici non ancora confermati dal server
- Possibilità di retry manuale dal toast di errore
- Enable ESLint `no-shadow` per prevenire bug tipo `it` (locale) shadowato da iterator

## API endpoints chiave
- `POST/PUT/DELETE /api/clients[/{id}]`
- `GET /api/clients?date=YYYY-MM-DD` (esclude pending)
- `GET /api/clients/pending`
- `GET /api/clients/unpaid`
- `POST /api/clients/{id}/execute` (sposta da pending a agenda)
- `POST/PUT/DELETE /api/expenses[/{id}]`
- `POST /api/advances`, `GET /api/advances?date=...&worker=...`
- `GET /api/summary?month=YYYY-MM`
- `GET /api/suppliers/summary?month=YYYY-MM` (riepilogo materiali per fornitore)

## Hosting
- Main API: `https://agenda-italserrande-api.onrender.com`
- Bulk email: `https://bulk-email-backend-kcny.onrender.com`
