/* QueueEase backend - sessions, role checks, rate limiting.
 * Cookie sessions (httpOnly, SameSite=Lax). Roles enforced here on every
 * privileged route; the frontend hiding a button is never authorization.
 */
'use strict';

const { newSessionToken, hashToken, parseCookies } = require('./auth-crypto.js');

const COOKIE_NAME = 'qe_session';

function cookieHeader(token, ttlHours, secure) {
  const maxAge = Math.round(ttlHours * 3600);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function clearCookieHeader(secure) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function getSession(req, store) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) { return null; }
  return store.findSession(hashToken(raw));
}

function login(store, user, ttlHours) {
  const token = newSessionToken();
  const ttlMs = ttlHours * 3600 * 1000;
  store.createSession(hashToken(token), user.id, Date.now() + ttlMs);
  return token;
}

function logout(req, store) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) {
    store.deleteSession(hashToken(cookies[COOKIE_NAME]));
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, store) {
    const sess = getSession(req, store);
    if (!sess) { return { error: 401, session: null }; }
    if (allowed.indexOf(sess.role) === -1) { return { error: 403, session: sess }; }
    return { error: null, session: sess };
  };
}

/* Sliding-window in-memory rate limiter, keyed per client + bucket. */
function createRateLimiter() {
  const hits = new Map(); // key -> array of timestamps
  return function check(key, perMinute) {
    const now = Date.now();
    const windowStart = now - 60000;
    let arr = hits.get(key);
    if (!arr) { arr = []; hits.set(key, arr); }
    while (arr.length && arr[0] < windowStart) { arr.shift(); }
    if (arr.length >= perMinute) { return false; }
    arr.push(now);
    if (hits.size > 5000) { hits.clear(); } // self-defence against map growth
    return true;
  };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) { return String(fwd).split(',')[0].trim().slice(0, 64); }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = {
  COOKIE_NAME, cookieHeader, clearCookieHeader,
  getSession, login, logout, requireRole,
  createRateLimiter, clientIp
};
