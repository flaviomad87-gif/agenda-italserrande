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


### Feb 2026 — Fix bilancio ore sempre più negativo (timbrature duplicate)
**Bug utente:** "ogni volta che apro e chiudo la timbratura mi dà più ore che deve recuperare". Il bilancio ore del dipendente diventava sempre più negativo dopo ogni ciclo clock-in/clock-out.
**Causa:** la `POST /api/time-entries` non era idempotente. Un doppio salvataggio (widget + edit, doppio tap, ecc.) creava DUPLICATI nel DB. Il frontend deduplicava via `Map(employee_id|date)` ma poteva "vincere" il duplicato incompleto (solo clock_in, senza clock_out) → giornata non conteggiata → delta accumulato negativo.
**Fix in `backend/routes/employees.py`:** POST ora cerca entry esistente per `(user_id, employee_id, date)` e se trovata fa `$set` merge dei campi forniti invece di `insert_one`. Resto invariato per retrocompat con il flusso create.
**Fix secondario in `backend/models.py`:** `TimeEntryCreate.break_minutes` da `int = 60` a `Optional[int] = None` → senza questo il merge sovrascriveva sempre break_minutes a 60, azzerando pause custom tipo 45min → stesso sintomo ma di magnitudine minore.
**Fix difensivo in `frontend/pages/OreLavoro.jsx`:** `entriesByEmpDate` Map ora preferisce entry con sia clock_in sia clock_out quando esistono duplicati residui pre-fix.
**Testing:** iter30 6/6 passati (idempotency, merge preservation, default fallback, PUT invariato, GET filters OK).


### Feb 2026 — Margine: logica attribuzione metodo di pagamento in 3 passi
**Richiesta utente:** "Si che hanno un metodo di pagamento. L'ho messo. Non deve andare in automatico con pos o bonifico se non lo inserisco". Screenshot ha rivelato: Leonardo Panzironi aveva un payment entry con `amount=0` e `method="bonifico"` (fattura emessa, saldo da arrivare) ma il filtro `amount>0` lo escludeva dal calcolo.
**Fix solo frontend `Margine.jsx`:**
- Rimosso l'auto-fallback a bonifico (user ha detto no)
- Nuovo `byMethod` a 3 passi:
  1. **Paid payments** (amount>0) → margine effettivamente incassato attribuito al loro metodo con distribuzione pro-quota dei materiali
  2. **Residuo** (expectedMargin − collectedMargin) → cerca un **intentPayment** = payment con `amount<=0` e metodo valido → attribuisce il residuo a quel metodo
  3. Se nessun intentPayment, usa `c.payment_method` del cliente
  4. Se neanche quello è valido → **NON contribuisce** (niente ipotesi automatiche)
**Bug risolto in iter28:** `intentPayment` prima pescava il primo payment con metodo valido, pescando quelli già pagati e deviando il residuo nel bucket sbagliato. Fix: filtro aggiuntivo `(Number(p.amount)||0) <= 0`.
**Testing:** 5/5 scenari passati in iter28 (A paid-contanti, B amount=0-bonifico, C legacy-pos, D empty-no-contrib, E mixed paid+intent).


### Feb 2026 — Margine: lavori non incassati tornano in pieno colore e nei totali
**Richiesta utente:** "Non voglio vederli trasparenti gli importi da incassare. Voglio vederli già nel conteggio. Ma quelli prima si trovavano nell incasso dei contanti invece devono stare nell incasso aziendale."
**Fix solo frontend `Margine.jsx`:**
- Rimosso stile grigio chiaro: TUTTI i lavori ora in pieno colore (nome scuro, cifra verde) — non c'è più distinzione visiva paid/unpaid (eccetto tag "acconto" per parziali)
- `byMethod`: oltre ai payments[] ora include anche il fallback legacy `c.payment_method` per i lavori senza pagamenti registrati → margine atteso attribuito al metodo salvato sulla scheda
- `collectedMargin` fallback a `expectedMargin` per i lavori unpaid → mostrati a valore pieno
- **Righe cliccabili**: ogni riga è ora un `<button>` che apre `ClientFormDialog` del cliente pre-compilato (data-testid `margine-row-open-{id}`). `onSaved`/`onDeleted` ricaricano i dati del mese
- Nessun badge "ancora da incassare" né tag "non incassato" (preservato dalla iter24)
**Testing:** iter25 passato al 100% su scenario con 3 clienti misti (paid + 2 legacy)


