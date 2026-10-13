/* QueueEase - public "Now serving" display board (read-only).
 * Refreshes every 10 seconds and instantly on cross-tab storage updates. */
(function () {
  'use strict';

  var CFG = window.QE_CONFIG;
  var Q = window.QEQueue;
  var S = window.QEStore;
  var I = window.QEI18N;
  var U = window.QEUI;
  var API = window.QEAPI;

  var OFFICE_KEY = 'queueease.display.office';
  var REFRESH_MS = 10000;
  var MAX_SERVING = 8;
  var MAX_WAITING = 12;

  var adapter = null;
  var state = null;
  var lang = 'en';
  var officeFilter = 'all';
  var timer = null;
  var serverMode = false;
  var sseHandle = null;
  var boardExtra = 0;

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

  function persist() {
    S.save(adapter, state, new Date());
  }

  function setLang(l, skipPersist) {
    lang = I.isLang(l);
    I.setStoredLang(lang);
    if (!skipPersist) {
      state.settings = state.settings || {};
      state.settings.lang = lang;
      persist();
    }
    I.applyStatic(lang);
    I.applyTitle('doc_title_display', lang);
    U.setLangButtons(lang);
    showModeBadge();
    syncOfficeSelect();
    render();
  }

  function bindLang() {
    var btns = document.querySelectorAll('[data-lang-btn]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang-btn')); });
    }
  }

  function loadOfficeFilter() {
    try {
      var v = window.localStorage.getItem(OFFICE_KEY);
      officeFilter = (v === 'all' || Q.getOffice(v)) ? v : 'all';
    } catch (e) { officeFilter = 'all'; }
  }

  function saveOfficeFilter() {
    try { window.localStorage.setItem(OFFICE_KEY, officeFilter); } catch (e) { /* ignore */ }
  }

  function syncOfficeSelect() {
    var sel = U.byId('display-office');
    sel.innerHTML = '<option value="all">' + U.esc(I.t('opt_all', lang)) + '</option>' +
      CFG.OFFICES.map(function (o) {
        return '<option value="' + U.esc(o.id) + '">' + U.esc(U.officeName(o, lang)) + '</option>';
      }).join('');
    sel.value = officeFilter;
  }

  function inScope(entry) {
    return officeFilter === 'all' || entry.officeId === officeFilter;
  }

  function timeNow() {
    try {
      return new Date().toLocaleTimeString(lang === 'te' ? 'te-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return new Date().toLocaleTimeString();
    }
  }

  function render() {
    var serving = state.entries
      .filter(function (e) { return e.status === 'Serving' && inScope(e); })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
      .slice(0, MAX_SERVING);

    var serveList = U.byId('serve-list');
    if (!serving.length) {
      serveList.innerHTML = '<div class="empty"><span class="empty-icon" aria-hidden="true">⏳</span>' +
        '<p>' + U.esc(I.t('display_none_serving', lang)) + '</p></div>';
    } else {
      serveList.innerHTML = serving.map(function (e) {
        var office = Q.getOffice(e.officeId);
        var service = Q.getService(e.serviceId);
        return '<article class="serve-card" aria-label="' + U.esc(e.token + ' ' + I.statusName(e.status, lang)) + '">' +
          '<span class="stat-label">' + U.esc(I.t('display_title', lang)) + '</span>' +
          '<div class="serve-token">' + U.esc(e.token) + '</div>' +
          '<div class="serve-office">' + U.esc(U.serviceName(service, lang)) + ' · ' +
          U.esc(I.t('display_at_office', lang, { office: U.officeName(office, lang) })) + '</div>' +
          '</article>';
      }).join('');
    }

    var today = U.todayISO();
    var waiting = state.entries
      .filter(function (e) { return e.status === 'Waiting' && e.date === today && inScope(e); })
      .sort(function (a, b) {
        if (a.createdAt !== b.createdAt) { return a.createdAt - b.createdAt; }
        return a.tokenSeq - b.tokenSeq;
      });
    var waitList = U.byId('wait-list');
    if (!waiting.length) {
      waitList.innerHTML = '<div class="empty" style="flex:1 1 100%"><p>' + U.esc(I.t('display_none_waiting', lang)) + '</p></div>';
    } else {
      var shown = waiting.slice(0, MAX_WAITING);
      var extra = (waiting.length - shown.length) + boardExtra;
      waitList.innerHTML = shown.map(function (e) {
        return '<span class="wait-chip"><span class="mono">' + U.esc(e.token) + '</span>' +
          '</span>';
      }).join('') + (extra > 0 ? '<span class="wait-chip">+' + extra + '</span>' : '');
    }

    U.byId('display-updated').textContent = I.t('display_updated', lang, { time: timeNow() });
  }

  function reload() {
    if (serverMode) { loadBoard(); return; }
    var loaded = S.load(adapter, new Date());
    state = loaded.state;
    state.settings = state.settings || {};
    if (state.settings.lang && state.settings.lang !== lang) {
      setLang(state.settings.lang, true);
      return;
    }
    render();
  }

  function loadBoard() {
    API.board(officeFilter).then(function (data) {
      boardExtra = Math.max(0, (data.waitingTotal || 0) - (data.waiting || []).length);
      var publicRows = (data.serving || []).concat(data.waiting || []).map(function (entry) {
        var row = Object.assign({}, entry);
        row.id = row.id || ('public-' + row.token + '-' + row.date);
        row.tokenSeq = row.tokenSeq || (Number(String(row.token).split('-').pop()) || 0);
        return row;
      });
      state.entries = Q.sanitizeState({ entries: publicRows }).entries;
      render();
    }).catch(function () { /* keep the last good render */ });
  }

  function init() {
    adapter = S.createAdapter();
    var loaded = S.load(adapter, new Date());
    state = loaded.state;
    state.settings = state.settings || {};
    lang = I.isLang(state.settings.lang || I.getStoredLang());
    I.setStoredLang(lang);
    state.settings.lang = lang;
    loadOfficeFilter();

    bindLang();
    I.applyStatic(lang);
    I.applyTitle('doc_title_display', lang);
    U.setLangButtons(lang);
    syncOfficeSelect();

    U.byId('display-office').addEventListener('change', function () {
      officeFilter = this.value;
      saveOfficeFilter();
      if (serverMode) { loadBoard(); } else { render(); }
    });

    window.addEventListener('storage', function (e) {
      if (!serverMode && e && e.key === CFG.STORAGE_KEY) { reload(); }
    });
    timer = window.setInterval(reload, REFRESH_MS);
    window.addEventListener('pagehide', function () {
      if (timer) { window.clearInterval(timer); }
    });

    render();
    showModeBadge();
    API.detect().then(function (m) {
      serverMode = (m !== 'local');
      showModeBadge();
      if (m !== 'server') {
        state.entries = [];
        if (m === 'local') { reload(); }
        else { render(); }
        return;
      }
      loadBoard();
      try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
      sseHandle = API.subscribeEvents(function () { loadBoard(); });
      window.addEventListener('pagehide', function () {
        try { if (sseHandle && sseHandle.close) { sseHandle.close(); } } catch (e) { /* ignore */ }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
