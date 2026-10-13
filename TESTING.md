# QueueEase — test record

All checks below were **actually run** on Windows (Node v24.15.0, headless
Chrome). Nothing in this file is assumed or extrapolated.

## 1. Automated unit + API + static checks — 80/80 passed

Runner: `tests/run-tests.js` (zero dependencies; async-aware). Suites:

| Suite | Cases | Result |
|---|---|---|
| queue: booking validation | 19 | pass |
| queue: tokens and ordering | 7 | pass |
| queue: status transitions | 6 | pass |
| queue: reporting | 6 | pass |
| storage: load / save / reset | 7 | pass |
| pages: i18n coverage | 7 | pass |
| pages: element ids | 6 | pass |
| pages: no-government-branding guard | 1 | pass |
| api: health, config, booking | 7 | pass |
| api: auth and authorization | 5 | pass |
| api: queue lifecycle, cancel, lookup, board, export | 8 | pass |
| api: restart persistence, admin users, reset | 3 | pass |

Key engine cases (see `tests/queue.test.js`, `tests/storage.test.js`):
- Future booking → `Booked` + reference; same-day → `Waiting` immediately.
- Rejections: `NAME_REQUIRED`, `NAME_INVALID` (digits/ID-like; Telugu names
  accepted), `DATE_PAST`, `DATE_TOO_FAR` (14-day horizon), `OFFICE_CLOSED`
  (all offices Sunday; municipal also Saturday), `TIME_PAST`, `SLOT_FULL`
  (4/slot), `DUPLICATE_BOOKING`, `TOO_MANY_ACTIVE` (3/person/day),
  `WALKIN_NOT_TODAY`.
- Cancelled bookings free slot capacity; cancelled token numbers are never
  re-issued (uniqueness asserted over the whole store).
- `callNext` promotes that date's `Booked` entries then serves the earliest
  Waiting entry (history shows Booked→Waiting→Serving); concurrent second
  call blocked with `ALREADY_SERVING`; empty queue → `QUEUE_EMPTY`; same
  entry can never be served twice; `promoteDue` sweeps only arrived dates.
- Transitions: `Booked→Completed` rejected, `Booked→Serving` allowed for
  staff; `Waiting→Completed` rejected; reopen paths preserved with history.
- `summarize` consistency, filters, `peopleAhead` + estimate rule,
  reference/token lookup, CSV quoting, `sanitizeState` with garbage input,
  legacy `qe_bookings` migration, corrupt-JSON quarantine, token sequencing
  across save/load, localStorage regression test.
- Static checks (`tests/verify-pages.js`): every `data-i18n` attribute and
  every `t()` key resolves to a complete en+te entry (all three pages +
  all four page scripts); every engine code localised; every status has a
  Telugu name; every element id referenced by JS exists; no official
  seals/approval wording.

Key backend cases (`tests/api.test.js`, real HTTP vs `server/index.js`
with an isolated temp database):
- Health/config shape; six statuses listed; clean test database starts without
  fictional seed rows.
- Booking persists (`A-001`, `Booked`) with ahead/estMinutes; invalid input
  returns field codes and stores nothing; duplicates and over-capacity
  rejected.
- **20 concurrent bookings, one slot: exactly 4 win (201), 16 get
  SLOT_FULL, tokens unique** — allocation race covered.
- Anonymous queue/status/admin access → 401; wrong password → 401 without
  hinting which field failed; staff on admin routes → 403.
- Staff-only reports endpoint returns aggregate metrics without citizen names
  or booking references.
- Citizen cancel requires the reference (wrong → 404, repeat → 409);
  `Booked→Completed` rejected, `→Serving→Completed` accepted.
- **Two concurrent call-next: one 200, one 409.**
- Stats match stored rows field-by-field; board feed shape; CSV export
  gated by auth; SSE streams with correct content type.
- Completed tokens can be archived only by staff/admin after reaching
  `Completed`; the archived snapshot remains available to administrators and
  is removed from active queue results.
