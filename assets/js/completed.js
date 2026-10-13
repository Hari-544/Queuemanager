(function () {
  'use strict';
  var API = window.QEAPI;
  var CFG = window.QE_CONFIG;
  var U = window.QEUI;
  var state = { officeId: 'all', serviceId: 'all', from: '', to: '', q: '', offset: 0, limit: 25, total: 0 };
  var sse = null;
  var timer = null;

  function esc(value) { return U.esc(String(value == null ? '' : value)); }
  function dateTime(value) {
    if (!value) { return 'Not recorded'; }
    try { return new Date(Number(value)).toLocaleString(); } catch (e) { return 'Not recorded'; }
  }
  function setError(message) {
    var box = document.getElementById('error');
    box.textContent = message || '';
    box.classList.toggle('hide', !message);
  }
  function fillSelects() {
    var office = document.getElementById('office-filter');
    office.innerHTML = '<option value="all">All offices</option>' + CFG.OFFICES.map(function (o) {
      return '<option value="' + esc(o.id) + '">' + esc(U.officeName(o, 'en')) + '</option>';
    }).join('');
    var service = document.getElementById('service-filter');
    service.innerHTML = '<option value="all">All services</option>' + CFG.SERVICES.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(U.serviceName(s, 'en')) + '</option>';
    }).join('');
  }
  function render(data) {
    state.total = data.total || 0;
    var rows = data.entries || [];
    document.getElementById('count-line').textContent = state.total + ' completed token' + (state.total === 1 ? '' : 's');
    document.getElementById('completed-list').innerHTML = rows.map(function (e) {
      var office = CFG.OFFICES.filter(function (o) { return o.id === e.officeId; })[0];
      var service = CFG.SERVICES.filter(function (s) { return s.id === e.serviceId; })[0];
      return '<tr><td class="mono">' + esc(e.token) + '</td><td class="mono">' + esc(e.reference) + '</td>' +
        '<td>' + esc(U.officeName(office, 'en')) + '<br><small>' + esc(U.serviceName(service, 'en')) + '</small></td>' +
        '<td>' + esc(e.date + ' · ' + e.time) + '</td><td>' + esc(dateTime(e.createdAt)) + '</td>' +
        '<td>' + esc(dateTime(e.completionAt)) + '</td><td>' + U.statusBadge(e.status, 'en') + '</td></tr>';
    }).join('');
    document.getElementById('empty').classList.toggle('hide', rows.length !== 0);
    document.querySelector('.table-scroll').classList.toggle('hide', rows.length === 0);
    var first = state.total ? state.offset + 1 : 0;
    var last = Math.min(state.offset + state.limit, state.total);
    document.getElementById('page-line').textContent = state.total ? first + '–' + last + ' of ' + state.total : '';
    document.getElementById('prev-btn').disabled = state.offset === 0;
    document.getElementById('next-btn').disabled = state.offset + state.limit >= state.total;
  }
  function load() {
    var loading = document.getElementById('loading');
    loading.classList.remove('hide');
    setError('');
    API.completed(state).then(render).catch(function (err) {
      if (err && err.status === 401) { window.location.href = 'staff.html#auth'; return; }
      if (err && err.status === 403) { setError('You are not authorized to view completed tokens.'); return; }
      setError((err && err.message) || 'Could not load completed tokens.');
    }).then(function () { loading.classList.add('hide'); });
  }
  function scheduleLoad(event) {
    if (event && event.version && scheduleLoad.version >= event.version) { return; }
    if (event && event.version) { scheduleLoad.version = event.version; }
    clearTimeout(timer);
    timer = setTimeout(load, 120);
  }
  function init() {
    fillSelects();
    var fields = [['office-filter', 'officeId'], ['service-filter', 'serviceId'], ['from-filter', 'from'], ['to-filter', 'to']];
    fields.forEach(function (pair) { document.getElementById(pair[0]).addEventListener('change', function () { state[pair[1]] = this.value; state.offset = 0; load(); }); });
    document.getElementById('search-filter').addEventListener('input', function () { state.q = this.value; state.offset = 0; clearTimeout(timer); timer = setTimeout(load, 250); });
    document.getElementById('refresh-btn').addEventListener('click', load);
    document.getElementById('prev-btn').addEventListener('click', function () { state.offset = Math.max(0, state.offset - state.limit); load(); });
    document.getElementById('next-btn').addEventListener('click', function () { if (state.offset + state.limit < state.total) { state.offset += state.limit; load(); } });
    document.getElementById('logout-btn').addEventListener('click', function () { API.logout().then(function () { window.location.href = 'staff.html#auth'; }); });
    API.me().then(function (data) {
      document.getElementById('records').classList.remove('hide');
      document.getElementById('logout-btn').classList.remove('hide');
      document.getElementById('logout-btn').textContent = 'Logout (' + data.user.username + ')';
      load();
      sse = API.subscribeEvents(scheduleLoad);
    }).catch(function () { window.location.href = 'staff.html#auth'; });
    window.addEventListener('pagehide', function () { clearTimeout(timer); if (sse) { sse.close(); } }, { once: true });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