### Feb 2026 — Margine: rimessi i lavori non incassati come righe grigie
**Richiesta utente:** "I pagamento che devo ancora incassare però vorrei vederli nel margine" (dopo averli nascosti).
**Fix solo frontend `Margine.jsx`:**
- Lavori non ancora incassati tornano visibili nella lista Dettaglio lavori
- Resi in **grigio chiaro** (`text-stone-500` nome, `text-stone-400` cifra) → distinguibili a colpo d'occhio dai verdi "già incassati"
- Mostrano il margine ATTESO (`expectedMargin`) non lo zero, così l'utente vede il valore del lavoro
- Nessun tag "non incassato" né "ancora da incassare" (preservato il no-wording richiesto in iter23)
- Totali per metodo invariati: calcolati solo sui pagamenti davvero registrati
**Testing:** 10/10 test passati su 3 scenari (iter24)


### Feb 2026 — Margine: tolto badge "ancora da incassare" e tag "non incassato"
**Richiesta utente:** "Non voglio la scritta ancora da incassare perché quelli che devono pagare ce l'ho nella sezione incassi".
**Fix solo frontend `Margine.jsx`:**
- Rimosso badge arancione "+ X€ ancora da incassare · saldo Y€" dalla card totale
- Rimosso tag rosso "non incassato" dalle righe della lista
- Lavori con `collectedMargin ≤ 0` NASCOSTI dalla lista (gestiti già nella pagina Incassi)
- Preservati: tag "acconto" + "atteso X€" per pagamenti parziali
- Counter aggiornato: "N lavori incassati" invece di "N lavori eseguiti"
- Empty state: "Nessun lavoro incassato in {mese} {anno}"
**Testing:** 12/12 test passati su 3 scenari (iter23)


### Feb 2026 — Fix Margine: totali per metodo basati SOLO sui pagamenti registrati
**Bug (follow-up):** anche dopo il primo fix (usare `/api/summary.incassi_margine_by_method`), i totali per metodo restavano sbagliati per lavori con solo campo legacy `payment_method` settato (default) e nessuna entry in `payments[]`. Il backend attribuiva il margine al metodo di default anche se nessun pagamento era stato davvero registrato.
**Fix solo frontend `Margine.jsx`:** la pagina NON chiama più `/api/summary` per i totali per metodo. Calcola localmente scorrendo `payments[]` di ogni lavoro:
- Per ciascun pagamento → split IVA → imp → materials pro-quota → margine_p → accumula in `acc[method]`
- Lavori senza `payments[]` NON contribuiscono ai totali per metodo (mostrati come "non incassato" nella lista)
- Backend `_compute_summary` lasciato INVARIATO per compatibilità con test e altre pagine (Riepilogo, Incassi) che usano logica cash flow + legacy


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

### Giu 2026 — Rilievi Sezionali (MODULO RILIEVI)
- Modulo digitale identico al modulo cartaceo del fornitore (campi, ordine, etichette). Pagina `/rilievi` + sezione "Rilievi sezionali" nella scheda lavoro (pulsante Nuovo rilievo + elenco rilievi collegati, prefill riferimento cliente/destinazione).
- PDF = ridisegno vettoriale pulito (dritto, senza pieghe) del modulo originale, valori in blu; Tipo scelto cerchiato, X nelle caselle si/no; immagine MODELLO PANNELLO ripulita (`lib/panelModelsImg.js`). File: `lib/rilievoPdf.js`.
- Condivisione nativa (WhatsApp/email) via Web Share API, fallback download. Intestazione Ditta/Via/Tel/Fax/email ricordata in localStorage.
- Backend `/api/rilievi-sezionali` CRUD: si/no tri-state (null/true/false), campi oblo_h/oblo_w, fax; PUT accetta null.
- Fix: import duplicato FileText in AppShell che rompeva la build. SW cache v9.
- Test: iteration_32/33 100% backend+frontend.

## Backlog
- P2 Cestino (soft delete 30gg)
- P3 Pulizia DB legacy (payment_method)
- P3 Spostare logica margini da Margine.jsx a backend

