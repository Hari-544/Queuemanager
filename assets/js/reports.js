(function () {
  'use strict';

  var API = window.QEAPI;
  var U = window.QEUI;
  var currentReport = null;

  function byId(id) { return document.getElementById(id); }
  function setHidden(id, hidden) { byId(id).classList.toggle('hide', hidden); }
  function escape(value) { return U.esc(String(value === null || value === undefined ? '' : value)); }
  function fmtMinutes(value) { return value === null ? 'Not recorded' : escape(value) + ' min'; }

  function render(report) {
    currentReport = report;
    var t = report.totals;
    byId('report-kpis').innerHTML = [
      ['Total tokens', t.total, ''],
      ['Completed', t.completed, 'is-completed'],
      ['Completion rate', t.completionRate + '%', 'is-serving'],
      ['Avg wait time', fmtMinutes(t.averageWaitingMinutes), 'is-waiting'],
      ['Avg service time', fmtMinutes(t.averageServiceMinutes), 'is-serving']
    ].map(function (item) {
      return '<div class="stat ' + item[2] + '"><span class="stat-value">' + escape(item[1]) + '</span><span class="stat-label">' + item[0] + '</span></div>';
    }).join('');
    byId('office-report').innerHTML = report.offices.filter(function (o) { return o.total > 0; }).map(function (o) {
      return '<tr><td>' + escape(o.name) + '</td><td>' + o.total + '</td><td>' + o.completed + '</td><td>' + o.completionRate + '%</td><td>' + fmtMinutes(o.averageServiceMinutes) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="muted">No activity in this range.</td></tr>';
    var daily = report.daily || [];
    setHidden('daily-empty', daily.length > 0);
    var max = daily.reduce(function (n, item) { return Math.max(n, item.total); }, 1);
    byId('daily-report').innerHTML = daily.map(function (item) {
      return '<div class="report-bar-row"><span class="mono">' + escape(item.date) + '</span><span class="report-bar"><i style="width:' + Math.round((item.total / max) * 100) + '%"></i></span><strong>' + item.total + '</strong></div>';
    }).join('');
    byId('report-period').textContent = (report.from || 'All dates') + ' to ' + (report.to || 'Today');
    byId('generated-at').textContent = new Date(report.generatedAt).toLocaleString();
  }

  function load() {
    setHidden('report-loading', false);
    setHidden('report-error', true);
    API.reports(byId('from-date').value, byId('to-date').value).then(function (data) {
      render(data);
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403) {
        byId('auth-error').textContent = 'Please sign in from the Staff page to view reports.';
        setHidden('auth-error', false);
        setHidden('report-section', true);
      } else {
        byId('report-error').textContent = err.message || 'Could not load the report.';
        setHidden('report-error', false);
      }
    }).finally(function () {
      setHidden('report-loading', true);
    });
  }

  API.detect().then(function (mode) {
    if (mode !== 'server') {
      byId('auth-error').textContent = 'Reports require the QueueManager server. Start the backend and sign in from Staff.';
      setHidden('auth-error', false);
      return;
    }
    return API.me().then(function (data) {
      byId('logout-btn').textContent = 'Logout (' + data.user.username + ')';
      byId('logout-btn').classList.remove('hide');
      byId('report-section').classList.remove('hide');
      load();
    });
  }).catch(function () {
    byId('auth-error').textContent = 'Please sign in from the Staff page to view reports.';
    setHidden('auth-error', false);
  });
  byId('refresh-btn').addEventListener('click', load);
  byId('logout-btn').addEventListener('click', function () {
    API.logout().then(function () { window.location.href = 'staff.html#auth'; });
  });
  API.subscribeEvents(function () { if (currentReport) { load(); } });
}());