- **Kill + respawn: rows intact, token sequence continues** (acceptance
  criterion 13).
- Admin creates/deactivates staff (login fails after deactivation); audit
  contains bookings and user management; reset clears entries.

## 2. Browser end-to-end, local mode — `npm run test:e2e` → 28/28 passed

`tests/e2e.js` (CDP harness in `tests/cdp-helper.js`, no test dependencies)
drives the real UI against the static server. Flow: clean slate → book
(MeeSeva, next open date) → double submit yields one booking → token `A-001`
+ reference → print wiring → invalid name rejected → tracking → refresh
persistence → Telugu switch → 390 px no-overflow → staff shows `Booked=1` →
call-next promotes+serves → Serving=1 → search → Complete → Completed=1,
Waiting/Booked=0 → board shows serving, follows completion live → CSV
download → type-`RESET` reset → zero uncaught JS errors on all pages.

## 3. Browser end-to-end, server mode — `npm run test:e2e-server` → passed

`tests/e2e-server.js` boots `server/index.js` with an isolated temp database
and drives the UI in server mode: backend badge detected → API booking
(`A-001`, `Booked`) → tracking + refresh persistence from the server →
staff queue locked before sign-in → staff login → queue loads (`Booked=1`)
→ call-next → SSE board shows serving → complete → board follows live →
completed token appears on the separate Completed Tokens page → completed
token leaves the active view →
walk-in handled → logout re-locks → admin login shows panel → users listed
→ create `uitester` via UI → audit shows `user-create` → zero uncaught JS
errors on all pages.
downloads a file containing the header + `A-001` record → Reset opens a
confirmation dialog → typing `RESET` clears all records → zero uncaught JS
errors.

**Display board** — shows the serving `A-001` without reload → office filter
scopes the board → after completion in the staff tab, the board updates live
via the `storage` event (asserted, no reload) → zero uncaught JS errors.

## 4. Visual verification (headless Chrome)

- Desktop 1280 px citizen page: hero, demo banner, today counts, office
  cards with open badges — clean, no overlap.
- Desktop staff page: summary cards (over seeded demo data), call-next
  panel, auth panel, filters — clean.
- Desktop display board: large serving token card, waiting chips, office
  filter, updated timestamp — clean.
- Mobile 390 px citizen page: stacked layout, readable, no page overflow
  (also asserted numerically in E2E).
- Telugu citizen page: full UI translated, Telugu script renders correctly.
- Reports page: responsive KPI cards, office table and daily demand bars are
  rendered from protected aggregate data.

## 5. Bugs found and fixed by testing

1. Storage adapter referenced an out-of-scope variable, so
   `browserStorage()` threw on every call and silently fell back to memory.
   Fixed + regression test + E2E persistence check.
2. Duplicate seeded demo references (`QE-DEMA01` twice) — caught by the new
   `UNIQUE(reference)` constraint at first backend boot. Seed now embeds
   the date.
3. Admin user-status route parsed the wrong path segment (`parts[3]`
   instead of the last segment) → 404. Fixed `paramId` + covered by the
   admin API test.
4. Date-scoped summary leaked into the global dashboard cards via
   `/api/queue?date=`. Queue summary is global again; `?date=` scoping
   lives only on `/api/stats`. Covered by the stats-vs-rows test.
5. Test API runs accidentally inherited fictional demo rows, causing unstable
   token numbers and capacity assertions. Added explicit clean test mode and
   production-safe `SEED_DEMO_DATA` configuration.

## 6. Not tested (known gaps)

- Screen readers / keyboard-only walkthrough beyond focus-ring + aria-live
  markup (manual audit still needed).
- Real-device mobile browsers (only emulated 390 px viewport + overflow
  assertion).
- Professional review of Telugu strings.
- Multi-process deployment (single Node process; the mutex only guards
  within one process — documented; run one backend per database file).
- Load testing beyond the 20-way allocation race.