### Giu 2026 — Scelta modello pannello col tocco
- Nel rilievo l'immagine MODELLO PANNELLO ha 6 zone toccabili (S5, S4, S3, S1, S2, D1): scrive solo la sigla nel campo Modello (l'eventuale testo dopo la sigla resta), ritocco = rimuove. Nel PDF il pannello scelto è cerchiato in blu. File: `lib/panelModelsImg.js` (PANEL_MODELS, panelCode), `SezionaleRilievoDialog.jsx` (PanelPicker), `lib/rilievoPdf.js`. Test iteration_34 OK.

### Giu 2026 — Foto del luogo nei lavori
- Nella scheda lavoro, sotto Indirizzo/Telefono: sezione "Foto del luogo" con Scatta (fotocamera) e Galleria (multipla). Miniature, visore a schermo intero con avanti/indietro ed elimina.
- Foto compresse lato client (max 1600px JPEG), salvate su Emergent Object Storage (`backend/storage.py`), riferimenti in Mongo `job_photos` (soft delete). Endpoint: GET/POST/DELETE `/api/clients/{id}/photos`, GET `/api/photos/{id}/file`, DELETE `/api/photos/{id}`. Eliminando un lavoro le foto vengono eliminate; chiudendo un lavoro nuovo senza salvare le foto della bozza vengono scartate.
- Lavori nuovi: id bozza pre-generato (draftId) così si possono aggiungere foto prima di salvare.
- Richiede `EMERGENT_LLM_KEY` nel backend (anche su Render!). Upload non va in coda offline.
- Test iteration_35: backend 12/12, frontend OK.

