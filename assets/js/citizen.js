/* QueueEase - citizen page (booking, confirmation, my tokens, tracking). */
(function () {
  'use strict';

  var CFG = window.QE_CONFIG;
  var Q = window.QEQueue;
  var S = window.QEStore;
  var I = window.QEI18N;
  var U = window.QEUI;
  var API = window.QEAPI;

  var MINE_KEY = 'queueease.mine.v1';

  var adapter = null;
  var state = null;
  var lang = 'en';
  var selectedSlot = null;
  var submitting = false;
  var myIds = [];
  var serverMode = false;
  var serverToday = null;
  var posCache = {}; // entry id -> {ahead, est} supplied by server responses
  var sseHandle = null;
  var eventTimer = null;
  var refreshInFlight = false;
  var refreshAgain = false;
  var lastEventVersion = 0;

  function showModeBadge() {
    var wrap = document.querySelector('.demo-banner .wrap');
    if (!wrap) { return; }
    var badge = document.getElementById('mode-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'mode-badge';
      badge.className = 'badge badge-neutral';
      badge.style.marginLeft = '4px';
      wrap.appendChild(badge);
    }
    badge.textContent = API.mode === 'unavailable'
      ? 'Backend unavailable'
      : I.t(serverMode ? 'mode_server' : 'mode_local', lang);
  }

  /* ------------------------------------------------------------ persistence */

  function persist() {
    S.save(adapter, state, new Date());
  }

  function loadMine() {
    myIds = [];
    try {
      var raw = window.localStorage.getItem(MINE_KEY);
      var arr = JSON.parse(raw || '[]');
      if (Array.isArray(arr)) {
        myIds = arr.filter(function (x) { return typeof x === 'string'; }).slice(0, 200);
      }
    } catch (e) { myIds = []; }
  }

  function saveMine() {
    try { window.localStorage.setItem(MINE_KEY, JSON.stringify(myIds.slice(0, 200))); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ language */

  function setLang(l, skipPersist) {
    lang = I.isLang(l);
    I.setStoredLang(lang);
    if (!skipPersist) {
      state.settings = state.settings || {};
      state.settings.lang = lang;
      persist();
    }
    I.applyStatic(lang);
    I.applyTitle('doc_title_citizen', lang);
    U.setLangButtons(lang);
    showModeBadge();
    syncDateHint();
    renderAll();
  }

  function bindLang() {
    var btns = document.querySelectorAll('[data-lang-btn]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang-btn')); });
    }
  }

  /* ------------------------------------------------------------------- form */

  function formEls() {
    return {
      form: U.byId('booking-form'),
      office: U.byId('f-office'),
      service: U.byId('f-service'),
      date: U.byId('f-date'),
      slots: U.byId('slot-grid'),
      slotField: U.byId('slot-field'),
      name: U.byId('f-name'),
      note: U.byId('f-note'),
      submit: U.byId('submit-btn'),
      errors: U.byId('form-errors')
    };
  }

  function channel() {
    var checked = document.querySelector('input[name="channel"]:checked');
    return checked && checked.value === 'walkin' ? 'walkin' : 'appointment';
  }

  function currentOffice() {
    return Q.getOffice(formEls().office.value) || CFG.OFFICES[0];
  }

  function syncDateHint() {
    var today = U.todayISO();
    var max = Q.addDaysISO(today, CFG.RULES.bookingHorizonDays);
    U.byId('date-hint').textContent = I.t('date_range_hint', lang, { min: I.fmtDateShort(today, lang), max: I.fmtDateShort(max, lang) });
  }

  function syncFormDefaults() {
    var els = formEls();
    var today = U.todayISO();
    els.office.innerHTML = CFG.OFFICES.map(function (o) {
      return '<option value="' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</option>';
    }).join('');
    els.date.min = today;
    els.date.max = Q.addDaysISO(today, CFG.RULES.bookingHorizonDays);
    els.date.value = today;
    populateServices(true);
    renderSlots();
  }

  function populateServices(resetSelection) {
    var els = formEls();
    var office = currentOffice();
    var list = Q.servicesForOffice(office.id);
    var prev = els.service.value;
    els.service.innerHTML = list.map(function (s) {
      return '<option value="' + U.esc(s.id) + '">' + U.esc(U.serviceName(s, lang)) + '</option>';
    }).join('');
    if (!resetSelection && prev) {
      var stillThere = list.some(function (s) { return s.id === prev; });
      if (stillThere) { els.service.value = prev; }
    }
  }

  function slotUsage(officeId, date) {
    var counts = {};
    state.entries.forEach(function (e) {
      if (e.officeId === officeId && e.date === date && e.channel === 'appointment' && e.status !== 'Cancelled') {
        counts[e.time] = (counts[e.time] || 0) + 1;
      }
    });
    return counts;
  }

  function renderSlots() {
    var els = formEls();
    var isWalkin = channel() === 'walkin';
    els.slotField.classList.toggle('hide', isWalkin);
    els.date.disabled = isWalkin;
    if (isWalkin) {
      els.date.value = U.todayISO();
      U.byId('err-time').classList.add('hide');
      return;
    }
    var office = currentOffice();
    var date = els.date.value || U.todayISO();
    var open = Q.parseISODate(date) && Q.isOfficeOpenOn(office, date);
    var slots = open ? Q.generateSlots(office) : [];
    var today = U.todayISO();
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var used = slotUsage(office.id, date);

    if (!open && Q.parseISODate(date)) {
      els.slots.innerHTML = '<div class="notice notice-warn" style="grid-column:1/-1">' + U.esc(I.t('closed_day_note', lang)) + '</div>';
      selectedSlot = null;
      els.submit.disabled = true;
      return;
    }
    els.submit.disabled = false;

    if (selectedSlot && slots.indexOf(selectedSlot) === -1) { selectedSlot = null; }

    els.slots.innerHTML = slots.map(function (s) {
      var n = used[s] || 0;
      var full = n >= CFG.RULES.slotsPerService;
      var past = date === today && Q.toMinutes(s) <= nowMin;
      var disabled = full || past;
      if (disabled && selectedSlot === s) { selectedSlot = null; }
      var pressed = selectedSlot === s ? 'true' : 'false';
      var suffix = full ? ' · ' + I.t('slot_full', lang)
        : (n > 0 ? ' · ' + I.t('slots_left_n', lang, { n: CFG.RULES.slotsPerService - n }) : '');
      return '<button type="button" class="slot" data-slot="' + U.esc(s) + '"' +
        ' aria-pressed="' + pressed + '"' + (disabled ? ' disabled' : '') + '>' +
        U.esc(Q.to12h(s)) + '<span class="sr-only">' + U.esc(suffix) + '</span>' +
        (suffix ? '<br><small>' + U.esc(suffix.replace(/^ · /, '')) + '</small>' : '') + '</button>';
    }).join('');
  }

  function clearErrors() {
    var box = U.byId('form-errors');
    box.classList.remove('is-visible');
    box.innerHTML = '';
    ['service', 'date', 'time', 'name'].forEach(function (f) {
      var n = U.byId('err-' + f);
      if (n) { n.classList.add('hide'); n.textContent = ''; }
      var input = { service: 'f-service', date: 'f-date', time: null, name: 'f-name' }[f];
      if (input) { U.byId(input).removeAttribute('aria-invalid'); }
    });
  }

  function localizeEngineError(err) {
    return I.t('err_' + err.code, lang, { days: CFG.RULES.bookingHorizonDays, max: CFG.RULES.maxActivePerPersonPerDay, token: '' });
  }

  function showErrors(errors) {
    var box = U.byId('form-errors');
    var items = errors.map(function (e) { return '<li>' + U.esc(localizeEngineError(e)) + '</li>'; }).join('');
    box.innerHTML = '<strong>' + U.esc(I.t('form_error_title', lang)) + '</strong><ul>' + items + '</ul>';
    box.classList.add('is-visible');
    var fieldMap = { serviceId: 'service', date: 'date', time: 'time', name: 'name' };
    errors.forEach(function (e) {
      var target = fieldMap[e.field];
      if (!target) { return; }
      var n = U.byId('err-' + target);
      if (n) { n.textContent = localizeEngineError(e); n.classList.remove('hide'); }
      var inputId = { service: 'f-service', date: 'f-date', name: 'f-name' }[target];
      if (inputId) { U.byId(inputId).setAttribute('aria-invalid', 'true'); }
    });
    try { box.focus(); } catch (e) { /* ignore */ }
  }

  function estFor(entry) {
    var office = Q.getOffice(entry.officeId);
    var ahead = Q.peopleAhead(state, entry);
    var mins = ahead * U.avgMinutes(office, state.settings);
    return { ahead: ahead, mins: mins };
  }

  function positionLine(entry) {
    if (entry.status === 'Booked') {
      return I.t('pos_booked', lang, { date: I.fmtDateShort(entry.date, lang) });
    }
    if (entry.status !== 'Waiting') { return I.t('pos_not_waiting', lang); }
    var cached = posCache[entry.id];
    var ahead, mins;
    if (cached) {
      ahead = cached.ahead;
      mins = cached.est;
    } else {
      var info = estFor(entry);
      ahead = info.ahead;
      mins = info.mins;
    }
    var aheadTxt = ahead === 0 ? I.t('pos_next', lang) : I.t('pos_n', lang, { n: ahead });
    var wait = mins === 0 ? I.t('est_zero', lang) : I.t('est_n', lang, { m: mins });
    return aheadTxt + ' ' + wait;
  }

  function entryCard(entry, opts) {
    var office = Q.getOffice(entry.officeId);
    var service = Q.getService(entry.serviceId);
    var o = opts || {};
    var html = '<article class="queue-item' + (entry.status === 'Serving' ? ' is-serving' : '') + '">' +
      '<div class="queue-item-head"><div class="queue-item-title">' +
      '<span class="mono">#' + U.esc(entry.token) + '</span> · ' + U.esc(U.serviceName(service, lang)) +
      '</div>' + U.statusBadge(entry.status, lang) + '</div>' +
      '<div class="queue-meta">' +
      '<span>' + U.esc(U.officeName(office, lang)) + '</span>' +
      '<span>' + U.esc(I.fmtDateLong(entry.date, lang)) + ' · ' + U.esc(Q.to12h(entry.time)) + '</span>' +
      '<span>' + U.esc(entry.channel === 'walkin' ? I.t('walkin_badge', lang) : I.t('appt_badge', lang)) + '</span>' +
      (entry.demo ? '<span class="badge badge-neutral">' + U.esc(I.t('demo_badge', lang)) + '</span>' : '') +
      '</div>' +
      '<div class="queue-meta"><span>' + U.esc(I.t('c_name', lang)) + ': <b>' + U.esc(entry.name) + '</b></span>' +
      '<span>' + U.esc(I.t('c_reference', lang)) + ': <b class="mono">' + U.esc(entry.reference) + '</b></span></div>';
    if (entry.status === 'Waiting') {
      html += '<p class="muted" style="margin:0"><small>' + U.esc(positionLine(entry)) + ' ' + U.esc(I.t('est_disclaimer', lang)) + '</small></p>';
    }
    if (o.actions !== false) {
      html += '<div class="row-actions">';
      if (entry.status === 'Waiting' && o.cancel !== false) {
        html += '<button type="button" class="btn btn-ghost btn-sm" data-cancel="' + U.esc(entry.id) + '">' + U.esc(I.t('btn_cancel_booking', lang)) + '</button>';
      }
      if (o.remove) {
        html += '<button type="button" class="btn btn-ghost btn-sm" data-remove="' + U.esc(entry.id) + '">' + U.esc(I.t('btn_remove', lang)) + '</button>';
      }
      html += '</div>';
    }
    return html + '</article>';
  }

  function showConfirmation(entry) {
    var office = Q.getOffice(entry.officeId);
    var service = Q.getService(entry.serviceId);
    var ahead, wait;
    if (entry.status === 'Booked') {
      ahead = I.t('pos_booked', lang, { date: I.fmtDateShort(entry.date, lang) });
      wait = '—';
    } else {
      var info = estFor(entry);
      var cached = posCache[entry.id];
      var a = cached ? cached.ahead : info.ahead;
      var m = cached ? cached.est : info.mins;
      ahead = a === 0 ? I.t('pos_next', lang) : I.t('pos_n', lang, { n: a });
      wait = m === 0 ? I.t('est_zero', lang) : I.t('est_n', lang, { m: m });
    }
    var box = U.byId('confirmation');
    box.classList.remove('hide');
    box.innerHTML =
      '<div class="token-card">' +
      '<div><div class="eyebrow">' + U.esc(I.t('conf_title', lang)) + '</div>' +
      '<p class="muted">' + U.esc(I.t('conf_lead', lang)) + '</p></div>' +
      '<div class="token-box"><span class="stat-label">' + U.esc(I.t('c_token', lang)) + '</span>' +
      '<span class="token-number">' + U.esc(entry.token) + '</span>' +
      '<span>' + U.statusBadge(entry.status, lang) + ' <span class="badge badge-neutral">' + U.esc(I.t('demo_badge', lang)) + '</span></span></div>' +
      '<dl class="kv">' +
      '<dt>' + U.esc(I.t('c_reference', lang)) + '</dt><dd class="mono">' + U.esc(entry.reference) + '</dd>' +
      '<dt>' + U.esc(I.t('c_office', lang)) + '</dt><dd>' + U.esc(U.officeName(office, lang)) + '</dd>' +
      '<dt>' + U.esc(I.t('c_service', lang)) + '</dt><dd>' + U.esc(U.serviceName(service, lang)) + '</dd>' +
      '<dt>' + U.esc(I.t('c_when', lang)) + '</dt><dd>' + U.esc(I.fmtDateLong(entry.date, lang)) + ' · ' + U.esc(Q.to12h(entry.time)) + '</dd>' +
      '<dt>' + U.esc(I.t('c_ahead', lang)) + '</dt><dd>' + U.esc(ahead) + '</dd>' +
      '<dt>' + U.esc(I.t('c_estwait', lang)) + '</dt><dd>' + U.esc(wait) + '</dd>' +
      '</dl>' +
      '<p class="muted"><small>' + U.esc(I.t('c_ref_hint', lang)) + ' ' + U.esc(I.t('est_disclaimer', lang)) + '</small></p>' +
      '<div class="row">' +
      '<button type="button" class="btn btn-secondary" id="conf-new">' + U.esc(I.t('btn_new', lang)) + '</button>' +
      '<button type="button" class="btn btn-teal" id="conf-track">' + U.esc(I.t('btn_track', lang)) + '</button>' +
      '<button type="button" class="btn btn-ghost" id="conf-print">' + U.esc(I.t('btn_print', lang)) + '</button>' +
      '</div></div>';
    U.byId('conf-new').addEventListener('click', function () {
      box.classList.add('hide');
      box.innerHTML = '';
      document.getElementById('book').scrollIntoView({ behavior: 'smooth' });
      try { formEls().name.focus(); } catch (e) { /* ignore */ }
    });
    U.byId('conf-track').addEventListener('click', function () {
      U.byId('track-input').value = entry.reference;
      U.byId('track-form').dispatchEvent(new Event('submit', { cancelable: true }));
      document.getElementById('mytokens').scrollIntoView({ behavior: 'smooth' });
    });
    U.byId('conf-print').addEventListener('click', function () {
      document.body.classList.add('print-slip');
      window.print();
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function mergeServerEntry(entry, pos) {
    var publicEntry = Object.assign({}, entry || {});
    if (!publicEntry.id && publicEntry.reference) {
      publicEntry.id = 'public-' + publicEntry.reference;
    }
    if (!publicEntry.tokenSeq && publicEntry.token) {
      var tokenParts = String(publicEntry.token).split('-');
      publicEntry.tokenSeq = Number(tokenParts[tokenParts.length - 1]) || 0;
    }
    var clean = Q.normalizeEntry(publicEntry);
    if (!clean) { return null; }
    var ix = -1;
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === clean.id) { ix = i; break; }
    }
    if (ix === -1) { state.entries.push(clean); } else { state.entries[ix] = clean; }
    if (pos && typeof pos.ahead === 'number') {
      posCache[clean.id] = { ahead: pos.ahead, est: pos.estMinutes || 0 };
    }
    persist();
    if (myIds.indexOf(clean.id) === -1) { myIds.unshift(clean.id); saveMine(); }
    return clean;
  }

  function submitViaServer(input) {
    var els = formEls();
    API.book(input).then(function (data) {
      submitting = false;
      els.submit.disabled = false;
      els.submit.textContent = I.t('btn_get_token', lang);
      var saved = mergeServerEntry(data.entry, data);
      if (!saved) { return; }
      selectedSlot = null;
      els.form.reset();
      els.date.value = U.todayISO();
      populateServices(true);
      showConfirmation(saved);
      renderAll();
      U.toast(I.t('msg_CREATED', lang, { token: saved.token }), 'success');
    }).catch(function (err) {
      submitting = false;
      els.submit.disabled = false;
      els.submit.textContent = I.t('btn_get_token', lang);
      if (err && err.code === 'VALIDATION_FAILED' && err.fields && err.fields.length) {
        showErrors(err.fields.map(function (f) { return { field: f.field, code: f.code }; }));
      } else if (err) {
        U.toast((err && err.message) || 'Request failed.', 'danger');
      }
    });
  }

  function bindForm() {
    var els = formEls();

    els.office.addEventListener('change', function () {
      populateServices(false);
      selectedSlot = null;
      renderSlots();
      clearErrors();
    });
    els.service.addEventListener('change', clearErrors);
    els.date.addEventListener('change', function () {
      selectedSlot = null;
      renderSlots();
      clearErrors();
    });
    els.name.addEventListener('input', clearErrors);

    var radios = document.querySelectorAll('input[name="channel"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', function () {
        selectedSlot = null;
        renderSlots();
        clearErrors();
      });
    }

    els.slots.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-slot]');
      if (!btn || btn.disabled) { return; }
      selectedSlot = btn.getAttribute('data-slot');
      var all = els.slots.querySelectorAll('[data-slot]');
      for (var j = 0; j < all.length; j++) {
        all[j].setAttribute('aria-pressed', all[j].getAttribute('data-slot') === selectedSlot ? 'true' : 'false');
      }
      U.byId('err-time').classList.add('hide');
    });

    U.byId('clear-btn').addEventListener('click', function () {
      els.form.reset();
      els.date.value = U.todayISO();
      selectedSlot = null;
      clearErrors();
      populateServices(true);
      renderSlots();
    });

    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) { return; } // duplicate-submission guard
      clearErrors();
      var isWalkin = channel() === 'walkin';
      if (!isWalkin && !selectedSlot) {
        showErrors([{ field: 'time', code: 'TIME_INVALID', message: '' }]);
        return;
      }
      submitting = true;
      els.submit.disabled = true;
      els.submit.textContent = I.t('btn_sending', lang);
      window.setTimeout(function () {
        var input = {
          officeId: els.office.value,
          serviceId: els.service.value,
          channel: isWalkin ? 'walkin' : 'appointment',
          date: isWalkin ? U.todayISO() : els.date.value,
          time: selectedSlot,
          name: els.name.value,
          note: els.note.value
        };
        if (serverMode) {
          submitViaServer(input); // submitting flag cleared by its handlers
          return;
        }
        var res = Q.createBooking(state, input, new Date());
        submitting = false;
        els.submit.disabled = false;
        els.submit.textContent = I.t('btn_get_token', lang);
        if (!res.ok) {
          showErrors(res.errors);
          return;
        }
        persist();
        if (myIds.indexOf(res.entry.id) === -1) { myIds.unshift(res.entry.id); saveMine(); }
        selectedSlot = null;
        els.form.reset();
        els.date.value = U.todayISO();
        populateServices(true);
        showConfirmation(res.entry);
        renderAll();
        U.toast(I.t('msg_CREATED', lang, { token: res.entry.token }), 'success');
      }, 30);
    });
  }

  /* -------------------------------------------------------------- rendering */

  function renderStats() {
    var s;
    if (serverMode && serverToday) {
      s = serverToday;
    } else {
      var today = U.todayISO();
      var todays = state.entries.filter(function (e) { return e.date === today; });
      s = Q.summarize(todays);
    }
    U.byId('stat-waiting').textContent = s.Waiting;
    U.byId('stat-serving').textContent = s.Serving;
    U.byId('stat-completed').textContent = s.Completed;
    U.byId('stat-total').textContent = s.total;
  }

  function renderOffices() {
    var today = U.todayISO();
    var grid = U.byId('office-grid');
    grid.innerHTML = CFG.OFFICES.map(function (o) {
      var waiting = state.entries.filter(function (e) {
        return e.officeId === o.id && e.date === today && e.status === 'Waiting';
      }).length;
      var open = Q.isOfficeOpenOn(o, today);
      var n = Q.servicesForOffice(o.id).length;
      return '<article class="card card-tight">' +
        '<div class="row-between"><span style="font-size:2rem" aria-hidden="true">' + U.esc(o.emoji) + '</span>' +
        (open
          ? '<span class="badge badge-Completed">' + U.esc(I.t('open_today', lang)) + '</span>'
          : '<span class="badge badge-Cancelled">' + U.esc(I.t('closed_today', lang)) + '</span>') +
        '</div>' +
        '<h3 style="margin-top:8px">' + U.esc(U.officeName(o, lang)) + '</h3>' +
        '<p class="muted"><small>' + U.esc(o.blurb[lang] || o.blurb.en) + '</small></p>' +
        '<div class="queue-meta"><span>' + U.esc(I.t('office_services_n', lang, { n: n })) + '</span>' +
        '<span>' + U.esc(I.t('office_waiting_n', lang, { n: waiting })) + '</span>' +
        '<span>' + U.esc(I.t('avg_label_short', lang, { m: U.avgMinutes(o, state.settings) })) + '</span></div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-office="' + U.esc(o.id) + '">' + U.esc(I.t('btn_use_office', lang)) + '</button>' +
        '</div></article>';
    }).join('');
  }

  function renderMine() {
    var list = U.byId('mine-list');
    var entries = myIds
      .map(function (id) { return Q.findEntry(state, id); })
      .filter(Boolean)
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!entries.length) {
      list.innerHTML = '<div class="empty"><span class="empty-icon" aria-hidden="true">🎟️</span>' +
        '<h3>' + U.esc(I.t('empty_tokens_title', lang)) + '</h3>' +
        '<p>' + U.esc(I.t('empty_tokens_body', lang)) + '</p>' +
        '<a class="btn btn-primary btn-sm" href="#book">' + U.esc(I.t('btn_go_book', lang)) + '</a></div>';
      return;
    }
    list.innerHTML = entries.map(function (e) { return entryCard(e, { remove: true }); }).join('');
  }

  function renderAll() {
    renderStats();
    renderOffices();
    renderSlots();
    renderMine();
  }

  /* ------------------------------------------------------------- interactions */

  function bindOfficeGrid() {
    U.byId('office-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-office]');
      if (!btn) { return; }
      formEls().office.value = btn.getAttribute('data-office');
      populateServices(false);
      selectedSlot = null;
      clearErrors();
      renderSlots();
      document.getElementById('book').scrollIntoView({ behavior: 'smooth' });
      try { formEls().service.focus(); } catch (err) { /* ignore */ }
    });
  }

  function bindMineActions() {
    U.byId('mine-list').addEventListener('click', function (e) {
      var cancelBtn = e.target.closest('[data-cancel]');
      var removeBtn = e.target.closest('[data-remove]');
      if (cancelBtn) {
        var id = cancelBtn.getAttribute('data-cancel');
        var entry = Q.findEntry(state, id);
        if (!entry) { return; }
        U.confirmDialog({
          title: I.t('btn_cancel_booking', lang),
          body: I.t('confirm_cancel_own', lang, { token: entry.token }),
          confirmLabel: I.t('act_cancel', lang) || 'Cancel',
          cancelLabel: I.t('btn_keep', lang)
        }).then(function (yes) {
          if (!yes) { return; }
          if (serverMode) {
            API.cancelBooking(entry.reference, entry.reference).then(function (data) {
              mergeServerEntry(data.entry, null);
              renderAll();
              U.toast(I.t('msg_UPDATED', lang, { token: data.entry.token, status: I.statusName(data.entry.status, lang) }), 'success');
            }).catch(function (err) {
              U.toast((err && err.message) || 'Request failed.', 'danger');
            });
            return;
          }
          var res = Q.setStatus(state, id, 'Cancelled', new Date());
          if (!res.ok) {
            U.toast(I.t('err_' + res.code, lang, { token: entry.token, from: '', to: '' }) || res.message, 'danger');
            return;
          }
          persist();
          renderAll();
          U.toast(I.t('msg_UPDATED', lang, { token: res.entry.token, status: I.statusName(res.entry.status, lang) }), 'success');
        });
        return;
      }
      if (removeBtn) {
        var rid = removeBtn.getAttribute('data-remove');
        myIds = myIds.filter(function (x) { return x !== rid; });
        saveMine();
        renderMine();
        U.toast(I.t('msg_REMOVED', lang), 'success');
      }
    });
  }

  function renderTrackEntry(entry) {
    var box = U.byId('track-result');
    var saved = myIds.indexOf(entry.id) !== -1;
    box.innerHTML = entryCard(entry, { cancel: true, remove: false }) +
      (saved ? '' : '<div class="row" style="margin-top:10px"><button type="button" class="btn btn-secondary btn-sm" id="track-save" data-save="' + U.esc(entry.id) + '">' + U.esc(I.t('btn_save_token', lang)) + '</button></div>');
    var saveBtn = U.byId('track-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (myIds.indexOf(entry.id) === -1) { myIds.unshift(entry.id); }
        saveMine();
        renderMine();
        saveBtn.disabled = true;
        saveBtn.textContent = I.t('btn_saved_token', lang);
      });
    }
  }

  function trackNotFound(q) {
    U.byId('track-result').innerHTML = '<div class="notice notice-warn">' + U.esc(I.t('track_not_found', lang, { q: q })) + '</div>';
  }

  function bindTrack() {
    U.byId('track-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = U.byId('track-input').value.trim();
      var box = U.byId('track-result');
      if (!q) { box.innerHTML = ''; return; }
      if (serverMode) {
        API.lookup(q).then(function (data) {
          var saved = mergeServerEntry(data.entry, data);
          renderTrackEntry(saved || data.entry);
        }).catch(function () {
          var entry = Q.findReference(state, q);
          if (entry) { renderTrackEntry(entry); } else { trackNotFound(q); }
        });
        return;
      }
      var entry = Q.findReference(state, q);
      if (!entry) {
        trackNotFound(q);
        return;
      }
      renderTrackEntry(entry);
    });
  }

  /* ------------------------------------------------------------------- boot */

  function init() {
    adapter = S.createAdapter();
    var loaded = S.load(adapter, new Date());
    state = loaded.state;
    state.settings = state.settings || {};
    lang = I.isLang(state.settings.lang || I.getStoredLang());
    I.setStoredLang(lang);
    state.settings.lang = lang;
    loadMine();
    bindLang();
    I.applyStatic(lang);
    I.applyTitle('doc_title_citizen', lang);
    U.setLangButtons(lang);
    window.addEventListener('afterprint', function () {
      document.body.classList.remove('print-slip');
    });
    syncDateHint();
    syncFormDefaults();
    bindForm();
    bindOfficeGrid();
    bindMineActions();
    bindTrack();
    if (Q.promoteDue(state, U.todayISO(), new Date()) > 0) { persist(); }
    renderAll();
    showModeBadge();
    API.detect().then(function (m) {
      serverMode = (m !== 'local');
      showModeBadge();
      if (serverMode) {
        if (m === 'server') {
          refreshFromServer();
          subscribeSSE();
        } else {
          state.entries = [];
          renderAll();
          U.toast('Queue server unavailable. Retrying is required; local data is not authoritative.', 'danger');
        }
      }
    });
  }

  function refreshFromServer() {
    if (!serverMode) { return Promise.resolve(); }
    if (refreshInFlight) {
      refreshAgain = true;
      return Promise.resolve();
    }
    refreshInFlight = true;
    var refs = myIds.map(function (id) {
      var entry = Q.findEntry(state, id);
      return entry && entry.reference;
    }).filter(Boolean).slice(0, 50);
    return Promise.all([
      API.get('/api/stats?date=' + U.todayISO()),
      Promise.all(refs.map(function (ref) {
        return API.lookup(ref).catch(function () { return null; });
      }))
    ]).then(function (results) {
      var stats = results[0];
      if (stats && stats.summary) { serverToday = stats.summary; }
      results[1].forEach(function (data) {
        if (data && data.entry) { mergeServerEntry(data.entry, data); }
      });
      renderAll();
    }).catch(function () {
      // Keep the last server-confirmed state and let EventSource reconnect.
    }).then(function () {
      refreshInFlight = false;
      if (refreshAgain) {
        refreshAgain = false;
        refreshFromServer();
      }
    });
  }

  function scheduleServerRefresh(event) {
    var version = event && Number(event.version);
    if (version && version <= lastEventVersion) { return; }
    if (version) { lastEventVersion = version; }
    if (eventTimer) { window.clearTimeout(eventTimer); }
    eventTimer = window.setTimeout(function () {
      eventTimer = null;
      refreshFromServer();
    }, 100);
  }

  function subscribeSSE() {
    try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
    sseHandle = null;
    if (!serverMode) { return; }
    sseHandle = API.subscribeEvents(scheduleServerRefresh);
    window.addEventListener('pagehide', function () {
      if (eventTimer) { window.clearTimeout(eventTimer); }
      try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
