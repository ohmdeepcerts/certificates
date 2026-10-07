// ============================================================
//  wizard.js — Gas wizard: old mgwXxx UI + new gwXxx step wizard
// ============================================================
import { getSetting } from '../../lib/settings.js';
import { toast } from '../../lib/utils.js';
import { state, isAdmin } from '../../lib/state.js';
import { _refSettings, _pcScore, _refAddrPart } from '../_core/refgen.js';
// Circular-safe: cp12.js imports { gwRender, gwInitState, _gwUpdateTitle, mgwSyncToDesktopForm, mgwActive } from here.
import { setCP12Field, toggleCP12AppRow, oneYearMinusOneDayUK, saveGas, completeGas } from './cp12.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';

// ── OLD MGW WIZARD ────────────────────────────────────────

let _mgwSlots = 0;

export function mgwActive() {
  const w = document.getElementById('mobile-gas-wizard');
  return w && !w.hidden;
}

export function mgwInit() {
  _mgwSlots = 0;
  const t = new Date();
  const today = `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
  const el = document.getElementById('mgw-cert-date'); if (el) el.value = today;
  ['mgw-install-address', 'mgw-install-postcode', 'mgw-landlord-address', 'mgw-landlord-postcode'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const em = document.getElementById('mgw-recipient-email'); if (em) em.value = 'gbelectricalcertificates@hotmail.com';
  const wd = document.getElementById('mgw-work-details'); if (wd) wd.value = 'Annual gas safety inspection and landlord gas safety record (CP12) completed.';
  const appDiv = document.getElementById('mgw-appliances'); if (appDiv) appDiv.innerHTML = '';
  const defDiv = document.getElementById('mgw-defects-list'); if (defDiv) defDiv.innerHTML = '';
  const addBtn = document.getElementById('mgw-btn-add-app'); if (addBtn) addBtn.hidden = false;
  mgwAddAppliance();
}

function mgwBuildAppCard(slot) {
  const isFirst = slot === 1;
  const removeBtn = isFirst ? '' : `<button class="mgw-remove-btn" onclick="mgwRemoveAppliance(${slot})" title="Remove">Remove</button>`;
  return `<div class="mgw-app-card" id="mgw-app-${slot}" data-mgw-slot="${slot}">
    <div class="mgw-app-header"><div class="mgw-app-num">Appliance ${slot}</div>${removeBtn}</div>
    <div class="mgw-field-label">Location</div>
    <input type="text" id="mgw-a${slot}-loc" class="mgw-input" placeholder="e.g. Kitchen, Loft">
    <div class="mgw-field-label">Type</div>
    <input type="text" id="mgw-a${slot}-type" class="mgw-input" placeholder="e.g. Combi Boiler, Gas Fire" list="mgw-app-types" oninput="mgwOnTypeChange(${slot})">
    <div class="mgw-field-label">Manufacturer</div>
    <input type="text" id="mgw-a${slot}-make" class="mgw-input" placeholder="e.g. Vaillant, Worcester">
    <div class="mgw-field-label">Model</div>
    <input type="text" id="mgw-a${slot}-model" class="mgw-input" placeholder="e.g. ecoTec Pro 28">
    <div class="mgw-field-label">Flue Type</div>
    <input type="text" id="mgw-a${slot}-flue" class="mgw-input" placeholder="e.g. RS, FL, Open">
    <div class="mgw-field-label">Operating Pressure</div>
    <input type="text" id="mgw-a${slot}-pressure" class="mgw-input" value="20 mbar">
    <div class="mgw-field-label">Combustion Reading</div>
    <input type="text" id="mgw-a${slot}-comb" class="mgw-input" placeholder="e.g. CO 0 ppm, N/A">
    <div class="mgw-section-divider">Inspection Checks</div>
    <div class="mgw-checks-grid">
      <div class="mgw-check-item"><div class="mgw-check-label">Owned by Landlord?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-ownership"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Inspected?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-inspected"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Safety Devices</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-safety"><button class="mgw-toggle active" data-val="Pass" onclick="mgwToggle(this)">Pass</button><button class="mgw-toggle" data-val="Fail" onclick="mgwToggle(this)">Fail</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Ventilation</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-vent"><button class="mgw-toggle active" data-val="Pass" onclick="mgwToggle(this)">Pass</button><button class="mgw-toggle" data-val="Fail" onclick="mgwToggle(this)">Fail</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Visual Condition</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-visual"><button class="mgw-toggle" data-val="Pass" onclick="mgwToggle(this)">Pass</button><button class="mgw-toggle" data-val="Fail" onclick="mgwToggle(this)">Fail</button><button class="mgw-toggle active" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Flue Flow / Spillage</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-flueflow"><button class="mgw-toggle" data-val="Pass" onclick="mgwToggle(this)">Pass</button><button class="mgw-toggle" data-val="Fail" onclick="mgwToggle(this)">Fail</button><button class="mgw-toggle active" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Serviced?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-serviced"><button class="mgw-toggle active" data-val="No" onclick="mgwToggle(this)">No</button><button class="mgw-toggle" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">Safe to Use?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-safe"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button></div></div>
    </div>
    <div class="mgw-section-divider">CO Alarm</div>
    <div class="mgw-checks-grid">
      <div class="mgw-check-item"><div class="mgw-check-label">CO Alarm Fitted?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-co-fitted"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">CO Alarm In Date?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-co-date"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
      <div class="mgw-check-item"><div class="mgw-check-label">CO Alarm Tested?</div>
        <div class="mgw-toggle-row" data-mgw="a${slot}-co-test"><button class="mgw-toggle active" data-val="Yes" onclick="mgwToggle(this)">Yes</button><button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No</button><button class="mgw-toggle" data-val="N/A" onclick="mgwToggle(this)">N/A</button></div></div>
    </div>
  </div>`;
}

export function mgwAddAppliance() {
  if (_mgwSlots >= 5) return;
  _mgwSlots++;
  const slot = _mgwSlots;
  const appDiv = document.getElementById('mgw-appliances');
  if (appDiv) appDiv.insertAdjacentHTML('beforeend', mgwBuildAppCard(slot));
  const addBtn = document.getElementById('mgw-btn-add-app');
  if (addBtn) addBtn.hidden = (_mgwSlots >= 5);
}

export function mgwRemoveAppliance(slot) {
  const card = document.getElementById(`mgw-app-${slot}`);
  if (card) card.remove();
  const remaining = document.querySelectorAll('#mgw-appliances .mgw-app-card');
  remaining.forEach((c, i) => {
    const n = i + 1;
    c.dataset.mgwSlot = n;
    const numEl = c.querySelector('.mgw-app-num'); if (numEl) numEl.textContent = `Appliance ${n}`;
    const rmBtn = c.querySelector('.mgw-remove-btn'); if (rmBtn) rmBtn.setAttribute('onclick', `mgwRemoveAppliance(${n})`);
    c.id = `mgw-app-${n}`;
    c.querySelectorAll('[data-mgw]').forEach(el => { el.dataset.mgw = el.dataset.mgw.replace(/^a\d+/, `a${n}`); });
    c.querySelectorAll('[id^="mgw-a"]').forEach(el => { el.id = el.id.replace(/^mgw-a\d+/, `mgw-a${n}`); });
    c.querySelectorAll('[oninput]').forEach(el => { el.setAttribute('oninput', `mgwOnTypeChange(${n})`); });
  });
  _mgwSlots = remaining.length;
  const addBtn = document.getElementById('mgw-btn-add-app'); if (addBtn) addBtn.hidden = false;
}

export function mgwToggle(btn) {
  const row = btn.closest('.mgw-toggle-row'); if (!row) return;
  row.querySelectorAll('.mgw-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

export function mgwGetToggle(mgwKey) {
  const row = document.querySelector(`.mgw-toggle-row[data-mgw="${mgwKey}"]`); if (!row) return '';
  const active = row.querySelector('.mgw-toggle.active');
  return active ? active.dataset.val : '';
}

export function mgwSetToggle(mgwKey, val) {
  const row = document.querySelector(`.mgw-toggle-row[data-mgw="${mgwKey}"]`); if (!row) return;
  row.querySelectorAll('.mgw-toggle').forEach(b => b.classList.toggle('active', b.dataset.val === val));
}

export function mgwOnTypeChange(slot) {
  const el = document.getElementById(`mgw-a${slot}-type`); if (!el) return;
  const t = el.value.toLowerCase();
  const isCooker = /cooker|hob|range|dryer/.test(t);
  const isOpenFlue = /fire|back\s*boiler/.test(t);
  const isRS = /combi|system\s*boiler|condensing|warm\s*air|water\s*heater|boiler/.test(t) && !isOpenFlue;
  if (isCooker) {
    mgwSetToggle(`a${slot}-co-fitted`, 'N/A');
    mgwSetToggle(`a${slot}-co-date`, 'N/A');
    mgwSetToggle(`a${slot}-co-test`, 'N/A');
    mgwSetToggle(`a${slot}-flueflow`, 'N/A');
    mgwSetToggle(`a${slot}-vent`, 'N/A');
  } else if (isRS) {
    mgwSetToggle(`a${slot}-flue-type`, 'RS');
  } else if (isOpenFlue) {
    mgwSetToggle(`a${slot}-flue-type`, 'OF');
  }
}

let _mgwDefectCount = 0;
export function mgwAddDefect() {
  if (_mgwDefectCount >= 5) return;
  _mgwDefectCount++;
  const d = _mgwDefectCount;
  const list = document.getElementById('mgw-defects-list'); if (!list) return;
  list.insertAdjacentHTML('beforeend', `<div class="mgw-defect-row" id="mgw-defect-${d}">
    <div>
      <input type="text" id="mgw-d${d}-desc" class="mgw-input" placeholder="Defect description…" style="margin-bottom:6px">
      <div class="mgw-toggle-row" data-mgw="d${d}-warn">
        <button class="mgw-toggle active" data-val="N/A" onclick="mgwToggle(this)">N/A</button>
        <button class="mgw-toggle" data-val="Yes" onclick="mgwToggle(this)">Warning Issued</button>
        <button class="mgw-toggle" data-val="No" onclick="mgwToggle(this)">No Warning</button>
      </div>
    </div>
    <button class="mgw-defect-del" onclick="mgwRemoveDefect(${d})" title="Remove">×</button>
  </div>`);
}

export function mgwRemoveDefect(d) {
  const el = document.getElementById(`mgw-defect-${d}`); if (el) el.remove();
}

export function mgwSyncToDesktopForm() {
  const certDate = document.getElementById('mgw-cert-date')?.value || '';
  setCP12Field('cert_date', certDate);
  if (certDate.length === 10) setCP12Field('next_check_date', oneYearMinusOneDayUK(certDate));
  setCP12Field('install_address', document.getElementById('mgw-install-address')?.value || '');
  setCP12Field('install_postcode', document.getElementById('mgw-install-postcode')?.value || '');
  setCP12Field('landlord_address', document.getElementById('mgw-landlord-address')?.value || '');
  setCP12Field('landlord_postcode', document.getElementById('mgw-landlord-postcode')?.value || '');
  setCP12Field('recipient_email', document.getElementById('mgw-recipient-email')?.value || '');
  setCP12Field('work_details', document.getElementById('mgw-work-details')?.value || '');
  ['pipe_gas_tight', 'pipe_pressure', 'pipe_visual', 'pipe_meter', 'pipe_emergency'].forEach(f => setCP12Field(f, '✓'));
  const cards = document.querySelectorAll('#mgw-appliances .mgw-app-card');
  for (let n = 1; n <= 5; n++) {
    const card = document.getElementById(`cp12App${n}`); if (!card) continue;
    const isActive = n <= cards.length;
    const isDisabled = card.classList.contains('is-disabled');
    if (isActive && isDisabled) toggleCP12AppRow(n);
    if (!isActive && !isDisabled) toggleCP12AppRow(n);
  }
  cards.forEach((c, i) => {
    const n = i + 1;
    const s = parseInt(c.dataset.mgwSlot) || n;
    setCP12Field(`app${n}_location`, document.getElementById(`mgw-a${s}-loc`)?.value || '');
    setCP12Field(`app${n}_type`, document.getElementById(`mgw-a${s}-type`)?.value || '');
    setCP12Field(`app${n}_make`, document.getElementById(`mgw-a${s}-make`)?.value || '');
    setCP12Field(`app${n}_model`, document.getElementById(`mgw-a${s}-model`)?.value || '');
    setCP12Field(`app${n}_flue_type`, document.getElementById(`mgw-a${s}-flue`)?.value || '');
    setCP12Field(`app${n}_op_pressure`, document.getElementById(`mgw-a${s}-pressure`)?.value || '20 mbar');
    setCP12Field(`app${n}_combustion`, document.getElementById(`mgw-a${s}-comb`)?.value || '');
    const chk = [
      [`app${n}_ownership`, `a${s}-ownership`], [`app${n}_inspected`, `a${s}-inspected`],
      [`app${n}_safety_dev`, `a${s}-safety`], [`app${n}_vent`, `a${s}-vent`],
      [`app${n}_visual`, `a${s}-visual`], [`app${n}_flue_flow`, `a${s}-flueflow`],
      [`app${n}_serviced`, `a${s}-serviced`], [`app${n}_safe_to_use`, `a${s}-safe`],
      [`app${n}_co_fitted`, `a${s}-co-fitted`], [`app${n}_co_in_date`, `a${s}-co-date`],
      [`app${n}_co_alarm_test`, `a${s}-co-test`],
    ];
    chk.forEach(([df, mf]) => {
      const v = mgwGetToggle(mf);
      if (v) {
        setCP12Field(df, v);
        const btn = document.querySelector(`button.choice-cycle[data-group="${df}"]`);
        if (btn) { btn.dataset.current = v; btn.textContent = v; }
      }
    });
  });
  for (let i = 1; i <= 5; i++) {
    const descEl = document.getElementById(`mgw-d${i}-desc`);
    if (descEl && descEl.closest(`#mgw-defect-${i}`)) {
      setCP12Field(`defect_${i}`, descEl.value || 'N/A');
      setCP12Field(`defect_warn_${i}`, mgwGetToggle(`d${i}-warn`) || 'N/A');
    } else {
      setCP12Field(`defect_${i}`, 'N/A');
      setCP12Field(`defect_warn_${i}`, 'N/A');
    }
  }
  setCP12Field('remedial_action', 'N/A');
}

