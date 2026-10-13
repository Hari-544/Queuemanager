/* QueueEase backend - entry point.
 * Serves the frontend statically AND the JSON API from one origin, so the
 * browser app talks to the backend with same-origin fetch (no CORS needed).
 *
 *   node server/index.js [port]     (PORT / DB_PATH / secrets via .env)
 *   npm start                       (same thing)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { load } = require('./env.js');
const { createStore } = require('./db.js');
const { createApi } = require('./api.js');

const ROOT = path.join(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map((a) => String(a)).join(' ');
  process.stdout.write(line + '\n');
}

function safePath(urlPath) {
  let p = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  if (p.endsWith('/')) { p += 'index.html'; }
  const resolved = path.normalize(path.join(ROOT, p));
  if (!resolved.startsWith(ROOT)) { return null; }
  return resolved;
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }
  if (url.pathname.startsWith('/data/')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const file = safePath(url.pathname);
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

function main() {
  const env = load();
  if (process.argv[2]) {
    const p = Number(process.argv[2]);
    if (Number.isFinite(p) && p > 0) { env.PORT = p; }
  }
  if (env.NODE_ENV === 'production' && (env.isDefaultSecret || env.isDemoCredentials)) {
    throw new Error('Production startup requires SESSION_SECRET, SEED_ADMIN_PASSWORD, and SEED_STAFF_PASSWORD.');
  }

  const store = createStore(env.DB_PATH, env, { seedDemo: env.SEED_DEMO_DATA });
  const sseClients = new Set();
  let eventVersion = 0;

  function broadcast(event, data) {
    const versioned = Object.assign({}, data, {
      eventId: 'queue-' + String(++eventVersion),
      version: eventVersion
    });
    const payload = `event: ${event}\ndata: ${JSON.stringify(versioned)}\n\n`;
    for (const res of [...sseClients]) {
      try { res.write(payload); } catch (e) { sseClients.delete(res); }
    }
  }

  function subscribeSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    const hb = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(hb); sseClients.delete(res); }
    }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
  }

  const api = createApi(store, env, { broadcast, log, subscribeSSE });

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await api.handle(req, res, url);
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } }));
        }
        return;
      }
      serveStatic(req, res, url);
    } catch (err) {
      log('server-error', err && err.message);
      try {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal error');
      } catch (e2) { /* ignore */ }
    }
  });

  const purgeTimer = setInterval(() => store.purgeExpiredSessions(), 3600 * 1000);
  if (purgeTimer.unref) { purgeTimer.unref(); }

  server.listen(env.PORT, env.HOST, () => {
    log('QueueEase backend listening on http://' + env.HOST + ':' + env.PORT + '/');
    log('citizen: http://localhost:' + env.PORT + '/index.html');
    log('staff:   http://localhost:' + env.PORT + '/staff.html');
    log('display: http://localhost:' + env.PORT + '/display.html');
    log('reports: http://localhost:' + env.PORT + '/reports.html');
    log('health:  http://localhost:' + env.PORT + '/api/health');
    log('database: ' + env.DB_PATH + ' (' + store.countEntries() + ' entries)');
    for (const u of store.seeded.users) {
      log('seeded ' + u.role + ' account: username="' + u.username + '" (demo password from .env / defaults; change for real use)');
    }
    if (store.seeded.demoEntries > 0) { log('seeded ' + store.seeded.demoEntries + ' fictional demo entries'); }
    if (env.isDefaultSecret) {
      log('WARNING: using the default SESSION_SECRET - set one in .env for anything beyond local demo');
    }
    if (env.NODE_ENV === 'production' && env.isDemoCredentials) {
      log('WARNING: production mode is using demo account credentials; set SEED_*_PASSWORD before first boot');
    }
  });

  function shutdown() {
    log('shutting down...');
    clearInterval(purgeTimer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, store, env };
}

if (require.main === module) {
  main();
}

module.exports = { main };
