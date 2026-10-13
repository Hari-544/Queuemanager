/* QueueEase backend - password hashing + token helpers (pure crypto).
 * scrypt with per-password salt; session tokens are random 256-bit values
 * stored hashed (sha256) so a database read alone never yields a session.
 */
'use strict';

const crypto = require('crypto');

function hashPassword(password) {
  const pw = String(password || '');
  if (pw.length < 8) { throw new Error('password too short'); }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return 'scrypt$1$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') { return false; }
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    const actual = crypto.scryptSync(String(password || ''), salt, 64);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex'); // 256-bit, cookie value
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) { continue; }
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

module.exports = { hashPassword, verifyPassword, newSessionToken, hashToken, parseCookies };
