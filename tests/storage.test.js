/* QueueEase - storage adapter tests (in-memory store). */
'use strict';

const CFG = require('../assets/js/config.js');
const Q = require('../assets/js/queue.js');
const S = require('../assets/js/storage.js');

const NOW = new Date(2026, 9, 12, 11, 0, 0);

function memAdapter() {
  return S.createAdapter(S.memoryStorage());
}

module.exports = async function (ctx) {
  const { assert, suite } = ctx;

  await suite('storage: load / save / reset', [
    {
      name: 'first run seeds clearly-labelled fictional demo data',
      fn() {
        const a = memAdapter();
        const loaded = S.load(a, NOW);
        assert.equal(loaded.source, 'demo');
        assert(loaded.state.entries.length > 0, 'demo entries expected');
        assert(loaded.state.entries.every(function (e) { return e.demo === true; }), 'all seeded rows flagged demo');
        assert(loaded.state.entries.every(function (e) { return e.name.indexOf('(fictional)') !== -1; }), 'fictional names');
      }
    },
    {
      name: 'save then load round-trips entries',
      fn() {
        const a = memAdapter();
        const loaded = S.load(a, NOW, { fresh: true });
        assert.equal(loaded.state.entries.length, 0);
        const res = Q.createBooking(loaded.state, {
          officeId: 'other', serviceId: 'oth-voter', channel: 'appointment',
          date: '2026-10-13', time: '10:00', name: 'Persist Me', note: ''
        }, NOW);
        assert(res.ok, 'booking should pass');
        assert(S.save(a, loaded.state, NOW), 'save ok');
        const again = S.load(a, NOW);
        assert.equal(again.source, 'stored');
        assert.equal(again.state.entries.length, 1);
        assert.equal(again.state.entries[0].token, 'D-001');
        assert.equal(again.state.entries[0].name, 'Persist Me');
      }
    },
    {
      name: 'corrupt JSON is quarantined and replaced with fresh demo data',
      fn() {
        const a = memAdapter();
        a.set(a.key, '{not valid json!!!');
        const loaded = S.load(a, NOW);
        assert(loaded.corrupt === true, 'corrupt flag');
        assert(loaded.state.entries.length > 0, 'demo fallback');
        assert(a.get(CFG.STORAGE_KEY + '.corrupt') === '{not valid json!!!', 'corrupt copy kept for inspection');
      }
    },
    {
      name: 'legacy qe_bookings key migrates entries with fresh tokens',
      fn() {
        const a = memAdapter();
        a.set(CFG.STORAGE_KEY_LEGACY, JSON.stringify([
          { id: '1', token: 'Q001', serviceId: 1, name: 'Old Record', date: '2026-10-13', time: '10:00', status: 'Waiting', created: NOW.getTime() },
          { id: '2', token: 'Q002', serviceId: 99, name: '', date: 'junk', time: 'xx', status: 'Waiting' }
        ]));
        const loaded = S.load(a, NOW);
        assert.equal(loaded.source, 'migrated');
        assert.equal(loaded.migrated, 1, 'only the valid row migrates');
        assert.equal(loaded.state.entries[0].token, 'A-001');
        assert.equal(loaded.state.entries[0].name, 'Old Record');
      }
    },
    {
      name: 'reset clears everything, optionally reseeding demo data',
      fn() {
        const a = memAdapter();
        S.load(a, NOW);
        const empty = S.reset(a, NOW, false);
        assert.equal(empty.entries.length, 0);
        const seeded = S.reset(a, NOW, true);
        assert(seeded.entries.length > 0, 'reseed expected');
      }
    },
    {
      name: 'demo token numbering stays unique after reload',
      fn() {
        const a = memAdapter();
        const loaded = S.load(a, NOW, { fresh: true });
        const r1 = Q.createBooking(loaded.state, {
          officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
          date: '2026-10-13', time: '10:00', name: 'First Reload', note: ''
        }, NOW);
        assert(r1.ok && r1.entry.token === 'A-001', 'first token');
        S.save(a, loaded.state, NOW);
        const reloaded = S.load(a, NOW);
        const r2 = Q.createBooking(reloaded.state, {
          officeId: 'meeseva', serviceId: 'meeseva-income', channel: 'appointment',
          date: '2026-10-13', time: '10:30', name: 'Second Reload', note: ''
        }, NOW);
        assert(r2.ok && r2.entry.token === 'A-002', 'sequence continues, got ' + (r2.entry && r2.entry.token));
      }
    },
    {
      name: 'REGRESSION: real localStorage global is used when present (no silent memory fallback)',
      fn() {
        // Simulate a browser global, then reload the module fresh.
        const bag = {};
        global.localStorage = {
          getItem: (k) => (k in bag ? bag[k] : null),
          setItem: (k, v) => { bag[k] = String(v); },
          removeItem: (k) => { delete bag[k]; }
        };
        try {
          delete require.cache[require.resolve('../assets/js/storage.js')];
          const S2 = require('../assets/js/storage.js');
          const a = S2.createAdapter();
          assert(a.persistent === true, 'adapter must detect browser storage');
          const loaded = S2.load(a, NOW, { fresh: true });
          assert(loaded.storageAvailable === true, 'load must report storage available');
          S2.save(a, loaded.state, NOW);
          assert(typeof bag[CFG.STORAGE_KEY] === 'string', 'state must be written to localStorage');
        } finally {
          delete global.localStorage;
          delete require.cache[require.resolve('../assets/js/storage.js')];
        }
      }
    }
  ]);
};
