/* QueueEase - backend API tests (real HTTP against server/index.js).
 * Spawns the backend on a test port with an isolated temp database file.
 * Skipped gracefully only if the server cannot boot (reported as failure).
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8931;
const BASE = 'http://127.0.0.1:' + PORT;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function pad(n) { return String(n).padStart(2, '0'); }
function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/* Next non-Sunday date (all demo offices are closed Sundays). */
function nextOpenDate(fromOffset) {
  const d = new Date();
  for (let i = fromOffset; i < fromOffset + 14; i++) {
    const t = new Date(d);
    t.setDate(t.getDate() + i);
    if (t.getDay() !== 0) { return isoOf(t); }
  }
  throw new Error('no open date found');
}

function startServer(dbFile) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DB_PATH: dbFile,
      SESSION_SECRET: 'test-secret-do-not-reuse',
      SEED_DEMO_DATA: 'false',
      RATE_BOOK_PER_MIN: '1000',
      RATE_LOGIN_PER_MIN: '100'
    }),
    stdio: 'pipe'
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function waitHealth() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) { return await r.json(); }
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('backend did not boot on ' + BASE);
}

function stopServer(child) {
  return new Promise((resolve) => {
    try {
      child.on('exit', () => resolve());
      child.kill();
      setTimeout(resolve, 3000);
    } catch (e) { resolve(); }
  });
}

