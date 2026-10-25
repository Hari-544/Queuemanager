/* QueueManager backend - REST API (Node stdlib http).
 *
 * Business rules are NOT re-implemented here: validation, token ordering,
 * transitions and estimates all come from assets/js/queue.js, the same
 * module the browser uses. The server adds what only a server can provide:
 * atomic allocation (mutex + IMMEDIATE transactions + UNIQUE constraints),
 * authentication/authorization, rate limits and an audit trail.
 *
 * Response shape: success -> JSON payload (2xx); failure ->
 * { "error": { "code": "STRING_CODE", "message": "...", "fields": [...] } }
 */
'use strict';

const crypto = require('crypto');

const CFG = require('../assets/js/config.js');
const Q = require('../assets/js/queue.js');
const AUTH = require('./auth.js');
const { verifyPassword } = require('./auth-crypto.js');

const APP_VERSION = '2.0.0';

/* ------------------------------------------------------------ http helpers */

function sendJson(res, code, obj, extraHeaders) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function sendError(res, httpCode, code, message, fields) {
  sendJson(res, httpCode, { error: { code, message, fields: fields || [] } });
}

function publicEntry(entry) {
  if (!entry) { return null; }
  return {
    reference: entry.reference,
    token: entry.token,
    officeId: entry.officeId,
    serviceId: entry.serviceId,
    date: entry.date,
    time: entry.time,
    channel: entry.channel,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) { resolve({}); return; }
      try { resolve(JSON.parse(text)); }
      catch (e) { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------- validation bridge */

function pseudoState(rows) {
  return { version: 1, entries: rows, settings: {}, seededDemo: false, updatedAt: 0 };
}

/* Queue position for one entry: people ahead (Waiting, same office + date,
 * created earlier) and illustrative wait (ahead x office average minutes). */
function positionFor(store, entry) {
  if (!entry || entry.status !== 'Waiting') { return { ahead: 0, estMinutes: 0 }; }
  const rows = store.listEntries({ officeId: entry.officeId, date: entry.date, status: 'Waiting', limit: 2000 });
  let ahead = 0;
  for (const r of rows) {
    if (r.createdAt < entry.createdAt || (r.createdAt === entry.createdAt && r.tokenSeq < entry.tokenSeq)) {
      ahead += 1;
    }
  }
  const office = Q.getOffice(entry.officeId);
  return { ahead, estMinutes: ahead * (office ? office.avgServiceMinutes : 10) };
}

/* Rows needed to validate one booking: the office+date slice (capacity,
 * duplicates) plus the person's same-day rows (active limit). */
function validationRows(store, officeId, date, name) {
  const bySlot = store.listEntries({ officeId, date, limit: 2000 });
  const byName = name
    ? store.listEntries({ officeId, date, q: String(name).slice(0, 40), limit: 200 })
    : [];
  const seen = new Set(bySlot.map((e) => e.id));
  for (const e of byName) { if (!seen.has(e.id)) { bySlot.push(e); seen.add(e.id); } }
  return bySlot;
}

/* Allocate inside a mutex + IMMEDIATE transaction. Re-runs validation
 * against fresh rows, then inserts with UNIQUE(office,date,seq) retry. */
async function allocateBooking(store, input, now) {
  return store.mutex(async () => {
    const db = store.db;
    db.exec('BEGIN IMMEDIATE;');
    try {
      // daily sweep first: due bookings join the line before we validate
      store.promoteBooked({}, Q.toISODate(now), now.getTime());
      const rows = validationRows(store, input.officeId, input.date, input.name);
      const check = Q.validateBookingInput(pseudoState(rows), input, now);
      if (!check.ok) {
        db.exec('ROLLBACK;');
        return { ok: false, errors: check.errors };
      }
      const office = check.office;
      let time = input.time;
      if (check.channel === 'walkin') {
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const slotStart = Math.floor(nowMin / CFG.RULES.slotMinutes) * CFG.RULES.slotMinutes;
        time = String(Math.floor(slotStart / 60)).padStart(2, '0') + ':' + String(slotStart % 60).padStart(2, '0');
        if (Q.generateSlots(office).indexOf(time) === -1) { time = office.openTime; }
      }
      const stamp = now.getTime();
      const today = Q.toISODate(now);
      const startStatus = (check.channel === 'walkin' || input.date <= today) ? 'Waiting' : 'Booked';
      let entry = null;
      let lastError = null;
      for (let attempt = 0; attempt < 5 && !entry; attempt += 1) {
        const seq = store.maxTokenSeq(office.id, input.date) + 1;
        const candidate = {
          id: Q.toISODate(now) + '-' + seq + '-' + crypto.randomBytes(4).toString('hex'),
          reference: null, token: office.prefix + '-' + String(seq).padStart(3, '0'),
          tokenSeq: seq, tokenPrefix: office.prefix, officeId: office.id,
          serviceId: check.service.id, date: input.date, time,
          name: check.name, channel: check.channel,
          note: String((input && input.note) || '').trim().slice(0, 120),
          status: startStatus, createdAt: stamp, updatedAt: stamp,
          history: [{ status: startStatus, at: stamp }], demo: false
        };
        // unique reference, retrying against the live table
        for (let r = 0; r < 10; r += 1) {
          candidate.reference = Q.makeReference(now, Math.random);
          if (!store.getEntryByRef(candidate.reference)) { break; }
        }
        try {
          store.insertEntry(candidate);
          entry = candidate;
        } catch (err) {
          lastError = err; // UNIQUE race -> recompute seq and retry
        }
      }
      if (!entry) {
        db.exec('ROLLBACK;');
        return { ok: false, errors: [{ field: 'token', code: 'ALLOC_FAILED', message: 'Could not allocate a token. Please retry.' }], busy: !!lastError };
      }
      db.exec('COMMIT;');
      return { ok: true, entry };
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
      throw err;
    }
  });
}

/* ------------------------------------------------------------------ router */

function routeKey(method, pathname) {
  if (method === 'GET' && pathname === '/api/health') { return 'health'; }
  if (method === 'GET' && pathname === '/api/config') { return 'config'; }
  if (method === 'POST' && pathname === '/api/bookings') { return 'book'; }
  if (method === 'GET' && pathname === '/api/bookings') { return 'lookup'; }
  if (method === 'POST' && /^\/api\/bookings\/[^/]+\/cancel$/.test(pathname)) { return 'cancel'; }
  if (method === 'GET' && pathname === '/api/queue') { return 'queue'; }
  if (method === 'GET' && pathname === '/api/completed') { return 'completed'; }
  if (method === 'POST' && pathname === '/api/queue/call-next') { return 'callNext'; }
  if (method === 'PATCH' && /^\/api\/entries\/[^/]+\/status$/.test(pathname)) { return 'setStatus'; }
  if (method === 'POST' && /^\/api\/entries\/[^/]+\/archive$/.test(pathname)) { return 'archive'; }
  if (method === 'POST' && pathname === '/api/walkins') { return 'walkin'; }
  if (method === 'GET' && pathname === '/api/export.csv') { return 'csv'; }
  if (method === 'GET' && pathname === '/api/export.json') { return 'json'; }
  if (method === 'GET' && pathname === '/api/admin/archived') { return 'archived'; }
  if (method === 'GET' && pathname === '/api/stats') { return 'stats'; }
  if (method === 'GET' && pathname === '/api/reports') { return 'reports'; }
  if (method === 'GET' && pathname === '/api/board') { return 'board'; }
  if (method === 'GET' && pathname === '/api/events') { return 'events'; }
  if (method === 'POST' && pathname === '/api/auth/login') { return 'login'; }
  if (method === 'POST' && pathname === '/api/auth/logout') { return 'logout'; }
  if (method === 'GET' && pathname === '/api/auth/me') { return 'me'; }
  if (method === 'GET' && pathname === '/api/admin/users') { return 'users'; }
  if (method === 'POST' && pathname === '/api/admin/users') { return 'userCreate'; }
  if (method === 'PATCH' && /^\/api\/admin\/users\/[^/]+$/.test(pathname)) { return 'userPatch'; }
  if (method === 'GET' && pathname === '/api/admin/audit') { return 'audit'; }
  if (method === 'POST' && pathname === '/api/admin/reset') { return 'reset'; }
  return null;
}

function paramId(pathname, prefix) {
  // /api/bookings/<id>/cancel and /api/entries/<id>/status -> <id>;
  // /api/admin/users/<id> -> <id>
  const parts = String(pathname).split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === 'cancel' || last === 'status' || last === 'archive') {
    return decodeURIComponent(parts[parts.length - 2] || '');
  }
  return decodeURIComponent(last || '');
}

function createApi(store, env, hooks) {
  const broadcast = (hooks && hooks.broadcast) || (() => {});
  const log = (hooks && hooks.log) || (() => {});
  const checkLimit = AUTH.createRateLimiter();

  function limited(res, ip, bucket, perMinute) {
    if (!checkLimit(ip + ':' + bucket, perMinute)) {
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and retry.');
      return false;
    }
    return true;
  }

  function sameOriginMutation(req) {
    if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') { return true; }
    const origin = req.headers.origin;
    if (!origin) { return true; }
    try {
      return new URL(origin).host === String(req.headers.host || '');
    } catch (e) {
      return false;
    }
  }

  function buildReport(from, to) {
      const rows = store.listEntries({
        from: from || undefined,
        to: to || undefined,
        limit: 10000,
        offset: 0
      });
      const offices = {};
      const daily = {};
      const totals = { total: rows.length, booked: 0, waiting: 0, serving: 0, completed: 0, cancelled: 0, noShow: 0 };
      let serviceMinutes = 0;
      let serviceSamples = 0;
      let waitingMinutes = 0;
      let waitingSamples = 0;
      for (const office of CFG.OFFICES) {
        offices[office.id] = {
          officeId: office.id, name: office.name.en, tokenPrefix: office.prefix,
          total: 0, completed: 0, cancelled: 0, waiting: 0, serving: 0, noShow: 0,
          completionRate: 0, averageServiceMinutes: null
        };
      }
      for (const entry of rows) {
        const office = offices[entry.officeId];
        if (!office) { continue; }
        office.total += 1;
        const key = entry.status === 'Booked' ? 'booked'
          : entry.status === 'Waiting' ? 'waiting'
            : entry.status === 'Serving' ? 'serving'
              : entry.status === 'Completed' ? 'completed'
                : entry.status === 'Cancelled' ? 'cancelled' : 'noShow';
        totals[key] += 1;
        office[key] = (office[key] || 0) + 1;
        daily[entry.date] = (daily[entry.date] || 0) + 1;
        const history = Array.isArray(entry.history) ? entry.history : [];
        const servingAt = history.find((h) => h.status === 'Serving');
        const completedAt = history.slice().reverse().find((h) => h.status === 'Completed');
        if (servingAt && completedAt && Number(completedAt.at) >= Number(servingAt.at)) {
          serviceMinutes += (Number(completedAt.at) - Number(servingAt.at)) / 60000;
          serviceSamples += 1;
        }
        if (servingAt && Number(servingAt.at) >= Number(entry.createdAt)) {
          waitingMinutes += (Number(servingAt.at) - Number(entry.createdAt)) / 60000;
          waitingSamples += 1;
        }
      }
      Object.keys(offices).forEach((id) => {
        const office = offices[id];
        office.completionRate = office.total ? Math.round((office.completed / office.total) * 100) : 0;
        const done = rows.filter((entry) => entry.officeId === id && entry.status === 'Completed');
        const durations = done.map((entry) => {
          const start = (entry.history || []).find((h) => h.status === 'Serving');
          const end = (entry.history || []).slice().reverse().find((h) => h.status === 'Completed');
          return start && end ? (Number(end.at) - Number(start.at)) / 60000 : null;
        }).filter((value) => value !== null && value >= 0);
        office.averageServiceMinutes = durations.length
          ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
          : null;
      });
      return {
        generatedAt: new Date().toISOString(),
        from: from || null, to: to || null,
        totals: Object.assign(totals, {
          completionRate: totals.total ? Math.round((totals.completed / totals.total) * 100) : 0,
          averageServiceMinutes: serviceSamples ? Math.round((serviceMinutes / serviceSamples) * 10) / 10 : null,
          averageWaitingMinutes: waitingSamples ? Math.round((waitingMinutes / waitingSamples) * 10) / 10 : null
        }),
        offices: Object.values(offices),
        daily: Object.keys(daily).sort().map((date) => ({ date, total: daily[date] }))
      };
  }

  async function handle(req, res, url) {
    const key = routeKey(req.method, url.pathname);
    const ip = AUTH.clientIp(req);
    if (!key) { return false; } // not an API route -> static handler
    const at = Date.now();
    try {
      if (!sameOriginMutation(req)) {
        sendError(res, 403, 'CROSS_ORIGIN_FORBIDDEN', 'Cross-origin requests are not allowed.');
        return true;
      }
      switch (key) {
        case 'health': {
          sendJson(res, 200, {
            ok: true, version: APP_VERSION, time: new Date().toISOString(),
            db: { entries: store.countEntries() }, mode: 'server'
          });
          break;
        }
        case 'config': {
          sendJson(res, 200, {
            offices: CFG.OFFICES, services: CFG.SERVICES, rules: CFG.RULES,
            statuses: CFG.STATUSES, transitions: CFG.TRANSITIONS
          });
          break;
        }
        case 'book': {
          if (!limited(res, ip, 'book', env.RATE_BOOK_PER_MIN)) { break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const input = {
            officeId: body.officeId, serviceId: body.serviceId,
            channel: body.channel === 'walkin' ? 'walkin' : 'appointment',
            date: body.date, time: body.time, name: body.name, note: body.note
          };
          if (input.channel === 'walkin') {
            sendError(res, 400, 'WALKIN_STAFF_ONLY', 'Walk-in tokens are issued by staff. Choose an appointment instead.');
            break;
          }
          const result = await allocateBooking(store, input, new Date());
          if (!result.ok) {
            sendError(res, 400, 'VALIDATION_FAILED', 'Booking details are invalid.', result.errors);
            break;
          }
          store.audit('citizen', 'book', result.entry.id, result.entry.token + ' ' + result.entry.officeId);
          broadcast('queue', queueSnapshot());
          const pos = positionFor(store, result.entry);
          sendJson(res, 201, { entry: publicEntry(result.entry), ahead: pos.ahead, estMinutes: pos.estMinutes });
          break;
        }
        case 'lookup': {
          if (!limited(res, ip, 'lookup', env.RATE_GENERAL_PER_MIN)) { break; }
          const promoted = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const count = store.promoteBooked({}, Q.toISODate(new Date()), Date.now());
              store.db.exec('COMMIT;');
              return count;
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              return 0;
            }
          });
          if (promoted > 0) { broadcast('queue', queueSnapshot()); }
          const entry = store.getEntryByRef(url.searchParams.get('ref') || '');
          if (!entry) { sendError(res, 404, 'NOT_FOUND', 'No booking found for that reference or token.'); break; }
          const pos = positionFor(store, entry);
          sendJson(res, 200, { entry: publicEntry(entry), ahead: pos.ahead, estMinutes: pos.estMinutes });
          break;
        }
        case 'cancel': {
          if (!limited(res, ip, 'book', env.RATE_BOOK_PER_MIN)) { break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const id = paramId(url.pathname);
          const outcome = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const entry = store.getEntry(id) || store.getEntryByRef(id);
              if (!entry || entry.reference !== String(body.reference || '').trim().toUpperCase()) {
                store.db.exec('ROLLBACK;');
                return { code: 404 };
              }
              if (['Booked', 'Waiting'].indexOf(entry.status) === -1) {
                store.db.exec('ROLLBACK;');
                return { code: 409, err: 'NOT_CANCELLABLE', message: 'Only Booked or Waiting bookings can be cancelled.' };
              }
              const updated = store.setEntryStatus(entry.id, 'Cancelled', Date.now());
              store.db.exec('COMMIT;');
              return { code: 200, entry: updated };
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              throw err;
            }
          });
          if (outcome.code !== 200) {
            sendError(res, outcome.code, outcome.err || 'NOT_FOUND', outcome.message || 'Booking not found.');
            break;
          }
          store.audit('citizen', 'cancel', outcome.entry.id, outcome.entry.token);
          broadcast('queue', queueSnapshot());
          sendJson(res, 200, { entry: publicEntry(outcome.entry) });
          break;
        }
        case 'queue':
        case 'stats': {
          if (key === 'queue') {
            const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
            if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.'); break; }
          } else if (!limited(res, ip, 'lookup', env.RATE_GENERAL_PER_MIN)) {
            break; // stats is public (counts only, no personal data)
          }
          await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const sweep = store.promoteBooked({}, Q.toISODate(new Date()), Date.now());
              store.db.exec('COMMIT;');
              if (sweep > 0) { broadcast('queue', queueSnapshot()); }
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
            }
          });
          const filters = {
            officeId: url.searchParams.get('officeId') || 'all',
            serviceId: url.searchParams.get('serviceId') || 'all',
            status: url.searchParams.get('status') || 'all',
            channel: url.searchParams.get('channel') || 'all',
            date: url.searchParams.get('date') || undefined,
            from: url.searchParams.get('from') || undefined,
            to: url.searchParams.get('to') || undefined,
            q: url.searchParams.get('q') || undefined,
            limit: url.searchParams.get('limit') || 500,
            offset: url.searchParams.get('offset') || 0
          };
          if (key === 'queue' && filters.status === 'all') {
            filters.activeOnly = true;
          }
          const entries = store.listEntries(filters);
          // Queue view: entries honour the filters, but the summary cards stay
          // global (same as local mode) so counts never disagree with the store.
          // /api/stats accepts ?date= for scoped counts (citizen today view).
          const date = key === 'stats' ? url.searchParams.get('date') : null;
          const summary = date && Q.parseISODate(date)
            ? store.summarize('date = ?', [date])
            : store.summarize();
          if (key === 'stats') {
            sendJson(res, 200, { summary, byOffice: Q.statusCountsByOffice(store.listEntries({ limit: 2000 })) });
          } else {
            sendJson(res, 200, { entries, summary });
          }
          break;
        }
        case 'reports': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) {
            sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.');
            break;
          }
          const from = url.searchParams.get('from') || '';
          const to = url.searchParams.get('to') || '';
          if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
            sendError(res, 400, 'INVALID_DATE_RANGE', 'Use dates in YYYY-MM-DD format.');
            break;
          }
          if (from && to && from > to) {
            sendError(res, 400, 'INVALID_DATE_RANGE', 'The start date must not be after the end date.');
            break;
          }
          sendJson(res, 200, buildReport(from, to));
          break;
        }
        case 'completed': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) {
            sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.');
            break;
          }
          const officeId = url.searchParams.get('officeId') || 'all';
          const serviceId = url.searchParams.get('serviceId') || 'all';
          const from = url.searchParams.get('from') || '';
          const to = url.searchParams.get('to') || '';
          const q = url.searchParams.get('q') || '';
          if (officeId !== 'all' && !Q.getOffice(officeId)) {
            sendError(res, 400, 'INVALID_FILTER', 'Unknown office filter.'); break;
          }
          if (serviceId !== 'all' && !Q.getService(serviceId)) {
            sendError(res, 400, 'INVALID_FILTER', 'Unknown service filter.'); break;
          }
          if (from && !Q.parseISODate(from)) {
            sendError(res, 400, 'INVALID_FILTER', 'Invalid start date.'); break;
          }
          if (to && !Q.parseISODate(to)) {
            sendError(res, 400, 'INVALID_FILTER', 'Invalid end date.'); break;
          }
          if (from && to && from > to) {
            sendError(res, 400, 'INVALID_FILTER', 'Start date must not be after end date.'); break;
          }
          const result = store.listCompleted({
            officeId, serviceId, from, to, q: String(q).slice(0, 80),
            limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset')
          });
          sendJson(res, 200, {
            entries: result.entries,
            total: result.total,
            limit: Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100),
            offset: Math.max(Number(url.searchParams.get('offset')) || 0, 0)
          });
          break;
        }
        case 'callNext': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const officeId = body.officeId;
          const date = body.date;
          if (!Q.getOffice(officeId) || !Q.parseISODate(date)) {
            sendError(res, 400, 'VALIDATION_FAILED', 'officeId and date are required.');
            break;
          }
          const outcome = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const pseudo = pseudoState(store.listEntries({ officeId, date, limit: 2000 }));
              const result = Q.callNext(pseudo, officeId, date, new Date());
              if (!result.ok) {
                store.db.exec('ROLLBACK;');
                return { result, promoted: 0 };
              }
              // persist promotion + serving inside the same transaction
              const at = Date.now();
              const promoted = store.promoteBooked({ officeId, forDate: date }, null, at);
              const updated = store.setEntryStatus(result.entry.id, 'Serving', at);
              store.db.exec('COMMIT;');
              return { result: { ok: true, code: 'CALLED', entry: updated }, promoted };
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              throw err;
            }
          });
          if (!outcome.result.ok) {
            const code = outcome.result.code === 'ALREADY_SERVING' ? 409 : 400;
            sendError(res, code, outcome.result.code, outcome.result.message);
            break;
          }
          store.audit(gate.session.username, 'call-next', outcome.result.entry.id,
            outcome.result.entry.token + (outcome.promoted ? ' (opened queue, +' + outcome.promoted + ' promoted)' : ''));
          broadcast('queue', queueSnapshot());
          sendJson(res, 200, { entry: outcome.result.entry, promoted: outcome.promoted });
          break;
        }
        case 'setStatus': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const id = paramId(url.pathname);
          const outcome = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const rows = store.listEntries({ limit: 2000 });
              const result = Q.setStatus(pseudoState(rows), id, body.status, new Date());
              if (!result.ok) {
                store.db.exec('ROLLBACK;');
                return result;
              }
              const updated = store.setEntryStatus(id, body.status, Date.now());
              store.db.exec('COMMIT;');
              return { ok: true, code: 'UPDATED', entry: updated };
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              throw err;
            }
          });
          if (!outcome.ok) {
            const map = { NOT_FOUND: 404, ALREADY_SERVING: 409 };
            sendError(res, map[outcome.code] || 400, outcome.code, outcome.message);
            break;
          }
          store.audit(gate.session.username, 'set-status', outcome.entry.id, outcome.entry.token + ' -> ' + outcome.entry.status);
          broadcast('queue', queueSnapshot());
          sendJson(res, 200, { entry: outcome.entry });
          break;
        }
        case 'archive': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) {
            sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.');
            break;
          }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const id = paramId(url.pathname);
          const outcome = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const result = store.archiveEntry(id, gate.session.username, body.reason, Date.now());
              if (result.code !== 'ARCHIVED') {
                store.db.exec('ROLLBACK;');
                return result;
              }
              store.db.exec('COMMIT;');
              return result;
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              throw err;
            }
          });
          if (outcome.code !== 'ARCHIVED') {
            const status = outcome.code === 'NOT_FOUND' ? 404 : 409;
            sendError(res, status, outcome.code, outcome.code === 'NOT_ELIGIBLE'
              ? 'Only completed tokens can be archived.'
              : 'Token was not found.');
            break;
          }
          store.audit(gate.session.username, 'archive', outcome.entry.id,
            outcome.entry.token + (body.reason ? ' reason=' + String(body.reason).slice(0, 120) : ''));
          broadcast('queue', queueSnapshot());
          sendJson(res, 200, { archived: true, entry: outcome.entry, archiveId: outcome.archiveId });
          break;
        }
        case 'walkin': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const today = Q.toISODate(new Date());
          const result = await allocateBooking(store, {
            officeId: body.officeId, serviceId: body.serviceId, channel: 'walkin',
            date: today, time: null, name: body.name, note: ''
          }, new Date());
          if (!result.ok) {
            sendError(res, 400, 'VALIDATION_FAILED', 'Walk-in details are invalid.', result.errors);
            break;
          }
          store.audit(gate.session.username, 'walkin', result.entry.id, result.entry.token);
          broadcast('queue', queueSnapshot());
          const pos = positionFor(store, result.entry);
          sendJson(res, 201, { entry: result.entry, ahead: pos.ahead, estMinutes: pos.estMinutes });
          break;
        }
        case 'csv':
        case 'json': {
          const gate = AUTH.requireRole(['staff', 'admin'])(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Staff sign-in required.'); break; }
          const rows = store.listEntries({ limit: 2000 });
          if (key === 'csv') {
            const body = Buffer.from(Q.toCSV(rows), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': body.length, 'Content-Disposition': 'attachment; filename="queueease-export.csv"' });
            res.end(body);
          } else {
            sendJson(res, 200, { app: 'QueueManager server export', exportedAt: new Date().toISOString(), entries: rows });
          }
          break;
        }
        case 'archived': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) {
            sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.');
            break;
          }
          sendJson(res, 200, {
            entries: store.listArchived(url.searchParams.get('limit'), url.searchParams.get('offset'))
          });
          break;
        }
        case 'events': {
          hooks.subscribeSSE(req, res);
          break;
        }
        case 'board': {
          // Public read-only board feed (aliases only, same data as the wall display).
          if (!limited(res, ip, 'lookup', env.RATE_GENERAL_PER_MIN)) { break; }
          const promoted = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const count = store.promoteBooked({}, Q.toISODate(new Date()), Date.now());
              store.db.exec('COMMIT;');
              return count;
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              return 0;
            }
          });
          if (promoted > 0) { broadcast('queue', queueSnapshot()); }
          const today = Q.toISODate(new Date());
          const officeId = url.searchParams.get('officeId') || 'all';
          const publicFields = (entry) => ({
            id: entry.id,
            token: entry.token,
            officeId: entry.officeId,
            serviceId: entry.serviceId,
            date: entry.date,
            status: entry.status,
            updatedAt: entry.updatedAt
          });
          const serving = store.listEntries({ officeId, status: 'Serving', limit: 50 })
            .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
          const waiting = store.listEntries({ officeId, status: 'Waiting', date: today, limit: 200 });
          sendJson(res, 200, {
            serving: serving.map(publicFields),
            waitingTotal: waiting.length,
            waiting: waiting.slice(0, 12).map(publicFields),
            at: Date.now()
          });
          break;
        }
        case 'login': {
          if (!limited(res, ip, 'login', env.RATE_LOGIN_PER_MIN)) { break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const user = store.findUserByUsername(body.username || '');
          if (!user || !user.active || !verifyPassword(body.password || '', user.pass_hash)) {
            log('auth-failed', ip, String(body.username || '').slice(0, 40));
            sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
            break;
          }
          const token = AUTH.login(store, user, env.SESSION_TTL_HOURS);
          store.audit(user.username, 'login', null, 'role=' + user.role);
          sendJson(res, 200,
            { user: { username: user.username, role: user.role } },
            { 'Set-Cookie': AUTH.cookieHeader(token, env.SESSION_TTL_HOURS, env.COOKIE_SECURE) });
          break;
        }
        case 'logout': {
          AUTH.logout(req, store);
          sendJson(res, 200, { ok: true }, { 'Set-Cookie': AUTH.clearCookieHeader(env.COOKIE_SECURE) });
          break;
        }
        case 'me': {
          const sess = AUTH.getSession(req, store);
          if (!sess) { sendError(res, 401, 'UNAUTHENTICATED', 'Not signed in.'); break; }
          sendJson(res, 200, { user: { username: sess.username, role: sess.role } });
          break;
        }
        case 'users': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.'); break; }
          sendJson(res, 200, { users: store.listUsers() });
          break;
        }
        case 'userCreate': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const username = String(body.username || '').trim().toLowerCase();
          const role = body.role === 'admin' ? 'admin' : 'staff';
          if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
            sendError(res, 400, 'VALIDATION_FAILED', 'Username must be 3-32 lowercase letters, digits, dots, dashes or underscores.');
            break;
          }
          let passHash;
          try {
            const { hashPassword } = require('./auth-crypto.js');
            passHash = hashPassword(body.password || '');
          } catch (e) {
            sendError(res, 400, 'VALIDATION_FAILED', 'Password must be at least 8 characters.');
            break;
          }
          if (store.findUserByUsername(username)) {
            sendError(res, 409, 'USERNAME_TAKEN', 'That username already exists.');
            break;
          }
          const created = store.createUser(username, passHash, role);
          store.audit(gate.session.username, 'user-create', null, username + ' role=' + role);
          sendJson(res, 201, { user: { id: created.id, username, role, active: 1 } });
          break;
        }
        case 'userPatch': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { sendError(res, e.status || 400, 'BAD_BODY', e.message); break; }
          const id = paramId(url.pathname);
          const ok = store.setUserActive(id, body.active !== false);
          if (!ok) { sendError(res, 404, 'NOT_FOUND', 'Staff account not found.'); break; }
          store.audit(gate.session.username, body.active !== false ? 'user-activate' : 'user-deactivate', null, id);
          sendJson(res, 200, { ok: true });
          break;
        }
        case 'audit': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.'); break; }
          sendJson(res, 200, { audit: store.listAudit(url.searchParams.get('limit') || 50) });
          break;
        }
        case 'reset': {
          const gate = AUTH.requireRole('admin')(req, store);
          if (gate.error) { sendError(res, gate.error, gate.error === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'Administrator sign-in required.'); break; }
          let body;
          try { body = await readBody(req, env.BODY_LIMIT_BYTES); }
          catch (e) { body = {}; }
          const outcome = await store.mutex(async () => {
            store.db.exec('BEGIN IMMEDIATE;');
            try {
              const removed = store.deleteAllEntries();
              store.db.exec('COMMIT;');
              return removed;
            } catch (err) {
              try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
              throw err;
            }
          });
          const S = require('../assets/js/storage.js');
          if (body.reseed !== false) {
            const demo = S.buildDemoState(new Date());
            await store.mutex(async () => {
              store.db.exec('BEGIN IMMEDIATE;');
              try {
                for (const e of demo.entries) { store.insertEntry(e); }
                store.db.exec('COMMIT;');
              } catch (err) {
                try { store.db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
                throw err;
              }
            });
          }
          store.audit(gate.session.username, 'reset', null, 'removed=' + outcome + ' reseed=' + (body.reseed !== false));
          broadcast('queue', queueSnapshot());
          sendJson(res, 200, { ok: true, removed: outcome });
          break;
        }
      }
    } catch (err) {
      log('api-error', req.method, url.pathname, err && err.message);
      sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please retry.');
    }
    const ms = Date.now() - at;
    log('access', req.method, url.pathname, res.statusCode, ms + 'ms');
    return true;
  }

  function queueSnapshot() {
    try {
      return { summary: store.summarize(), at: Date.now() };
    } catch (e) {
      return { summary: null, at: Date.now() };
    }
  }

  return { handle, queueSnapshot };
}

module.exports = { createApi, APP_VERSION };
