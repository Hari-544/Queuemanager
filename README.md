# QueueManager — Online Appointment & Queue Management System

**Tagline: Less waiting. Better service.**

A Community Service Internship (CSI) **demonstration prototype** for appointment
booking and queue management at public-facing service counters in India
(MeeSeva centres, Gram Panchayat offices, municipal offices and other
government service counters).

QueueManager runs in **two modes**:

- **Server mode (recommended):** `npm start` launches the Node.js backend
  with a persistent SQLite database, session authentication for staff,
  server-enforced queue rules and live updates. All pages auto-detect the
  backend and show a “Connected to demo server” badge.
- **Local demo mode:** opening `index.html` directly (or `npm run
  start:static`) runs the UI against per-browser localStorage. This is useful
  for offline demonstrations only and cannot synchronize between devices.

> **DEMO PROTOTYPE.** Nothing here confirms a real appointment. Seeded names,
> tokens and records are **fictional demo data**. No real-provider pilot has
> been conducted and no community impact is claimed. This project is not
> affiliated with, endorsed or approved by any government department.

## The community problem

Visitors to MeeSeva centres, panchayat offices and municipal counters often
wait in unmanaged physical queues with no visibility of their turn. Staff
manage crowds with registers or memory, which causes disputes about order,
long perceived waiting times and wasted trips when counters are closed.
QueueManager demonstrates how a simple token + status workflow could organise
such queues: citizens take a numbered token, staff call tokens in order, and
everyone sees the current status.

## Main features

**Citizen page (`index.html`)**
- Four demo office types with per-office services, hours, lunch breaks and
  weekly holidays (Sundays closed; municipal offices also closed Saturdays).
- Appointment booking with date + time-slot picker, slot capacity limits
  (4 per slot), past-slot blocking and closed-day validation.
- Walk-in token option for the current day while the counter is open.
- Minimum data only: display name/alias plus an optional short note.
  Aadhaar, ID numbers and phone numbers are rejected by validation.
- Unique queue token (e.g. `A-001`) + booking reference (e.g. `QE-7F3K9A`)
  on a confirmation screen with live queue position and an illustrative wait
  estimate.
- “My tokens” list, token tracking by reference/token, and self-cancellation
  of waiting bookings.
- Printable token slip from the confirmation screen.
- English / Telugu language switch for the whole interface.

**Public display board (`display.html`)**
- Read-only “Now serving” board with large high-contrast token cards.
- Today’s waiting list, office filter, auto-refresh every 10 seconds plus
  instant cross-tab updates (book on one tab, watch the board update).

**Staff dashboard (`staff.html`)**
- Summary cards for Waiting / Serving / Completed / Cancelled / No-show.
- “Call next token” (serves the earliest waiting entry; blocked while another
  token is being served at the same office/date).
- Per-token actions: Start serving, Complete, Cancel, No-show, Back to Waiting
  (all transitions validated against a documented transition table).
- Filters for office, service, status, visit type and date; search by token,
  reference or name.
- Walk-in token creation, CSV + JSON export, demo settings (configurable
  average minutes per token), and reset-demo-data with a type-`RESET`
  confirmation step.
- Estimated wait = people ahead × configured average minutes, always shown
  with an “illustrative, not guaranteed” notice.

**Operations reports (`reports.html`)**
- Authenticated management view with date-range filtering.
- Aggregate token volume, completion rate and average service duration.
- Office comparison and daily demand visualisation.
- Reports intentionally omit names, booking references and notes.

## Technology stack (actually used)

- Frontend: plain **HTML + CSS + vanilla JavaScript** — no frameworks, no
  build step, no CDNs, works offline. The same pages run in both modes.
- Backend: **Node.js standard library only** (`node:http`, `node:sqlite`,
  `node:crypto`) — zero npm dependencies. REST JSON API + Server-Sent Events,
  served from the same origin as the app (no CORS needed).
- Database: **SQLite** file (`data/queueease.db` by default) with a
  normalized schema (offices, services, entries, users, sessions, audit),
  primary/foreign/unique keys, indexes and `IMMEDIATE` transactions.
  PostgreSQL is the recommended production path (see Deployment); the SQL is
  standard and the store is isolated in `server/db.js` for that migration.
- Queue rules live in **`assets/js/queue.js`**, required by both the browser
  and the server — one implementation, tested once, enforced twice
  (instant client feedback + authoritative server checks).
- **Node.js 22+** required for the backend (`node:sqlite`); Node v24 used
  here. The static frontend alone needs only a browser.

Project layout:

```
index.html / staff.html / display.html   citizen page, staff dashboard,
                                         public display board
completed.html / reports.html            completed history and operations reports
assets/css/styles.css        design system (blue/teal, responsive, accessible)
assets/js/config.js          offices, services, hours, scheduling rules
assets/js/queue.js           queue engine: validation, tokens, transitions,
                             estimates, CSV export (browser AND server)
assets/js/storage.js         localStorage adapter, seeding, reset, migration
assets/js/i18n.js            English/Telugu strings + date formatting
assets/js/ui.js              toasts, dialogs, badges, downloads
assets/js/api.js             backend REST/SSE client + server/local detection
assets/js/citizen.js         citizen page behaviour (dual-mode)
assets/js/staff.js           staff dashboard behaviour (dual-mode + admin UI)
assets/js/display.js         display board behaviour (dual-mode, SSE live)
server/index.js              backend entry: static hosting + API + SSE
server/api.js                REST routes, atomic allocation, audit, snapshots
server/db.js                 SQLite schema, migrations, seed, store, mutex
server/auth.js               sessions, role checks, rate limiting
server/auth-crypto.js        scrypt hashing, session tokens
server/env.js                .env loading with safe defaults
server.js                    static-only fallback server (no API)
docs/API.md                  full endpoint reference
tests/                       unit + API + static tests and browser E2E suites
data/queueease.db            SQLite database file (created at first boot)
```

Queue logic (`queue.js`) is shared by browser and server; persistence has
two implementations with the same record shape: `server/db.js` (SQLite,
authoritative in server mode) and `assets/js/storage.js` (localStorage,
standalone local mode and citizen offline cache).

## Prerequisites and running locally

- Browser (Chrome/Edge/Firefox, 2023+) for the UI.
- Node.js 22+ for the backend and tests (v24.15.0 used here). No `npm
  install` needed — zero dependencies.

**Option A — full demo (recommended): backend + persistent database**

```bat
cd QueueManager_CSI
npm start
```

Then open `http://localhost:8080/index.html` (citizen),
`http://localhost:8080/staff.html` (staff), `http://localhost:8080/completed.html`
(history), `http://localhost:8080/reports.html` (management reports) and
`http://localhost:8080/display.html` (board).
First boot creates `data/queueease.db`, optionally seeds fictional demo
entries when `SEED_DEMO_DATA=true`, creates the configured accounts, and
prints the URLs. Health check: `/api/health`.

Demo sign-in (staff page → Staff sign-in; **change for real use**):

| Role  | Username | Password        |
|---|---|---|
| staff | `staff`  | `staff-demo-123` |
| admin | `admin`  | `admin-demo-123` |

Override via environment or a `.env` file (see `.env.example`):
`PORT`, `HOST`, `NODE_ENV`, `DB_PATH`, `SESSION_SECRET`, `SESSION_TTL_HOURS`,
`COOKIE_SECURE`, `SEED_DEMO_DATA`,
`SEED_ADMIN_USER/PASSWORD`, `SEED_STAFF_USER/PASSWORD`, rate limits,
`BODY_LIMIT_BYTES`. Never commit a real `.env`.

**Option B — static local demo:** `npm run start:static`, or open
`index.html` directly. Same UI against browser localStorage only.

**Tests:**

```bat
npm test              :: unit + API + static checks (no dependencies)
npm run test:e2e        :: local-mode browser workflow (needs Chrome)
npm run test:e2e-server :: backend UI integration workflow (needs Chrome)
npm run check         :: syntax check of every JS file
```

**Deploy using GitHub Pages:** upload the whole folder to a repository,
then Settings → Pages → “Deploy from a branch”, branch `main`, folder
`/(root)`. No build step is required.

## Citizen booking-to-completion demo (evaluator script, server mode)

1. Start the backend (`npm start`) and open the citizen page. The badge
   reads “Connected to demo server”.
2. Choose an office card (e.g. **MeeSeva Centre**) → **Book at this office**.
3. Pick a service, a date and an available time slot; enter a display name
   (e.g. `Anitha`) and press **Get queue token**. Future dates start as
   **Booked**; today’s bookings join **Waiting** immediately.
4. Note the token (e.g. `A-005`) and the `QE-XXXXXX` reference. Use **Print
   token** for a paper slip.
5. Open the **staff demo** and **sign in** as `staff` / `staff-demo-123`.
6. Set the office and the booking date in **Call next token** and press it —
   the date’s queue opens (Booked → Waiting) and your token shows **Serving**.
7. Find the token (or search `A-005`) and press **Complete**.
8. The summary cards update and the citizen “My tokens” entry shows
   **Completed**.
9. Open the **display board** on a second screen: serving tokens and today’s
   waiting list update live. As `admin`, the staff page also shows user
   management and the audit log.

## How the prototype stores data

**Server mode (authoritative):** one SQLite file (`DB_PATH`, default
`data/queueease.db`) with tables `offices, services, entries, users,
sessions, audit, meta`. Each entry carries `id, reference (unique), token,
token_seq (+ UNIQUE(office_id, date, token_seq)), office/service, date/time,
name, channel, note, status, created/updated timestamps, history[], demo`.
Back up by copying the `.db` file while the server is stopped.

**Local mode:** one JSON document under the `queueease.state.v1`
localStorage key (same record shape). Corrupt JSON is quarantined and the
previous prototype’s `qe_bookings` key migrates once. Local storage never
synchronises between users, browsers or devices — use server mode for any
shared queue.

## Test cases and actual results

