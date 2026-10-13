/* QueueEase backend - SQLite persistence (node:sqlite, stdlib).
 *
 * One file database, ACID transactions, UNIQUE constraints. Token allocation
 * and status changes run inside IMMEDIATE transactions behind an async mutex,
 * so concurrent bookings cannot produce duplicate tokens or overfill a slot.
 *
 * Schema is versioned (PRAGMA user_version); v1 is the baseline. Future
 * changes must add guarded migrations in migrate(), never edit v1 blocks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const CFG = require('../assets/js/config.js');
const Q = require('../assets/js/queue.js');
const S = require('../assets/js/storage.js');
const { hashPassword } = require('./auth-crypto.js');

const SCHEMA_VERSION = 2;

/* Serialize write transactions (Node is single-threaded but async
 * interleaving between HTTP handlers is real). */
function createMutex() {
  let tail = Promise.resolve();
  return function mutex(fn) {
    const run = tail.then(() => fn());
    tail = run.catch(() => {});
    return run;
  };
}

function rowToEntry(r) {
  let history = [];
  try { history = JSON.parse(r.history || '[]'); } catch (e) { history = []; }
  return {
    id: r.id,
    reference: r.reference,
    token: r.token,
    tokenSeq: r.token_seq,
    tokenPrefix: r.token_prefix,
    officeId: r.office_id,
    serviceId: r.service_id,
    date: r.date,
    time: r.time,
    name: r.name,
    channel: r.channel,
    note: r.note || '',
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    history,
    demo: r.demo === 1
  };
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= SCHEMA_VERSION) { return { migrated: false, version: current }; }

  /* ---- v1 baseline (do not edit; add new versions below) ---- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS offices (
      id TEXT PRIMARY KEY, prefix TEXT NOT NULL, name_en TEXT NOT NULL, name_te TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '', avg_minutes INTEGER NOT NULL, walkin_enabled INTEGER NOT NULL DEFAULT 1,
      open_days TEXT NOT NULL, open_time TEXT NOT NULL, close_time TEXT NOT NULL,
      lunch_start TEXT, lunch_end TEXT
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices(id),
      name_en TEXT NOT NULL, name_te TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, token TEXT NOT NULL,
      token_seq INTEGER NOT NULL, token_prefix TEXT NOT NULL,
      office_id TEXT NOT NULL REFERENCES offices(id), service_id TEXT NOT NULL,
      date TEXT NOT NULL, time TEXT NOT NULL, name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'appointment', note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      history TEXT NOT NULL DEFAULT '[]', demo INTEGER NOT NULL DEFAULT 0,
      UNIQUE (office_id, date, token_seq)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_office_date_status ON entries (office_id, date, status);
    CREATE INDEX IF NOT EXISTS idx_entries_reference ON entries (reference);
    CREATE INDEX IF NOT EXISTS idx_entries_token ON entries (token);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('staff', 'admin')),
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL,
      actor TEXT NOT NULL, action TEXT NOT NULL, entry_id TEXT, detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit (at DESC);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (current < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS archived_entries (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL UNIQUE,
        archived_at INTEGER NOT NULL,
        archived_by TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        entry_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_archived_entries_at ON archived_entries(archived_at DESC);
    `);
    db.exec('PRAGMA user_version = 2;');
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  return { migrated: true, version: SCHEMA_VERSION };
}

function seedOfficesAndServices(db) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM offices').get().n;
  if (has > 0) { return false; }
  const insO = db.prepare(`INSERT INTO offices
    (id, prefix, name_en, name_te, emoji, avg_minutes, walkin_enabled, open_days, open_time, close_time, lunch_start, lunch_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const o of CFG.OFFICES) {
    insO.run(o.id, o.prefix, o.name.en, o.name.te, o.emoji, o.avgServiceMinutes,
      o.walkInEnabled ? 1 : 0, JSON.stringify(o.openDays), o.openTime, o.closeTime, o.lunchStart, o.lunchEnd);
  }
  const insS = db.prepare(`INSERT INTO services (id, office_id, name_en, name_te, minutes) VALUES (?, ?, ?, ?, ?)`);
  for (const s of CFG.SERVICES) {
    insS.run(s.id, s.officeId, s.name.en, s.name.te, s.minutes || 10);
  }
  return true;
}

function seedUsers(db, env, now) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (has > 0) { return []; }
  const created = [];
  const ins = db.prepare(`INSERT INTO users (id, username, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`);
  const mk = (username, password, role) => {
    const id = 'u-' + role + '-' + String(now.getTime().toString(36));
    ins.run(id, username.toLowerCase(), hashPassword(password), role, now.getTime());
    created.push({ username: username.toLowerCase(), role });
  };
  mk(env.SEED_ADMIN_USER, env.SEED_ADMIN_PASSWORD, 'admin');
  if ((env.SEED_STAFF_USER || '').toLowerCase() !== (env.SEED_ADMIN_USER || '').toLowerCase()) {
    mk(env.SEED_STAFF_USER, env.SEED_STAFF_PASSWORD, 'staff');
  }
  return created;
}

function seedDemoEntries(db, now) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
  if (has > 0) { return 0; }
  const demo = S.buildDemoState(now);
  const ins = db.prepare(`INSERT INTO entries
    (id, reference, token, token_seq, token_prefix, office_id, service_id, date, time, name, channel, note, status, created_at, updated_at, history, demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const e of demo.entries) {
      ins.run(e.id, e.reference, e.token, e.tokenSeq, e.tokenPrefix, e.officeId, e.serviceId,
        e.date, e.time, e.name, e.channel, e.note, e.status, e.createdAt, e.updatedAt,
        JSON.stringify(e.history), 1);
    }
    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (e2) { /* ignore */ }
    throw err;
  }
  return demo.entries.length;
}

