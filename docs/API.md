# QueueEase API reference

Base URL is the same origin that serves the app (no CORS needed):
`http://localhost:8080/api/...`. All bodies and responses are JSON, except
`GET /api/export.csv` (CSV) and `GET /api/events` (Server-Sent Events).

Failure shape (all error statuses):

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable.", "fields": [] } }
```

`fields` carries per-field validation failures: `[{ "field": "time",
"code": "SLOT_FULL", "message": "..." }]`. `message` text is generic and safe
to display; unexpected failures return `INTERNAL_ERROR` with the detail only
in the server log.

Status codes used: `200` ok, `201` created, `400` validation/bad body,
`401` sign-in required or bad credentials, `403` wrong role, `404` unknown
id/reference/endpoint, `409` state conflict (slot race, serving conflict,
non-cancellable), `413` body too large, `429` rate limited, `500` internal.

Auth: cookie session `qe_session` (httpOnly, SameSite=Lax, 12 h default).
Send it automatically with same-origin `fetch(..., { credentials:
'same-origin' })`. Roles: `staff` (queue operations) and `admin` (everything
+ user/audit/reset administration).

## Public

| Method + path | Auth | Description |
|---|---|---|
| `GET /api/health` | no | `{ ok, version, time, db: { entries }, mode }` |
| `GET /api/config` | no | offices, services, rules, statuses, transitions |
| `POST /api/bookings` | no, rate-limited | citizen booking (appointments only) |
| `GET /api/bookings?ref=QE-XXXXXX` | no, rate-limited | lookup by reference **or** token; includes `ahead`, `estMinutes` |
| `POST /api/bookings/:id/cancel` | no (`{ reference }` must match) | cancel a Booked/Waiting booking; the path may use the booking reference |
| `GET /api/stats[?date=YYYY-MM-DD]` | no | `{ summary, byOffice }` counts; `?date=` scopes the summary |
| `GET /api/reports[?from=YYYY-MM-DD&to=YYYY-MM-DD]` | staff/admin | aggregate service KPIs, average wait/service time, office comparison and daily demand |
| `GET /api/board?officeId=all` | no | display feed: `{ serving[], waiting[], waitingTotal, at }` |
| `GET /api/events` | no | SSE `queue` events with `{ summary, at }` (+ `:heartbeat`) |

`POST /api/bookings` body:

```json
{
  "officeId": "meeseva", "serviceId": "meeseva-cert",
  "channel": "appointment", "date": "2026-10-13", "time": "10:00",
  "name": "Anitha", "note": "certificate copy"
}
```

Success `201`: `{ "entry": {...}, "ahead": 0, "estMinutes": 0 }`. New
future-date bookings start as `Booked`; same-day bookings and staff
walk-ins start as `Waiting`.

Public booking and lookup responses intentionally omit internal database IDs,
citizen names, notes, and status history. Only token-tracking fields are
returned.

## Staff (`staff` or `admin` session)

| Method + path | Description |
|---|---|
| `GET /api/queue?officeId=&serviceId=&status=&channel=&date=&from=&to=&q=&limit=&offset=` | filtered entries + global `summary` |
| `GET /api/completed?officeId=&serviceId=&from=&to=&q=&limit=&offset=` | authenticated, paginated completed tokens with `total`; searches token/reference |
| `POST /api/queue/call-next` `{ officeId, date }` | promote that date's Booked entries, serve earliest Waiting; `409` while another token is serving |
| `PATCH /api/entries/:id/status` `{ status }` | validated transition; `409` on serving conflict |
| `POST /api/entries/:id/archive` `{ reason? }` | archive a Completed token; staff/admin only; `409` if not Completed |
| `POST /api/walkins` `{ officeId, serviceId, name }` | walk-in token for today (counter hours enforced) |
| `GET /api/export.csv` | CSV download of all records |
| `GET /api/export.json` | JSON download of all records |

## Auth

| Method + path | Description |
|---|---|
| `POST /api/auth/login` `{ username, password }` | sets the session cookie; `401 INVALID_CREDENTIALS` |
| `POST /api/auth/logout` | clears session + cookie |
| `GET /api/auth/me` | `{ user: { username, role } }` or `401` |

## Admin (`admin` session only)

| Method + path | Description |
|---|---|
| `GET /api/admin/users` | staff accounts (no password hashes) |
| `POST /api/admin/users` `{ username, password (8+), role }` | create account; `409 USERNAME_TAKEN` |
| `PATCH /api/admin/users/:id` `{ active }` | deactivate / reactivate |
| `GET /api/admin/audit?limit=50` | newest-first audit rows |
| `POST /api/admin/reset` `{ reseed }` | delete all entries, optionally reseed fictional demo data |
| `GET /api/admin/archived?limit=&offset=` | archived token history; administrator only |

## Queue rules (enforced server-side)

- Tokens are sequential per office + date (`A-001…`), never re-issued after
  cancellation; allocation runs in a mutex + `IMMEDIATE` transaction with a
  `UNIQUE(office_id, date, token_seq)` constraint and retry, so concurrent
  bookings cannot duplicate or overfill.
- Slot capacity (default 4 appointments/slot) and duplicate/active-booking
  limits are re-validated inside the booking transaction.
- `callNext` promotes that office+date's `Booked` entries to `Waiting`
  (opening the counter), then serves the earliest Waiting entry; only one
  `Serving` entry per office+date is allowed (`409 ALREADY_SERVING`).
- Status changes must follow the transition table from `GET /api/config`.
- The active staff queue defaults to `Booked`, `Waiting`, and `Serving`; completed,
  cancelled, and no-show records are available through their protected history
  views rather than the active queue.
- Due `Booked` entries (date arrived) are swept to `Waiting` on queue reads.
- Every mutation writes an audit row and broadcasts an SSE `queue` event.
- Archiving is a soft-delete: the completed row leaves active queue results but its
  protected snapshot remains available through the administrator archive endpoint.
- Estimated wait = people ahead × office average minutes (illustrative).
