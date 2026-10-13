/* QueueEase - shared headless-Chrome CDP harness (no npm dependencies).
 * Used by tests/e2e.js (local static mode) and tests/e2e-server.js
 * (backend integration mode).
 */
'use strict';

const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function httpJson(method, url) {
  const res = await fetch(url, { method });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return text; }
}

/* Minimal CDP client over the global WebSocket (Node 21+). */
function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(targetMethod, params) {
        id += 1;
        const myId = id;
        return new Promise((res, rej) => {
          pending.set(myId, { res, rej });
          ws.send(JSON.stringify({ id: myId, method: targetMethod, params: params || {} }));
        });
      },
      close() { try { ws.close(); } catch (e) { /* ignore */ } }
    });
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(String(evt.data)); } catch (e) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) { p.rej(new Error(msg.error.message || JSON.stringify(msg.error))); }
        else { p.res(msg.result); }
      }
    };
    ws.onerror = (e) => reject(new Error('websocket error: ' + e.message));
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, timeout: 15000
  });
  if (r.exceptionDetails) {
    const t = r.exceptionDetails.text + ': ' + (r.exceptionDetails.exception
      ? JSON.stringify(r.exceptionDetails.exception.description || '').slice(0, 300) : '');
    throw new Error('page exception: ' + t);
  }
  return r.result && 'value' in r.result ? r.result.value : undefined;
}

async function waitFor(cdp, expression, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const v = await evaluate(cdp, expression);
    if (v) { return v; }
    if (Date.now() - start > timeoutMs) { throw new Error('timeout waiting for: ' + label); }
    await sleep(250);
  }
}

function openTab(cdpPort) {
  return async function (url) {
    const target = await httpJson('PUT', 'http://127.0.0.1:' + cdpPort + '/json/new?' + encodeURIComponent(url));
    const cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    return { cdp, targetId: target.id };
  };
}

async function launchChrome(cdpPort, profile) {
  const chrome = spawn(CHROME, [
    '--headless', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + cdpPort,
    '--user-data-dir=' + profile,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});
  for (let i = 0; i < 40; i++) {
    try {
      await httpJson('GET', 'http://127.0.0.1:' + cdpPort + '/json/version');
      return chrome;
    } catch (e) { await sleep(300); }
  }
  chrome.kill();
  throw new Error('chrome remote debugging did not start');
}

module.exports = { CHROME, sleep, httpJson, connectCdp, evaluate, waitFor, openTab, launchChrome };