### Giu 2026 — Collegamento app Preventivi (https://preventiviitalserrande.netlify.app)
- App Preventivi = altro progetto Emergent, Firebase separato `app-preventivi-aa253`, Firestore `users/{uid}/quotes/{id}` (number, date, status draft/sent/accepted/rejected, clientName, clientAddress, subject, lineItems[{id,description,amount,vatRate}], paymentTerms, footerNote, notes, createdAt, updatedAt) + `users/{uid}/meta/settings` {counter, company}. Rotte: /quote/:id, /quote/new.
- Agenda: `lib/preventiviApp.js` (seconda istanza Firebase "preventivi", login email/password una volta, sessione persistente). Voce menu "App Preventivi" (link esterno). In /da-preventivare sezione "App Preventivi": elenco preventivi (filtri Da gestire/Accettati/Tutti), Apri, "Crea lavoro" (precompila nome, indirizzo, importo, IVA, N° preventivo, quote_ref → Prossimi lavori), badge "In agenda" se collegato.
- Nel lavoro: "Apri preventivo N° X" se collegato, altrimenti "Crea preventivo nell'app" (bozza con stessi default dell'app, numerazione max(counter, numeri)+1) e "Apri app Preventivi".
- Backend: campo client `quote_ref`, GET `/api/clients/quote-refs`.
- Test iteration_36: stato non collegato OK; flussi da collegati NON testati (servono credenziali reali dell'utente).
- Fix UX: in /da-preventivare i lavori dell'agenda stanno in alto; il riquadro "App Preventivi" è in fondo e chiuso di default (tocca il titolo per aprirlo, mostra "N da gestire", stato ricordato).
- Bozze create dall'agenda: clientName e clientAddress in MAIUSCOLO. Nuovo pulsante "Fai preventivo" su ogni card di /da-preventivare (crea bozza, collega quote_ref, apre il preventivo; diventa "Apri preventivo N° X").

### Giu 2026 — Fix iPhone (WebKit)
- Prossimi lavori: lavoro appena creato spariva dalla lista su iPhone (race tra due ricariche: la lettura vecchia sovrascriveva). Ora upsert locale + scarto risposte fuori ordine (loadSeq).
- Appuntamento: senza giorno scelto mostra "Scegli prima il giorno" al posto del campo ora disabilitato (su iOS sembrava 12:30 bloccato).
- CSS iOS per input date/time (niente sforamenti, altezza minima), touch-action manipulation; viewport maximum-scale=1 (niente zoom automatico sui campi).
- Dettatura: messaggio specifico per errore iOS "service-not-allowed".
- Script di verifica WebKit iPhone: /app/tests/ios_check.py (PLAYWRIGHT_BROWSERS_PATH=/pw-browsers).
- Appuntamento: il calendario a comparsa (Radix Popover dentro Dialog) non si apriva su iPhone reale → sostituito con calendario IN LINEA sotto il pulsante "Scegli giorno" (si chiude dopo la scelta). Nessun Popover dentro i Dialog.

### Giu 2026 — Link gestionale fatture
- /da-fatturare: pulsante "Gestionale" in alto e "Fattura" su ogni lavoro → apre https://asit.studiodigitale.cloud/wt00010885/cliente.sto; "Fattura" copia anche nome/indirizzo/telefono in MAIUSCOLO negli appunti da incollare nel gestionale.

### Giu 2026 — Preventivi DENTRO l'agenda (piattaforma unica) + tema blu
- Tema predefinito "Blu Italserrande" (#0047AB, come app Preventivi); migrazione una tantum da verde-classico (localStorage theme_blu_v1).
- Backend `routes/quotes.py`: CRUD `/api/quotes` (soft delete), numerazione progressiva (max(counter, numeri)+1), nome/indirizzo MAIUSCOLO, `/api/quotes/import` (idempotente per source_id, ricollega quote_ref dei lavori), `/api/quote-settings` (dati azienda + templateLayout, default Italserrande S.r.l.).
- Frontend `lib/quoteDoc.jsx`: porting fedele del template dell'app originale (JC/YC: header logo+dati, Cliente/Preventivo/Data, Descrizione/Importo €/C. Iva, OGGETTO, firma, Tot. Imponibile IVA ESCLUSA, Modalità di pagamento, Note; auto-fit/multipagina) + PDF via html2canvas+jsPDF (Preventivo-N-ANNO.pdf). Font IBM Plex Sans/Mono + Chivo. Logo /italserrande-logo.png.
- Pagina `/preventivi/:id` (QuoteEditor): modifica/anteprima, stati, righe, Invia PDF (share/download, bozza→inviato), Crea lavoro, elimina.
- /da-preventivare: sezione "Preventivi" interna (filtri, cerca, Nuovo preventivo, Crea lavoro, In agenda) + "Importa dalla vecchia app Preventivi" (login Firebase app vecchia una volta). "Fai preventivo" sulle card e "Crea preventivo" nel lavoro ora creano nell'agenda.
- Esempio PDF originale: /app/memory/prev_app/sample.pdf; bundle originale in /app/memory/prev_app/.
- Fix post-test (iter37): selettori CSS dei temi erano doppio-escapati (nessun tema funzionava) → corretti dal testing agent; override blu anche per terracotta #B8683D; .fade-in con fill-mode backwards (prima il transform rompeva gli elementi position:fixed, es. barra editor e FAB); PUT /quotes parziale (exclude_unset), maiuscolo lato server, esclusi i cancellati; import in maiuscolo; anteprima A4 con altezza corretta; barra azioni editor su una riga.
- DA FARE utente: premere "Importa dalla vecchia app Preventivi" una volta (serve login app vecchia) per portare preventivi, numerazione, dati azienda e impaginazione.
- Fix "Preventivo non trovato" (iPhone, produzione): lavori collegati con id della VECCHIA app → GET /quotes/{id} ora cerca anche per source_id (dopo import si apre e reindirizza al nuovo id). Editor: richieste separate; se manca mostra pagina "Preventivo non ancora nell'agenda" con istruzioni per importare.
- Import automatico: se la vecchia app è collegata (anche appena collegata dal dialog) l'import parte da solo una volta (flag localStorage quotes_imported_v1). Se non ci sono preventivi, in /da-preventivare compare un riquadro grande "Porta qui i preventivi della vecchia app". L'import non può essere fatto dall'agente: dati utente su Atlas/Render + password vecchia app.

### Giu 2026 — Velocità
- Backend: indici Mongo creati all'avvio (server.py INDEXES: user_id+id/date/pending/quote_ref/source_id/client_id) — prima nessun indice.
- Frontend: jsPDF/html2canvas caricati solo al momento del PDF; Firestore (~300KB) caricato solo finché l'import vecchia app non è fatto (components/ImportOldQuotes.jsx lazy); precaricamento in sottofondo delle pagine principali dopo il login (AppShell).
- Render free: keep-alive GitHub Actions Lun–Sab 06–20 (DEPLOY_KEEPALIVE.md); fuori orario il primo avvio può richiedere 30-60s.
- Fix "tornata la vecchia estetica" (iPhone produzione): migrazione tema v2 (theme_blu_v2) → chi era su verde-classico o senza tema passa al blu anche se la v1 era già stata segnata; temi scelti esplicitamente (es. notte-blu) restano. CSS blu: regole esatte (~=) per bg/text #4A5D23, tinte /10 /15, #F8EBE4, #E5EFE9, #EAE7DE, #FBF1DE, bordi /20-/40, hover text. Test iteration_38 OK. SW v24.

## 2026-06 — Documenti CE e Registro di Manutenzione
- Nuova voce menu hamburger "Documenti CE e Manutenzione" (/documenti), due schede: Dichiarazioni CE / Manutenzioni.
- Backend /api/documenti (kind ce|manutenzione, numerazione progressiva atomica per tipo+anno in `documenti_counters`, soft delete).
- PDF vettoriali fedeli ai moduli originali (lib/documentiPdf.js, logo public/doc-logo.jpg); firme lasciate vuote da firmare a mano; CE: Sì/No + nota per le 8 norme; Manutenzione: un intervento per documento, Nr. = numero/anno.
- Test: iteration_39 backend 8/8, frontend 24/24.
- Backlog: creare documenti dalla scheda lavoro con dati precompilati; collegare il Registro alla stessa scheda impianto (fascicolo tecnico / "carta d'identità dell'impianto").

## 2026-06 — Pratica impianto (documentazione completa)
- Scheda "Pratiche" (default) in /documenti: compili una volta e generi un PDF unico (~12 pagine) o i singoli documenti:
  Dichiarazione CE/DoP, Verbale di collaudo e consegna (check-list sicurezze, senza misura forze EN 12445), Analisi dei rischi (auto da sicurezze installate),
  Manuale d'uso e manutenzione (testi per avvolgibile/sezionale/basculante/scorrevole/battente), Dichiarazione DM 37/08 (Allegato I + relazione materiali + avvertenze art. 8),
  Registro di manutenzione (prima voce installazione), Targhetta CE da stampare.
- File: lib/praticaTesti.js (contenuti standard, DA FAR VERIFICARE AL TITOLARE), lib/praticaPdf.js (motore impaginazione Flow), components/PraticaDialog.jsx, PraticaForm.jsx.
- Numerazione atomica `documenti_counters` (indice unico) con riallineamento dai numeri già esistenti.
- Test: iteration_40 backend 11/11, frontend 77/77.
- Note: dal 20/01/2027 aggiornare riferimenti a Regolamento Macchine (UE) 2023/1230.

## 2026-06 — Regolamento Macchine (UE) 2023/1230
- Documenti con data >= 20/01/2027 passano in automatico al nuovo Regolamento (Dichiarazione UE, norma 3, analisi rischi Allegato III, targhetta,
  manuale con conservazione istruzioni 10 anni e protezione comandi a distanza, nuova voce collaudo/rischio "accessi non autorizzati").
  Prima di quella data restano secondo Direttiva 2006/42/CE (il Regolamento vieta di emettere dichiarazioni nuove prima del 20/01/2027).
- Funzioni: isNuovoReg / regMacchine / normaLabel in lib/documentiPdf.js; avviso RegimeNote nella pratica.

## 2026-06 — Schema impianto DM 37/08
- Sezione 7b pratica: dati linea (origine, interruttore MT+diff poli/In/curva/Idn/tipo/potere, cavo tipo/formazione/lunghezza/posa/percorso, motore/potenza/cavi accessori)
  + verifiche strumentali CEI 64-8 (continuità PE, isolamento MOhm, tempo intervento diff. ms).
- PDF: schema unifilare disegnato in automatico (quadro -> MTD -> linea -> centralina -> motore/fotocellule/coste/lampeggiante/finecorsa/comandi, PE) + tabella dati e verifiche,
  allegato alla DM 37/08; foto del libretto (JobPhotos con client_id "pratica-<id>") in coda, una per pagina.
- Eliminando la pratica vengono eliminate anche le foto. Test: iteration_41 70/72 (2 solo diciture).

## 2026-06 — Verifica impianto esistente, Contratti manutenzione, Logo
- Documenti > tab "Verifiche" (kind "verifica"): stato di fatto (10 punti C/NC/NA + note), documenti presenti, esito idonea/adeguamento/non idonea,
  interventi, parti, rifiuto cliente, foto (client_id "verifica-<id>") nel PDF; tasto "Crea pratica di adeguamento" (precompila pratica, DM37 trasformazione).
- /contratti (menu "Contratti manutenzione"): contratti con impianti, durata, frequenza visite (default 6 mesi), rinnovo tacito, canone, visite registrate;
  prossima visita = ultima visita (o inizio) + frequenza; avviso 15 giorni prima: badge menu, pallino Menu, banner su Prossimi lavori, email riepilogativa
  a owner_email (email login) via Emergent managed email (EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME). PDF contratto con clausole standard + artt. 1341/1342 c.c.
- Job giornaliero: avviato dal ping GET /api/ (keep-alive GitHub su Render) una volta al giorno dopo le 7 (Roma) + .emergent/crons.yml (POST /api/cron/manutenzioni, Bearer WEBHOOK_CRON_SECRET).
- Su Render vanno aggiunte le variabili EMERGENT_EMAIL_KEY ed EMAIL_FROM_NAME (valori in backend/.env).
- Logo Italserrande: /app-logo.jpg (login, registrazione, sidebar), icone PWA 192/512, apple-touch-icon, favicon.
- Test: iteration_42 backend 12/13 (fix applicati: cron body vuoto, task retention, retry giornaliero, stato Literal), frontend 65/65.

## 2026-06 — Revisione documenti pratica (feedback utente)
- Collaudo: frase forze d'impatto ora dipende dalla modalità adottata (uomo presente / impulsivo / automatico + dispositivi); avviso rosso se protezioni insufficienti (T.notaForze, anche nel form).
- Analisi rischi: Utilizzo selezionabile (privato, condominiale, commerciale, industriale, pubblico) T.USI_IMPIANTO.
- DM37: campi committente/indirizzo/proprietà/scala/piano/interno con spazi da compilare se vuoti; allegati in tabella chiara (materiali, schema, visura camerale, progetto, precedenti);
  schema elettrico ora in continuazione della DM37 con relazione materiali nella tabella dati linea; cavi dentro i box dispositivi; PE indicato come conduttore unico.
- Misure isolamento/differenziale: avviso nel form se vuote, nel PDF spazio "______" da compilare.
- Firme: riquadri per firma; CE pag. 2 riga per "Firma Italserrande S.r.l."; Sì/No in norme.
- Impaginazione compatta: pratica completa da 14 a 10 pagine (dati impianto su 2 colonne, check-list collaudo su 2 colonne).
- 2026-06: PDF normalizza sempre la sigla cavo FG16OR16 (anche se digitata FG160R16) in schema e relazione materiali; tensione centralina "230 V AC 50 Hz" con testo adattato al riquadro;
  Registro della pratica: descrizione con [Matricola] se non inserita e data della pratica; CE pag. 2 righe firma più distanziate.
- 2026-06: registro pratica con segnaposto [Data] e [Matricola]; correzione FG16OR16 applicata a tutto il testo dei PDF (newDoc); CE pag. 2 firme più distanziate.
- 2026-06: CE pag. 2 con riquadri firma distinti (accettazione, Italserrande con timbro, data, firma cliente).

## 2026-06 — 5 nuove funzioni
- Pratica dal lavoro: pulsante nella scheda lavoro (ClientRilievi) -> /documenti?nuova=pratica&cliente&indirizzo apre pratica precompilata.
- Rilievo -> preventivo: pulsante "Preventivo" nel rilievo crea preventivo con righe dalle misure/accessori (prezzi a mano), cliente/indirizzo maiuscoli.
- Dettatura: MicButton (Web Speech API it-IT) su note lavoro, aree testo pratica, descrizione registro, verifica, note contratto; nascosto se non supportato.
- Invio PDF: condivisione nativa (WhatsApp come file); etichette "Invia PDF".
- QR targhetta: public_token per pratica, GET /api/public/impianto/{token} (senza dati personali), pagina pubblica /impianto/:token con scheda impianto, manutenzioni, contatti; QR in ogni targhetta (libreria qrcode).
- Test: iteration_43 backend 100%, frontend 100%.

### Giu 2026 — Nuova disposizione: 4 aree + tasto Nuovo
- Barra mobile: Agenda · Lavori · (+) · Soldi · Ufficio. Lavori = Prossimi/In attesa/Da preventivare/Da fatturare (pagine separate, chip in alto). Soldi = Incassi/Margine/Spese/Fornitori. Ufficio = pannello a riquadri (Clienti, Rilievi, Documenti CE, Contratti, Magazzino, Ore lavoro, Profilo).
- Tasto "+": nuovo lavoro, preventivo, rilievo, pratica impianto, contratto.
- Logo piccolo in alto (mobile) e nella sidebar desktop divisa per aree. Apertura resta su Prossimi lavori.
- File: layouts/navConfig.js, layouts/AppShell.jsx, components/AreaTabs.jsx, components/BottomSheet.jsx; Rilievi/Contratti aprono il nuovo con location.state.nuovo. SW v36.
- Test: iteration_44 frontend 123/124 (overflow email in Profilo corretto).

## Backlog
- P1: Togliere backend/firebase-admin.json dal repository (tracciato in git) e ruotare la chiave.
- P2: Cestino 30 giorni, normalizzazione dati legacy, margine lato backend.

### Giu 2026 — Foto spostate nel MongoDB dell'utente (via da Emergent)
- routes/photos.py: nuovi upload in GridFS (bucket `photo_files`, campo `file_id` su job_photos). Lettura da GridFS; foto vecchie (storage_path su Emergent) copiate automaticamente all'avvio (migrate_legacy_photos, idempotente) e al primo accesso.
- Upload non richiede più EMERGENT_LLM_KEY. La copia delle foto vecchie in produzione richiede che EMERGENT_LLM_KEY resti su Render fino al primo riavvio dopo il deploy; poi si può togliere.
- Verificato: upload/lista/download/delete via curl, 14 foto di anteprima migrate, pytest foto 12/12.

### Giu 2026 — Regressione completa (iteration_45) e correzioni
- Numerazione preventivi atomica ($max + $inc su quote_settings.counter): niente più numeri doppi da due dispositivi.
- Validazione date AAAA-MM-GG (lavori POST/PUT, execute, contratti.data_inizio, documenti.data) e parametro month/date nelle query → 422 invece di dati sporchi.
- Magazzino: quantità negative rifiutate su crea/modifica.
- Foto: eliminando una foto (o le foto di un lavoro) si cancella anche il file nel database.
- Dipendenti: orari predefiniti rispettati alla creazione. Documenti: public_token filtrato per utente.
- Editor preventivo: totale etichettato "Imponibile".
- Scelte volute (test saltati): importi/righe negative ammesse (sconti), foto caricabili su bozze non salvate.
- Test: nuove suite 25 pass + 3 skip, vecchie suite 89/89.

### Giu 2026 — Collegamento assistente IA (MCP + OAuth 2.1)
- Utente: ChatGPT Go (non supporta MCP), ha Claude Pro → collegamento standard MCP usabile da Claude ora, ChatGPT Business/altri in futuro.
- Permessi scelti: legge tutto, crea/sposta lavori e appuntamenti, registra pagamenti e visite manutenzione, prepara BOZZE di preventivo (prezzi a mano, approvazione in app). Nessuna cancellazione.
- Backend: ai_auth.py (token hash, 1h access, 90gg refresh con rotazione), routes/ai_oauth.py (metadati /.well-known in radice e sotto /api, DCR, CIMD, pagina login email+password Firebase via REST con FIREBASE_WEB_API_KEY, blocco 5 tentativi/15 min, TTL indici), routes/ai_mcp.py (POST /api/mcp JSON-RPC, 14 strumenti, validazione argomenti, attività registrata), routes/assistente.py (/api/assistente/stato, approva/scarta bozze, scollega).
- Frontend: pages/Assistente.jsx (/assistente, in Ufficio → Assistente IA), setupProxy.js per /.well-known in sviluppo.
- Produzione Render: aggiungere FIREBASE_WEB_API_KEY (= REACT_APP_FIREBASE_API_KEY) alle variabili del backend. Indirizzo connettore: https://agenda-italserrande-api.onrender.com/api/mcp
- Test: iteration_46 backend 14/14 + frontend 100%; e2e tests/test_ai_connector_e2e.py; client MCP ufficiale (SDK 2.3) OK.