Full record in [`TESTING.md`](TESTING.md), API reference in
[`docs/API.md`](docs/API.md). Summary:

- `npm test`: **78 checks** — queue engine incl. new `Booked` status (35),
  storage incl. localStorage regression (7), i18n/id/branding static checks
  (13), backend API (22): booking, validation, duplicates, capacity,
  20-way concurrent allocation (exactly 4 win, unique tokens), auth
  (401/403), transitions, citizen cancel, stats-vs-rows, board feed, CSV
  export, SSE stream, restart persistence with continuing token sequence,
  admin user management, audit, reset.
- `npm run test:e2e` (local mode, headless Chrome): **28/28** — full
  citizen→staff→display flow, Telugu, 390 px layout, CSV download,
  type-`RESET` reset, zero console errors.
- `npm run test:e2e-server` (backend mode, headless Chrome): **25/25** —
  server badge, API booking with `Booked` status, tracking, staff sign-in
  lockout, call-next promotion, live SSE board, completed-token page,
  walk-in, logout lockout, admin create-user + audit via UI, zero console
  errors.
- Notable finds while testing: a scoping bug that silently disabled browser
  persistence (fixed + regression-tested); duplicate demo references
  rejected by the new UNIQUE constraint (seed fixed); an admin-route id
  parsing bug (fixed + covered); a date-scoped summary leaking into global
  cards (fixed + covered).

## Current limitations

- Demo-grade deployment: single Node process, SQLite file (no replication),
  in-memory rate limits, stdout logs. Fine for evaluation, not for load.
- Seeded demo passwords are public by design; set real ones via `.env`
  before any shared use, and serve behind HTTPS (use a reverse proxy).
- Office hours/services are code configuration (`assets/js/config.js`,
  seeded once into the DB); there is no office-CRUD UI yet.
- Authorized staff/admin workflows can archive completed tokens after confirmation.
  Archiving removes them from active queue results but retains a protected snapshot
  for administrators at `/api/admin/archived`; the action is audited and broadcasts
  a live queue update.
- The server staff workflow has a separate `completed.html` page. The active
  queue shows only Booked, Waiting, and Serving records; completed records are
  queried through the authenticated, paginated `/api/completed` endpoint.
- No SMS/email/WhatsApp notifications (in-app toasts + live board only);
  none are claimed.
- Estimated waits are illustrative arithmetic, not predictions.
- Telugu translations have not been professionally reviewed.
- Accessibility is baseline (labels, focus rings, live regions); no
  assistive-technology audit yet.
- Local demo mode still cannot share queues between devices (by design).

## Future improvements required before real deployment

1. **PostgreSQL migration:** run Postgres (Docker/compose or managed),
   port `server/db.js` (parameter placeholders, `SERIAL` audit id,
   severity of WAL tuning), and re-run `tests/api.test.js` against it.
2. **Hardening:** HTTPS everywhere, rotated `SESSION_SECRET`, stricter rate
   limits, persistent audit shipping, database backups + restore drills,
   multi-process or replicated deployment.
3. **Privacy review:** data minimisation, retention/deletion policy,
   consent, and alignment with applicable data-protection law.
4. Real provider partnership: consenting counters, measured baseline vs.
   post-deployment waiting times, anonymous feedback only.
5. Operational depth: office/hours CRUD UI, staff password rotation,
   assisted-access (non-smartphone) channels, Telugu UX review.
6. Formal QA: cross-browser matrix, screen-reader audit, penetration test.

## Multi-user deployment checklist

1. Use Node.js >= 22 and copy `.env.example` to `.env`.
2. For a shared deployment set `NODE_ENV=production`,
   `SEED_DEMO_DATA=false`, a long random `SESSION_SECRET`, strong seed
   passwords, and `COOKIE_SECURE=true` when HTTPS is enabled.
3. Keep `DB_PATH` on persistent storage. Do not run separate backend
   processes against the same SQLite file.
4. Start `npm start`, verify `/api/health`, and use the server URL from every
   device (not `file://` or the static server).
5. Put the server behind HTTPS and a reverse proxy before exposing it beyond
   localhost. Keep `data/` outside the web root.
6. Sign in as admin, create named staff accounts, and deactivate temporary
   seed accounts. Never share seed passwords.
7. Back up the database before upgrades and regularly thereafter. Stop the
   server for a simple consistent copy:

   ```bat
   copy data\queueease.db backups\queueease-backup.db
   ```

   Restore by replacing the database file while the server is stopped, then
   restart and check `/api/health`.
8. Never commit `.env`, `data/*.db`, WAL files, credentials, or backups.

### Testing from two devices

1. Set `HOST=0.0.0.0`, start the backend, and allow the configured port
   through the host firewall.
2. Find the host LAN address, such as `192.168.1.20`.
3. Open `http://192.168.1.20:8080/index.html` on both devices.
4. Create a booking on device A and verify it appears on the staff or display
   page on device B.
5. Call and complete it from staff; verify the other open pages update without
   a refresh.
6. For internet testing, use HTTPS and a reverse proxy instead of exposing
   the development HTTP server directly.
