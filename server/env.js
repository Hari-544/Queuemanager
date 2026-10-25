/* QueueManager backend - environment loading (stdlib only, no dotenv dependency).
 * Reads server/.env or ./.env (never commits secrets; see .env.example).
 * Every value has a safe local default so `node server/index.js` just works.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) { continue; }
    const eq = line.indexOf('=');
    if (eq === -1) { continue; }
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = val;
  }
  return out;
}

function load() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env')
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const parsed = parseDotEnv(fs.readFileSync(file, 'utf8'));
        for (const k of Object.keys(parsed)) {
          if (!(k in process.env)) { process.env[k] = parsed[k]; }
        }
        break; // first file wins; real env vars always win over files
      }
    } catch (e) { /* unreadable .env -> fall back to defaults */ }
  }

  const num = (name, def) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : def;
  };

  return {
    PORT: num('PORT', 8080),
    HOST: process.env.HOST || '127.0.0.1',
    NODE_ENV: process.env.NODE_ENV || 'development',
    DB_PATH: process.env.DB_PATH || path.join(process.cwd(), 'data', 'queueease.db'),
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    SESSION_TTL_HOURS: num('SESSION_TTL_HOURS', 12),
    SEED_ADMIN_USER: process.env.SEED_ADMIN_USER || 'admin',
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'admin-demo-123',
    SEED_STAFF_USER: process.env.SEED_STAFF_USER || 'staff',
    SEED_STAFF_PASSWORD: process.env.SEED_STAFF_PASSWORD || 'staff-demo-123',
    RATE_BOOK_PER_MIN: num('RATE_BOOK_PER_MIN', 20),
    RATE_LOGIN_PER_MIN: num('RATE_LOGIN_PER_MIN', 10),
    RATE_GENERAL_PER_MIN: num('RATE_GENERAL_PER_MIN', 300),
    BODY_LIMIT_BYTES: num('BODY_LIMIT_BYTES', 102400),
    COOKIE_SECURE: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    SEED_DEMO_DATA: process.env.SEED_DEMO_DATA !== 'false' && process.env.NODE_ENV !== 'production',
    isDefaultSecret: !process.env.SESSION_SECRET,
    isDemoCredentials: process.env.SEED_ADMIN_PASSWORD === undefined ||
      process.env.SEED_STAFF_PASSWORD === undefined
  };
}

module.exports = { load, parseDotEnv };
