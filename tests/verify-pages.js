/* QueueManager - static cross-checks: HTML ids/keys referenced by JS must exist,
 * every i18n key used must be defined, every engine code must be localised. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG = require('../assets/js/config.js');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

function collect(re, text) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) { out.push(m[1]); }
  return out;
}

module.exports = async function (ctx) {
  const { assert, suite } = ctx;

  const i18nSrc = read('assets/js/i18n.js');
  const queueSrc = read('assets/js/queue.js');
  const citizenSrc = read('assets/js/citizen.js');
  const staffSrc = read('assets/js/staff.js');
  const displaySrc = read('assets/js/display.js');
  const reportsSrc = read('assets/js/reports.js');
  const uiSrc = read('assets/js/ui.js');
  const indexHtml = read('index.html');
  const staffHtml = read('staff.html');
  const displayHtml = read('display.html');
  const reportsHtml = read('reports.html');

  const dict = new Set(collect(/^    ['"]?([A-Za-z0-9_-]+)['"]?: \{/gm, i18nSrc));

  function htmlIds(html) { return new Set(collect(/ id="([^"]+)"/g, html)); }
  function htmlI18n(html) {
    return collect(/data-i18n(?:-ph|-aria)?="([^"]+)"/g, html);
  }
  function jsTKeys(src) {
    return collect(/\.t\(\s*['"]([A-Za-z0-9_-]+)['"]/g, src)
      .filter(function (k) { return k.slice(-1) !== '_'; }); // skip dynamic prefixes like 'err_'
  }
  function jsIds(src) {
    return collect(/(?:byId|getElementById)\(\s*['"]([^'"]+)['"]\)/g, src)
      .filter(function (id) { return id.slice(-1) !== '-'; }); // skip dynamic prefixes like 'avg-'
  }

  const indexIds = htmlIds(indexHtml);
  const staffIds = htmlIds(staffHtml);
  const displayIds = htmlIds(displayHtml);
  const reportsIds = htmlIds(reportsHtml);
  for (const id of jsIds(reportsSrc)) { reportsIds.add(id); }
  // ids created at runtime inside JS (innerHTML strings, .id assignments)
  for (const id of collect(/ id="([^"]+)"/g, citizenSrc + staffSrc + displaySrc + uiSrc)) {
    indexIds.add(id);
    staffIds.add(id);
    displayIds.add(id);
  }
  for (const id of collect(/\.id\s*=\s*['"]([^'"]+)['"]/g, citizenSrc + staffSrc + displaySrc + uiSrc)) {
    indexIds.add(id);
    staffIds.add(id);
    displayIds.add(id);
  }
  const bothIds = new Set([...indexIds, ...staffIds]);

  await suite('pages: i18n coverage', [
    {
      name: 'every data-i18n attribute in index.html exists in the dictionary',
      fn() {
        const missing = htmlI18n(indexHtml).filter(function (k) { return !dict.has(k); });
        assert.equal(missing.length, 0, 'missing keys: ' + missing.join(', '));
      }
    },
    {
      name: 'every data-i18n attribute in staff.html exists in the dictionary',
      fn() {
        const missing = htmlI18n(staffHtml).filter(function (k) { return !dict.has(k); });
        assert.equal(missing.length, 0, 'missing keys: ' + missing.join(', '));
      }
    },
    {
      name: 'every data-i18n attribute in display.html exists in the dictionary',
      fn() {
        const missing = htmlI18n(displayHtml).filter(function (k) { return !dict.has(k); });
        assert.equal(missing.length, 0, 'missing keys: ' + missing.join(', '));
      }
    },
    {
      name: 'every t() key used in JS exists in the dictionary (both languages complete)',
      fn() {
        const used = new Set([...jsTKeys(citizenSrc), ...jsTKeys(staffSrc), ...jsTKeys(displaySrc), ...jsTKeys(uiSrc)]);
        const missing = [...used].filter(function (k) { return !dict.has(k); });
        assert.equal(missing.length, 0, 'missing keys: ' + missing.join(', '));
        // both en and te present for every used key (entries may span lines)
        for (const k of used) {
          const at = i18nSrc.indexOf('\n    ' + k + ':') !== -1
            ? i18nSrc.indexOf('\n    ' + k + ':')
            : i18nSrc.indexOf("\n    '" + k + "':");
          assert(at !== -1, 'key not found in dictionary source: ' + k);
          const block = i18nSrc.slice(at, at + 900);
          assert(/en:\s*'[^']*'/.test(block), 'key lacks an en string: ' + k);
          assert(/te:\s*'[^']*'/.test(block), 'key lacks a te string: ' + k);
        }
      }
    },
    {
      name: 'staff ACTION_LABEL values are all defined',
      fn() {
        const labels = collect(/['"](act_[a-z_]+)['"]/g, staffSrc);
        const missing = labels.filter(function (k) { return !dict.has(k); });
        assert.equal(missing.length, 0, 'missing: ' + missing.join(', '));
      }
    },
    {
      name: 'every engine result code has a localised message',
      fn() {
        const codes = new Set(collect(/code:\s*'([A-Z_]+)'/g, queueSrc));
        const missing = [...codes].filter(function (c) { return !dict.has('err_' + c) && !dict.has('msg_' + c); });
        assert.equal(missing.length, 0, 'unlocalised codes: ' + missing.join(', '));
      }
    },
    {
      name: 'every queue status has a localised name',
      fn() {
        const missing = CFG.STATUSES.filter(function (s) { return !dict.has('st_' + s); });
        assert.equal(missing.length, 0, 'missing: ' + missing.join(', '));
      }
    }
  ]);

  await suite('pages: element ids', [
    {
      name: 'every id used by citizen.js exists in index.html',
      fn() {
        const missing = jsIds(citizenSrc).filter(function (id) { return !indexIds.has(id); });
        assert.equal(missing.length, 0, 'missing ids: ' + missing.join(', '));
      }
    },
    {
      name: 'every id used by staff.js exists in staff.html',
      fn() {
        const missing = jsIds(staffSrc).filter(function (id) { return !staffIds.has(id); });
        assert.equal(missing.length, 0, 'missing ids: ' + missing.join(', '));
      }
    },
    {
      name: 'every id used by display.js exists in display.html',
      fn() {
        const missing = jsIds(displaySrc).filter(function (id) { return !displayIds.has(id); });
        assert.equal(missing.length, 0, 'missing ids: ' + missing.join(', '));
      }
    },
    {
      name: 'every id used by reports.js exists in reports.html',
      fn() {
        const missing = jsIds(reportsSrc).filter(function (id) { return !reportsIds.has(id); });
        assert.equal(missing.length, 0, 'missing ids: ' + missing.join(', '));
      }
    },
    {
      name: 'shared ui.js ids exist on both pages',
      fn() {
        const missing = jsIds(uiSrc).filter(function (id) { return !bothIds.has(id); });
        assert.equal(missing.length, 0, 'missing ids: ' + missing.join(', '));
      }
    },
    {
      name: 'no leftover references to the old prototype ids',
      fn() {
        for (const [name, src] of [['citizen.js', citizenSrc], ['staff.js', staffSrc], ['display.js', displaySrc]]) {
          for (const legacy of ['serviceGrid', 'bookingForm', 'myBookings', 'staffQueue', 'staffFilter', 'customer', 'serviceSelect', 'reason']) {
            assert(src.indexOf(legacy) === -1, name + ' references removed id: ' + legacy);
          }
        }
      }
    }
  ]);

  await suite('pages: no-governmen- branding guard', [
    {
      name: 'no official seals, emblems or approval claims in the UI',
      fn() {
        const banned = ['satyameva', 'national emblem', 'govt. approved', 'government approved', 'official portal', 'అధికారిక పోర్టల్'];
        for (const [name, src] of [['index.html', indexHtml], ['staff.html', staffHtml], ['i18n.js', i18nSrc]]) {
          const low = src.toLowerCase();
          for (const b of banned) {
            assert(low.indexOf(b) === -1, name + ' contains banned phrase: ' + b);
          }
        }
      }
    }
  ]);
};