export async function mgwSaveDraft() { mgwSyncToDesktopForm(); await saveGas(true); }
export async function mgwComplete() { mgwSyncToDesktopForm(); await completeGas(); }

// ── GW DRUM PICKER ────────────────────────────────────────

function _gwDrumPickerHTML(baseId, dateStr) {
  var parts = (dateStr || '01/01/' + new Date().getFullYear()).split('/');
  var dd = parseInt(parts[0]) || 1, mm = parseInt(parts[1]) || 1, yyyy = parseInt(parts[2]) || new Date().getFullYear();
  var IH = 30, VIS = 5, H = IH * VIS;
  var days = []; for (var _d = 1; _d <= 31; _d++) days.push(String(_d).padStart(2, '0'));
  var mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ty = new Date().getFullYear(), years = []; for (var _y = ty - 2; _y <= ty + 3; _y++) years.push(String(_y));
  var di = dd - 1, mi = mm - 1, yi = years.indexOf(String(yyyy)); if (yi < 0) yi = 2;
  function col(id, items, si) {
    var c = '<div style="flex:1;position:relative;overflow:hidden;height:' + H + 'px">';
    c += '<div style="position:absolute;top:0;left:0;right:0;height:' + (IH * 2) + 'px;background:linear-gradient(to bottom,var(--surface2) 10%,transparent);pointer-events:none;z-index:2"></div>';
    c += '<div style="position:absolute;bottom:0;left:0;right:0;height:' + (IH * 2) + 'px;background:linear-gradient(to top,var(--surface2) 10%,transparent);pointer-events:none;z-index:2"></div>';
    c += '<div style="position:absolute;top:' + ((H - IH) / 2) + 'px;left:6px;right:6px;height:' + IH + 'px;background:rgba(37,99,235,.07);border-radius:6px;pointer-events:none;z-index:1"></div>';
    c += '<div id="' + id + '" data-gw-drum="' + baseId + '" data-init-idx="' + si + '" style="height:' + H + 'px;overflow-y:scroll;scroll-snap-type:y mandatory;scroll-snap-stop:always;-ms-overflow-style:none;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-padding-top:' + (IH * 2) + 'px" onscroll="_gwDrumScrolled(this)" onwheel="_gwDrumWheel(event,this)">';
    c += '<div style="height:' + (IH * 2) + 'px"></div>';
    items.forEach(function (item, i) {
      var isSel = i === si;
      c += '<div data-idx="' + i + '" data-val="' + item + '" onclick="_gwDrumClickItem(this)" style="height:' + IH + 'px;scroll-snap-align:start;display:flex;align-items:center;justify-content:center;font-size:' + (isSel ? '17' : '13') + 'px;font-weight:' + (isSel ? '700' : '400') + ';color:' + (isSel ? 'var(--accent)' : 'var(--text)') + ';user-select:none;cursor:pointer">' + item + '</div>';
    });
    c += '<div style="height:' + (IH * 2) + 'px"></div></div></div>';
    return c;
  }
  var html = '<div id="' + baseId + '-drum" style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface2)">';
  html += col(baseId + '-dd', days, di) + '<div style="width:1px;background:var(--border)"></div>';
  html += col(baseId + '-mm', mNames, mi) + '<div style="width:1px;background:var(--border)"></div>';
  html += col(baseId + '-yy', years, yi) + '</div>';
  return html;
}

