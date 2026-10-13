/* QueueEase - zero-dependency static file server for local demo runs.
 * Usage:  node server.js [port]      (default port 8080)
 * Serves the project directory so index.html and staff.html work over
 * http://localhost:8080 instead of file:// (recommended for localStorage).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

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

function safePath(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) { p += 'index.html'; }
  const resolved = path.normalize(path.join(ROOT, p));
  if (!resolved.startsWith(ROOT)) { return null; }
  return resolved;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }
  const file = safePath(req.url || '/');
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + req.url);
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('QueueEase demo running at http://localhost:' + PORT + '/');
  console.log('Citizen page: http://localhost:' + PORT + '/index.html');
  console.log('Staff demo:   http://localhost:' + PORT + '/staff.html');
  console.log('Press Ctrl+C to stop.');
});
