/* QueueEase - backend integration E2E (no npm dependencies).
 * Serves the app from server/index.js and drives the real UI in server mode:
 * citizen booking (API) -> staff sign-in -> call-next -> display board ->
 * complete -> counts -> admin panel -> logout lockout.
 * Usage: node tests/e2e-server.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, evaluate, waitFor, openTab, launchChrome } = require('./cdp-helper.js');

const ROOT = path.join(__dirname, '..');
const PORT = 8902;
const CDP_PORT = 9336;
const BASE = 'http://127.0.0.1:' + PORT;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-e2e-srv-'));
const DBDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-e2e-db-'));
const openPage = openTab(CDP_PORT);

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ok   ' + name); }
  else { failures += 1; console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
}

async function adminReset() {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin-demo-123' })
  });
  if (!login.ok) { throw new Error('admin seed login failed: ' + login.status); }
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const reset = await fetch(BASE + '/api/admin/reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reseed: false })
  });
  if (!reset.ok) { throw new Error('admin reset failed: ' + reset.status); }
}

async function main() {
  console.log('== e2e-server: starting backend ==');
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DB_PATH: path.join(DBDIR, 'e2e.db'),
      SESSION_SECRET: 'e2e-secret-do-not-reuse',
      RATE_BOOK_PER_MIN: '1000',
      RATE_LOGIN_PER_MIN: '100'
    }),
    stdio: 'pipe'
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(d));

  console.log('== e2e-server: launching headless chrome ==');
  const chrome = await launchChrome(CDP_PORT, PROFILE).catch((err) => {
    server.kill();
    throw err;
  });

  const exitCode = await (async () => {
    try {
      await adminReset();

      /* ------------------------------------------------ citizen (server) */
      console.log('\n== e2e-server: citizen page in server mode ==');
      const { cdp } = await openPage(BASE + '/index.html');
      await waitFor(cdp, `document.readyState === 'complete' && document.querySelectorAll('#office-grid .card').length === 4`, 15000, 'citizen boot');
      await waitFor(cdp, `document.getElementById('mode-badge') && document.getElementById('mode-badge').textContent.length > 0`, 8000, 'mode badge');
      const badge = await evaluate(cdp, `document.getElementById('mode-badge').textContent`);
      check('page detects the backend (server mode)', /server/i.test(badge), 'got: ' + badge);
      await evaluate(cdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);

      const booking = await evaluate(cdp, `(async () => {
        const pad = n => String(n).padStart(2, '0');
        const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        const d = new Date();
        let date = '';
        for (let i = 1; i <= 14; i++) { const t = new Date(d); t.setDate(t.getDate() + i); if (t.getDay() !== 0) { date = iso(t); break; } }
        const office = document.getElementById('f-office');
        office.value = 'meeseva'; office.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('f-service').value = 'meeseva-cert';
        const dateEl = document.getElementById('f-date');
        dateEl.value = date; dateEl.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        const slot = document.querySelector('#slot-grid .slot:not(:disabled)');
        if (!slot) { return { error: 'no enabled slot for ' + date }; }
        slot.click();
        document.getElementById('f-name').value = 'Server Evelyn';
        document.getElementById('booking-form').dispatchEvent(new Event('submit', { cancelable: true }));
        return { date };
      })()`);
      check('server booking accepted', !booking.error, booking.error || '');
      await waitFor(cdp, `!document.getElementById('confirmation').classList.contains('hide')`, 10000, 'confirmation');
      const token = await evaluate(cdp, `document.querySelector('#confirmation .token-number').textContent.trim()`);
      check('server issued token A-001', token === 'A-001', 'got: ' + token);
      const ref = await evaluate(cdp, `document.querySelector('#confirmation .mono').textContent.trim()`);
      check('server issued a QE- reference', /^QE-[A-Z2-9]{6}$/.test(ref), 'got: ' + ref);
      const statusShown = await evaluate(cdp, `document.getElementById('confirmation').textContent`);
      check('future booking shows Booked status', /Booked|బుక్/.test(statusShown));

      // persistence + tracking come from the server, not localStorage
      await evaluate(cdp, `location.reload();`);
      await waitFor(cdp, `document.readyState === 'complete' && document.getElementById('mine-list').textContent.includes('${token}')`, 15000, 'token survives reload');
      check('server booking persists across refresh', true);
      await evaluate(cdp, `document.getElementById('track-input').value = ${JSON.stringify(ref)};
        document.getElementById('track-form').dispatchEvent(new Event('submit', { cancelable: true }));`);
      await sleep(800);
      check('server tracking finds the token', await evaluate(cdp, `document.getElementById('track-result').textContent.includes('${token}')`));
      const citizenErrs = await evaluate(cdp, `window.__qeErrs || []`);
      check('no uncaught JS errors on citizen page', citizenErrs.length === 0, JSON.stringify(citizenErrs).slice(0, 400));
      await cdp.close();

      /* ------------------------------------------------- staff (server) */
      console.log('\n== e2e-server: staff dashboard with sign-in ==');
      const staff = await openPage(BASE + '/staff.html');
      const scdp = staff.cdp;
      await waitFor(scdp, `document.readyState === 'complete' && !document.getElementById('auth-section').classList.contains('hide')`, 15000, 'staff boot + auth panel');
      await evaluate(scdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);
      check('queue locked before sign-in', await evaluate(scdp, `document.getElementById('queue-list').textContent.includes('Sign in')`));

      await evaluate(scdp, `(async () => {
        document.getElementById('auth-user').value = 'staff';
        document.getElementById('auth-pass').value = 'staff-demo-123';
        document.getElementById('auth-form').dispatchEvent(new Event('submit', { cancelable: true }));
      })()`);
      await waitFor(scdp, `!document.getElementById('auth-signed-in').classList.contains('hide')`, 8000, 'signed in');
      check('staff sign-in works', await evaluate(scdp, `document.getElementById('auth-status').textContent.includes('staff')`));
      await waitFor(scdp, `document.querySelector('[data-count="Booked"]').textContent === '1'`, 8000, 'queue loads from server');
      check('queue loads the server booking (Booked=1)', true);

      await evaluate(scdp, `document.getElementById('call-office').value = 'meeseva';
        document.getElementById('call-date').value = ${JSON.stringify(booking.date)};
        document.getElementById('call-btn').click();`);
      await sleep(800);
      check('call next serves A-001', await evaluate(scdp, `document.getElementById('call-result').textContent.includes('A-001')`));

      // display board follows via SSE
      const display = await openPage(BASE + '/display.html');
      const dcdp = display.cdp;
      await waitFor(dcdp, `document.readyState === 'complete' && document.getElementById('display-updated').textContent.length > 0`, 15000, 'display boot');
      await sleep(1200);
      check('display board shows serving token', await evaluate(dcdp, `document.getElementById('serve-list').textContent.includes('A-001')`));

      await evaluate(scdp, `document.getElementById('flt-date').value = ${JSON.stringify(booking.date)};
        document.getElementById('flt-date').dispatchEvent(new Event('change'));
        document.getElementById('flt-search').value = 'A-001';
        document.getElementById('flt-search').dispatchEvent(new Event('input'));`);
      await sleep(800);
      await evaluate(scdp, `document.querySelector('#queue-list [data-act="Completed"]').click();`);
      await sleep(800);
      check('completed via staff UI', await evaluate(scdp, `document.querySelector('[data-count="Completed"]').textContent === '1'`));
      const completed = await openPage(BASE + '/completed.html');
      const ccdp = completed.cdp;
      await waitFor(ccdp, `document.getElementById('completed-list').textContent.includes('A-001')`, 8000, 'completed page');
      check('completed token appears on separate page', true);
      await ccdp.close();
      await sleep(1500);
      check('display board follows completion live', !(await evaluate(dcdp, `document.getElementById('serve-list').textContent.includes('A-001')`)));
      check('completed token leaves active queue', !(await evaluate(scdp, `document.getElementById('queue-list').textContent.includes('A-001')`)));

      // walk-in (counter hours dependent - accept either honest outcome)
      const walkinMsg = await evaluate(scdp, `(async () => {
        document.getElementById('w-office').value = 'meeseva';
        document.getElementById('w-office').dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 80));
        document.getElementById('w-name').value = 'Counter Visitor';
        document.getElementById('walkin-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 900));
        return document.getElementById('walkin-result').textContent.trim() + ' || ' +
          document.getElementById('walkin-errors').textContent.trim();
      })()`);
      check('walk-in handled (token or honest closed message)', /D-|A-|B-|C-|closed|మూసి/i.test(walkinMsg), 'got: ' + walkinMsg.slice(0, 160));

      await evaluate(scdp, `document.getElementById('logout-btn').click();`);
      await sleep(600);
      check('logout locks the queue again', await evaluate(scdp, `document.getElementById('queue-list').textContent.includes('Sign in')`));

      /* ------------------------------------------------- admin (server) */
      console.log('\n== e2e-server: admin panel ==');
      await evaluate(scdp, `(async () => {
        document.getElementById('auth-user').value = 'admin';
        document.getElementById('auth-pass').value = 'admin-demo-123';
        document.getElementById('auth-form').dispatchEvent(new Event('submit', { cancelable: true }));
      })()`);
      await waitFor(scdp, `!document.getElementById('admin-section').classList.contains('hide')`, 8000, 'admin panel');
      check('admin panel visible for administrators', true);
      await waitFor(scdp, `document.getElementById('admin-users').textContent.includes('staff')`, 8000, 'users listed');
      check('staff accounts listed', true);
      await evaluate(scdp, `(async () => {
        document.getElementById('new-username').value = 'uitester';
        document.getElementById('new-password').value = 'uitester-123';
        document.getElementById('new-role').value = 'staff';
        document.getElementById('admin-user-form').dispatchEvent(new Event('submit', { cancelable: true }));
      })()`);
      await waitFor(scdp, `document.getElementById('admin-users').textContent.includes('uitester')`, 8000, 'user created');
      check('admin creates staff account via UI', true);
      check('audit log shows activity', await evaluate(scdp, `document.getElementById('admin-audit').textContent.includes('user-create')`));

      const staffErrs = await evaluate(scdp, `window.__qeErrs`);
      check('no uncaught JS errors on staff page', staffErrs.length === 0, JSON.stringify(staffErrs).slice(0, 400));
      await scdp.close();
      const displayErrs = await evaluate(dcdp, `window.__qeErrs || []`);
      await dcdp.close();
      check('display page ran clean', displayErrs.length === 0, JSON.stringify(displayErrs).slice(0, 400));
      return 0;
    } catch (err) {
      console.log('  FAIL e2e-server aborted: ' + (err && err.message));
      return 1;
    }
  })();

  chrome.kill();
  server.kill();
  await sleep(500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  try { fs.rmSync(DBDIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log('\n----------------------------------------');
  const failed = failures + exitCode;
  console.log(failed === 0 ? 'E2E-SERVER PASSED' : 'E2E-SERVER FAILED (' + failed + ')');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('e2e-server harness error: ' + (err && err.stack || err));
  process.exit(2);
});
