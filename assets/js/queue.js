/*
 * QueueEase - queue logic (no DOM, no storage access).
 *
 * Every function receives the in-memory `state` object so the exact same
 * rules can run in the browser and inside the Node test-suite.  The storage
 * adapter is injected by storage.js, which keeps this file UI-free and makes
 * a future shared backend a drop-in replacement.
 */
(function (root, factory) {
  var cfg = (typeof module !== 'undefined' && module.exports)
    ? require('./config.js')
    : root.QE_CONFIG;
  var api = factory(cfg);
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  root.QEQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CFG) {
  'use strict';

  /* ------------------------------------------------------------------ dates */

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) { return null; }
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) { return null; }
    if (toISODate(d) !== iso) { return null; } // rejects 2026-02-31
    return d;
  }

  function isoToWeekday(iso) {
    var d = parseISODate(iso);
    return d ? d.getDay() : null;
  }

  function addDaysISO(iso, days) {
    var d = parseISODate(iso);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  function toMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) { return null; }
    var h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) { return null; }
    return h * 60 + min;
  }

  function to12h(hhmm) {
    var min = toMinutes(hhmm);
    if (min === null) { return hhmm; }
    var h = Math.floor(min / 60), m = min % 60;
    var suffix = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12;
    if (h12 === 0) { h12 = 12; }
    return h12 + ':' + pad(m) + ' ' + suffix;
  }

  /* ----------------------------------------------------------------- lookups */

  function getOffice(id) {
    return CFG.OFFICES.filter(function (o) { return o.id === id; })[0] || null;
  }

  function getService(id) {
    return CFG.SERVICES.filter(function (s) { return s.id === id; })[0] || null;
  }

  function servicesForOffice(officeId) {
    return CFG.SERVICES.filter(function (s) { return s.officeId === officeId; });
  }

  /* ------------------------------------------------------------------- slots */

  function generateSlots(office) {
    if (!office) { return []; }
    var out = [];
    var start = toMinutes(office.openTime);
    var end = toMinutes(office.closeTime);
    var lunchStart = office.lunchStart ? toMinutes(office.lunchStart) : null;
    var lunchEnd = office.lunchEnd ? toMinutes(office.lunchEnd) : null;
    var step = CFG.RULES.slotMinutes;
    if (start === null || end === null || end <= start) { return []; }
    for (var t = start; t + step <= end; t += step) {
      if (lunchStart !== null && t >= lunchStart && t < lunchEnd) { continue; }
      out.push(pad(Math.floor(t / 60)) + ':' + pad(t % 60));
    }
    return out;
  }

  function isOfficeOpenOn(office, isoDate) {
    var wd = isoToWeekday(isoDate);
    return wd !== null && office.openDays.indexOf(wd) !== -1;
  }

  function activeStatuses() { return ['Booked', 'Waiting', 'Serving']; }

  function isActive(entry) { return activeStatuses().indexOf(entry.status) !== -1; }

  function isCancelled(entry) { return entry.status === 'Cancelled'; }

  /* -------------------------------------------------------------- sanitising */

  function normalizeEntry(raw) {
    var e = raw || {};
    var id = typeof e.id === 'string' && e.id ? e.id : null;
    if (!id) { return null; }
    var status = CFG.STATUSES.indexOf(e.status) !== -1 ? e.status : 'Waiting';
    var officeId = getOffice(e.officeId) ? e.officeId : String(e.officeId || 'other');
    var serviceId = typeof e.serviceId === 'string' && e.serviceId ? e.serviceId : '';
    var tokenSeq = Number(e.tokenSeq);
    var office = getOffice(officeId);
    return {
      id: id,
      tokenPrefix: typeof e.tokenPrefix === 'string' && e.tokenPrefix
        ? e.tokenPrefix : (office ? office.prefix : 'X'),
      reference: typeof e.reference === 'string' && e.reference ? e.reference : ('QE-' + id.slice(0, 6).toUpperCase()),
      token: typeof e.token === 'string' && e.token ? e.token : 'X-000',
      tokenSeq: isFinite(tokenSeq) ? tokenSeq : 0,
      officeId: officeId,
      serviceId: serviceId,
      date: parseISODate(e.date) ? e.date : toISODate(new Date()),
      time: toMinutes(e.time) !== null ? e.time : '10:00',
      name: String(e.name == null ? '' : e.name).slice(0, 40),
      channel: CFG.CHANNELS.indexOf(e.channel) !== -1 ? e.channel : 'appointment',
      note: String(e.note == null ? '' : e.note).slice(0, 120),
      status: status,
      createdAt: Number(e.createdAt) || Date.now(),
      updatedAt: Number(e.updatedAt) || Number(e.createdAt) || Date.now(),
      history: Array.isArray(e.history) ? e.history.slice(-40) : [{ status: status, at: Number(e.createdAt) || Date.now() }],
      demo: !!e.demo
    };
  }

  function sanitizeState(raw) {
    var entries = Array.isArray(raw && raw.entries) ? raw.entries : [];
    var clean = [];
    for (var i = 0; i < entries.length; i++) {
      var e = normalizeEntry(entries[i]);
      if (e) { clean.push(e); }
    }
    return {
      version: 1,
      entries: clean,
      settings: raw && typeof raw.settings === 'object' && raw.settings ? raw.settings : {},
      seededDemo: !!(raw && raw.seededDemo),
      updatedAt: Number(raw && raw.updatedAt) || 0
    };
  }

  /* --------------------------------------------------------------- validation */

  var NAME_RE = /^[\p{L}\p{M}\s.'-]{2,40}$/u;

  function validateBookingInput(state, input, now) {
    var errors = [];
    var today = toISODate(now);
    var officeId = input && input.officeId;
    var serviceId = input && input.serviceId;
    var office = getOffice(officeId);
    var service = getService(serviceId);
    var channel = input && input.channel === 'walkin' ? 'walkin' : 'appointment';

    if (!office) { errors.push({ field: 'officeId', code: 'OFFICE_INVALID', message: 'Choose a demo office.' }); }
    if (!service) {
      errors.push({ field: 'serviceId', code: 'SERVICE_INVALID', message: 'Choose a service.' });
    } else if (office && service.officeId !== office.id) {
      errors.push({ field: 'serviceId', code: 'SERVICE_OFFICE_MISMATCH', message: 'That service does not belong to the selected office.' });
    }

    var name = String((input && input.name) || '').trim();
    if (!name) {
      errors.push({ field: 'name', code: 'NAME_REQUIRED', message: 'Enter a display name or alias.' });
    } else if (!NAME_RE.test(name)) {
      errors.push({ field: 'name', code: 'NAME_INVALID', message: 'Use 2-40 letters, spaces, dots or hyphens. No numbers or ID numbers.' });
    }

    var date = String((input && input.date) || '');
    if (!parseISODate(date)) {
      errors.push({ field: 'date', code: 'DATE_INVALID', message: 'Choose a valid date.' });
    } else if (date < today) {
      errors.push({ field: 'date', code: 'DATE_PAST', message: 'The chosen date is in the past.' });
    } else if (date > addDaysISO(today, CFG.RULES.bookingHorizonDays)) {
      errors.push({ field: 'date', code: 'DATE_TOO_FAR', message: 'Demo bookings open for the next ' + CFG.RULES.bookingHorizonDays + ' days only.' });
    } else if (office && !isOfficeOpenOn(office, date)) {
      errors.push({ field: 'date', code: 'OFFICE_CLOSED', message: 'The selected office is closed on that date.' });
    }

    var slots = office ? generateSlots(office) : [];
    var time = String((input && input.time) || '');

    if (channel === 'appointment') {
      if (slots.indexOf(time) === -1) {
        errors.push({ field: 'time', code: 'TIME_INVALID', message: 'Choose a valid time slot.' });
      } else if (date === today) {
        var nowMin = now.getHours() * 60 + now.getMinutes();
        if (toMinutes(time) <= nowMin) {
          errors.push({ field: 'time', code: 'TIME_PAST', message: 'That slot has already started today. Choose a later slot.' });
        }
      }
      if (!errors.length) {
        var used = state.entries.filter(function (e) {
          return e.officeId === office.id && e.date === date && e.time === time &&
            e.channel === 'appointment' && !isCancelled(e);
        }).length;
        if (used >= CFG.RULES.slotsPerService) {
          errors.push({ field: 'time', code: 'SLOT_FULL', message: 'That slot is full for this demo office. Choose another slot.' });
        }
      }
    } else {
      // Walk-in token: only for today, only when the counter is open now.
      if (date !== today) {
        errors.push({ field: 'date', code: 'WALKIN_NOT_TODAY', message: 'Walk-in tokens are issued for today only.' });
      } else if (office) {
        var nowM = now.getHours() * 60 + now.getMinutes();
        var openFrom = toMinutes(office.openTime);
        var openTo = toMinutes(office.closeTime);
        if (nowM < openFrom || nowM >= openTo) {
          errors.push({ field: 'walkin', code: 'WALKIN_CLOSED', message: 'The counter is closed now. Walk-in tokens are unavailable.' });
        } else if (office.lunchStart && nowM >= toMinutes(office.lunchStart) && nowM < toMinutes(office.lunchEnd)) {
          errors.push({ field: 'walkin', code: 'WALKIN_LUNCH', message: 'Counter is on lunch break. Walk-in tokens are unavailable.' });
        } else if (!office.walkInEnabled) {
          errors.push({ field: 'walkin', code: 'WALKIN_DISABLED', message: 'Walk-in tokens are disabled for this demo office.' });
        }
      }
    }

    if (!errors.length) {
      var sameSlot = state.entries.filter(function (e) {
        return e.officeId === office.id && e.date === date &&
          e.name.toLowerCase() === name.toLowerCase() && !isCancelled(e) &&
          e.status !== 'Completed' && e.status !== 'No-show';
      });
      if (channel === 'appointment' && sameSlot.some(function (e) { return e.time === time; })) {
        errors.push({ field: 'time', code: 'DUPLICATE_BOOKING', message: 'You already have a booking in this slot.' });
      }
      var activeCount = sameSlot.filter(isActive).length;
      if (activeCount >= CFG.RULES.maxActivePerPersonPerDay) {
        errors.push({ field: 'name', code: 'TOO_MANY_ACTIVE', message: 'Demo limit: at most ' + CFG.RULES.maxActivePerPersonPerDay + ' active tokens per person per day.' });
      }
    }

    return { ok: errors.length === 0, errors: errors, office: office, service: service, name: name, channel: channel };
  }

  /* ------------------------------------------------------------------ tokens */

  function nextToken(state, office, date) {
    var max = 0;
    var used = {};
    state.entries.forEach(function (e) {
      if (e.officeId === office.id && e.date === date && e.tokenPrefix === office.prefix) {
        used[e.token] = true;
        if (e.tokenSeq > max) { max = e.tokenSeq; }
      }
    });
    var seq = max + 1;
    var token = office.prefix + '-' + String(seq).padStart(3, '0');
    var guard = 0;
    while (used[token] && guard < 5000) {
      seq += 1;
      token = office.prefix + '-' + String(seq).padStart(3, '0');
      guard += 1;
    }
    return { seq: seq, token: token };
  }

  var REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function makeReference(now, rng) {
    var rand = rng || Math.random;
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += REF_ALPHABET.charAt(Math.floor(rand() * REF_ALPHABET.length));
    }
    return 'QE-' + out;
  }

  function uniqueReference(state, now, rng) {
    var existing = {};
    state.entries.forEach(function (e) { existing[e.reference] = true; });
    var ref = makeReference(now, rng);
    var guard = 0;
    while (existing[ref] && guard < 200) {
      ref = makeReference(now, rng);
      guard += 1;
    }
    return ref;
  }

  function makeId(now, rng) {
    var rand = rng || Math.random;
    var stamp = now ? now.getTime().toString(36) : Date.now().toString(36);
    var tail = '';
    for (var i = 0; i < 4; i++) { tail += Math.floor(rand() * 36).toString(36); }
    return stamp + '-' + tail;
  }

  /* ------------------------------------------------------------- queue engine */

  function createBooking(state, input, now, rng) {
    var when = now instanceof Date ? now : new Date();
    var check = validateBookingInput(state, input, when);
    if (!check.ok) {
      return { ok: false, errors: check.errors, entry: null };
    }
    var office = check.office;
    var channel = check.channel;
    var time = input.time;
    if (channel === 'walkin') {
      var nowMin = when.getHours() * 60 + when.getMinutes();
      var slotStart = Math.floor(nowMin / CFG.RULES.slotMinutes) * CFG.RULES.slotMinutes;
      time = pad(Math.floor(slotStart / 60)) + ':' + pad(slotStart % 60);
      if (generateSlots(office).indexOf(time) === -1) { time = office.openTime; }
    }
    var tok = nextToken(state, office, input.date);
    var stamp = when.getTime();
    // Future-date bookings start as Booked; today's bookings (and walk-ins)
    // join the Waiting line immediately. Booked entries are promoted to
    // Waiting by the daily sweep (promoteDue) or when staff call the next
    // token for that office and date (opening the counter).
    var today = toISODate(when);
    var startStatus = (channel === 'walkin' || input.date <= today) ? 'Waiting' : 'Booked';
    var entry = {
      id: makeId(when, rng),
      reference: uniqueReference(state, when, rng),
      token: tok.token,
      tokenSeq: tok.seq,
      tokenPrefix: office.prefix,
      officeId: office.id,
      serviceId: check.service.id,
      date: input.date,
      time: time,
      name: check.name,
      channel: channel,
      note: String((input && input.note) || '').trim().slice(0, 120),
      status: startStatus,
      createdAt: stamp,
      updatedAt: stamp,
      history: [{ status: startStatus, at: stamp }],
      demo: false
    };
    state.entries.push(entry);
    return { ok: true, errors: [], entry: entry };
  }

  function findEntry(state, id) {
    return state.entries.filter(function (e) { return e.id === id; })[0] || null;
  }

  function servingEntry(state, officeId, date) {
    return state.entries.filter(function (e) {
      return e.officeId === officeId && e.date === date && e.status === 'Serving';
    })[0] || null;
  }

  /* Promote Booked -> Waiting for one office + date (opening the counter).
   * Returns the number of entries promoted. */
  function promoteBooked(state, officeId, date, now) {
    var when = now instanceof Date ? now : new Date();
    var stamp = when.getTime();
    var n = 0;
    state.entries.forEach(function (e) {
      if (e.officeId === officeId && e.date === date && e.status === 'Booked') {
        e.status = 'Waiting';
        e.updatedAt = stamp;
        e.history.push({ status: 'Waiting', at: stamp });
        n += 1;
      }
    });
    return n;
  }

  /* Daily sweep: bookings whose date has arrived join the waiting line.
   * Returns the number of entries promoted. */
  function promoteDue(state, todayISO, now) {
    var when = now instanceof Date ? now : new Date();
    var stamp = when.getTime();
    var n = 0;
    state.entries.forEach(function (e) {
      if (e.status === 'Booked' && e.date <= todayISO) {
        e.status = 'Waiting';
        e.updatedAt = stamp;
        e.history.push({ status: 'Waiting', at: stamp });
        n += 1;
      }
    });
    return n;
  }

  function callNext(state, officeId, date, now) {
    var when = now instanceof Date ? now : new Date();
    var office = getOffice(officeId);
    if (!office) { return { ok: false, code: 'OFFICE_INVALID', entry: null, message: 'Select a demo office.' }; }
    var busy = servingEntry(state, officeId, date);
    if (busy) {
      return {
        ok: false,
        code: 'ALREADY_SERVING',
        entry: null,
        message: 'Token ' + busy.token + ' is being served. Complete, cancel or mark it No-show before calling the next token.'
      };
    }
    // Opening the counter: booked entries for this office + date join the line.
    promoteBooked(state, officeId, date, when);
    var queue = waitingQueue(state, officeId, date);
    if (!queue.length) {
      return { ok: false, code: 'QUEUE_EMPTY', entry: null, message: 'No waiting tokens in this queue.' };
    }
    var next = queue[0];
    next.status = 'Serving';
    next.updatedAt = when.getTime();
    next.history.push({ status: 'Serving', at: when.getTime() });
    return { ok: true, code: 'CALLED', entry: next, message: 'Now serving token ' + next.token + '.' };
  }

  function setStatus(state, id, status, now) {
    var when = now instanceof Date ? now : new Date();
    var entry = findEntry(state, id);
    if (!entry) { return { ok: false, code: 'NOT_FOUND', message: 'Token not found.' }; }
    if (CFG.STATUSES.indexOf(status) === -1) { return { ok: false, code: 'STATUS_INVALID', message: 'Unknown status.' }; }
    if (entry.status === status) {
      return { ok: false, code: 'NO_CHANGE', entry: entry, message: 'Token ' + entry.token + ' is already ' + status + '.' };
    }
    if (CFG.TRANSITIONS[entry.status].indexOf(status) === -1) {
      return { ok: false, code: 'TRANSITION_INVALID', entry: entry, from: entry.status, to: status, message: 'A ' + entry.status + ' token cannot be changed to ' + status + '.' };
    }
    if (status === 'Serving') {
      var busy = servingEntry(state, entry.officeId, entry.date);
      if (busy && busy.id !== entry.id) {
        return { ok: false, code: 'ALREADY_SERVING', entry: entry, conflict: busy, message: 'Token ' + busy.token + ' is already being served at this office.' };
      }
    }
    entry.status = status;
    entry.updatedAt = when.getTime();
    entry.history.push({ status: status, at: when.getTime() });
    return { ok: true, code: 'UPDATED', entry: entry, message: 'Token ' + entry.token + ' is now ' + status + '.' };
  }

  function waitingQueue(state, officeId, date) {
    return state.entries.filter(function (e) {
      return e.officeId === officeId && e.date === date && e.status === 'Waiting';
    }).sort(function (a, b) {
      if (a.createdAt !== b.createdAt) { return a.createdAt - b.createdAt; }
      return a.tokenSeq - b.tokenSeq;
    });
  }

  /* ---------------------------------------------------------------- reporting */

  function summarize(entries) {
    var out = { total: entries.length, Booked: 0, Waiting: 0, Serving: 0, Completed: 0, Cancelled: 0, 'No-show': 0 };
    entries.forEach(function (e) {
      if (out[e.status] === undefined) { out[e.status] = 0; }
      out[e.status] += 1;
    });
    return out;
  }

  function filterEntries(entries, filters) {
    var f = filters || {};
    var token = String(f.token || '').trim().toUpperCase();
    var from = parseISODate(f.from);
    var to = parseISODate(f.to);
    return entries.filter(function (e) {
      if (f.officeId && f.officeId !== 'all' && e.officeId !== f.officeId) { return false; }
      if (f.serviceId && f.serviceId !== 'all' && e.serviceId !== f.serviceId) { return false; }
      if (f.status && f.status !== 'all' && e.status !== f.status) { return false; }
      if (f.date && e.date !== f.date) { return false; }
      if (from && e.date < f.from) { return false; }
      if (to && e.date > f.to) { return false; }
      if (f.channel && f.channel !== 'all' && e.channel !== f.channel) { return false; }
      if (token) {
        var hay = (e.token + ' ' + e.reference + ' ' + e.name).toUpperCase();
        if (hay.indexOf(token) === -1) { return false; }
      }
      return true;
    });
  }

  function sortForDisplay(entries) {
    return entries.slice().sort(function (a, b) {
      if (a.date !== b.date) { return a.date < b.date ? -1 : 1; }
      if (a.createdAt !== b.createdAt) { return a.createdAt - b.createdAt; }
      return a.tokenSeq - b.tokenSeq;
    });
  }

  function peopleAhead(state, entry) {
    if (!entry || entry.status !== 'Waiting') { return 0; }
    var ahead = state.entries.filter(function (e) {
      return e.officeId === entry.officeId && e.date === entry.date && e.status === 'Waiting' &&
        (e.createdAt < entry.createdAt || (e.createdAt === entry.createdAt && e.tokenSeq < entry.tokenSeq));
    });
    return ahead.length;
  }

  function estimateWaitMinutes(state, entry, office) {
    var off = office || getOffice(entry && entry.officeId);
    if (!off || !entry) { return 0; }
    return peopleAhead(state, entry) * off.avgServiceMinutes;
  }

  function findReference(state, reference) {
    var ref = String(reference || '').trim().toUpperCase();
    if (!ref) { return null; }
    return state.entries.filter(function (e) {
      return e.reference.toUpperCase() === ref || e.token.toUpperCase() === ref;
    })[0] || null;
  }

  /* ------------------------------------------------------------------- export */

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(entries) {
    var header = ['reference', 'token', 'office', 'service', 'date', 'time', 'channel', 'name', 'note', 'status', 'createdAt', 'updatedAt'];
    var rows = [header.join(',')];
    entries.forEach(function (e) {
      var office = getOffice(e.officeId);
      var service = getService(e.serviceId);
      rows.push([
        e.reference, e.token, office ? office.id : e.officeId, service ? service.id : e.serviceId,
        e.date, e.time, e.channel, e.name, e.note, e.status,
        new Date(e.createdAt).toISOString(), new Date(e.updatedAt).toISOString()
      ].map(csvCell).join(','));
    });
    return rows.join('\n');
  }

  function statusCountsByOffice(entries) {
    var out = {};
    CFG.OFFICES.forEach(function (o) { out[o.id] = summarize([]); });
    CFG.OFFICES.forEach(function (o) {
      out[o.id] = summarize(entries.filter(function (e) { return e.officeId === o.id; }));
    });
    return out;
  }

  return {
    toISODate: toISODate,
    parseISODate: parseISODate,
    isoToWeekday: isoToWeekday,
    addDaysISO: addDaysISO,
    toMinutes: toMinutes,
    to12h: to12h,
    getOffice: getOffice,
    getService: getService,
    servicesForOffice: servicesForOffice,
    generateSlots: generateSlots,
    isOfficeOpenOn: isOfficeOpenOn,
    isActive: isActive,
    isCancelled: isCancelled,
    normalizeEntry: normalizeEntry,
    sanitizeState: sanitizeState,
    validateBookingInput: validateBookingInput,
    createBooking: createBooking,
    findEntry: findEntry,
    nextToken: nextToken,
    makeReference: makeReference,
    servingEntry: servingEntry,
    promoteBooked: promoteBooked,
    promoteDue: promoteDue,
    callNext: callNext,
    setStatus: setStatus,
    waitingQueue: waitingQueue,
    summarize: summarize,
    filterEntries: filterEntries,
    sortForDisplay: sortForDisplay,
    peopleAhead: peopleAhead,
    estimateWaitMinutes: estimateWaitMinutes,
    findReference: findReference,
    toCSV: toCSV,
    statusCountsByOffice: statusCountsByOffice
  };
});
