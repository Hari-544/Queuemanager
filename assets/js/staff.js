/* QueueManager - staff demonstration dashboard. */
(function () {
  'use strict';

  var CFG = window.QE_CONFIG;
  var Q = window.QEQueue;
  var S = window.QEStore;
  var I = window.QEI18N;
  var U = window.QEUI;
  var API = window.QEAPI;

  var adapter = null;
  var state = null;
  var lang = 'en';
  var filters = { officeId: 'all', serviceId: 'all', status: 'all', channel: 'all', date: '', q: '' };
  var searchTimer = null;
  var serverMode = false;
  var serverSummary = null;
  var session = null;
  var sseHandle = null;
  var queueTimer = null;

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

  function roleName(r) {
    return r === 'admin' ? I.t('role_admin', lang) : I.t('role_staff', lang);
  }

  var ACTION_LABEL = { Serving: 'act_start', Completed: 'act_complete', Cancelled: 'act_cancel', 'No-show': 'act_noshow', Waiting: 'act_reopen' };
  var ACTION_CLASS = { Serving: 'btn-primary', Completed: 'btn-teal', Cancelled: 'btn-ghost', 'No-show': 'btn-ghost', Waiting: 'btn-secondary' };

  /* ------------------------------------------------------------ persistence */

  function persist() {
    if (serverMode) {
      // The server is the store in server mode; keep local settings only.
      try {
        var raw = adapter.get(adapter.key);
        var cached = raw ? JSON.parse(raw) : {};
        cached.settings = state.settings;
        adapter.set(adapter.key, JSON.stringify(cached));
      } catch (e) { /* ignore */ }
      return;
    }
    S.save(adapter, state, new Date());
  }

  function mergeServerEntry(entry) {
    var clean = Q.normalizeEntry(entry);
    if (!clean) { return null; }
    var ix = -1;
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === clean.id) { ix = i; break; }
    }
    if (ix === -1) { state.entries.push(clean); } else { state.entries[ix] = clean; }
    return clean;
  }

  function apiErrorToast(err) {
    if (!err) { return; }
    if (err.status === 401) {
      session = null;
      renderAuth();
      renderAll();
      U.toast(I.t('auth_required', lang), 'danger');
    } else if (err.status === 403) {
      U.toast(I.t('msg_forbidden', lang), 'danger');
    } else {
      U.toast((err && err.message) || 'Request failed.', 'danger');
    }
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
    I.applyTitle('doc_title_staff', lang);
    U.setLangButtons(lang);
    showModeBadge();
    renderAuth();
    syncFilterOptions(true);
    syncCallOffice();
    syncWalkinServices();
    renderAll();
  }

  function bindLang() {
    var btns = document.querySelectorAll('[data-lang-btn]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang-btn')); });
    }
  }

  /* ------------------------------------------------------------------ messages */

  function resultText(res) {
    switch (res.code) {
      case 'CALLED':
        return I.t('msg_CALLED', lang, { token: res.entry.token });
      case 'UPDATED':
        return I.t('msg_UPDATED', lang, { token: res.entry.token, status: I.statusName(res.entry.status, lang) });
      case 'ALREADY_SERVING':
        if (res.conflict) {
          return I.t('err_ALREADY_SERVING', lang, { token: res.conflict.token });
        }
        return res.message || I.t('err_ALREADY_SERVING', lang, { token: '' });
      case 'QUEUE_EMPTY':
        return I.t('err_QUEUE_EMPTY', lang);
      case 'NO_CHANGE':
        return I.t('err_NO_CHANGE', lang, {
          token: res.entry ? res.entry.token : '',
          status: res.entry ? I.statusName(res.entry.status, lang) : ''
        });
      case 'TRANSITION_INVALID':
        return I.t('err_TRANSITION_INVALID', lang, {
          from: I.statusName(res.from, lang),
          to: I.statusName(res.to, lang)
        });
      case 'NOT_FOUND':
        return I.t('err_NOT_FOUND', lang);
      default:
        return res.message || res.code;
    }
  }

  function flashResult(elId, text, kind) {
    var box = U.byId(elId);
    if (!box) { return; }
    box.innerHTML = '<div class="notice ' + (kind === 'ok' ? 'notice-success' : 'notice-danger') + '">' + U.esc(text) + '</div>';
  }

  /* ------------------------------------------------------------------ selects */

  function optionAll() {
    return '<option value="all">' + U.esc(I.t('opt_all', lang)) + '</option>';
  }

  function syncCallOffice() {
    var sel = U.byId('call-office');
    var prev = sel.value;
    sel.innerHTML = CFG.OFFICES.map(function (o) {
      return '<option value="' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</option>';
    }).join('');
    if (prev && Q.getOffice(prev)) { sel.value = prev; }
  }

  function syncFilterOptions(keep) {
    var fo = U.byId('flt-office');
    var prevO = keep ? fo.value : filters.officeId;
    fo.innerHTML = optionAll() + CFG.OFFICES.map(function (o) {
      return '<option value="' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</option>';
    }).join('');
    if (prevO && (prevO === 'all' || Q.getOffice(prevO))) { fo.value = prevO; }
    filters.officeId = fo.value;

    var fs = U.byId('flt-service');
    var prevS = keep ? fs.value : filters.serviceId;
    var list = filters.officeId === 'all'
      ? CFG.SERVICES.slice()
      : CFG.SERVICES.filter(function (s) { return s.officeId === filters.officeId; });
    fs.innerHTML = optionAll() + list.map(function (s) {
      return '<option value="' + U.esc(s.id) + '">' + U.esc(U.serviceName(s, lang)) + '</option>';
    }).join('');
    var stillThere = prevS === 'all' || list.some(function (s) { return s.id === prevS; });
    fs.value = stillThere ? prevS : 'all';
    filters.serviceId = fs.value;

    var fst = U.byId('flt-status');
    var prevSt = keep ? fst.value : filters.status;
    var activeStatuses = ['Booked', 'Waiting', 'Serving'];
    fst.innerHTML = optionAll() + activeStatuses.map(function (s) {
      return '<option value="' + U.esc(s) + '">' + U.esc(I.statusName(s, lang)) + '</option>';
    }).join('');
    fst.value = prevSt || 'all';
    filters.status = fst.value;

    var fc = U.byId('flt-channel');
    fc.innerHTML = optionAll() +
      '<option value="appointment">' + U.esc(I.t('appt_badge', lang)) + '</option>' +
      '<option value="walkin">' + U.esc(I.t('walkin_badge', lang)) + '</option>';
    fc.value = filters.channel || 'all';
  }

  function syncWalkinServices() {
    var office = Q.getOffice(U.byId('w-office').value) || CFG.OFFICES[0];
    var sel = U.byId('w-service');
    var prev = sel.value;
    var list = Q.servicesForOffice(office.id);
    sel.innerHTML = list.map(function (s) {
      return '<option value="' + U.esc(s.id) + '">' + U.esc(U.serviceName(s, lang)) + '</option>';
    }).join('');
    if (prev && list.some(function (s) { return s.id === prev; })) { sel.value = prev; }
  }

  function syncWalkinOffice() {
    var sel = U.byId('w-office');
    sel.innerHTML = CFG.OFFICES.map(function (o) {
      return '<option value="' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</option>';
    }).join('');
  }

  /* ---------------------------------------------------------------- rendering */

  function renderSummary() {
    var s = (serverMode && serverSummary) ? serverSummary : Q.summarize(state.entries);
    var cards = [
      ['Booked', s.Booked || 0, '', 'st_Booked'],
      ['Waiting', s.Waiting || 0, 'is-waiting', 'stat_waiting'],
      ['Serving', s.Serving || 0, 'is-serving', 'stat_serving'],
      ['Completed', s.Completed || 0, 'is-completed', 'stat_completed'],
      ['Cancelled', s.Cancelled || 0, 'is-cancelled', 'stat_cancelled'],
      ['No-show', s['No-show'] || 0, 'is-noshow', 'stat_noshow'],
      ['__total__', s.total || 0, '', 'stat_all_records']
    ];
    U.byId('summary-cards').innerHTML = cards.map(function (c) {
      return '<div class="stat ' + c[2] + '" role="listitem"><span class="stat-value" data-count="' + c[0] + '">' + c[1] + '</span>' +
        '<span class="stat-label">' + U.esc(I.t(c[3], lang)) + '</span></div>';
    }).join('');
  }

  function filteredEntries() {
    var entries = Q.filterEntries(state.entries, {
      officeId: filters.officeId,
      serviceId: filters.serviceId,
      status: filters.status,
      channel: filters.channel,
      date: filters.date || undefined,
      token: filters.q
    });
    if (filters.status === 'all') {
      entries = entries.filter(function (entry) { return ['Booked', 'Waiting', 'Serving'].indexOf(entry.status) !== -1; });
    }
    return Q.sortForDisplay(entries);
  }

  function estimateLine(entry) {
    if (entry.status !== 'Waiting') { return ''; }
    var office = Q.getOffice(entry.officeId);
    var ahead = Q.peopleAhead(state, entry);
    var mins = ahead * U.avgMinutes(office, state.settings);
    var txt = I.t('ahead_n', lang, { n: ahead }) + ' · ' +
      (mins === 0 ? I.t('est_zero', lang) : I.t('est_n', lang, { m: mins }));
    return '<span title="' + U.esc(I.t('est_disclaimer', lang)) + '">' + U.esc(txt) + '</span>';
  }

  function actionButtons(entry) {
    var allowed = CFG.TRANSITIONS[entry.status] || [];
    var order = ['Serving', 'Completed', 'Cancelled', 'No-show', 'Waiting'];
    var buttons = order.filter(function (s) { return allowed.indexOf(s) !== -1; }).map(function (s) {
      return '<button type="button" class="btn btn-sm ' + ACTION_CLASS[s] + '" data-act="' + U.esc(s) + '" data-id="' + U.esc(entry.id) + '">' +
        U.esc(I.t(ACTION_LABEL[s], lang)) + '</button>';
    }).join('');
    return buttons;
  }

  function renderList() {
    var list = U.byId('queue-list');
    if (serverMode && !session) {
      U.byId('showing-line').textContent = '';
      list.innerHTML = '<div class="empty"><span class="empty-icon" aria-hidden="true">🔐</span>' +
        '<h3>' + U.esc(I.t('auth_title', lang)) + '</h3>' +
        '<p>' + U.esc(I.t('auth_required', lang)) + '</p></div>';
      return;
    }
    var rows = filteredEntries();
    U.byId('showing-line').textContent = I.t('showing_n', lang, { a: rows.length, b: state.entries.length });
    if (!rows.length) {
      var empty = '<div class="empty"><span class="empty-icon" aria-hidden="true">📭</span>' +
        '<h3>' + U.esc(I.t('empty_staff_title', lang)) + '</h3>' +
        '<p>' + U.esc(I.t('empty_staff_body', lang)) + '</p>';
      if (!state.entries.length) {
        empty += '<button type="button" class="btn btn-primary btn-sm" id="empty-load-demo">' + U.esc(I.t('btn_load_demo', lang)) + '</button>';
      }
      list.innerHTML = empty + '</div>';
      var btn = U.byId('empty-load-demo');
      if (btn) { btn.addEventListener('click', loadDemoData); }
      return;
    }
    list.innerHTML = rows.map(function (e) {
      var office = Q.getOffice(e.officeId);
      var service = Q.getService(e.serviceId);
      return '<article class="queue-item' + (e.status === 'Serving' ? ' is-serving' : '') + '" data-entry="' + U.esc(e.id) + '">' +
        '<div class="queue-item-head"><div class="queue-item-title">' +
        '<span class="mono">#' + U.esc(e.token) + '</span> · ' + U.esc(e.name) +
        '</div><div class="row">' + U.statusBadge(e.status, lang) +
        (e.demo ? '<span class="badge badge-neutral">' + U.esc(I.t('demo_badge', lang)) + '</span>' : '') +
        '</div></div>' +
        '<div class="queue-meta">' +
        '<span>' + U.esc(U.officeName(office, lang)) + '</span>' +
        '<span>' + U.esc(U.serviceName(service, lang)) + '</span>' +
        '<span>' + U.esc(I.fmtDateShort(e.date, lang)) + ' · ' + U.esc(Q.to12h(e.time)) + '</span>' +
        '<span>' + U.esc(e.channel === 'walkin' ? I.t('walkin_badge', lang) : I.t('appt_badge', lang)) + '</span>' +
        '<span class="mono">' + U.esc(e.reference) + '</span>' +
        '</div>' +
        (e.status === 'Waiting' ? '<div class="queue-meta">' + estimateLine(e) + '</div>' : '') +
        '<div class="row-actions">' + actionButtons(e) + '</div>' +
        '</article>';
    }).join('');
  }

  function renderSettings() {
    U.byId('avg-fields').innerHTML = CFG.OFFICES.map(function (o) {
      var v = U.avgMinutes(o, state.settings);
      return '<div class="field"><label for="avg-' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</label>' +
        '<input type="number" id="avg-' + U.esc(o.id) + '" min="1" max="60" step="1" value="' + v + '"></div>';
    }).join('');
  }

  function renderAll() {
    renderSummary();
    renderList();
  }

  /* ------------------------------------------------------ server refresh */

  function refreshQueueFromServer() {
    if (!serverMode || !session) { renderAll(); return; }
    API.queue({
      officeId: filters.officeId,
      serviceId: filters.serviceId,
      status: filters.status,
      channel: filters.channel,
      date: filters.date || undefined,
      q: filters.q || undefined,
      limit: 500
    }).then(function (data) {
      serverSummary = data.summary;
      state.entries = Q.sanitizeState({ entries: data.entries }).entries;
      renderAll();
    }).catch(apiErrorToast);
  }

  function subscribeSSE() {
    try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
    sseHandle = null;
    if (!serverMode || !session) { return; }
    sseHandle = API.subscribeEvents(function () {
      window.clearTimeout(queueTimer);
      queueTimer = window.setTimeout(refreshQueueFromServer, 600);
    });
  }

  /* ------------------------------------------------------------------ actions */

  function bindListActions() {
    U.byId('queue-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) { return; }
      if (serverMode) {
        API.setStatus(btn.getAttribute('data-id'), btn.getAttribute('data-act')).then(function (data) {
          mergeServerEntry(data.entry);
          refreshQueueFromServer();
          U.toast(resultText({ ok: true, code: 'UPDATED', entry: data.entry }), 'success');
        }).catch(apiErrorToast);
        return;
      }
      var res = Q.setStatus(state, btn.getAttribute('data-id'), btn.getAttribute('data-act'), new Date());
      if (!res.ok) {
        U.toast(resultText(res), 'danger');
        return;
      }
      persist();
      renderAll();
      U.toast(resultText(res), 'success');
    });
  }

  function bindCallNext() {
    U.byId('call-btn').addEventListener('click', function () {
      var officeId = U.byId('call-office').value;
      var date = U.byId('call-date').value || U.todayISO();
      if (serverMode) {
        if (!session) { U.toast(I.t('auth_required', lang), 'danger'); return; }
        API.callNext(officeId, date).then(function (data) {
          mergeServerEntry(data.entry);
          refreshQueueFromServer();
          flashResult('call-result', resultText({ ok: true, code: 'CALLED', entry: data.entry }), 'ok');
          U.toast(resultText({ ok: true, code: 'CALLED', entry: data.entry }), 'success');
        }).catch(function (err) {
          if (err && (err.code === 'ALREADY_SERVING' || err.code === 'QUEUE_EMPTY')) {
            flashResult('call-result', resultText(err), 'err');
          }
          apiErrorToast(err);
        });
        return;
      }
      var res = Q.callNext(state, officeId, date, new Date());
      if (!res.ok) {
        flashResult('call-result', resultText(res), 'err');
        U.toast(resultText(res), 'danger');
        return;
      }
      persist();
      renderAll();
      flashResult('call-result', resultText(res), 'ok');
      U.toast(resultText(res), 'success');
    });
  }

  function refilter() {
    // Server mode filters server-side (fresh fetch); local mode filters in memory.
    if (serverMode && session) { refreshQueueFromServer(); } else { renderList(); }
  }

  function bindFilters() {
    U.byId('flt-office').addEventListener('change', function () {
      filters.officeId = this.value;
      syncFilterOptions(true);
      refilter();
    });
    U.byId('flt-service').addEventListener('change', function () { filters.serviceId = this.value; refilter(); });
    U.byId('flt-status').addEventListener('change', function () { filters.status = this.value; refilter(); });
    U.byId('flt-channel').addEventListener('change', function () { filters.channel = this.value; refilter(); });
    U.byId('flt-date').addEventListener('change', function () { filters.date = this.value; refilter(); });
    U.byId('flt-search').addEventListener('input', function () {
      var v = this.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { filters.q = v; refilter(); }, 200);
    });
    U.byId('flt-clear').addEventListener('click', function () {
      filters = { officeId: 'all', serviceId: 'all', status: 'all', channel: 'all', date: U.todayISO(), q: '' };
      U.byId('flt-date').value = filters.date;
      U.byId('flt-search').value = '';
      syncFilterOptions(false);
      refilter();
    });
  }

  function walkinErrorList(box, errors) {
    var items = errors.map(function (er) {
      return '<li>' + U.esc(I.t('err_' + er.code, lang, { days: CFG.RULES.bookingHorizonDays, max: CFG.RULES.maxActivePerPersonPerDay, token: '' })) + '</li>';
    }).join('');
    box.innerHTML = '<strong>' + U.esc(I.t('form_error_title', lang)) + '</strong><ul>' + items + '</ul>';
    box.classList.add('is-visible');
    try { box.focus(); } catch (err) { /* ignore */ }
  }

  function bindWalkin() {
    U.byId('w-office').addEventListener('change', syncWalkinServices);
    U.byId('walkin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var box = U.byId('walkin-errors');
      box.classList.remove('is-visible');
      box.innerHTML = '';
      var payload = {
        officeId: U.byId('w-office').value,
        serviceId: U.byId('w-service').value,
        name: U.byId('w-name').value
      };
      if (serverMode) {
        if (!session) { U.toast(I.t('auth_required', lang), 'danger'); return; }
        API.walkin(payload).then(function (data) {
          mergeServerEntry(data.entry);
          U.byId('w-name').value = '';
          refreshQueueFromServer();
          flashResult('walkin-result', I.t('msg_CREATED', lang, { token: data.entry.token }), 'ok');
          U.toast(I.t('msg_CREATED', lang, { token: data.entry.token }), 'success');
        }).catch(function (err) {
          if (err && err.code === 'VALIDATION_FAILED' && err.fields) { walkinErrorList(box, err.fields); }
          else { apiErrorToast(err); }
        });
        return;
      }
      var res = Q.createBooking(state, {
        officeId: payload.officeId,
        serviceId: payload.serviceId,
        channel: 'walkin',
        date: U.todayISO(),
        time: null,
        name: payload.name,
        note: ''
      }, new Date());
      if (!res.ok) {
        walkinErrorList(box, res.errors);
        return;
      }
      persist();
      U.byId('w-name').value = '';
      renderAll();
      flashResult('walkin-result', I.t('msg_CREATED', lang, { token: res.entry.token }), 'ok');
      U.toast(I.t('msg_CREATED', lang, { token: res.entry.token }), 'success');
    });
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function downloadHref(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    if (filename) { a.setAttribute('download', filename); }
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () { document.body.removeChild(a); }, 100);
  }

  function bindExport() {
    U.byId('export-csv').addEventListener('click', function () {
      if (serverMode) {
        if (!session) { U.toast(I.t('auth_required', lang), 'danger'); return; }
        downloadHref(API.csvUrl(), 'queueease-export.csv');
        U.toast(I.t('msg_EXPORTED', lang, { file: 'CSV', n: state.entries.length }), 'success');
        return;
      }
      var rowsCsv = Q.sortForDisplay(Q.filterEntries(state.entries, {
        officeId: filters.officeId, serviceId: filters.serviceId, status: filters.status,
        channel: filters.channel, date: filters.date || undefined, token: filters.q
      }));
      U.download('queuemanager' + stamp() + '.csv', Q.toCSV(rowsCsv), 'text/csv;charset=utf-8');
      U.toast(I.t('msg_EXPORTED', lang, { file: 'CSV', n: rowsCsv.length }), 'success');
    });
    U.byId('export-json').addEventListener('click', function () {
      if (serverMode) {
        if (!session) { U.toast(I.t('auth_required', lang), 'danger'); return; }
        downloadHref(API.jsonUrl(), 'queueease-export.json');
        U.toast(I.t('msg_EXPORTED', lang, { file: 'JSON', n: state.entries.length }), 'success');
        return;
      }
      var rows = Q.sortForDisplay(Q.filterEntries(state.entries, {
        officeId: filters.officeId, serviceId: filters.serviceId, status: filters.status,
        channel: filters.channel, date: filters.date || undefined, token: filters.q
      }));
      var payload = {
        app: 'QueueManager prototype',
        exportedAt: new Date().toISOString(),
        filters: filters,
        entries: rows
      };
      U.download('queuemanager' + stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      U.toast(I.t('msg_EXPORTED', lang, { file: 'JSON', n: rows.length }), 'success');
    });
  }

  function bindReset() {
    U.byId('reset-btn').addEventListener('click', function () {
      U.confirmDialog({
        title: I.t('reset_title', lang),
        body: I.t('reset_body', lang),
        requireText: 'RESET',
        requireLabel: I.t('reset_type', lang),
        confirmLabel: I.t('reset_confirm', lang),
        cancelLabel: I.t('btn_keep', lang)
      }).then(function (yes) {
        if (!yes) { return; }
        var reseed = U.byId('reset-reseed').checked;
        if (serverMode) {
          if (!session) { U.toast(I.t('auth_required', lang), 'danger'); return; }
          API.adminReset(reseed).then(function () {
            refreshQueueFromServer();
            U.toast(I.t('msg_RESET_DONE', lang), 'warn');
          }).catch(apiErrorToast);
          return;
        }
        state = S.reset(adapter, new Date(), reseed);
        state.settings = state.settings || {};
        state.settings.lang = lang;
        persist();
        renderAll();
        U.toast(I.t('msg_RESET_DONE', lang), 'warn');
      });
    });
  }

  function bindSettings() {
    U.byId('settings-save').addEventListener('click', function () {
      state.settings = state.settings || {};
      state.settings.avgOverrides = state.settings.avgOverrides || {};
      var changed = false;
      CFG.OFFICES.forEach(function (o) {
        var input = U.byId('avg-' + o.id);
        if (!input) { return; }
        var v = Math.round(Number(input.value));
        if (isFinite(v) && v >= 1 && v <= 60) {
          if (v !== o.avgServiceMinutes) { state.settings.avgOverrides[o.id] = v; }
          else { delete state.settings.avgOverrides[o.id]; }
          changed = true;
        }
      });
      if (changed) { persist(); }
      renderAll();
      U.toast(I.t('msg_SETTINGS_SAVED', lang), 'success');
    });
  }

  /* ------------------------------------------------------- auth + admin */

  function renderAuth() {
    var show = serverMode;
    U.byId('auth-section').classList.toggle('hide', !show);
    if (!show) {
      U.byId('admin-section').classList.add('hide');
      return;
    }
    U.byId('auth-signed-out').classList.toggle('hide', !!session);
    U.byId('auth-signed-in').classList.toggle('hide', !session);
    if (session) {
      U.byId('auth-status').textContent = I.t('auth_signed_in', lang, { user: session.username, role: roleName(session.role) });
    }
    var isAdmin = !!(session && session.role === 'admin');
    U.byId('admin-section').classList.toggle('hide', !isAdmin);
    if (isAdmin) { loadAdmin(); }
  }

  function fmtDateTime(at) {
    try { return new Date(at).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN'); }
    catch (e) { return new Date(at).toLocaleString(); }
  }

  function loadAdmin() {
    API.listUsers().then(function (data) {
      U.byId('admin-users').innerHTML = (data.users || []).map(function (u) {
        var toggle = u.active
          ? '<button type="button" class="btn btn-ghost btn-sm" data-admin-toggle="' + U.esc(u.id) + '" data-active="0">' + U.esc(I.t('admin_deactivate', lang)) + '</button>'
          : '<button type="button" class="btn btn-secondary btn-sm" data-admin-toggle="' + U.esc(u.id) + '" data-active="1">' + U.esc(I.t('admin_activate', lang)) + '</button>';
        return '<tr><td><b>' + U.esc(u.username) + '</b></td><td>' + U.esc(roleName(u.role)) + '</td>' +
          '<td class="nowrap">' + U.esc(I.fmtDateShort(new Date(u.created_at).toISOString().slice(0, 10), lang)) + '</td>' +
          '<td><span class="badge badge-neutral">' + U.esc(I.t(u.active ? 'user_active' : 'user_inactive', lang)) + '</span></td>' +
          '<td>' + toggle + '</td></tr>';
      }).join('');
    }).catch(apiErrorToast);
    API.audit(50).then(function (data) {
      var rows = data.audit || [];
      U.byId('admin-audit').innerHTML = rows.length ? rows.map(function (a) {
        return '<tr><td class="nowrap">' + U.esc(fmtDateTime(a.at)) + '</td>' +
          '<td>' + U.esc(a.actor) + '</td><td>' + U.esc(a.action) + '</td>' +
          '<td>' + U.esc((a.entry_id || '') + (a.detail ? ' ' + a.detail : '')) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted">—</td></tr>';
    }).catch(apiErrorToast);
  }

  function bindAuth() {
    U.byId('auth-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var box = U.byId('auth-error');
      box.classList.remove('is-visible');
      box.innerHTML = '';
      var btn = U.byId('auth-btn');
      btn.disabled = true;
      btn.textContent = I.t('auth_signing', lang);
      API.login(U.byId('auth-user').value.trim(), U.byId('auth-pass').value).then(function (data) {
        btn.disabled = false;
        btn.textContent = I.t('auth_btn', lang);
        U.byId('auth-pass').value = '';
        session = data.user;
        renderAuth();
        refreshQueueFromServer();
        subscribeSSE();
        U.toast(I.t('msg_login', lang, { user: session.username }), 'success');
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = I.t('auth_btn', lang);
        box.innerHTML = U.esc(I.t('auth_bad', lang));
        box.classList.add('is-visible');
      });
    });
    U.byId('logout-btn').addEventListener('click', function () {
      API.logout().catch(function () {}).then(function () {
        session = null;
        serverSummary = null;
        try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
        sseHandle = null;
        renderAuth();
        renderAll();
        U.toast(I.t('msg_logout', lang), 'success');
      });
    });
    U.byId('admin-user-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var box = U.byId('admin-user-error');
      box.classList.remove('is-visible');
      box.innerHTML = '';
      API.createUser({
        username: U.byId('new-username').value,
        password: U.byId('new-password').value,
        role: U.byId('new-role').value
      }).then(function (data) {
        U.byId('new-username').value = '';
        U.byId('new-password').value = '';
        loadAdmin();
        U.toast(I.t('msg_user_created', lang, { user: data.user.username }), 'success');
      }).catch(function (err) {
        box.innerHTML = U.esc((err && err.message) || 'Request failed.');
        box.classList.add('is-visible');
      });
    });
    U.byId('admin-users').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-admin-toggle]');
      if (!btn) { return; }
      API.setUserActive(btn.getAttribute('data-admin-toggle'), btn.getAttribute('data-active') === '1').then(function () {
        loadAdmin();
        U.toast(I.t('msg_user_updated', lang), 'success');
      }).catch(apiErrorToast);
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
    filters.date = U.todayISO();

    bindLang();
    I.applyStatic(lang);
    I.applyTitle('doc_title_staff', lang);
    U.setLangButtons(lang);

    syncCallOffice();
    U.byId('call-date').value = U.todayISO();
    syncFilterOptions(false);
    U.byId('flt-date').value = filters.date;
    syncWalkinOffice();
    syncWalkinServices();
    renderSettings();

    bindListActions();
    bindCallNext();
    bindFilters();
    bindWalkin();
    bindExport();
    bindReset();
    bindSettings();
    bindAuth();
    if (Q.promoteDue(state, U.todayISO(), new Date()) > 0) { persist(); }
    renderAll();
    renderAuth();
    showModeBadge();
    API.detect().then(function (m) {
      serverMode = (m !== 'local');
      showModeBadge();
      renderAuth();
      if (!serverMode || m !== 'server') {
        if (m !== 'local') {
          state.entries = [];
          renderAll();
          U.toast('Queue server unavailable. Local browser data is not authoritative.', 'danger');
        }
        return;
      }
      API.me().then(function (data) {
        session = data.user;
        renderAuth();
        refreshQueueFromServer();
        subscribeSSE();
      }).catch(function () {
        session = null;
        renderAuth();
        renderAll();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
