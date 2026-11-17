// PAT Test wizard — 4-step form
// _pw is module-scoped and never on window.
// Only EXPORTED functions reach window via Object.assign(window, patWiz) in main.js.
// NEVER use onclick="_pw.step=N;pwRender()" — _pw is not global.
// Always use onclick="pwJump(N)" which closes over _pw.

const _pw = { step: 0 };
var _pwDirCache = null;
var _pwKeyBound = false;

const _PW_STEPS = ['Job Details', 'Property', 'Client', 'Appliances', 'Review'];
const _PW_IDS   = ['pw-step-details', 'pw-step-property', 'pw-step-client', 'pw-step-appliances', 'pw-step-review'];

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmtDate(val) {
  if (!val) return '';
  var p = val.split('-');
  if (p.length !== 3) return val;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _stepSummary(i) {
  if (i === 0) {
    var date = document.getElementById('pat-date')?.value || '';
    if (!date) return '';
    return _fmtDate(date);
  }
  if (i === 1) {
    var addr = (document.getElementById('pat-addr1')?.value || '').trim();
    var pc   = (document.getElementById('pat-postcode')?.value || '').trim();
    if (!addr && !pc) return '';
    var short = addr.length > 32 ? addr.slice(0,32) + '…' : addr;
    return (short || '—') + (pc ? ' · ' + pc : '');
  }
  if (i === 2) {
    var name = (document.getElementById('pat-landlord')?.value || '').trim();
    return name || '';
  }
  if (i === 3) {
    var apps = window.patApps || [];
    if (!apps.length) return '0 appliances';
    var pass = apps.filter(function(a){ return (a.result||'').toLowerCase()==='pass'; }).length;
    var fail = apps.filter(function(a){ return (a.result||'').toLowerCase()==='fail'; }).length;
    return apps.length + ' appliance' + (apps.length !== 1 ? 's' : '') +
           (pass ? ' · <span style="color:var(--success)">' + pass + ' Pass</span>' : '') +
           (fail ? ' · <span style="color:#ef4444">'        + fail + ' Fail</span>' : '');
  }
  return '';
}

export function pwRender() {
  var tabsEl = document.getElementById('pat-wiz-tabs');
  if (!tabsEl) return;

  var appCount = (window.patApps || []).length;

  var html = '<div class="wiz-step-tabs">';
  _PW_STEPS.forEach(function(name, i) {
    var done   = i < _pw.step;
    var active = i === _pw.step;
    var cls    = 'wiz-step-tab' + (done ? ' done' : (active ? ' active' : ''));
    var num    = done ? '&#10003;' : (i + 1);
    var click  = done ? ' onclick="pwJump(' + i + ')"' : '';
    var cursor = done ? 'pointer' : 'default';

    // Appliance badge on Step 3 tab (Appliances = index 2)
    var badge = '';
    if (i === 2 && appCount > 0) {
      badge = ' <span class="pw-app-badge">' + appCount + '</span>';
    }

    html += '<div class="' + cls + '" style="cursor:' + cursor + '"' + click + '>';
    html += '<div style="display:flex;align-items:center;gap:4px"><span class="tab-num">' + num + '</span>';
    html += '<span class="tab-lbl">&nbsp;' + name + badge + '</span></div>';

    // Summary chip under done tabs
    if (done) {
      var sum = _stepSummary(i);
      if (sum) html += '<div class="pw-tab-summary">' + sum + '</div>';
    }

    html += '</div>';
  });
  html += '</div>';
  tabsEl.innerHTML = html;

  _PW_IDS.forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.hidden = (i !== _pw.step);
  });

  var backBtn = document.getElementById('pat-wiz-back');
  var nextBtn = document.getElementById('pat-wiz-next');
  if (backBtn) backBtn.hidden = (_pw.step === 0);
  if (nextBtn) nextBtn.hidden = (_pw.step === _PW_STEPS.length - 1);

  var info = document.getElementById('pat-wiz-step-info');
  if (info) info.textContent = 'Step ' + (_pw.step + 1) + ' of ' + _PW_STEPS.length;

  if (_pw.step === 3 && window.doPatPreview) window.doPatPreview();
}