function _gwInitDrums() {
  document.querySelectorAll('[data-gw-drum]').forEach(function (el) {
    el.scrollTop = parseInt(el.getAttribute('data-init-idx') || '0') * 30;
  });
}

window._gwDrumScrolled = function (el) {
  var IH = 30, nearIdx = Math.round(el.scrollTop / IH);
  el.querySelectorAll('[data-idx]').forEach(function (item) {
    var isSel = parseInt(item.getAttribute('data-idx')) === nearIdx;
    item.style.fontSize = isSel ? '17px' : '13px'; item.style.fontWeight = isSel ? '700' : '400';
    item.style.color = isSel ? 'var(--accent)' : 'var(--text)';
  });
  clearTimeout(el._st); el._st = setTimeout(function () { window._gwDrumDone(el); }, 120);
};

window._gwDrumDone = function (el) {
  var IH = 30, baseId = el.getAttribute('data-gw-drum');
  function getColVal(sfx) {
    var d = document.getElementById(baseId + sfx); if (!d) return null;
    var i = Math.round(d.scrollTop / IH), found = null;
    d.querySelectorAll('[data-idx]').forEach(function (x) { if (parseInt(x.getAttribute('data-idx')) === i) found = x; });
    return found ? found.getAttribute('data-val') : null;
  }
  var ddV = getColVal('-dd'), mmV = getColVal('-mm'), yyV = getColVal('-yy'); if (!ddV || !mmV || !yyV) return;
  var mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var dateStr = ddV + '/' + String(mNames.indexOf(mmV) + 1).padStart(2, '0') + '/' + yyV;
  if (baseId === 'gw-cert-date') {
    gwSet('certDate', dateStr); var nx = oneYearMinusOneDayUK(dateStr); gwSet('nextCheckDate', nx);
    window._gwSetDrum('gw-ncd', nx);
    var ex = document.getElementById('gw-expiry-display'); if (ex) ex.textContent = 'Next due: ' + nx;
    var cd = document.getElementById('gw-cert-date-display'); if (cd) cd.textContent = _gwFmtDateWithDay(dateStr);
  } else if (baseId === 'gw-ncd') {
    gwSet('nextCheckDate', dateStr);
    var ex2 = document.getElementById('gw-expiry-display'); if (ex2) ex2.textContent = 'Next due: ' + dateStr;
  }
};

window._gwSetDrum = function (baseId, dateStr) {
  var parts = (dateStr || '').split('/'); if (parts.length !== 3) return;
  var dd = parseInt(parts[0]) || 1, mm = parseInt(parts[1]) || 1, yyyy = parseInt(parts[2]) || new Date().getFullYear();
  var IH = 30, ty = new Date().getFullYear(), years = []; for (var _y = ty - 2; _y <= ty + 3; _y++) years.push(String(_y));
  var ddD = document.getElementById(baseId + '-dd'), mmD = document.getElementById(baseId + '-mm'), yyD = document.getElementById(baseId + '-yy');
  if (ddD) ddD.scrollTop = (dd - 1) * IH; if (mmD) mmD.scrollTop = (mm - 1) * IH;
  if (yyD) { var yi = years.indexOf(String(yyyy)); yyD.scrollTop = (yi < 0 ? 2 : yi) * IH; }
};

window._gwDrumWheel = function (e, el) {
  e.preventDefault(); e.stopPropagation();
  var IH = 30, dir = e.deltaY > 0 ? 1 : -1;
  var steps = Math.max(1, Math.min(5, Math.round(Math.abs(e.deltaY) / 40)));
  var cur = Math.round(el.scrollTop / IH);
  var max = el.querySelectorAll('[data-idx]').length - 1;
  var next = Math.max(0, Math.min(max, cur + dir * steps));
  el.scrollTo({ top: next * IH, behavior: 'smooth' });
};

window._gwDrumClickItem = function (itemEl) {
  var col = itemEl.parentElement; if (!col) return;
  var idx = parseInt(itemEl.getAttribute('data-idx'));
  col.scrollTo({ top: idx * 30, behavior: 'smooth' });
};

window._gwDateAdjust = function (baseId, delta) {
  var cur = baseId === 'gw-cert-date' ? _gw.certDate : _gw.nextCheckDate;
  var parts = (cur || '').split('/'); if (parts.length !== 3) return;
  var d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); if (isNaN(d.getTime())) return;
  d.setDate(d.getDate() + delta);
  var nd = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  if (baseId === 'gw-cert-date') {
    gwSet('certDate', nd); var nx = oneYearMinusOneDayUK(nd); gwSet('nextCheckDate', nx);
    window._gwSetDrum('gw-cert-date', nd); window._gwSetDrum('gw-ncd', nx);
    var ex = document.getElementById('gw-expiry-display'); if (ex) ex.textContent = 'Next due: ' + nx;
    var cd = document.getElementById('gw-cert-date-display'); if (cd) cd.textContent = _gwFmtDateWithDay(nd);
  } else {
    gwSet('nextCheckDate', nd); window._gwSetDrum('gw-ncd', nd);
    var ex2 = document.getElementById('gw-expiry-display'); if (ex2) ex2.textContent = 'Next due: ' + nd;
  }
};