function createStore(dbPath, env, opts) {
  const options = opts || {};
  const now = options.now || new Date();
  const db = openDb(dbPath);
  const migration = migrate(db);
  const officesSeeded = seedOfficesAndServices(db);
  const usersSeeded = seedUsers(db, env, now);
  let demoSeeded = 0;
  if (options.seedDemo !== false) {
    demoSeeded = seedDemoEntries(db, now);
  }
  db.prepare(`INSERT INTO meta (key, value) VALUES ('boot_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    .run(String(now.getTime()));

  const mutex = createMutex();

  const ENTRY_COLS = 'id, reference, token, token_seq, token_prefix, office_id, service_id, date, time, name, channel, note, status, created_at, updated_at, history, demo';

  function listEntries(f) {
    const filters = f || {};
    const where = [];
    const args = [];
    if (filters.officeId && filters.officeId !== 'all') { where.push('office_id = ?'); args.push(filters.officeId); }
    if (filters.serviceId && filters.serviceId !== 'all') { where.push('service_id = ?'); args.push(filters.serviceId); }
    if (filters.status && filters.status !== 'all') { where.push('status = ?'); args.push(filters.status); }
    if (filters.activeOnly) { where.push("status IN ('Booked', 'Waiting', 'Serving')"); }
    if (filters.channel && filters.channel !== 'all') { where.push('channel = ?'); args.push(filters.channel); }
    if (filters.date) { where.push('date = ?'); args.push(filters.date); }
    if (filters.from) { where.push('date >= ?'); args.push(filters.from); }
    if (filters.to) { where.push('date <= ?'); args.push(filters.to); }
    if (filters.q) {
      where.push('(UPPER(token) LIKE ? OR UPPER(reference) LIKE ? OR UPPER(name) LIKE ?)');
      const like = '%' + String(filters.q).toUpperCase().replace(/[%_]/g, '') + '%';
      args.push(like, like, like);
    }

    let sql = `SELECT ${ENTRY_COLS} FROM entries`;
    if (where.length) { sql += ' WHERE ' + where.join(' AND '); }
    sql += ' ORDER BY date ASC, created_at ASC, token_seq ASC';
    const limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 10000);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    sql += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
    return db.prepare(sql).all(...args).map(rowToEntry);
  }

  function completionAt(entry) {
    const item = (entry.history || []).slice().reverse().find((h) => h && h.status === 'Completed');
    return item && Number.isFinite(Number(item.at)) ? Number(item.at) : null;
  }

  function listCompleted(filters) {
    const f = filters || {};
    const where = ["status = 'Completed'"];
    const args = [];
    if (f.officeId && f.officeId !== 'all') { where.push('office_id = ?'); args.push(f.officeId); }
    if (f.serviceId && f.serviceId !== 'all') { where.push('service_id = ?'); args.push(f.serviceId); }
    if (f.from) { where.push('date >= ?'); args.push(f.from); }
    if (f.to) { where.push('date <= ?'); args.push(f.to); }
    if (f.q) {
      where.push('(UPPER(token) LIKE ? OR UPPER(reference) LIKE ?)');
      const q = '%' + String(f.q).toUpperCase().replace(/[%_]/g, '') + '%';
      args.push(q, q);
    }
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${whereSql}`).get(...args).n;
    const limit = Math.min(Math.max(Number(f.limit) || 25, 1), 100);
    const offset = Math.max(Number(f.offset) || 0, 0);
    const rows = db.prepare(`SELECT ${ENTRY_COLS} FROM entries WHERE ${whereSql}
      ORDER BY updated_at DESC, token_seq ASC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { total, entries: rows.map(rowToEntry).map((entry) => ({
      id: entry.id, reference: entry.reference, token: entry.token, tokenSeq: entry.tokenSeq,
      officeId: entry.officeId, serviceId: entry.serviceId, date: entry.date, time: entry.time,
      name: entry.name, channel: entry.channel, status: entry.status, createdAt: entry.createdAt,
      completionAt: completionAt(entry), updatedAt: entry.updatedAt
    })) };
  }

  function countEntries() {
    return db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
  }

  function summarize(where, args) {
    const rows = db.prepare(
      `SELECT status, COUNT(*) AS n FROM entries${where ? ' WHERE ' + where : ''} GROUP BY status`
    ).all(...(args || []));
    const out = { total: 0, Waiting: 0, Serving: 0, Completed: 0, Cancelled: 0, 'No-show': 0, Booked: 0 };
    for (const r of rows) {
      out[r.status] = r.n;
      out.total += r.n;
    }
    return out;
  }

  function getEntry(id) {
    const r = db.prepare(`SELECT ${ENTRY_COLS} FROM entries WHERE id = ?`).get(id);
    return r ? rowToEntry(r) : null;
  }

  function getEntryByRef(ref) {
    const key = String(ref || '').trim().toUpperCase();
    if (!key) { return null; }
    const r = db.prepare(`SELECT ${ENTRY_COLS} FROM entries WHERE UPPER(reference) = ? OR UPPER(token) = ?`).get(key, key);
    return r ? rowToEntry(r) : null;
  }

  function maxTokenSeq(officeId, date) {
    const r = db.prepare('SELECT COALESCE(MAX(token_seq), 0) AS m FROM entries WHERE office_id = ? AND date = ?').get(officeId, date);
    return r.m;
  }

  function insertEntry(e) {
    db.prepare(`INSERT INTO entries
      (id, reference, token, token_seq, token_prefix, office_id, service_id, date, time, name, channel, note, status, created_at, updated_at, history, demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(e.id, e.reference, e.token, e.tokenSeq, e.tokenPrefix, e.officeId, e.serviceId,
        e.date, e.time, e.name, e.channel, e.note || '', e.status, e.createdAt, e.updatedAt,
        JSON.stringify(e.history || []), e.demo ? 1 : 0);
    return e;
  }

  function updateStatus(id, status, at) {
    const cur = getEntry(id);
    if (!cur) { return null; }
    cur.status = status;
    cur.updatedAt = at;
    cur.history.push({ status, at });
    db.prepare('UPDATE entries SET status = ?, updated_at = ?, history = ? WHERE id = ?')
      .run(status, at, JSON.stringify(cur.history.slice(-40)), id);
    return cur;
  }

  /* Promote Booked -> Waiting. Scope: {officeId?, date?}; only past-or-due
   * dates unless the caller explicitly opens a date (forDate bypasses). */
  function promoteBooked(scope, todayISO, at) {
    const s = scope || {};
    const where = ["status = 'Booked'"];
    const args = [];
    if (s.officeId) { where.push('office_id = ?'); args.push(s.officeId); }
    if (s.forDate) { where.push('date = ?'); args.push(s.forDate); }
    else if (todayISO) { where.push('date <= ?'); args.push(todayISO); }
    const rows = db.prepare(`SELECT ${ENTRY_COLS} FROM entries WHERE ${where.join(' AND ')}`).all(...args);
    for (const r of rows) {
      const e = rowToEntry(r);
      e.status = 'Waiting';
      e.updatedAt = at;
      e.history.push({ status: 'Waiting', at });
      db.prepare('UPDATE entries SET status = ?, updated_at = ?, history = ? WHERE id = ?')
        .run('Waiting', at, JSON.stringify(e.history.slice(-40)), e.id);
    }
    return rows.length;
  }

  function setEntryStatus(id, status, at) {
    return updateStatus(id, status, at);
  }

  function deleteAllEntries() {
    const n = countEntries();
    db.prepare('DELETE FROM entries').run();
    return n;
  }

  function archiveEntry(id, actor, reason, at) {
    const entry = getEntry(id);
    if (!entry) { return { code: 'NOT_FOUND' }; }
    if (entry.status !== 'Completed') { return { code: 'NOT_ELIGIBLE', entry }; }
    const archiveId = 'archive-' + String(at) + '-' + Math.random().toString(36).slice(2, 10);
    db.prepare(`INSERT INTO archived_entries
      (id, entry_id, archived_at, archived_by, reason, entry_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(archiveId, entry.id, at, String(actor || '').slice(0, 120), String(reason || '').slice(0, 300), JSON.stringify(entry));
    db.prepare('DELETE FROM entries WHERE id = ? AND status = ?').run(id, 'Completed');
    return { code: 'ARCHIVED', entry, archiveId };
  }

  function listArchived(limit, offset) {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = Math.max(Number(offset) || 0, 0);
    return db.prepare(`SELECT id, entry_id, archived_at, archived_by, reason, entry_json
      FROM archived_entries ORDER BY archived_at DESC LIMIT ? OFFSET ?`).all(n, skip).map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      archivedAt: r.archived_at,
      archivedBy: r.archived_by,
      reason: r.reason,
      entry: JSON.parse(r.entry_json)
    }));
  }

  /* ---- users / sessions / audit ---- */

  function findUserByUsername(username) {
    return db.prepare('SELECT id, username, pass_hash, role, active, created_at FROM users WHERE username = ?')
      .get(String(username || '').toLowerCase()) || null;
  }

  function listUsers() {
    return db.prepare('SELECT id, username, role, active, created_at FROM users ORDER BY created_at ASC').all();
  }

  function createUser(username, passHash, role) {
    const id = 'u-' + String(Date.now().toString(36)) + Math.floor(Math.random() * 1e6).toString(36);
    db.prepare('INSERT INTO users (id, username, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .run(id, String(username).toLowerCase(), passHash, role, Date.now());
    return { id, username: String(username).toLowerCase(), role, active: 1 };
  }

  function setUserActive(id, active) {
    const r = db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    return r.changes > 0;
  }

  function createSession(tokenHash, userId, expiresAt) {
    const at = Date.now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, userId, at, expiresAt);
  }

  function findSession(tokenHash) {
    const r = db.prepare(`SELECT s.token_hash, s.user_id, s.expires_at, u.username, u.role, u.active
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(tokenHash);
    if (!r) { return null; }
    if (r.expires_at < Date.now() || r.active !== 1) {
      try { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); } catch (e) { /* ignore */ }
      return null;
    }
    return r;
  }

  function deleteSession(tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  function purgeExpiredSessions() {
    try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); } catch (e) { /* ignore */ }
  }

  function audit(actor, action, entryId, detail) {
    try {
      db.prepare('INSERT INTO audit (at, actor, action, entry_id, detail) VALUES (?, ?, ?, ?, ?)')
        .run(Date.now(), actor, action, entryId || null, detail ? String(detail).slice(0, 500) : null);
    } catch (e) { /* audit must never break the operation */ }
  }

  function listAudit(limit) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return db.prepare('SELECT id, at, actor, action, entry_id, detail FROM audit ORDER BY id DESC LIMIT ?').all(n);
  }

  return {
    db, mutex, migration, seeded: { offices: officesSeeded, users: usersSeeded, demoEntries: demoSeeded },
    listEntries, listCompleted, countEntries, summarize, getEntry, getEntryByRef,
    maxTokenSeq, insertEntry, setEntryStatus, promoteBooked, deleteAllEntries,
    archiveEntry, listArchived,
    findUserByUsername, listUsers, createUser, setUserActive,
    createSession, findSession, deleteSession, purgeExpiredSessions,
    audit, listAudit,
    close() { try { db.close(); } catch (e) { /* ignore */ } }
  };
}

module.exports = { createStore, rowToEntry, SCHEMA_VERSION };