/* Minimal cookie jar around global fetch. */
function client() {
  const jar = {};
  async function req(method, p, body, extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    const cookie = Object.keys(jar).map((k) => k + '=' + jar[k]).join('; ');
    if (cookie) { headers.Cookie = cookie; }
    let res;
    try {
      res = await fetch(BASE + p, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('connection failed for ' + method + ' ' + p + ': ' + e.message);
    }
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const m = /^([^=]+)=([^;]*)/.exec(sc);
      if (m) {
        if (/Max-Age=0/i.test(sc)) { delete jar[m[1]]; }
        else { jar[m[1]] = m[2]; }
      }
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { _raw: text }; }
    return { status: res.status, data, text };
  }
  return {
    get: (p) => req('GET', p),
    post: (p, b, h) => req('POST', p, b, h),
    patch: (p, b, h) => req('PATCH', p, b, h)
  };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRST';
const person = (i) => 'Load Person ' + LETTERS[i % LETTERS.length] + (i >= LETTERS.length ? ' Again' : '');

module.exports = async function (ctx) {
  const { assert, suite } = ctx;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-api-'));
  const dbFile = path.join(tmp, 'test.db');
  let child = startServer(dbFile);
  const anon = client();
  const staff = client();
  const admin = client();
  let firstRef = null;
  let firstId = null;
  const DATE = nextOpenDate(1);
  const DATE2 = nextOpenDate(2);

  async function asStaff() {
    const r = await staff.post('/api/auth/login', { username: 'staff', password: 'staff-demo-123' });
    assert.equal(r.status, 200, 'staff login: ' + JSON.stringify(r.data));
  }
  async function asAdmin() {
    const r = await admin.post('/api/auth/login', { username: 'admin', password: 'admin-demo-123' });
    assert.equal(r.status, 200, 'admin login: ' + JSON.stringify(r.data));
  }

  try {
    await suite('api: health, config, booking', [
      {
        name: 'health reports version and entry count',
        fn: async () => {
          const h = await waitHealth();
          assert.equal(h.ok, true);
          assert(typeof h.version === 'string' && h.version.length > 0, 'version present');
          assert.equal(h.db.entries, 0, 'test server starts with a clean database');
        }
      },
      {
        name: 'config exposes offices, services and six statuses',
        fn: async () => {
          const r = await anon.get('/api/config');
          assert.equal(r.status, 200);
          assert.equal(r.data.offices.length, 4);
          assert(r.data.services.length >= 20, 'services');
          assert(r.data.statuses.indexOf('Booked') !== -1, 'Booked status listed');
        }
      },
      {
        name: 'valid booking persists with token A-001 as Booked',
        fn: async () => {
          const r = await anon.post('/api/bookings', {
            officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
            date: DATE, time: '10:00', name: 'Api Tester', note: ''
          });
          assert.equal(r.status, 201, JSON.stringify(r.data));
          assert.equal(r.data.entry.token, 'A-001');
          assert.equal(r.data.entry.status, 'Booked');
          assert(typeof r.data.ahead === 'number' && typeof r.data.estMinutes === 'number', 'position info');
          assert.equal(r.data.entry.id, undefined, 'public response omits internal id');
          assert.equal(r.data.entry.name, undefined, 'public response omits citizen name');
          assert.equal(r.data.entry.history, undefined, 'public response omits status history');
          firstRef = r.data.entry.reference;
          firstId = null;
        }
      },
      {
        name: 'invalid booking rejected with field codes, nothing stored',
        fn: async () => {
          const before = (await anon.get('/api/stats')).data.summary.total;
          const r = await anon.post('/api/bookings', {
            officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
            date: DATE, time: '10:00', name: '12345', note: ''
          });
          assert.equal(r.status, 400);
          assert.equal(r.data.error.code, 'VALIDATION_FAILED');
          assert(r.data.error.fields.some((f) => f.code === 'NAME_INVALID'), 'name code present');
          const after = (await anon.get('/api/stats')).data.summary.total;
          assert.equal(after, before, 'no row stored');
        }
      },
      {
        name: 'duplicate booking rejected',
        fn: async () => {
          const r = await anon.post('/api/bookings', {
            officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
            date: DATE, time: '10:00', name: 'Api Tester', note: ''
          });
          assert.equal(r.status, 400);
          assert(r.data.error.fields.some((f) => f.code === 'DUPLICATE_BOOKING'), 'dup code');
        }
      },
      {
        name: 'slot capacity enforced at four',
        fn: async () => {
          for (let i = 0; i < 3; i++) {
            const r = await anon.post('/api/bookings', {
              officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
              date: DATE, time: '10:00', name: person(i), note: ''
            });
            assert.equal(r.status, 201, 'fill ' + i + ': ' + JSON.stringify(r.data));
          }
          const over = await anon.post('/api/bookings', {
            officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
            date: DATE, time: '10:00', name: 'Overflow Person', note: ''
          });
          assert.equal(over.status, 400);
          assert(over.data.error.fields.some((f) => f.code === 'SLOT_FULL'), 'slot full code');
        }
      },
      {
        name: 'concurrent bookings: exactly four win, tokens unique',
        fn: async () => {
          const attempts = [];
          for (let i = 0; i < 20; i++) {
            attempts.push(anon.post('/api/bookings', {
              officeId: 'meeseva', serviceId: 'meeseva-income', channel: 'appointment',
              date: DATE, time: '10:30', name: person(i), note: ''
            }));
          }
          const results = await Promise.all(attempts);
          const won = results.filter((r) => r.status === 201);
          const lost = results.filter((r) => r.status === 400);
          assert.equal(won.length, 4, 'capacity winners, got ' + won.length);
          assert.equal(lost.length, 16, 'capacity losers');
          assert(lost.every((r) => r.data.error.fields.some((f) => f.code === 'SLOT_FULL')), 'losers are SLOT_FULL');
          const tokens = won.map((r) => r.data.entry.token);
          assert.equal(new Set(tokens).size, 4, 'unique tokens: ' + tokens.join(','));
        }
      }
    ]);

    await suite('api: auth and authorization', [
      {
        name: 'staff endpoints reject anonymous callers (401)',
        fn: async () => {
          assert.equal((await anon.get('/api/queue')).status, 401);
          assert.equal((await anon.post('/api/queue/call-next', { officeId: 'meeseva', date: DATE })).status, 401);
          assert.equal((await anon.patch('/api/entries/x/status', { status: 'Serving' })).status, 401);
          assert.equal((await anon.get('/api/admin/users')).status, 401);
          assert.equal((await anon.get('/api/reports')).status, 401);
        }
      },
      {
        name: 'wrong password rejected without leaking which field failed',
        fn: async () => {
          const r = await anon.post('/api/auth/login', { username: 'staff', password: 'wrong-password' });
          assert.equal(r.status, 401);
          assert.equal(r.data.error.code, 'INVALID_CREDENTIALS');
        }
      },
      {
        name: 'cross-origin mutations are rejected',
        fn: async () => {
          const r = await anon.post('/api/bookings', {
            officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
            date: DATE, time: '12:00', name: 'Origin Test', note: ''
          }, { Origin: 'https://attacker.example' });
          assert.equal(r.status, 403);
          assert.equal(r.data.error.code, 'CROSS_ORIGIN_FORBIDDEN');
        }
      },
      {
        name: 'staff login works; staff cannot touch admin endpoints (403)',
        fn: async () => {
          await asStaff();
          const me = await staff.get('/api/auth/me');
          assert.equal(me.status, 200);
          assert.equal(me.data.user.role, 'staff');
          assert.equal((await staff.get('/api/admin/users')).status, 403);
          assert.equal((await staff.post('/api/admin/reset', {})).status, 403);
        }
      },
      {
        name: 'admin login works and sees staff accounts',
        fn: async () => {
          await asAdmin();
          const r = await admin.get('/api/admin/users');
          assert.equal(r.status, 200);
          assert(r.data.users.length >= 2, 'seeded accounts');
        }
      },
      {
        name: 'authorized reports return aggregate metrics only',
        fn: async () => {
          const r = await staff.get('/api/reports');
          assert.equal(r.status, 200);
          assert(typeof r.data.totals.total === 'number', 'total metric');
          assert(Array.isArray(r.data.offices), 'office metrics');
          assert(Array.isArray(r.data.daily), 'daily metrics');
          assert(JSON.stringify(r.data).indexOf('Load Person') === -1, 'no citizen names in reports');
        }
      }
    ]);

    await suite('api: queue lifecycle, cancel, lookup, board, export', [
      {
        name: 'lookup returns entry with ahead/estMinutes',
        fn: async () => {
          const r = await anon.get('/api/bookings?ref=' + firstRef.toLowerCase());
          assert.equal(r.status, 200);
          assert.equal(r.data.entry.token, 'A-001');
          assert(typeof r.data.ahead === 'number', 'ahead present');
        }
      },
      {
        name: 'citizen cancel needs the reference; wrong ref is 404',
        fn: async () => {
          const bad = await anon.post('/api/bookings/' + firstRef + '/cancel', { reference: 'QE-NOPE00' });
          assert.equal(bad.status, 404);
          const ok = await anon.post('/api/bookings/' + firstRef + '/cancel', { reference: firstRef });
          assert.equal(ok.status, 200);
          assert.equal(ok.data.entry.status, 'Cancelled');
          const again = await anon.post('/api/bookings/' + firstRef + '/cancel', { reference: firstRef });
          assert.equal(again.status, 409, 'already cancelled');
        }
      },
      {
        name: 'invalid transition rejected; valid lifecycle accepted',
        fn: async () => {
          const b = await anon.post('/api/bookings', {
            officeId: 'panchayat', serviceId: 'pan-house-tax', channel: 'appointment',
            date: DATE2, time: '10:00', name: 'Lifecycle Person', note: ''
          });
          assert.equal(b.status, 201);
          const queue = await staff.get('/api/queue?q=' + encodeURIComponent('Lifecycle Person'));
          const id = queue.data.entries[0].id;
          const bad = await staff.patch('/api/entries/' + id + '/status', { status: 'Completed' });
          assert.equal(bad.status, 400);
          assert.equal(bad.data.error.code, 'TRANSITION_INVALID');
          assert.equal((await staff.patch('/api/entries/' + id + '/status', { status: 'Serving' })).status, 200);
          const done = await staff.patch('/api/entries/' + id + '/status', { status: 'Completed' });
          assert.equal(done.status, 200);
          assert.equal(done.data.entry.status, 'Completed');
          const completed = await staff.get('/api/completed?q=' + encodeURIComponent(done.data.entry.token));
          assert.equal(completed.status, 200);
          assert.equal(completed.data.total, 1);
          assert.equal(completed.data.entries[0].completionAt > 0, true);
        }
      },
      {
        name: 'concurrent call-next: one serves, one gets 409',
        fn: async () => {
          for (const n of ['Race Person One', 'Race Person Two']) {
            const r = await anon.post('/api/bookings', {
              officeId: 'other', serviceId: 'oth-voter', channel: 'appointment',
              date: DATE2, time: '10:00', name: n, note: ''
            });
            assert.equal(r.status, 201, 'setup: ' + JSON.stringify(r.data));
          }
          const [c1, c2] = await Promise.all([
            staff.post('/api/queue/call-next', { officeId: 'other', date: DATE2 }),
            staff.post('/api/queue/call-next', { officeId: 'other', date: DATE2 })
          ]);
          const codes = [c1.status, c2.status].sort().join(',');
          assert.equal(codes, '200,409', 'one winner one conflict, got ' + codes);
        }
      },
      {
        name: 'completed tokens archive safely and remain in admin history',
        fn: async () => {
          const b = await anon.post('/api/bookings', {
            officeId: 'municipal', serviceId: 'mun-property-tax', channel: 'appointment',
            date: DATE2, time: '10:00', name: 'Archive Person', note: ''
          });
          assert.equal(b.status, 201);
          const queue = await staff.get('/api/queue?q=' + encodeURIComponent('Archive Person'));
          const id = queue.data.entries[0].id;
          const early = await staff.post('/api/entries/' + id + '/archive', {});
          assert.equal(early.status, 409);
          assert.equal((await staff.patch('/api/entries/' + id + '/status', { status: 'Serving' })).status, 200);
          assert.equal((await staff.patch('/api/entries/' + id + '/status', { status: 'Completed' })).status, 200);
          const archived = await staff.post('/api/entries/' + id + '/archive', { reason: 'Completed service retained for history' });
          assert.equal(archived.status, 200);
          assert.equal(archived.data.archived, true);
          assert.equal((await staff.get('/api/queue?q=' + encodeURIComponent('Archive Person'))).data.entries.length, 0);
          assert.equal((await anon.post('/api/entries/' + id + '/archive', {})).status, 401);
          const history = await admin.get('/api/admin/archived?limit=100');
          assert.equal(history.status, 200);
          assert(history.data.entries.some((row) => row.entryId === id), 'archived row retained');
        }
      },
      {
        name: 'stats match stored records; board feed has shape',
        fn: async () => {
          const q = await staff.get('/api/queue?limit=2000');
          assert.equal(q.status, 200);
          const s = await staff.get('/api/stats');
          assert.equal(s.status, 200);
          const counted = {};
          for (const e of q.data.entries) { counted[e.status] = (counted[e.status] || 0) + 1; }
          for (const k of ['Booked', 'Waiting', 'Serving']) {
            assert.equal(s.data.summary[k] || 0, counted[k] || 0, 'active summary.' + k + ' matches rows');
          }
          assert(s.data.summary.total >= q.data.entries.length, 'summary retains historical records');
          const board = await anon.get('/api/board?officeId=all');
          assert.equal(board.status, 200);
          assert(Array.isArray(board.data.serving) && Array.isArray(board.data.waiting), 'board arrays');
          assert(typeof board.data.at === 'number', 'board timestamp');
        }
      },
      {
        name: 'CSV export downloads with header (staff only)',
        fn: async () => {
          assert.equal((await anon.get('/api/export.csv')).status, 401);
          const r = await staff.get('/api/export.csv');
          assert.equal(r.status, 200);
          assert(r.text.indexOf('reference,token,office') === 0, 'csv header');
        }
      },
      {
        name: 'SSE endpoint streams events',
        fn: async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            const res = await fetch(BASE + '/api/events', { signal: ctrl.signal });
            assert((res.headers.get('content-type') || '').indexOf('text/event-stream') !== -1, 'sse content type');
            const reader = res.body.getReader();
            const first = await reader.read();
            clearTimeout(timer);
            const chunk = Buffer.from(first.value || []).toString('utf8');
            assert(chunk.indexOf('connected') !== -1 || chunk.indexOf('event:') !== -1, 'sse prelude, got: ' + chunk.slice(0, 80));
            ctrl.abort();
          } finally {
            clearTimeout(timer);
          }
        }
      }
    ]);

    await suite('api: restart persistence, admin users, reset', [
      {
        name: 'data survives a server restart; token sequence continues',
        fn: async () => {
          const before = (await staff.get('/api/stats')).data.summary.total;
          const b1 = await anon.post('/api/bookings', {
            officeId: 'municipal', serviceId: 'mun-property-tax', channel: 'appointment',
            date: DATE2, time: '11:00', name: 'Restart Person', note: ''
          });
          assert.equal(b1.status, 201);
          const seq1 = Number(b1.data.entry.token.split('-')[1]);
          await stopServer(child);
          child = startServer(dbFile);
          await waitHealth();
          await asStaff();
          await asAdmin();
          const after = (await staff.get('/api/stats')).data.summary.total;
          assert.equal(after, before + 1, 'row survived restart');
          const b2 = await anon.post('/api/bookings', {
            officeId: 'municipal', serviceId: 'mun-property-tax', channel: 'appointment',
            date: DATE2, time: '11:30', name: 'After Restart', note: ''
          });
          assert.equal(b2.status, 201);
          assert.equal(Number(b2.data.entry.token.split('-')[1]), seq1 + 1, 'sequence continues');
        }
      },
      {
        name: 'admin creates, deactivates staff; audit records it',
        fn: async () => {
          const c = await admin.post('/api/admin/users', { username: 'teststaff', password: 'teststaff-123', role: 'staff' });
          assert.equal(c.status, 201, JSON.stringify(c.data));
          const fresh = client();
          assert.equal((await fresh.post('/api/auth/login', { username: 'teststaff', password: 'teststaff-123' })).status, 200);
          const off = await admin.patch('/api/admin/users/' + c.data.user.id, { active: false });
          assert.equal(off.status, 200);
          assert.equal((await fresh.post('/api/auth/login', { username: 'teststaff', password: 'teststaff-123' })).status, 401);
          const audit = await admin.get('/api/admin/audit?limit=50');
          assert.equal(audit.status, 200);
          assert(audit.data.audit.some((a) => a.action === 'user-create'), 'user-create audited');
          assert(audit.data.audit.some((a) => a.action === 'book'), 'booking audited');
        }
      },
      {
        name: 'admin reset clears entries (reseed off)',
        fn: async () => {
          const r = await admin.post('/api/admin/reset', { reseed: false });
          assert.equal(r.status, 200);
          assert(r.data.removed > 0, 'removed count');
          assert.equal((await staff.get('/api/stats')).data.summary.total, 0);
        }
      }
    ]);
  } finally {
    await stopServer(child);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
};