window._gwDateToday = function (baseId) {
  var t = new Date(), nd = String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0') + '/' + t.getFullYear();
  if (baseId === 'gw-cert-date') {
    gwSet('certDate', nd); var nx = oneYearMinusOneDayUK(nd); gwSet('nextCheckDate', nx);
    window._gwSetDrum('gw-cert-date', nd); window._gwSetDrum('gw-ncd', nx);
    var ex = document.getElementById('gw-expiry-display'); if (ex) ex.textContent = 'Next due: ' + nx;
    var cd = document.getElementById('gw-cert-date-display'); if (cd) cd.textContent = _gwFmtDateWithDay(nd);
  } else { gwSet('nextCheckDate', nd); window._gwSetDrum('gw-ncd', nd); }
};

window._gwDateSetNcd12m = function () {
  var cd = _gw.certDate; if (!cd || cd.length !== 10) return;
  var nx = oneYearMinusOneDayUK(cd); gwSet('nextCheckDate', nx); window._gwSetDrum('gw-ncd', nx);
  var ex = document.getElementById('gw-expiry-display'); if (ex) ex.textContent = 'Next due: ' + nx;
};

function _gwFmtDateWithDay(dateStr) {
  if (!dateStr || dateStr.length < 8) return dateStr || '';
  var p = dateStr.split('/'); if (p.length !== 3) return dateStr;
  var d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  if (isNaN(d.getTime())) return dateStr;
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var mns = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return days[d.getDay()] + ', ' + parseInt(p[0]) + ' ' + mns[d.getMonth()] + ' ' + p[2];
}

export function _gwUpdateTitle() {
  var refEl = document.getElementById('gas-form-ref'); if (!refEl || state.editingGasId) return;
  var addr = (_gw.installAddr1 || '').trim(), pc = (_gw.installPostcode || '').trim();
  if (state.cachedNextGasSerial) {
    var s = _refSettings('gas');
    var yy = String(new Date().getFullYear()).slice(-2);
    var score = _pcScore(pc);
    var addrPart = addr ? _refAddrPart(addr) : '';
    refEl.textContent = s.prefix + state.cachedNextGasSerial + yy + (score ? score : '') + (addrPart ? ' / ' + addrPart : '');
  } else {
    refEl.textContent = [addr, pc].filter(Boolean).join(' · ') || 'CP12 · Draft';
  }
}

window.gwSetAppFlue = function (i, ft) {
  gwSetApp(i, 'flueType', ft);
  var card = document.querySelector('[data-gw-app="' + i + '"]');
  if (!card) { gwRender(); return; }
  card.querySelectorAll('[data-gw-flue]').forEach(function (chip) { chip.classList.toggle('sel', chip.getAttribute('data-gw-flue') === ft); });
};

window.gwSetAppCO = function (i, field, v) {
  gwSetApp(i, field, v);
  var card = document.querySelector('[data-gw-app="' + i + '"]');
  if (!card) { gwRender(); return; }
  var chips = card.querySelectorAll('[data-gw-co-field="' + field + '"]');
  if (!chips.length) { gwRender(); return; }
  chips.forEach(function (chip) { chip.classList.toggle('sel', chip.getAttribute('data-gw-co-val') === v); });
};

function _gwFillAppliance(i, rec) {
  if (!_gw.appliances[i]) return;
  gwSetApp(i, 'type', rec.name || '');
  if (rec.manufacturer) gwSetApp(i, 'make', rec.manufacturer);
  if (rec.model) gwSetApp(i, 'model', rec.model);
  var card = document.querySelector('[data-gw-app="' + i + '"]');
  if (!card) { gwRender(); return; }
  var typeEl = card.querySelector('[data-gw-type]'); var makeEl = card.querySelector('[data-gw-make]'); var modelEl = card.querySelector('[data-gw-model]');
  if (typeEl) typeEl.value = rec.name || '';
  if (makeEl && rec.manufacturer) makeEl.value = rec.manufacturer;
  if (modelEl && rec.model) modelEl.value = rec.model;
  gwAutoFlue(i, rec.name || '');
  if (typeof _fillToast === 'function') _fillToast('Appliance'); // still global
}

// ── GW WIZARD STATE + STEPS ───────────────────────────────

// _gw is module-level, not exported (internal to wizard)
var _gw = {};
var _GW_STEPS = ['Dates', 'Property', 'Landlord', 'Appliances', 'Work & Defects', 'Review'];
var _GW_PIPE_LABELS = ['Gas Tightness Test', 'Standing / Working Pressure', 'Visual Inspection of Installation', 'Meter / Governor Condition', 'Emergency Control Valve Accessible'];
var _GW_PIPE_FIELDS = ['pipe_gas_tight', 'pipe_pressure', 'pipe_visual', 'pipe_meter', 'pipe_emergency'];
var _GW_FLUE = ['RS', 'FL'];

export function gwInitState() {
  var t = new Date();
  var dd = String(t.getDate()).padStart(2, '0'), mm = String(t.getMonth() + 1).padStart(2, '0'), yyyy = t.getFullYear();
  var today = dd + '/' + mm + '/' + yyyy;
  _gw = {
    step: 0,
    certDate: today,
    nextCheckDate: oneYearMinusOneDayUK(today),
    installAddr1: '', installAddr2: '', installAddr3: '', installPostcode: '',
    landlordName: '', landlordAddr1: '', landlordAddr2: '', landlordAddr3: '', landlordPostcode: '',
    recipientEmail: getSetting('gas_client_email_default', getSetting('el_client_email_default', '')),
    engineerName: getSetting('gas_default_engineer', ''),
    gasSafeNo: getSetting('gas_safe_no', ''),
    licenceNo: getSetting('gas_licence', ''),
    appliances: [{ location: '', type: '', make: '', model: '', flueType: 'RS', combustionReading: 'N/A', coFitted: 'Yes', coInDate: 'Yes', coTest: 'Yes' }],
    defects: [],
    workDetails: 'Annual gas safety inspection and landlord gas safety record (CP12) completed.',
    remedialAction: 'N/A'
  };
}

