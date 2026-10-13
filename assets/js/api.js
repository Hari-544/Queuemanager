/*
 * QueueEase - backend API client (browser).
 * Same-origin fetch with credentials (session cookie). When no backend is
 * reachable the pages stay in local demo mode (localStorage engine).
 */
(function (root) {
  'use strict';

  function ApiError(status, code, message, fields) {
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message;
    this.fields = fields || [];
  }
  ApiError.prototype = Object.create(Error.prototype);

  var mode = 'unknown'; // 'server' | 'local' | 'unavailable'
  var healthCache = null;

  function withTimeout(ms) {
    if (typeof AbortController === 'undefined') {
      return { signal: undefined, cancel: function () {} };
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ignore */ } }, ms);
    return { signal: ctrl.signal, cancel: function () { clearTimeout(timer); } };
  }

  async function detect() {
    if (mode !== 'unknown') { return mode; }
    try {
      const t = withTimeout(2500);
      const res = await fetch('/api/health', { cache: 'no-store', signal: t.signal });
      t.cancel();
      if (res.ok) {
        try { healthCache = await res.json(); } catch (e) { healthCache = null; }
        mode = 'server';
      } else if (res.status === 404) {
        mode = 'local';
      } else {
        mode = 'unavailable';
      }
    } catch (e) {
      mode = 'unavailable';
    }
    return mode;
  }

  function isServer() { return mode === 'server'; }

  async function request(method, path, body) {
    const t = withTimeout(15000);
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: t.signal
      });
    } catch (e) {
      t.cancel();
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the demo server.');
    }
    t.cancel();
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const err = (data && data.error) || {};
      throw new ApiError(res.status, err.code || ('HTTP_' + res.status), err.message || 'Request failed.', err.fields || []);
    }
    return data;
  }

  const get = (path) => request('GET', path);
  const post = (path, body) => request('POST', path, body || {});
  const patch = (path, body) => request('PATCH', path, body || {});

  function subscribeEvents(onMessage) {
    if (typeof EventSource === 'undefined') { return null; }
    try {
      const es = new EventSource('/api/events');
      es.addEventListener('queue', function (evt) {
        try {
          var data = JSON.parse(evt.data);
          if (data && typeof data === 'object') { onMessage(data); }
        } catch (e) { /* ignore malformed */ }
      });
      return es;
    } catch (e) {
      return null;
    }
  }

  root.QEAPI = {
    ApiError,
    detect, isServer,
    get mode() { return mode; },
    get health() { return healthCache; },
    get, post, patch,
    subscribeEvents,
    // citizen
    book: (input) => post('/api/bookings', input),
    lookup: (ref) => get('/api/bookings?ref=' + encodeURIComponent(ref)),
    cancelBooking: (id, reference) => post('/api/bookings/' + encodeURIComponent(id) + '/cancel', { reference }),
    stats: () => get('/api/stats'),
    reports: (from, to) => {
      const q = new URLSearchParams();
      if (from) { q.set('from', from); }
      if (to) { q.set('to', to); }
      return get('/api/reports?' + q.toString());
    },
    board: (officeId) => get('/api/board?officeId=' + encodeURIComponent(officeId || 'all')),
    // staff
    queue: (params) => {
      const q = new URLSearchParams();
      Object.keys(params || {}).forEach((k) => { if (params[k] !== undefined && params[k] !== '') { q.set(k, params[k]); } });
      return get('/api/queue?' + q.toString());
    },
    completed: (params) => {
      const q = new URLSearchParams();
      Object.keys(params || {}).forEach((k) => { if (params[k] !== undefined && params[k] !== '') { q.set(k, params[k]); } });
      return get('/api/completed?' + q.toString());
    },
    callNext: (officeId, date) => post('/api/queue/call-next', { officeId, date }),
    setStatus: (id, status) => patch('/api/entries/' + encodeURIComponent(id) + '/status', { status }),
    archive: (id, reason) => post('/api/entries/' + encodeURIComponent(id) + '/archive', { reason: reason || '' }),
    walkin: (data) => post('/api/walkins', data),
    // auth
    login: (username, password) => post('/api/auth/login', { username, password }),
    logout: () => post('/api/auth/logout', {}),
    me: () => get('/api/auth/me'),
    // admin
    listUsers: () => get('/api/admin/users'),
    createUser: (data) => post('/api/admin/users', data),
    setUserActive: (id, active) => patch('/api/admin/users/' + encodeURIComponent(id), { active }),
    audit: (limit) => get('/api/admin/audit?limit=' + encodeURIComponent(limit || 50)),
    archived: (limit, offset) => get('/api/admin/archived?limit=' + encodeURIComponent(limit || 100) + '&offset=' + encodeURIComponent(offset || 0)),
    adminReset: (reseed) => post('/api/admin/reset', { reseed: reseed !== false }),
    csvUrl: () => '/api/export.csv',
    jsonUrl: () => '/api/export.json'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
