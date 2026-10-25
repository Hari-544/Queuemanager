/* QueueManager - queue engine tests (pure logic, no DOM). */
'use strict';

const CFG = require('../assets/js/config.js');
const Q = require('../assets/js/queue.js');

/* Monday 12 Oct 2026, 11:00 local time. Saturdays/Sundays around it:
 * Sun 11 Oct (past), Sat 17 Oct, Sun 18 Oct (future, all offices closed). */
const NOW = new Date(2026, 9, 12, 11, 0, 0);
const TODAY = '2026-10-12';
const TOMORROW = '2026-10-13';
const SUNDAY = '2026-10-18';
const SATURDAY = '2026-10-17';

function freshState() {
  return Q.sanitizeState({ version: 1, entries: [], settings: {}, seededDemo: false, updatedAt: 0 });
}

let rngCounter = 0;
function rng() { // deterministic pseudo-random for stable references
  rngCounter += 1;
  return ((rngCounter * 7919) % 1000) / 1000;
}

function book(state, over) {
  return Q.createBooking(state, Object.assign({
    officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'appointment',
    date: TOMORROW, time: '10:00', name: 'Test User', note: ''
  }, over || {}), NOW, rng);
}

function codes(res) { return res.errors.map(function (e) { return e.code; }); }

module.exports = async function (ctx) {
  const { assert, suite } = ctx;

  await suite('queue: booking validation', [
    {
      name: 'future appointment creates token A-001 as Booked, with reference',
      fn() {
        const st = freshState();
        const res = book(st);
        assert(res.ok, 'expected ok, got ' + JSON.stringify(res.errors));
        assert.equal(res.entry.token, 'A-001');
        assert.match(res.entry.reference, /^QE-[A-Z2-9]{6}$/);
        assert.equal(res.entry.status, 'Booked');
        assert.equal(res.entry.name, 'Test User');
        assert.equal(st.entries.length, 1);
      }
    },
    {
      name: 'same-day appointment joins the Waiting line immediately',
      fn() {
        const st = freshState();
        const res = book(st, { date: TODAY, time: '11:30' });
        assert(res.ok, 'expected ok, got ' + JSON.stringify(res.errors));
        assert.equal(res.entry.status, 'Waiting');
      }
    },
    {
      name: 'missing name is rejected (NAME_REQUIRED)',
      fn() {
        const res = book(freshState(), { name: '   ' });
        assert(!res.ok, 'expected failure');
        assert(codes(res).indexOf('NAME_REQUIRED') !== -1, 'want NAME_REQUIRED');
      }
    },
    {
      name: 'numeric / ID-like names are rejected (NAME_INVALID)',
      fn() {
        assert(codes(book(freshState(), { name: '123456789012' })).indexOf('NAME_INVALID') !== -1, 'digits');
        assert(codes(book(freshState(), { name: 'A' })).indexOf('NAME_INVALID') !== -1, 'too short');
      }
    },
    {
      name: 'Telugu names are accepted',
      fn() {
        const res = book(freshState(), { name: 'అనిత' });
        assert(res.ok, 'expected ok, got ' + JSON.stringify(res.errors));
      }
    },
    {
      name: 'past date is rejected (DATE_PAST)',
      fn() {
        const res = book(freshState(), { date: '2026-10-11' });
        assert(codes(res).indexOf('DATE_PAST') !== -1, 'want DATE_PAST');
      }
    },
    {
      name: 'date beyond horizon is rejected (DATE_TOO_FAR)',
      fn() {
        const res = book(freshState(), { date: Q.addDaysISO(TODAY, CFG.RULES.bookingHorizonDays + 1) });
        assert(codes(res).indexOf('DATE_TOO_FAR') !== -1, 'want DATE_TOO_FAR, got ' + codes(res));
      }
    },
    {
      name: 'Sunday booking rejected for all offices (OFFICE_CLOSED)',
      fn() {
        for (const o of CFG.OFFICES) {
          const svc = Q.servicesForOffice(o.id)[0].id;
          const res = book(freshState(), { officeId: o.id, serviceId: svc, date: SUNDAY, time: '10:00' });
          assert(codes(res).indexOf('OFFICE_CLOSED') !== -1, o.id + ' should be closed Sunday');
        }
      }
    },
    {
      name: 'municipal office closed Saturday, panchayat open Saturday',
      fn() {
        const st = freshState();
        const m = book(st, { officeId: 'municipal', serviceId: 'mun-property-tax', date: SATURDAY, time: '10:00' });
        assert(codes(m).indexOf('OFFICE_CLOSED') !== -1, 'municipal should be closed Saturday');
        const p = book(st, { officeId: 'panchayat', serviceId: 'pan-house-tax', date: SATURDAY, time: '10:00' });
        assert(p.ok, 'panchayat should be open Saturday: ' + JSON.stringify(p.errors));
      }
    },
    {
      name: 'past slot today is rejected (TIME_PAST)',
      fn() {
        const res = book(freshState(), { date: TODAY, time: '10:00' }); // now is 11:00
        assert(codes(res).indexOf('TIME_PAST') !== -1, 'want TIME_PAST, got ' + codes(res));
      }
    },
    {
      name: 'future slot today is accepted',
      fn() {
        const res = book(freshState(), { date: TODAY, time: '11:30' });
        assert(res.ok, 'expected ok: ' + JSON.stringify(res.errors));
      }
    },
    {
      name: 'full slot is rejected (SLOT_FULL) after capacity reached',
      fn() {
        const st = freshState();
        const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
        for (const n of names) {
          const r = book(st, { name: n });
          assert(r.ok, 'setup booking failed: ' + JSON.stringify(r.errors));
        }
        const over = book(st, { name: 'Epsilon' });
        assert(codes(over).indexOf('SLOT_FULL') !== -1, 'want SLOT_FULL');
      }
    },
    {
      name: 'cancelled bookings free the slot capacity',
      fn() {
        const st = freshState();
        const names = ['Alpha', 'Beta', 'Gamma', 'Delta'];
        const ids = [];
        for (const n of names) { ids.push(book(st, { name: n }).entry.id); }
        const c = Q.setStatus(st, ids[0], 'Cancelled', NOW);
        assert(c.ok, 'cancel failed');
        const again = book(st, { name: 'Epsilon' });
        assert(again.ok, 'slot should be free after cancel: ' + JSON.stringify(again.errors));
      }
    },
    {
      name: 'same person same slot twice is rejected (DUPLICATE_BOOKING)',
      fn() {
        const st = freshState();
        assert(book(st).ok, 'first should pass');
        const dup = book(st);
        assert(codes(dup).indexOf('DUPLICATE_BOOKING') !== -1, 'want DUPLICATE_BOOKING');
      }
    },
    {
      name: 'different slots same day are allowed (up to active limit)',
      fn() {
        const st = freshState();
        assert(book(st, { time: '10:00' }).ok, 'slot 1');
        assert(book(st, { time: '10:30' }).ok, 'slot 2');
        assert(book(st, { time: '11:00' }).ok, 'slot 3');
        const fourth = book(st, { time: '11:30' });
        assert(codes(fourth).indexOf('TOO_MANY_ACTIVE') !== -1, 'want TOO_MANY_ACTIVE');
      }
    },
    {
      name: 'walk-in requires today (WALKIN_NOT_TODAY)',
      fn() {
        const res = book(freshState(), { channel: 'walkin', date: TOMORROW });
        assert(codes(res).indexOf('WALKIN_NOT_TODAY') !== -1, 'want WALKIN_NOT_TODAY');
      }
    },
    {
      name: 'walk-in for today is accepted and stamped with a slot time',
      fn() {
        const st = freshState();
        const office = Q.getOffice('meeseva');
        const res = Q.createBooking(st, {
          officeId: 'meeseva', serviceId: 'meeseva-cert', channel: 'walkin',
          date: TODAY, time: null, name: 'Walker', note: ''
        }, NOW, rng);
        assert(res.ok, 'expected ok: ' + JSON.stringify(res.errors));
        assert(office && Q.generateSlots(office).indexOf(res.entry.time) !== -1, 'walk-in time should be a valid slot');
      }
    }
  ]);

  await suite('queue: tokens and ordering', [
    {
      name: 'token prefixes differ per office, sequences restart per date',
      fn() {
        const st = freshState();
        const a = book(st, { officeId: 'meeseva', serviceId: 'meeseva-cert' });
        const b = book(st, { officeId: 'panchayat', serviceId: 'pan-house-tax', name: 'Other Person' });
        assert.equal(a.entry.token, 'A-001');
        assert.equal(b.entry.token, 'B-001');
        const c = book(st, { officeId: 'meeseva', serviceId: 'meeseva-income', name: 'Third Person', time: '10:30' });
        assert.equal(c.entry.token, 'A-002');
      }
    },
    {
      name: 'cancelled tokens are never re-issued (no duplicate numbers)',
      fn() {
        const st = freshState();
        const first = book(st).entry;
        Q.setStatus(st, first.id, 'Cancelled', NOW);
        const second = book(st, { name: 'New Person' }).entry;
        assert.equal(second.token, 'A-002');
        const tokens = st.entries.map(function (e) { return e.token; });
        assert.equal(new Set(tokens).size, tokens.length, 'tokens must be unique');
      }
    },
    {
      name: 'callNext opens the date: promotes Booked then serves earliest',
      fn() {
        const st = freshState();
        const e = book(st, { name: 'Future Person', time: '10:00' }).entry;
        assert.equal(e.status, 'Booked');
        book(st, { name: 'Later Person', time: '10:30' });
        const r = Q.callNext(st, 'meeseva', TOMORROW, NOW);
        assert(r.ok && r.entry.name === 'Future Person', 'earliest promoted and served first');
        assert.equal(r.entry.status, 'Serving');
        const hist = r.entry.history.map((h) => h.status);
        assert.deepEqual(hist, ['Booked', 'Waiting', 'Serving']);
      }
    },
    {
      name: 'promoteDue sweeps only arrived dates into the line',
      fn() {
        const st = freshState();
        const a = book(st, { name: 'Alpha Person', time: '10:00' }).entry; // tomorrow
        const b = book(st, { name: 'Beta Person', date: TODAY, time: '11:30' }).entry; // today
        assert.equal(Q.promoteDue(st, TODAY, NOW), 0, 'nothing due yet');
        assert.equal(Q.promoteDue(st, TOMORROW, NOW), 1, 'tomorrow booking promoted');
        assert.equal(Q.findEntry(st, a.id).status, 'Waiting');
        assert.equal(Q.findEntry(st, b.id).status, 'Waiting');
      }
    },
    {
      name: 'second callNext is blocked while one is serving (ALREADY_SERVING)',
      fn() {
        const st = freshState();
        book(st, { name: 'First Person', time: '10:00' });
        book(st, { name: 'Second Person', time: '10:30' });
        assert(Q.callNext(st, 'meeseva', TOMORROW, NOW).ok, 'first call ok');
        const r2 = Q.callNext(st, 'meeseva', TOMORROW, NOW);
        assert(!r2.ok && r2.code === 'ALREADY_SERVING', 'want ALREADY_SERVING');
        const done = Q.setStatus(st, Q.servingEntry(st, 'meeseva', TOMORROW).id, 'Completed', NOW);
        assert(done.ok, 'complete ok');
        const r3 = Q.callNext(st, 'meeseva', TOMORROW, NOW);
        assert(r3.ok && r3.entry.name === 'Second Person', 'second served after completion');
      }
    },
    {
      name: 'callNext on empty queue reports QUEUE_EMPTY',
      fn() {
        const r = Q.callNext(freshState(), 'meeseva', TOMORROW, NOW);
        assert(!r.ok && r.code === 'QUEUE_EMPTY', 'want QUEUE_EMPTY');
      }
    },
    {
      name: 'serving the same entry twice is impossible',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.setStatus(st, e.id, 'Serving', NOW).ok, 'serve ok');
        const again = Q.setStatus(st, e.id, 'Serving', NOW);
        assert(!again.ok && again.code === 'NO_CHANGE', 'want NO_CHANGE');
      }
    }
  ]);

  await suite('queue: status transitions', [
    {
      name: 'Booked cannot jump to Completed but staff may serve it directly',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.setStatus(st, e.id, 'Completed', NOW).code === 'TRANSITION_INVALID', 'no Booked->Completed');
        assert(Q.setStatus(st, e.id, 'Serving', NOW).ok, 'Booked->Serving allowed');
      }
    },
    {
      name: 'Waiting cannot jump straight to Completed',
      fn() {
        const st = freshState();
        const e = book(st, { date: TODAY, time: '11:30' }).entry;
        assert.equal(e.status, 'Waiting');
        const r = Q.setStatus(st, e.id, 'Completed', NOW);
        assert(!r.ok && r.code === 'TRANSITION_INVALID', 'want TRANSITION_INVALID');
      }
    },
    {
      name: 'full lifecycle Waiting -> Serving -> Completed -> Waiting(reopen)',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.setStatus(st, e.id, 'Serving', NOW).ok, 'serve');
        assert(Q.setStatus(st, e.id, 'Completed', NOW).ok, 'complete');
        const r = Q.setStatus(st, e.id, 'Waiting', NOW);
        assert(r.ok, 'reopen should be allowed for staff corrections');
        assert.equal(Q.findEntry(st, e.id).history.length, 4, 'history recorded');
      }
    },
    {
      name: 'Serving -> Completed -> Cancelled is rejected (final unless reopened)',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        Q.setStatus(st, e.id, 'Serving', NOW);
        Q.setStatus(st, e.id, 'Completed', NOW);
        const r = Q.setStatus(st, e.id, 'Cancelled', NOW);
        assert(!r.ok && r.code === 'TRANSITION_INVALID', 'want TRANSITION_INVALID');
      }
    },
    {
      name: 'No-show can be restored to Waiting',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.setStatus(st, e.id, 'No-show', NOW).ok, 'no-show');
        assert(Q.setStatus(st, e.id, 'Waiting', NOW).ok, 'restore');
      }
    },
    {
      name: 'unknown status and unknown id are rejected',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.setStatus(st, e.id, 'Flying', NOW).code === 'STATUS_INVALID', 'bad status');
        assert(Q.setStatus(st, 'nope', 'Serving', NOW).code === 'NOT_FOUND', 'bad id');
      }
    }
  ]);

  await suite('queue: reporting', [
    {
      name: 'summarize counts statuses consistently',
      fn() {
        const st = freshState();
        const a = book(st, { name: 'Alpha Person', time: '10:00' }).entry;
        const b = book(st, { name: 'Beta Person', time: '10:30' }).entry;
        book(st, { name: 'Gamma Person', time: '11:00' });
        Q.setStatus(st, a.id, 'Serving', NOW);
        Q.setStatus(st, b.id, 'Cancelled', NOW);
        const s = Q.summarize(st.entries);
        assert.deepEqual(s, { total: 3, Booked: 1, Waiting: 0, Serving: 1, Completed: 0, Cancelled: 1, 'No-show': 0 });
      }
    },
    {
      name: 'filterEntries supports status, office, date and text search',
      fn() {
        const st = freshState();
        book(st, { name: 'Alpha Person', date: TODAY, time: '11:30' });
        book(st, { name: 'Beta Person', date: TODAY, time: '12:00', officeId: 'panchayat', serviceId: 'pan-house-tax' });
        assert.equal(Q.filterEntries(st.entries, { status: 'Waiting' }).length, 2);
        assert.equal(Q.filterEntries(st.entries, { officeId: 'panchayat' }).length, 1);
        assert.equal(Q.filterEntries(st.entries, { token: 'b-001' }).length, 1, 'case-insensitive token search');
        assert.equal(Q.filterEntries(st.entries, { token: 'alpha' }).length, 1, 'name search');
        assert.equal(Q.filterEntries(st.entries, { date: '2099-01-01' }).length, 0);
      }
    },
    {
      name: 'peopleAhead and estimate follow the demo rule (ahead x avg minutes)',
      fn() {
        const st = freshState();
        const first = book(st, { name: 'Alpha Person', date: TODAY, time: '11:30' }).entry;
        const second = book(st, { name: 'Beta Person', date: TODAY, time: '12:00' }).entry;
        assert.equal(Q.peopleAhead(st, first), 0);
        assert.equal(Q.peopleAhead(st, second), 1);
        assert.equal(Q.estimateWaitMinutes(st, second), 1 * Q.getOffice('meeseva').avgServiceMinutes);
      }
    },
    {
      name: 'findReference matches reference and token, case-insensitive',
      fn() {
        const st = freshState();
        const e = book(st).entry;
        assert(Q.findReference(st, e.reference.toLowerCase()).id === e.id, 'ref lookup');
        assert(Q.findReference(st, e.token.toLowerCase()).id === e.id, 'token lookup');
        assert(Q.findReference(st, 'QE-NOPE00') === null, 'missing');
      }
    },
    {
      name: 'toCSV quotes fields and covers all rows',
      fn() {
        const st = freshState();
        const r = book(st, { name: 'Quote Person', time: '10:00', note: 'Bring "old" certificate, copy' });
        assert(r.ok, 'setup booking failed: ' + JSON.stringify(r.errors));
        const csv = Q.toCSV(st.entries);
        const lines = csv.split('\n');
        assert.equal(lines.length, 2, 'header + 1 row');
        assert(lines[0].indexOf('reference,token,office') === 0, 'header');
        assert(lines[1].indexOf('"Bring ""old"" certificate, copy"') !== -1, 'quoted note, got: ' + lines[1]);
      }
    },
    {
      name: 'sanitizeState drops garbage and repairs unknown statuses',
      fn() {
        const st = Q.sanitizeState({
          entries: [
            null,
            { id: '', token: 'junk' },
            { id: 'x1', status: 'Flying', name: 'Ghost' },
            { id: 'x2', status: 'Serving', officeId: 'meeseva', serviceId: 'meeseva-cert', date: 'bad-date', time: '25:99', name: 'Ok' }
          ]
        });
        assert.equal(st.entries.length, 2, 'two salvageable entries');
        assert.equal(st.entries[0].status, 'Waiting', 'unknown status defaults to Waiting');
        assert(Q.parseISODate(st.entries[1].date) !== null, 'bad date repaired');
      }
    }
  ]);
};