export function gwRender() {
  var body = document.getElementById('gw-body'); if (!body) return;
  var s = _gw.step, total = _GW_STEPS.length;
  function esc(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var pct = Math.round(s / (total - 1) * 100);
  var html = '<div style="padding:20px 20px 0">'
    + '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px">'
    + '<div style="height:4px;border-radius:2px;background:var(--accent,#b91c1c);width:' + pct + '%;transition:width .3s"></div></div>'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:18px">Step ' + (s + 1) + ' of ' + total + ' — ' + _GW_STEPS[s] + '</div>';
  if (s === 0) {
    html += '<div class="elwiz-q">Certificate dates</div>'
      + '<div class="elwiz-sub">When was the inspection carried out?</div>'
      + '<label class="elwiz-input-label">Date of inspection</label>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'
      + '<button type="button" class="elwiz-chip sel" onclick="_gwDateToday(\'gw-cert-date\')" style="padding:5px 11px;font-size:12px">Today</button>'
      + '<button type="button" class="elwiz-chip" onclick="_gwDateAdjust(\'gw-cert-date\',-1)" style="padding:5px 11px;font-size:12px">← Prev</button>'
      + '<button type="button" class="elwiz-chip" onclick="_gwDateAdjust(\'gw-cert-date\',1)" style="padding:5px 11px;font-size:12px">Next →</button>'
      + '</div>'
      + _gwDrumPickerHTML('gw-cert-date', _gw.certDate)
      + '<div id="gw-cert-date-display" style="font-size:12px;font-weight:600;color:var(--accent);margin-top:6px;padding:5px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border)">' + _gwFmtDateWithDay(_gw.certDate) + '</div>'
      + '<div id="gw-expiry-display" style="font-size:12px;color:var(--muted);margin-top:4px;margin-bottom:14px;padding:6px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border)">Next due: ' + esc(_gw.nextCheckDate) + '</div>'
      + '<label class="elwiz-input-label">Next inspection due</label>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'
      + '<button type="button" class="elwiz-chip sel" onclick="_gwDateSetNcd12m()" style="padding:5px 11px;font-size:12px">12 months</button>'
      + '<button type="button" class="elwiz-chip" onclick="_gwDateAdjust(\'gw-ncd\',-1)" style="padding:5px 11px;font-size:12px">← Prev</button>'
      + '<button type="button" class="elwiz-chip" onclick="_gwDateAdjust(\'gw-ncd\',1)" style="padding:5px 11px;font-size:12px">Next →</button>'
      + '</div>'
      + _gwDrumPickerHTML('gw-ncd', _gw.nextCheckDate);
  } else if (s === 1) {
    html += '<div class="elwiz-q">Installation address</div>'
      + '<div class="elwiz-sub">Start typing in Address line 1 to search the Directory, or enter manually.</div>'
      + '<label class="elwiz-input-label">Address line 1 <span style="color:var(--error,#b91c1c)">*</span></label>'
      + '<input class="elwiz-input" id="gw-install-a1" placeholder="Street / building" value="' + esc(_gw.installAddr1 || '') + '" oninput="gwSet(\'installAddr1\',this.value)">'
      + '<label class="elwiz-input-label">Address line 2 <small style="font-weight:400;color:var(--muted)">(optional)</small></label>'
      + '<input class="elwiz-input" id="gw-install-a2" placeholder="Area / district" value="' + esc(_gw.installAddr2 || '') + '" oninput="gwSet(\'installAddr2\',this.value)">'
      + '<label class="elwiz-input-label">Town / City <small style="font-weight:400;color:var(--muted)">(optional)</small></label>'
      + '<input class="elwiz-input" id="gw-install-a3" placeholder="Town / city" value="' + esc(_gw.installAddr3 || '') + '" oninput="gwSet(\'installAddr3\',this.value)">'
      + '<label class="elwiz-input-label" style="margin-top:12px">Postcode <span style="color:var(--error,#b91c1c)">*</span></label>'
      + '<input class="elwiz-input" id="gw-install-pc" placeholder="e.g. M1 1AA" style="text-transform:uppercase;max-width:160px" value="' + esc(_gw.installPostcode) + '" oninput="gwSet(\'installPostcode\',this.value.toUpperCase())">';
  } else if (s === 2) {
    html += '<div class="elwiz-q">Landlord / Customer</div>'
      + '<div class="elwiz-sub">Pick from Directory or enter manually.</div>'
      + '<label class="elwiz-input-label">Name</label>'
      + '<input class="elwiz-input" id="gw-landlord-name" placeholder="e.g. John Smith / ABC Properties" value="' + esc(_gw.landlordName || '') + '" oninput="gwSet(\'landlordName\',this.value)">'
      + '<label class="elwiz-input-label" style="margin-top:12px">Address line 1 <span style="color:var(--error,#b91c1c)">*</span></label>'
      + '<input class="elwiz-input" id="gw-landlord-a1" placeholder="Street / building" value="' + esc(_gw.landlordAddr1 || '') + '" oninput="gwSet(\'landlordAddr1\',this.value)">'
      + '<label class="elwiz-input-label">Address line 2 <small style="font-weight:400;color:var(--muted)">(optional)</small></label>'
      + '<input class="elwiz-input" id="gw-landlord-a2" placeholder="Area / district" value="' + esc(_gw.landlordAddr2 || '') + '" oninput="gwSet(\'landlordAddr2\',this.value)">'
      + '<label class="elwiz-input-label">Town / City <small style="font-weight:400;color:var(--muted)">(optional)</small></label>'
      + '<input class="elwiz-input" id="gw-landlord-a3" placeholder="Town / city" value="' + esc(_gw.landlordAddr3 || '') + '" oninput="gwSet(\'landlordAddr3\',this.value)">'
      + '<button type="button" onclick="gwCopyPropToLandlord()" style="margin-top:8px;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);cursor:pointer;font-size:12px">📋 Same as installation address</button>'
      + '<label class="elwiz-input-label" style="margin-top:12px">Postcode <span style="color:var(--error,#b91c1c)">*</span></label>'
      + '<input class="elwiz-input" id="gw-landlord-pc" placeholder="e.g. M1 1AA" style="text-transform:uppercase;max-width:160px" value="' + esc(_gw.landlordPostcode) + '" oninput="gwSet(\'landlordPostcode\',this.value.toUpperCase())">'
      + '<label class="elwiz-input-label" style="margin-top:12px">Email <span style="color:var(--muted);font-weight:400">(cert sent here)</span></label>'
      + '<input class="elwiz-input" id="gw-recipient-email" type="email" placeholder="landlord@email.com" value="' + esc(_gw.recipientEmail) + '" oninput="gwSet(\'recipientEmail\',this.value)">';
  } else if (s === 3) {
    html += '<div class="elwiz-q">Appliances</div>'
      + '<div class="elwiz-sub">Add each gas appliance inspected.</div>';
    (_gw.appliances || []).forEach(function (app, i) {
      var _isCookerHob = /cooker|hob|range|dryer/i.test(app.type || '');
      var _isBoiler = /boiler/i.test(app.type || '') && !_isCookerHob;
      if (_isBoiler && (!app.combustionReading || app.combustionReading === 'N/A' || app.combustionReading === '')) {
        var _lc = localStorage.getItem('gw_last_comb') || '0.0008';
        _gw.appliances[i].combustionReading = _lc;
        app = _gw.appliances[i];
      }
      html += '<div data-gw-app="' + i + '" style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
        + '<span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)">Appliance ' + (i + 1) + '</span>'
        + (i > 0 ? '<span onclick="gwRemoveApp(' + i + ')" style="cursor:pointer;color:var(--muted);font-size:22px;line-height:1">&times;</span>' : '')
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">'
        + '<div><label class="elwiz-input-label">Location</label><input class="elwiz-input" style="margin:0" placeholder="e.g. Kitchen" value="' + esc(app.location || '') + '" oninput="gwSetApp(' + i + ',\'location\',this.value)"></div>'
        + '<div><label class="elwiz-input-label">Type</label><input data-gw-type class="elwiz-input" style="margin:0" placeholder="e.g. Combi Boiler" value="' + esc(app.type || '') + '" oninput="gwSetApp(' + i + ',\'type\',this.value);gwAutoFlue(' + i + ',this.value)"></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
        + '<div><label class="elwiz-input-label">Manufacturer</label><input data-gw-make class="elwiz-input" style="margin:0" placeholder="e.g. Vaillant" value="' + esc(app.make || '') + '" oninput="gwSetApp(' + i + ',\'make\',this.value)"></div>'
        + '<div><label class="elwiz-input-label">Model</label><input data-gw-model class="elwiz-input" style="margin:0" placeholder="e.g. ecoTec Pro" value="' + esc(app.model || '') + '" oninput="gwSetApp(' + i + ',\'model\',this.value)"></div>'
        + '</div>'
        + '<div style="margin-bottom:10px"><label class="elwiz-input-label">Flue type</label><div class="elwiz-chips" style="flex-wrap:wrap">';
      _GW_FLUE.forEach(function (ft) {
        html += '<div class="elwiz-chip' + ((app.flueType || 'RS') === ft ? ' sel' : '') + '" data-gw-flue="' + ft + '" onclick="gwSetAppFlue(' + i + ',\'' + ft + '\')">' + ft + '</div>';
      });
      html += '</div></div>';
      if (_isBoiler) {
        var _lc2 = localStorage.getItem('gw_last_comb') || '0.0008';
        html += '<div data-gw-comb style="margin-bottom:10px"><label class="elwiz-input-label">Combustion analyser reading</label>'
          + '<input class="elwiz-input" id="gw-comb-' + i + '" placeholder="e.g. 0.0008" style="max-width:140px" value="' + esc(app.combustionReading || '') + '" oninput="gwSetApp(' + i + ',\'combustionReading\',this.value)">'
          + '<div style="font-size:11px;color:var(--muted);margin-top:3px">Last recorded: ' + esc(_lc2) + '</div>'
          + '</div>';
      } else {
        html += '<div data-gw-comb style="display:none"></div>';
      }
      html += '<div><label class="elwiz-input-label" style="margin-bottom:6px">CO alarm</label>'
        + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px">';
      [['Fitted', 'coFitted'], ['In date', 'coInDate'], ['Test OK', 'coTest']].forEach(function (info) {
        var lbl = info[0], field = info[1], cur = app[field] || 'Yes';
        html += '<span style="font-size:11px;color:var(--muted);padding:0 2px">' + lbl + ':</span>';
        ['Yes', 'No', 'N/A'].forEach(function (v) {
          html += '<div class="elwiz-chip' + (cur === v ? ' sel' : '') + '" data-gw-co-field="' + field + '" data-gw-co-val="' + v + '" onclick="gwSetAppCO(' + i + ',\'' + field + '\',\'' + v + '\')" style="padding:3px 7px;font-size:11px">' + v + '</div>';
        });
        html += '<span style="width:6px"></span>';
      });
      html += '</div></div></div>';
    });
    if ((_gw.appliances || []).length < 5) {
      html += '<button onclick="gwAddApp()" style="width:100%;padding:10px;border:1.5px dashed var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:13px;margin-top:4px">+ Add Another Appliance</button>';
    }
  } else if (s === 4) {
    html += '<div class="elwiz-q">Work carried out</div>'
      + '<textarea class="elwiz-input" rows="3" style="resize:vertical" oninput="gwSet(\'workDetails\',this.value)">' + esc(_gw.workDetails) + '</textarea>'
      + '<div style="margin-top:20px"><div class="elwiz-q" style="font-size:16px">Defects <span style="font-size:13px;font-weight:400;color:var(--muted)">(optional)</span></div>'
      + '<div class="elwiz-sub">Any defects or safety warnings found.</div>';
    (_gw.defects || []).forEach(function (def, i) {
      html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">'
        + '<div style="display:flex;gap:8px;align-items:center">'
        + '<input class="elwiz-input" style="flex:1;margin:0" placeholder="Defect description" value="' + esc(def.text || '') + '" oninput="gwSetDefect(' + i + ',\'text\',this.value)">'
        + '<span onclick="gwRemoveDefect(' + i + ')" style="cursor:pointer;color:var(--muted);font-size:22px;flex-shrink:0">&times;</span>'
        + '</div>'
        + '<div style="margin-top:8px;display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--muted)">Warning notice:</span>'
        + '<div class="elwiz-chip' + ((def.warn || 'N/A') === 'Yes' ? ' sel' : '') + '" onclick="gwSetDefect(' + i + ',\'warn\',\'Yes\');gwRender()">Yes</div>'
        + '<div class="elwiz-chip' + ((def.warn || 'N/A') === 'N/A' ? ' sel' : '') + '" onclick="gwSetDefect(' + i + ',\'warn\',\'N/A\');gwRender()">N/A</div>'
        + '</div></div>';
    });
    html += '<button onclick="gwAddDefect()" style="width:100%;padding:8px;border:1.5px dashed var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:13px">+ Add Defect</button></div>';
  } else if (s === 5) {
    var appCount = (_gw.appliances || []).filter(function (a) { return a.location || a.type; }).length;
    var defCount = (_gw.defects || []).filter(function (d) { return d.text; }).length;
    html += '<div class="elwiz-q">Review &amp; Issue</div>'
      + '<div class="elwiz-sub">Check the summary then issue the certificate.</div>'
      + '<div style="background:var(--surface2);border-radius:var(--radius);padding:16px;font-size:13px;line-height:2;margin-bottom:20px">'
      + '<b>Date:</b> ' + esc(_gw.certDate || '—') + '<br>'
      + '<b>Next due:</b> ' + esc(_gw.nextCheckDate || '—') + '<br>'
      + '<b>Property:</b> ' + esc(_gw.installAddr1 || '—') + (_gw.installPostcode ? ' · ' + esc(_gw.installPostcode) : '') + '<br>'
      + '<b>Landlord:</b> ' + esc(_gw.landlordName || _gw.landlordAddr1 || '—') + '<br>'
      + '<b>Appliances:</b> ' + appCount + '<br>'
      + '<b>Defects:</b> ' + (defCount || 'None') + '<br>'
      + '<b>Engineer:</b> ' + esc(_gw.engineerName || getSetting('gas_default_engineer', '(from settings)')) + ' <button type="button" onclick="_showEngineerPicker(this,\'gas\')" style="font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);cursor:pointer;margin-left:4px">👤 Change</button><br>'
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="elwiz-next" style="flex:2;min-width:160px;background:var(--success,#16a34a)" onclick="gwIssue()">✓ Issue Gas Certificate</button>'
      + (isAdmin() ? '<button class="elwiz-next" style="flex:1;min-width:120px;background:var(--surface2);color:var(--text);border:1.5px solid var(--border)" onclick="gwPreview()">🔍 Preview PDF</button>' : '')
      + '<button class="elwiz-next" style="flex:1;min-width:100px;background:var(--surface2);color:var(--text);border:1.5px solid var(--border)" onclick="gwSaveDraft()">💾 Save Draft</button>'
      + '</div>';
  }
  if (s < _GW_STEPS.length - 1) {
    html += '<div class="elwiz-nav">'
      + (s > 0 ? '<button class="elwiz-back" onclick="gwBack()">← Back</button>' : '<span></span>')
      + '<button class="elwiz-next" onclick="gwNext()">Next →</button>'
      + '</div>';
  } else {
    html += '<div style="margin-top:12px"><button class="elwiz-back" onclick="gwBack()">← Back</button></div>';
  }
  html += '</div>';
  body.innerHTML = html;
  if (s === 0) setTimeout(_gwInitDrums, 0);
  var wiz = document.getElementById('mobile-gas-wizard');
  if (wiz) wiz.scrollTop = 0;
  gwAttachAC();
}

export function gwAttachAC() {
  if (_gw.step === 1) {
    var ia = document.getElementById('gw-install-a1');
    if (ia && typeof attachDirAC === 'function') attachDirAC(ia, 'properties', _gwFillProperty); // still global
    if (ia) attachAddressAutocomplete(ia, {
      onSelect: function(a) {
        gwSet('installAddr1', a.line1);
        gwSet('installAddr2', [a.line2, a.line3].filter(Boolean).join(', '));
        gwSet('installAddr3', a.town);
        gwSet('installPostcode', a.postcode);
        gwRender();
      }
    });
    var ia2 = document.getElementById('gw-install-a2');
    var ia3 = document.getElementById('gw-install-a3');
    if (ia2) _gwAttachColAC(ia2, 'addr2', function (v) { gwSet('installAddr2', v); ia2.value = v; });
    if (ia3) _gwAttachColAC(ia3, 'town', function (v) { gwSet('installAddr3', v); ia3.value = v; });
  } else if (_gw.step === 2) {
    var ni = document.getElementById('gw-landlord-name');
    var la = document.getElementById('gw-landlord-a1');
    if (ni && typeof attachDirAC === 'function') attachDirAC(ni, 'landlords', _gwFillLandlord);
    if (la && typeof attachDirAC === 'function') attachDirAC(la, 'landlords', _gwFillLandlord);
    if (la) attachAddressAutocomplete(la, {
      onSelect: function(a) {
        gwSet('landlordAddr1', a.line1);
        gwSet('landlordAddr2', [a.line2, a.line3].filter(Boolean).join(', '));
        gwSet('landlordAddr3', a.town);
        gwSet('landlordPostcode', a.postcode);
        gwRender();
      }
    });
  } else if (_gw.step === 3) {
    (_gw.appliances || []).forEach(function (_, i) {
      var card = document.querySelector('[data-gw-app="' + i + '"]'); if (!card) return;
      var typeEl = card.querySelector('[data-gw-type]');
      if (typeEl && typeof attachApplianceAC === 'function') attachApplianceAC(typeEl, function (rec) { _gwFillAppliance(i, rec); }); // still global
    });
  }
}

function _gwAttachColAC(inputEl, col, onPick) {
  if (typeof _acDD === 'undefined' && typeof _initAcDD === 'function') _initAcDD(); // still global
  if (inputEl._acColAttached) return; inputEl._acColAttached = true;
  inputEl.addEventListener('input', function () {
    var q = (inputEl.value || '').trim();
    if (q.length < 2) { if (typeof _hideAcDD === 'function') _hideAcDD(); return; }
    var props = (typeof _dir !== 'undefined' && _dir && _dir.properties) || []; // _dir still global
    var seen = new Set(), items = [];
    props.forEach(function (r) {
      var v = (col === 'addr2' ? r.addr2 : r.town) || '';
      v = v.trim();
      if (!v || !v.toLowerCase().startsWith(q.toLowerCase())) return;
      if (seen.has(v.toLowerCase())) return;
      seen.add(v.toLowerCase());
      items.push({ _colVal: v });
    });
    if (!items.length) { if (typeof _hideAcDD === 'function') _hideAcDD(); return; }
    if (typeof _acItems === 'undefined') return;
    window._acItems = items.slice(0, 8);
    var html = '<div style="padding:4px 14px;text-align:right;border-bottom:1px solid var(--border)"><button onclick="_hideAcDD()" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--muted);padding:2px 6px">✕ Close</button></div>';
    html += window._acItems.map(function (item, idx) {
      return '<div class="ac-item" data-idx="' + idx + '" onclick="_acPick(' + idx + ')" style="padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;font-weight:500;color:var(--text)">' + (typeof _hlText === 'function' ? _hlText(item._colVal, q) : item._colVal) + '</div>';
    }).join('');
    if (typeof _acDD !== 'undefined' && _acDD) {
      _acDD.innerHTML = html;
      _acDD._onSelect = function (item) { onPick(item._colVal); };
      _acDD._type = ''; window._acCurInput = inputEl; window._acIdx = -1;
      if (typeof _posAcDD === 'function') _posAcDD(inputEl);
    }
  });
  inputEl.addEventListener('keydown', typeof _acKbd !== 'undefined' ? _acKbd : function () {}); // still global
}

function _gwInstallAddr() { return [_gw.installAddr1, _gw.installAddr2, _gw.installAddr3].filter(Boolean).join('\n'); }

function _gwFillProperty(rec) {
  var a1 = rec.addr1 || '', a2 = rec.addr2 || '', a3 = [rec.town, rec.county].filter(Boolean).join(', ');
  gwSet('installAddr1', a1); gwSet('installAddr2', a2); gwSet('installAddr3', a3); gwSet('installPostcode', rec.postcode || '');
  var e1 = document.getElementById('gw-install-a1'); var e2 = document.getElementById('gw-install-a2');
  var e3 = document.getElementById('gw-install-a3'); var pc = document.getElementById('gw-install-pc');
  if (e1) e1.value = a1; if (e2) e2.value = a2; if (e3) e3.value = a3; if (pc) pc.value = rec.postcode || '';
  if (typeof _fillToast === 'function') _fillToast('Property address'); // still global
  if (typeof _offerLinkedContacts === 'function') _offerLinkedContacts(rec, 'gw'); // still global
}

function _gwLandlordAddr() { return [_gw.landlordAddr1, _gw.landlordAddr2, _gw.landlordAddr3].filter(Boolean).join('\n'); }

function _gwFillLandlord(rec) {
  var name = rec.landlord_name || rec.company_name || '';
  var a1 = rec.addr1 || '', a2 = rec.addr2 || '', a3 = [rec.town, rec.county].filter(Boolean).join(', ');
  gwSet('landlordName', name); gwSet('landlordAddr1', a1); gwSet('landlordAddr2', a2); gwSet('landlordAddr3', a3); gwSet('landlordPostcode', rec.postcode || '');
  if (rec.email) gwSet('recipientEmail', rec.email);
  var ni = document.getElementById('gw-landlord-name');
  var e1 = document.getElementById('gw-landlord-a1'); var e2 = document.getElementById('gw-landlord-a2');
  var e3 = document.getElementById('gw-landlord-a3'); var pc = document.getElementById('gw-landlord-pc'); var em = document.getElementById('gw-recipient-email');
  if (ni) ni.value = name; if (e1) e1.value = a1; if (e2) e2.value = a2; if (e3) e3.value = a3; if (pc) pc.value = rec.postcode || ''; if (em && rec.email) em.value = rec.email;
  if (typeof _fillToast === 'function') _fillToast('Landlord'); // still global
}

export function gwCopyPropToLandlord() {
  if (!(_gw.installAddr1 || _gw.installAddr2 || _gw.installAddr3)) return;
  gwSet('landlordAddr1', _gw.installAddr1 || '');
  gwSet('landlordAddr2', _gw.installAddr2 || '');
  gwSet('landlordAddr3', _gw.installAddr3 || '');
  gwSet('landlordPostcode', _gw.installPostcode || '');
  gwRender();
}

export function gwSet(f, v) { _gw[f] = v; _gwUpdateTitle(); }
export function gwSetPipe(i, v) { _gw.pipework[i] = v; gwRender(); }
export function gwSetApp(i, f, v) { if (_gw.appliances[i]) _gw.appliances[i][f] = v; }

export function gwAutoFlue(i, typeVal) {
  var t = (typeVal || '').toLowerCase();
  var ft = null, isCookerHob = false, isBoiler = false;
  if (/back\s*boiler/.test(t)) { ft = 'OF'; }
  else if (/combi|system\s*boiler|condensing|warm\s*air|water\s*heater|boiler/.test(t)) { ft = 'RS'; isBoiler = true; }
  else if (/fire|open\s*fire/.test(t)) { ft = 'OF'; }
  else if (/cooker|hob|range|dryer/.test(t)) { ft = 'FL'; isCookerHob = true; }
  if (!ft || !_gw.appliances[i]) return;
  _gw.appliances[i].flueType = ft;
  if (isCookerHob) { _gw.appliances[i].combustionReading = 'N/A'; }
  else if (isBoiler && (_gw.appliances[i].combustionReading === 'N/A' || !_gw.appliances[i].combustionReading)) {
    _gw.appliances[i].combustionReading = localStorage.getItem('gw_last_comb') || '0.0008';
  }
  var card = document.querySelector('[data-gw-app="' + i + '"]');
  if (!card) { gwRender(); return; }
  card.querySelectorAll('[data-gw-flue]').forEach(function (chip) { chip.classList.toggle('sel', chip.getAttribute('data-gw-flue') === ft); });
  var combDiv = card.querySelector('[data-gw-comb]');
  if (combDiv) {
    if (isBoiler) {
      var _lc2 = localStorage.getItem('gw_last_comb') || '0.0008';
      var _cv = _gw.appliances[i].combustionReading || '';
      if (!combDiv.querySelector('input')) {
        combDiv.innerHTML = '<label class="elwiz-input-label">Combustion analyser reading</label>'
          + '<input class="elwiz-input" id="gw-comb-' + i + '" placeholder="e.g. 0.0008" style="max-width:140px" value="' + _cv + '" oninput="gwSetApp(' + i + ',\'combustionReading\',this.value)">'
          + '<div style="font-size:11px;color:var(--muted);margin-top:3px">Last recorded: ' + _lc2 + '</div>';
      } else {
        var inp = combDiv.querySelector('input'); if (inp) inp.value = _cv;
        var hint = combDiv.querySelector('div'); if (hint) hint.textContent = 'Last recorded: ' + _lc2;
      }
      combDiv.style.display = '';
    } else { combDiv.style.display = 'none'; }
  }
}

export function gwSetDefect(i, f, v) { if (_gw.defects[i]) _gw.defects[i][f] = v; }
export function gwAddApp() { if ((_gw.appliances || []).length >= 5) return; _gw.appliances.push({ location: '', type: '', make: '', model: '', flueType: 'RS', combustionReading: 'N/A', coFitted: 'Yes', coInDate: 'Yes', coTest: 'Yes' }); gwRender(); }
export function gwRemoveApp(i) { _gw.appliances.splice(i, 1); gwRender(); }
export function gwAddDefect() { _gw.defects.push({ text: '', warn: 'N/A' }); gwRender(); }
export function gwRemoveDefect(i) { _gw.defects.splice(i, 1); gwRender(); }

export function gwNext() {
  if (_gw.step === 1) {
    if (!(_gw.installAddr1 || '').trim()) { toast('Installation address line 1 is required', 'warn'); return; }
    if (!(_gw.installPostcode || '').trim()) { toast('Installation postcode is required', 'warn'); return; }
  }
  if (_gw.step === 2) {
    if (!(_gw.landlordAddr1 || '').trim()) { toast('Landlord address line 1 is required', 'warn'); return; }
    if (!(_gw.landlordPostcode || '').trim()) { toast('Landlord postcode is required', 'warn'); return; }
  }
  if (_gw.step < _GW_STEPS.length - 1) {
    _gw.step++;
    if (_gw.step === 2 && !(_gw.landlordAddr1 || '').trim()) {
      _gw.landlordAddr1    = _gw.installAddr1    || '';
      _gw.landlordAddr2    = _gw.installAddr2    || '';
      _gw.landlordAddr3    = _gw.installAddr3    || '';
      _gw.landlordPostcode = _gw.installPostcode || '';
    }
    gwRender();
  }
}

export function gwBack() { if (_gw.step > 0) { _gw.step--; gwRender(); } }

export function gwSyncToCP12() {
  setCP12Field('cert_date', _gw.certDate || '');
  setCP12Field('next_check_date', _gw.nextCheckDate || '');
  setCP12Field('issuer_name', _gw.engineerName || '');
  setCP12Field('gas_safe_no', _gw.gasSafeNo || '');
  setCP12Field('landlord_ref', _gw.licenceNo || '');
  setCP12Field('install_address', _gwInstallAddr());
  setCP12Field('install_postcode', _gw.installPostcode || '');
  var _gwln = (_gw.landlordName || '').trim(), _gwla = _gwLandlordAddr().trim();
  setCP12Field('landlord_address', _gwln && _gwla ? _gwln + '\n' + _gwla : _gwln || _gwla);
  setCP12Field('landlord_postcode', _gw.landlordPostcode || '');
  setCP12Field('recipient_email', _gw.recipientEmail || '');
  setCP12Field('work_details', _gw.workDetails || '');
  setCP12Field('remedial_action', _gw.remedialAction || 'N/A');
  _GW_PIPE_FIELDS.forEach(function (f) { setCP12Field(f, '✓'); });
  var apps = (_gw.appliances || []).filter(function (a) { return a.location || a.type; });
  for (var n = 1; n <= 5; n++) {
    var card = document.getElementById('cp12App' + n); if (!card) continue;
    var isDisabled = card.classList.contains('is-disabled');
    if (n > apps.length) { if (!isDisabled) toggleCP12AppRow(n); }
    else {
      if (isDisabled) toggleCP12AppRow(n);
      var app = apps[n - 1];
      setCP12Field('app' + n + '_location', app.location || '');
      setCP12Field('app' + n + '_type', app.type || '');
      setCP12Field('app' + n + '_make', app.make || '');
      setCP12Field('app' + n + '_model', app.model || '');
      setCP12Field('app' + n + '_flue_type', app.flueType || 'RS');
      setCP12Field('app' + n + '_op_pressure', '20 mbar');
      setCP12Field('app' + n + '_ownership', 'Yes');
      setCP12Field('app' + n + '_inspected', 'Yes');
      setCP12Field('app' + n + '_safety_dev', 'Pass');
      setCP12Field('app' + n + '_vent', 'Pass');
      var _appIsCH = /cooker|hob|range|dryer/i.test(app.type || '');
      setCP12Field('app' + n + '_visual', _appIsCH ? 'N/A' : 'Pass');
      setCP12Field('app' + n + '_flue_flow', _appIsCH ? 'N/A' : 'Pass');
      setCP12Field('app' + n + '_serviced', 'No');
      setCP12Field('app' + n + '_combustion', /boiler/i.test(app.type || '') ? app.combustionReading || 'N/A' : 'N/A');
      if (/boiler/i.test(app.type || '') && app.combustionReading && app.combustionReading !== 'N/A') localStorage.setItem('gw_last_comb', app.combustionReading);
      setCP12Field('app' + n + '_safe_to_use', 'Yes');
      setCP12Field('app' + n + '_co_fitted', app.coFitted || 'Yes');
      setCP12Field('app' + n + '_co_in_date', app.coInDate || 'Yes');
      setCP12Field('app' + n + '_co_test', app.coTest || 'Yes');
    }
  }
  var defs = (_gw.defects || []).filter(function (d) { return d.text; });
  for (var di = 1; di <= 5; di++) {
    setCP12Field('defect_' + di, di <= defs.length ? (defs[di - 1].text || 'N/A') : 'N/A');
    setCP12Field('defect_warn_' + di, di <= defs.length ? (defs[di - 1].warn || 'N/A') : 'N/A');
  }
}

export async function gwIssue() {
  gwSyncToCP12();
  var wiz = document.getElementById('mobile-gas-wizard'); if (wiz) wiz.hidden = true;
  var wrap = document.getElementById('cp12Wrap');
  if (wrap && isAdmin()) wrap.style.display = '';
  await completeGas();
}

export function gwPreview() {
  gwSyncToCP12();
  var wiz = document.getElementById('mobile-gas-wizard'); if (wiz) wiz.hidden = true;
  var wrap = document.getElementById('cp12Wrap'); if (wrap) wrap.style.display = '';
}

export async function gwSaveDraft() {
  gwSyncToCP12();
  await saveGas(true);
  toast('Draft saved', 'success', 2000);
}
