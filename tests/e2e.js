/* QueueManager - headless-Chrome end-to-end test (no npm dependencies).
 * Drives the real UI over CDP: citizen booking -> token -> tracking ->
 * staff call-next -> complete -> counts -> CSV export -> reset.
 * Usage: node tests/e2e.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sleep, httpJson, evaluate, waitFor, openTab, launchChrome } = require('./cdp-helper.js');

const ROOT = path.join(__dirname, '..');
const PORT = 8901;
const CDP_PORT = 9333;
const BASE = 'http://127.0.0.1:' + PORT;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-e2e-'));
const openPage = openTab(CDP_PORT);

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ok   ' + name); }
  else { failures += 1; console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
}

async function main() {
  console.log('== e2e: starting local server ==');
  const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(d));
  await sleep(1200);

  console.log('== e2e: launching headless chrome ==');
  const chrome = await launchChrome(CDP_PORT, PROFILE).catch((err) => {
    server.kill();
    throw err;
  });

  const exitCode = await (async () => {
    try {
      /* ------------------------------------------------ citizen page */
      console.log('\n== e2e: citizen page ==');
      const { cdp } = await openPage(BASE + '/index.html');
      await waitFor(cdp, `document.readyState === 'complete' && document.querySelectorAll('#office-grid .card').length === 4`, 15000, 'citizen app boot');
      await evaluate(cdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);

      // start from a clean slate (no demo seed) for deterministic tokens
      await evaluate(cdp, `QEStore.reset(QEStore.createAdapter(), new Date(), false); location.reload();`);
      await waitFor(cdp, `document.readyState === 'complete' && document.querySelectorAll('#office-grid .card').length === 4`, 15000, 'citizen reload');
      await evaluate(cdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);
      check('clean slate shows zero waiting', await evaluate(cdp, `document.getElementById('stat-waiting').textContent`), (await evaluate(cdp, `document.getElementById('stat-waiting').textContent`)) === '0');

      // fill the booking form (next non-Sunday date so the office is open)
      const booking = await evaluate(cdp, `(async () => {
        const pad = n => String(n).padStart(2, '0');
        const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        const d = new Date();
        let date = '';
        for (let i = 1; i <= 14; i++) { const t = new Date(d); t.setDate(t.getDate() + i); if (t.getDay() !== 0) { date = iso(t); break; } }
        const office = document.getElementById('f-office');
        office.value = 'meeseva'; office.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 50));
        document.getElementById('f-service').value = 'meeseva-cert';
        const dateEl = document.getElementById('f-date');
        dateEl.value = date; dateEl.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 50));
        const slot = document.querySelector('#slot-grid .slot:not(:disabled)');
        if (!slot) { return { error: 'no enabled slot for ' + date }; }
        slot.click();
        document.getElementById('f-name').value = 'Evelyn Tester';
        // double submit: the in-flight guard must prevent a duplicate booking
        document.getElementById('booking-form').dispatchEvent(new Event('submit', { cancelable: true }));
        document.getElementById('booking-form').dispatchEvent(new Event('submit', { cancelable: true }));
        return { date };
      })()`);
      check('form accepted (slot available)', !booking.error, booking.error || '');
      await waitFor(cdp, `!document.getElementById('confirmation').classList.contains('hide')`, 8000, 'confirmation panel');
      const token = await evaluate(cdp, `document.querySelector('#confirmation .token-number').textContent.trim()`);
      check('confirmation shows token A-001', token === 'A-001', 'got: ' + token);
      const ref = await evaluate(cdp, `document.querySelector('#confirmation .mono').textContent.trim()`);
      check('confirmation shows a QE- reference', /^QE-[A-Z2-9]{6}$/.test(ref), 'got: ' + ref);
      // print wiring (stubbed so no print dialog opens headless)
      const printed = await evaluate(cdp, `(async () => {
        window.__printed = false;
        window.print = () => { window.__printed = true; document.body.classList.remove('print-slip'); };
        document.getElementById('conf-print').click();
        await new Promise(r => setTimeout(r, 100));
        return window.__printed;
      })()`);
      check('print token button triggers printing', printed === true);
      const dupes = await evaluate(cdp, `JSON.parse(localStorage.getItem('queueease.state.v1')).entries.filter(e => e.name === 'Evelyn Tester').length`);
      check('double submit created exactly one booking', dupes === 1, 'got: ' + dupes);
      check('my tokens lists the booking', await evaluate(cdp, `document.getElementById('mine-list').textContent.includes('${token}')`));

      // invalid input is rejected
      await evaluate(cdp, `document.getElementById('conf-new').click(); document.getElementById('f-name').value = '12';`);
      const invalidMsg = await evaluate(cdp, `(async () => {
        const slot = document.querySelector('#slot-grid .slot:not(:disabled)');
        if (slot) { slot.click(); }
        document.getElementById('booking-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 300));
        return document.getElementById('form-errors').textContent.trim();
      })()`);
      check('numeric name rejected with message', invalidMsg.length > 5, 'got: ' + JSON.stringify(invalidMsg));

      // tracking by reference
      await evaluate(cdp, `document.getElementById('track-input').value = ${JSON.stringify(ref)};
        document.getElementById('track-form').dispatchEvent(new Event('submit', { cancelable: true }));`);
      await sleep(400);
      check('tracking finds the token', await evaluate(cdp, `document.getElementById('track-result').textContent.includes('${token}')`));

      // persistence across reload
      await evaluate(cdp, `location.reload();`);
      await waitFor(cdp, `document.readyState === 'complete' && document.getElementById('mine-list').textContent.includes('${token}')`, 15000, 'token survives reload');
      check('booking persists after page refresh', true);
      await evaluate(cdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);

      // Telugu switch
      await evaluate(cdp, `document.querySelector('[data-lang-btn="te"]').click();`);
      await sleep(400);
      const htmlLang = await evaluate(cdp, `document.documentElement.lang`);
      const heroTe = await evaluate(cdp, `document.getElementById('hero-title').textContent`);
      check('Telugu switch updates lang + hero', htmlLang === 'te' && heroTe.includes('టోకెన్'), 'lang=' + htmlLang + ' hero=' + heroTe);
      await evaluate(cdp, `document.querySelector('[data-lang-btn="en"]').click();`);
      await sleep(300);

      // responsive: phone width must not cause page-level horizontal scroll
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(400);
      const overflow = await evaluate(cdp, `document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      check('usable at 390px width (no page overflow)', overflow <= 1, 'overflow px: ' + overflow);
      await cdp.send('Emulation.clearDeviceMetricsOverride');

      const citizenErrs = await evaluate(cdp, `window.__qeErrs`);
      check('no uncaught JS errors on citizen page', citizenErrs.length === 0, JSON.stringify(citizenErrs).slice(0, 500));
      await cdp.close();

      /* ------------------------------------------------- staff page */
      console.log('\n== e2e: staff dashboard ==');
      const staff = await openPage(BASE + '/staff.html');
      const scdp = staff.cdp;
      await waitFor(scdp, `document.readyState === 'complete' && document.querySelectorAll('#summary-cards .stat').length === 7`, 15000, 'staff app boot');
      await evaluate(scdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);

      const bookedBefore = await evaluate(scdp, `document.querySelector('[data-count="Booked"]').textContent`);
      check('dashboard shows the booked token', bookedBefore === '1', 'got: ' + bookedBefore);

      // call next for meeseva on the booking date
      await evaluate(scdp, `document.getElementById('call-office').value = 'meeseva';
        document.getElementById('call-date').value = ${JSON.stringify(booking.date)};
        document.getElementById('call-btn').click();`);
      await sleep(500);
      const callMsg = await evaluate(scdp, `document.getElementById('call-result').textContent`);
      check('call next serves A-001', /A-001/.test(callMsg), 'got: ' + callMsg.trim().slice(0, 160));
      const servingNow = await evaluate(scdp, `document.querySelector('[data-count="Serving"]').textContent`);
      check('Serving count updated to 1', servingNow === '1', 'got: ' + servingNow);

      // display board picks up the serving token live (same browser profile)
      console.log('\n== e2e: display board ==');
      const display = await openPage(BASE + '/display.html');
      const dcdp = display.cdp;
      await waitFor(dcdp, `document.readyState === 'complete' && document.getElementById('display-updated').textContent.length > 0`, 15000, 'display app boot');
      await evaluate(dcdp, `window.__qeErrs = []; window.addEventListener('error', e => window.__qeErrs.push(String((e && e.message) || e)));`);
      check('display board shows the serving token', await evaluate(dcdp, `document.getElementById('serve-list').textContent.includes('A-001')`));
      await evaluate(dcdp, `document.getElementById('display-office').value = 'panchayat';
        document.getElementById('display-office').dispatchEvent(new Event('change'));`);
      await sleep(300);
      const hiddenForOther = await evaluate(dcdp, `document.getElementById('serve-list').textContent.includes('A-001')`);
      check('display office filter scopes the board', hiddenForOther === false);
      await evaluate(dcdp, `document.getElementById('display-office').value = 'all';
        document.getElementById('display-office').dispatchEvent(new Event('change'));`);
      await sleep(300);

      // filter to the token and complete it via row action
      await evaluate(scdp, `document.getElementById('flt-office').value = 'meeseva';
        document.getElementById('flt-office').dispatchEvent(new Event('change'));
        document.getElementById('flt-date').value = ${JSON.stringify(booking.date)};
        document.getElementById('flt-date').dispatchEvent(new Event('change'));
        document.getElementById('flt-search').value = 'A-001';
        document.getElementById('flt-search').dispatchEvent(new Event('input'));`);
      await sleep(600);
      const rowVisible = await evaluate(scdp, `document.getElementById('queue-list').textContent.includes('A-001')`);
      check('search by token finds the entry', rowVisible);
      await evaluate(scdp, `document.querySelector('#queue-list [data-act="Completed"]').click();`);
      await sleep(500);
      const completedNow = await evaluate(scdp, `document.querySelector('[data-count="Completed"]').textContent`);
      const waitingNow = await evaluate(scdp, `document.querySelector('[data-count="Waiting"]').textContent`);
      const bookedNow = await evaluate(scdp, `document.querySelector('[data-count="Booked"]').textContent`);
      check('Completed count updated to 1', completedNow === '1', 'got: ' + completedNow);
      check('Waiting count back to 0', waitingNow === '0', 'got: ' + waitingNow);
      check('Booked count back to 0', bookedNow === '0', 'got: ' + bookedNow);
      const activeGone = await evaluate(scdp, `!document.getElementById('queue-list').textContent.includes('A-001')`);
      check('completed token leaves active queue', activeGone);

      // display board follows the completion live via the storage event (no reload)
      await sleep(1200);
      const boardEmpty = await evaluate(dcdp, `document.getElementById('serve-list').textContent`);
      check('display board updates live after completion', !boardEmpty.includes('A-001'), 'got: ' + boardEmpty.trim().slice(0, 120));

      // CSV export downloads a real file with the record
      await scdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: PROFILE });
      await evaluate(scdp, `document.getElementById('export-csv').click();`);
      let csvOk = false, csvDetail = 'no file';
      for (let i = 0; i < 20 && !csvOk; i++) {
        await sleep(300);
        const files = fs.readdirSync(PROFILE).filter((f) => f.endsWith('.csv'));
        if (files.length) {
          const content = fs.readFileSync(path.join(PROFILE, files[0]), 'utf8');
          csvOk = content.includes('reference,token') && content.includes('A-001');
          csvDetail = files[0] + ' (' + content.split('\n').length + ' lines)';
        }
      }
      check('CSV export downloads with the record', csvOk, csvDetail);

      // reset with typed confirmation clears everything
      await evaluate(scdp, `document.getElementById('reset-reseed').checked = false;
        document.getElementById('reset-btn').click();`);
      await sleep(400);
      const dlgOpen = await evaluate(scdp, `!!document.querySelector('dialog[open]')`);
      check('reset opens a confirmation dialog', dlgOpen);
      await evaluate(scdp, `(async () => {
        const input = document.getElementById('qe-dlg-input');
        input.value = 'RESET'; input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 50));
        document.querySelector('dialog [data-act="ok"]').click();
      })()`);
      await sleep(500);
      const totalAfter = await evaluate(scdp, `document.querySelector('[data-count="__total__"]').textContent`);
      check('reset clears all records', totalAfter === '0', 'got: ' + totalAfter);

      const staffErrs = await evaluate(scdp, `window.__qeErrs`);
      check('no uncaught JS errors on staff page', staffErrs.length === 0, JSON.stringify(staffErrs).slice(0, 500));
      await scdp.close();
      const displayErrs = await evaluate(dcdp, `window.__qeErrs`);
      check('no uncaught JS errors on display page', displayErrs.length === 0, JSON.stringify(displayErrs).slice(0, 500));
      await dcdp.close();
      return 0;
    } catch (err) {
      console.log('  FAIL e2e aborted: ' + (err && err.message));
      return 1;
    }
  })();

  try { await httpJson('GET', 'http://127.0.0.1:' + CDP_PORT + '/json/close/' + 'x').catch(() => {}); } catch (e) { /* ignore */ }
  chrome.kill();
  server.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log('\n----------------------------------------');
  const failed = failures + exitCode;
  console.log(failed === 0 ? 'E2E PASSED' : 'E2E FAILED (' + failed + ')');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('e2e harness error: ' + (err && err.stack || err));
  process.exit(2);
});
