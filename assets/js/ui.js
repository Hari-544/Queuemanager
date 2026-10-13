/*
 * QueueEase - shared browser UI helpers (toast, dialogs, badges, downloads).
 * All user-controlled text is escaped before insertion into HTML strings.
 */
(function (root) {
  'use strict';

  var I18N = root.QEI18N;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function byId(id) { return document.getElementById(id); }

  function announce(message) {
    var live = byId('live-region');
    if (live) {
      live.textContent = '';
      window.setTimeout(function () { live.textContent = message; }, 30);
    }
  }

  function toast(message, kind) {
    var region = byId('toasts');
    if (!region) { window.alert(message); return; }
    var item = document.createElement('div');
    item.className = 'toast' + (kind ? ' toast-' + kind : '');
    item.setAttribute('role', 'status');
    item.textContent = message;
    region.appendChild(item);
    while (region.children.length > 3) { region.removeChild(region.firstChild); }
    announce(message);
    window.setTimeout(function () {
      if (item.parentNode) { item.parentNode.removeChild(item); }
    }, kind === 'danger' ? 6000 : 4200);
  }

  function statusBadge(status, lang) {
    var cls = String(status).replace(/\s+/g, '-');
    return '<span class="badge badge-' + esc(cls) + '">' + esc(I18N.statusName(status, lang)) + '</span>';
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function avgMinutes(office, settings) {
    var ov = settings && settings.avgOverrides;
    if (ov && ov[office.id] != null && isFinite(Number(ov[office.id])) && Number(ov[office.id]) > 0) {
      return Number(ov[office.id]);
    }
    return office.avgServiceMinutes;
  }

  /* Promise-based confirmation dialog (native <dialog>, with fallback). */
  function confirmDialog(opts) {
    opts = opts || {};
    if (typeof HTMLDialogElement === 'undefined') {
      return Promise.resolve(window.confirm(opts.body || ''));
    }
    return new Promise(function (resolve) {
      var dlg = document.createElement('dialog');
      dlg.setAttribute('aria-labelledby', 'qe-dlg-title');
      var bodyHtml = '<div class="dialog-body">' +
        '<h2 id="qe-dlg-title">' + esc(opts.title || '') + '</h2>' +
        '<p>' + esc(opts.body || '') + '</p>';
      if (opts.requireText) {
        bodyHtml += '<div class="field"><label for="qe-dlg-input">' + esc(opts.requireLabel || '') + '</label>' +
          '<input type="text" id="qe-dlg-input" autocomplete="off" spellcheck="false"></div>';
      }
      bodyHtml += '<div class="dialog-actions">' +
        '<button type="button" class="btn btn-secondary" data-act="cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
        '<button type="button" class="btn btn-danger" data-act="ok">' + esc(opts.confirmLabel || 'Confirm') + '</button>' +
        '</div></div>';
      dlg.innerHTML = bodyHtml;
      document.body.appendChild(dlg);
      var input = dlg.querySelector('#qe-dlg-input');
      var okBtn = dlg.querySelector('[data-act="ok"]');
      function cleanup(val) {
        try { dlg.close(); } catch (e) { /* ignore */ }
        dlg.remove();
        resolve(val);
      }
      if (opts.requireText && input && okBtn) {
        okBtn.disabled = true;
        input.addEventListener('input', function () {
          okBtn.disabled = input.value.trim().toUpperCase() !== String(opts.requireText).toUpperCase();
        });
      }
      dlg.querySelector('[data-act="cancel"]').addEventListener('click', function () { cleanup(false); });
      okBtn.addEventListener('click', function () { cleanup(true); });
      dlg.addEventListener('cancel', function () { dlg.remove(); resolve(false); });
      dlg.addEventListener('close', function () { dlg.remove(); });
      try { dlg.showModal(); } catch (e) { cleanup(false); return; }
      var focusTarget = input || okBtn;
      if (focusTarget) { focusTarget.focus(); }
    });
  }

  function officeName(office, lang) {
    if (!office) { return ''; }
    return (office.name && (office.name[lang] || office.name.en)) || office.id;
  }

  function serviceName(service, lang) {
    if (!service) { return ''; }
    return (service.name && (service.name[lang] || service.name.en)) || service.id;
  }

  function setLangButtons(lang) {
    var btns = document.querySelectorAll('[data-lang-btn]');
    for (var i = 0; i < btns.length; i++) {
      var active = btns[i].getAttribute('data-lang-btn') === lang;
      btns[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  root.QEUI = {
    esc: esc,
    byId: byId,
    toast: toast,
    announce: announce,
    statusBadge: statusBadge,
    download: download,
    todayISO: todayISO,
    avgMinutes: avgMinutes,
    confirmDialog: confirmDialog,
    officeName: officeName,
    serviceName: serviceName,
    setLangButtons: setLangButtons
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
