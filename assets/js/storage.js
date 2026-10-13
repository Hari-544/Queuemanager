/*
 * QueueEase - persistence layer.
 *
 * The browser build uses window.localStorage (per-browser, per-device demo
 * storage).  The adapter is injected, so tests use an in-memory store and a
 * future shared backend would only need to replace load()/save().
 */
(function (root, factory) {
  var cfg = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.QE_CONFIG;
  var queue = (typeof module !== 'undefined' && module.exports) ? require('./queue.js') : root.QEQueue;
  var api = factory(cfg, queue);
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.QEStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CFG, Q) {
  'use strict';

  var G = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined' ? window : {});

  function browserStorage() {
    try {
      var probe = '__qe_probe__';
      G.localStorage.setItem(probe, '1');
      G.localStorage.removeItem(probe);
      return G.localStorage;
    } catch (err) {
      return null; // private mode / disabled storage -> fall back to memory
    }
  }

  function memoryStorage() {
    var bag = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
      setItem: function (k, v) { bag[k] = String(v); },
      removeItem: function (k) { delete bag[k]; },
      _bag: bag
    };
  }

  function createAdapter(storageLike) {
    var native = null;
    try { native = browserStorage(); } catch (e) { native = null; }
    var store = storageLike || native || memoryStorage();
    return {
      store: store,
      key: CFG.STORAGE_KEY,
      persistent: storageLike ? !!storageLike.persistent : !!native,
      get: function (k) { return store.getItem(k); },
      set: function (k, v) { store.setItem(k, v); },
      remove: function (k) { store.removeItem(k); }
    };
  }

  /* Legacy prototype key -> v1 state, best effort only. */
  function migrateLegacy(adapter, now) {
    var raw = adapter.get(CFG.STORAGE_KEY_LEGACY);
    if (!raw) { return null; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!Array.isArray(parsed)) { return null; }
    var today = Q.toISODate(now);
    var map = { 1: 'meeseva-cert', 2: 'pan-house-tax', 3: 'mun-property-tax' };
    var entries = [];
    parsed.forEach(function (b) {
      if (!b || typeof b.name !== 'string' || !b.name.trim()) { return; }
      var date = Q.parseISODate(b.date) ? b.date : today;
      var entry = Q.normalizeEntry({
        id: String(b.id || ('legacy-' + entries.length + '-' + Math.floor(Math.random() * 1e6))),
        reference: 'QE-LEGACY',
        token: String(b.token || 'X-000'),
        tokenSeq: 0,
        officeId: map[b.serviceId] ? map[b.serviceId].split('-')[0] : 'other',
        serviceId: map[b.serviceId] || 'oth-voter',
        date: date,
        time: Q.toMinutes(b.time) !== null ? b.time : '10:00',
        name: b.name,
        channel: 'appointment',
        note: 'Migrated from the earlier prototype build',
        status: CFG.STATUSES.indexOf(b.status) !== -1 ? b.status : 'Waiting',
        createdAt: Number(b.created) || now.getTime(),
        updatedAt: now.getTime()
      });
      if (entry) { entries.push(entry); }
    });
    if (!entries.length) { return null; }
    // Re-number tokens so they stay unique per office + date.
    var seq = {};
    entries.forEach(function (e) {
      var k = e.officeId + '|' + e.date;
      seq[k] = (seq[k] || 0) + 1;
      var office = Q.getOffice(e.officeId);
      e.tokenSeq = seq[k];
      e.token = office.prefix + '-' + String(seq[k]).padStart(3, '0');
      e.tokenPrefix = office.prefix;
    });
    return { version: 1, entries: entries, settings: {}, seededDemo: false, updatedAt: now.getTime(), migrated: entries.length };
  }

  /* --------------------------------------------------------- demo (fictional) */

  function demoEntry(office, service, date, time, name, status, seq, now, dayOffset) {
    var created = now.getTime() - (dayOffset || 0) * 86400000 - (9 - seq) * 600000 - seq * 180000;
    var history = status === 'Booked'
      ? [{ status: 'Booked', at: created }]
      : [{ status: 'Waiting', at: created }, { status: status, at: created + 600000 }];
    return {
      id: 'demo-' + office.id + '-' + date + '-' + seq,
      reference: 'QE-DEM' + office.prefix + String(seq).padStart(2, '0') + date.slice(5, 7) + date.slice(8, 10),
      token: office.prefix + '-' + String(seq).padStart(3, '0'),
      tokenSeq: seq,
      tokenPrefix: office.prefix,
      officeId: office.id,
      serviceId: service,
      date: date,
      time: time,
      name: name,
      channel: 'appointment',
      note: 'Fictional demo record',
      status: status,
      createdAt: created,
      updatedAt: created + 600000,
      history: history,
      demo: true
    };
  }

  function buildDemoState(now) {
    var today = Q.toISODate(now);
    var yesterday = Q.addDaysISO(today, -1);
    var tomorrow = Q.addDaysISO(today, 1);
    var offices = {};
    CFG.OFFICES.forEach(function (o) { offices[o.id] = o; });
    var entries = [
      demoEntry(offices.meeseva, 'meeseva-cert', today, '10:00', 'Ravi Kumar (fictional)', 'Completed', 1, now, 0),
      demoEntry(offices.meeseva, 'meeseva-income', today, '10:30', 'Sailaja (fictional)', 'Serving', 2, now, 0),
      demoEntry(offices.meeseva, 'meeseva-adangal', today, '11:00', 'Mahesh (fictional)', 'Waiting', 3, now, 0),
      demoEntry(offices.meeseva, 'meeseva-ration', today, '11:30', 'Kavitha (fictional)', 'Waiting', 4, now, 0),
      demoEntry(offices.meeseva, 'meeseva-pension', yesterday, '11:00', 'Naresh (fictional)', 'Completed', 1, now, 1),
      demoEntry(offices.panchayat, 'pan-house-tax', today, '10:00', 'Lakshmi (fictional)', 'Waiting', 1, now, 0),
      demoEntry(offices.panchayat, 'pan-water', today, '11:00', 'Srinivas (fictional)', 'Completed', 2, now, 0),
      demoEntry(offices.panchayat, 'pan-streetlight', yesterday, '10:30', 'Anitha (fictional)', 'Completed', 1, now, 1),
      demoEntry(offices.municipal, 'mun-property-tax', today, '10:00', 'Praveen (fictional)', 'Waiting', 1, now, 0),
      demoEntry(offices.municipal, 'mun-trade', today, '10:30', 'Divya (fictional)', 'No-show', 2, now, 0),
      demoEntry(offices.other, 'oth-pension', today, '10:00', 'Venkat (fictional)', 'Waiting', 1, now, 0),
      demoEntry(offices.other, 'oth-voter', today, '11:00', 'Padma (fictional)', 'Cancelled', 2, now, 0),
      demoEntry(offices.meeseva, 'meeseva-bill', tomorrow, '10:00', 'Suresh (fictional)', 'Booked', 1, now, -1)
    ];
    var state = Q.sanitizeState({ version: 1, entries: entries, settings: {}, seededDemo: true, updatedAt: now.getTime() });
    return state;
  }

  /* --------------------------------------------------------------- public API */

  function load(adapter, now, options) {
    var opts = options || {};
    var stamp = now instanceof Date ? now : new Date();
    var raw = null;
    try { raw = adapter.get(adapter.key); } catch (e) { raw = null; }

    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        var state = Q.sanitizeState(parsed);
        if (!state.entries.length && Object.keys(parsed).length) {
          // Parsed, but nothing usable inside - keep going with demo data.
        }
        return { state: state, source: 'stored', corrupt: false, storageAvailable: adapter.persistent };
      } catch (err) {
        try { adapter.set(CFG.STORAGE_KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
        try { adapter.remove(adapter.key); } catch (e3) { /* ignore */ }
      }
    }

    if (!raw) {
      var migrated = migrateLegacy(adapter, stamp);
      if (migrated) {
        var m = Q.sanitizeState(migrated);
        save(adapter, m, stamp);
        return { state: m, source: 'migrated', corrupt: false, storageAvailable: adapter.persistent, migrated: migrated.migrated };
      }
    }

    var state = opts.fresh ? Q.sanitizeState({}) : buildDemoState(stamp);
    save(adapter, state, stamp);
    return {
      state: state,
      source: opts.fresh ? 'fresh' : 'demo',
      corrupt: !opts.fresh && !!raw,
      storageAvailable: adapter.persistent
    };
  }

  function save(adapter, state, now) {
    var stamp = now instanceof Date ? now : new Date();
    state.updatedAt = stamp.getTime();
    try {
      adapter.set(adapter.key, JSON.stringify(state));
      return true;
    } catch (e) {
      return false; // quota / private mode
    }
  }

  function reset(adapter, now, withDemo) {
    var stamp = now instanceof Date ? now : new Date();
    var state = withDemo ? buildDemoState(stamp) : Q.sanitizeState({});
    save(adapter, state, stamp);
    return state;
  }

  return {
    createAdapter: createAdapter,
    memoryStorage: memoryStorage,
    browserStorage: browserStorage,
    buildDemoState: buildDemoState,
    load: load,
    save: save,
    reset: reset
  };
});