export function pwNext() {
  // Step validators before advancing
  if (_pw.step === 0) {
    var date = document.getElementById('pat-date');
    if (!date || !date.value) {
      window.toast?.('Test date is required', 'error');
      date?.focus();
      return;
    }
  }
  if (_pw.step === 1) {
    var addr = document.getElementById('pat-addr1');
    if (!addr || !addr.value.trim()) {
      window.toast?.('Property address line 1 is required', 'error');
      addr?.focus();
      return;
    }
    var pc = document.getElementById('pat-postcode');
    if (!pc || !pc.value.trim()) {
      window.toast?.('Postcode is required', 'error');
      pc?.focus();
      return;
    }
  }
  // Step 2 (Client) — all optional, no validation needed
  if (_pw.step < _PW_STEPS.length - 1) {
    _pw.step++;
    pwRender();
    var wiz = document.getElementById('pat-wizard');
    if (wiz) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function pwBack() {
  if (_pw.step > 0) {
    _pw.step--;
    pwRender();
    var wiz = document.getElementById('pat-wizard');
    if (wiz) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function pwJump(i) {
  if (i >= 0 && i < _PW_STEPS.length) {
    _pw.step = i;
    pwRender();
  }
}

export function pwInit() {
  _pw.step = 0;
  _pwDirCache = null;
  pwRender();
  _pwBindEnter();
}

// --- Enter → Next shortcut ---
function _pwBindEnter() {
  if (_pwKeyBound) return;
  _pwKeyBound = true;
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    var view = window.state?.currentView;
    if (view !== 'pat-new') return;
    // Don't fire from textarea (allow newline) or from buttons
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
    // Don't fire from appliance table rows (step 2)
    if (e.target.closest('#pat-app-table')) return;
    if (_pw.step < _PW_STEPS.length - 1) {
      e.preventDefault();
      pwNext();
    }
  });
}

// --- Directory picker ---
export function patPickFromDirectory() {
  if (!_pwDirCache) {
    window.dirLoad?.('properties').then(function(data) {
      if (data && data.length) { _pwDirCache = data; patPickFromDirectory(); }
      else window.toast?.('Property directory is empty. Add properties in Settings → Directory.', 'info');
    });
    return;
  }
  var props = _pwDirCache;
  if (!props.length) { window.toast?.('Property directory is empty.', 'info'); return; }

  var items = props.map(function(p, i) {
    var label = _esc(p.addr1 || p.address || p.name || '');
    var pc    = p.postcode ? ' <span style="color:var(--muted)">('+_esc(p.postcode)+')</span>' : '';
    return '<div class="dir-item" onclick="window._pwDirPick('+i+')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px">' + label + pc + '</div>';
  }).join('');

  var modal = '<div id="pat-dir-modal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px">'
    + '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:420px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden">'
    + '<div style="padding:14px 16px;font-weight:700;font-size:14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
    + 'Pick property <button onclick="document.getElementById(\'pat-dir-modal\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted)">×</button></div>'
    + '<div style="overflow-y:auto">' + items + '</div>'
    + '</div></div>';

  document.getElementById('pat-dir-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal);

  window._pwDirPick = function(i) {
    var p = props[i];
    if (p) {
      var parts = [p.addr1 || p.address || '', p.addr2 || '', p.addr3 || p.town || ''].filter(Boolean);
      var addrEl = document.getElementById('pat-addr');
      var pcEl   = document.getElementById('pat-postcode');
      if (addrEl) { addrEl.value = parts.join('\n'); if (window.capitalizeAddress) window.capitalizeAddress(addrEl); }
      if (pcEl)   { pcEl.value = p.postcode || ''; if (window.updatePatRef) window.updatePatRef(); }
      if (window.doPatPreview) window.doPatPreview();
    }
    document.getElementById('pat-dir-modal')?.remove();
    pwRender();
  };
}
