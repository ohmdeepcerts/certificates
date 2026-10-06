// ============================================================
//  cp12.js — CP12 form: fields, appliance cards, lifecycle,
//            validation, data bridge, init
// ============================================================
import { sb } from '../../lib/supabase.js';
import { getSetting } from '../../lib/settings.js';
import { toast, showOverlay, hideOverlay } from '../../lib/utils.js';
import { state, isAdmin } from '../../lib/state.js';
import { buildCertRefSeq, _refSettings, _pcScore, _refAddrPart, _extractPC } from '../_core/refgen.js';
import { navigate } from '../../nav/navigation.js';
// Circular-safe: wizard.js imports { saveGas, completeGas, setCP12Field, toggleCP12AppRow } from here.
// These imports are used only inside function bodies — never at module init time.
import { gwRender, gwInitState, _gwUpdateTitle, mgwSyncToDesktopForm, mgwActive } from './wizard.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
import { doGasPreview, _applyCP12Zoom } from './preview.js';
import { emailGas } from './history.js';

// ── CP12 choice cycles ────────────────────────────────────

export function cycleCP12Choice(btn) {
  const opts = (btn.dataset.options || '✓,✕,N/A').split(',');
  const grp = btn.dataset.group;
  if (grp) {
    const hi = btn.closest('.choice-group') && btn.closest('.choice-group').querySelector(`[data-field="${grp}"]`);
    const cur = opts.indexOf(hi ? hi.value : '');
    const next = opts[(cur + 1) % opts.length];
    btn.textContent = next;
    if (hi) hi.value = next;
  } else {
    const cur = opts.indexOf(btn.dataset.current || '');
    const next = opts[(cur + 1) % opts.length];
    btn.dataset.current = next; btn.textContent = next;
  }
}

export function refreshChoiceGroups() {
  document.querySelectorAll('#cp12Wrap .choice-cycle[data-group]').forEach(btn => {
    const grp = btn.dataset.group;
    const hi = btn.closest('.choice-group') && btn.closest('.choice-group').querySelector(`[data-field="${grp}"]`);
    if (hi) btn.textContent = hi.value || (btn.dataset.options || '').split(',')[0] || '';
    else btn.textContent = (btn.dataset.options || '').split(',')[0] || '';
  });
}

// ── CP12 fast date input ──────────────────────────────────

export function attachFastDateInput(el) {
  el.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '');
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
    if (v.length >= 5) v = v.slice(0, 5) + '/' + v.slice(5);
    this.value = v.slice(0, 10);
  });
  el.addEventListener('click', function () {
    if (typeof openDateDrum === 'function') openDateDrum(this); // still global
  });
  el.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (typeof openDateDrum === 'function') openDateDrum(this);
  }, { passive: false });
}

export function oneYearMinusOneDayUK(val) {
  if (!val || val.length < 10) return '';
  const p = val.split('/'); if (p.length < 3) return '';
  let d = parseInt(p[0]), m = parseInt(p[1]), y = parseInt(p[2]);
  y++; d--;
  if (d === 0) { m--; if (m === 0) { m = 12; y--; } d = new Date(y, m, 0).getDate(); }
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// ── CP12 helpers ──────────────────────────────────────────

export function copyInstallationToLandlord() {
  const la = document.querySelector('[data-field="landlord_address"]');
  const lp = document.querySelector('[data-field="landlord_postcode"]');
  const ia = document.querySelector('[data-field="install_address"]');
  const ip = document.querySelector('[data-field="install_postcode"]');
  if (la && ia) {
    if (la.dataset.composite === 'll') {
      const ni = la.querySelector('#cp12-ll-name');
      const ta = la.querySelector('textarea');
      if (ni) ni.value = '';
      if (ta) { ta.value = ia.value || ''; _cp12ResizeTA(ta); }
    } else {
      la.value = ia.value;
    }
  }
  if (lp && ip) lp.value = ip.value;
}

export function cp12Field(f) {
  const el = document.querySelector(`[data-field="${f}"]`); if (!el) return '';
  if (el.tagName === 'BUTTON') return el.dataset.current || '';
  if (el.dataset.composite === 'll') {
    const nm = (el.querySelector('#cp12-ll-name') || {}).value || '';
    const addr = (el.querySelector('textarea') || {}).value || '';
    return nm && addr ? nm + '\n' + addr : nm || addr;
  }
  return el.value || '';
}

export function _cp12ResizeTA(el, fromUser) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  const _cs = getComputedStyle(el);
  const _maxH = parseFloat(_cs.maxHeight) || 9999;
  const _padV = parseFloat(_cs.paddingTop) + parseFloat(_cs.paddingBottom);
  const _contentH = el.scrollHeight - _padV;
  if (fromUser && _contentH > _maxH) {
    el.value = el._cp12Prev != null ? el._cp12Prev : '';
    el.style.height = 'auto';
  } else {
    if (_contentH <= _maxH) el._cp12Prev = el.value;
  }
  const _finalH = el.scrollHeight - _padV;
  const _h = Math.min(_finalH, _maxH);
  el.style.height = _h + 'px';
  const _cell = el.closest('.appliance-value-cell');
  if (_cell) _cell.style.minHeight = (_h + _padV) + 'px';
}

export function setCP12Field(f, v) {
  const el = document.querySelector(`[data-field="${f}"]`); if (!el) return;
  if (el.tagName === 'BUTTON') { el.dataset.current = v; el.textContent = v; }
  else if (el.dataset.composite === 'll') {
    const lns = (v || '').split('\n'); const fl = (lns[0] || '').trim();
    let nm = '', addr = '';
    if (fl && !(/^\d/.test(fl) || /^flat\s/i.test(fl) || /^apt\s/i.test(fl))) {
      nm = fl; addr = lns.slice(1).join('\n');
    } else { nm = ''; addr = v || ''; }
    const ni = el.querySelector('#cp12-ll-name'); if (ni) ni.value = nm;
    const ta = el.querySelector('textarea'); if (ta) { ta.value = addr; _cp12ResizeTA(ta); }
  } else {
    el.value = v || '';
    if (el.tagName === 'TEXTAREA') _cp12ResizeTA(el);
    if (el.type === 'hidden') {
      const btn = el.closest('.choice-group') && el.closest('.choice-group').querySelector(`.choice-cycle[data-group="${f}"]`);
      if (btn) btn.textContent = v || (btn.dataset.options || '').split(',')[0] || '';
    }
  }
}

// ── CP12 appliance cards ──────────────────────────────────

export function buildCP12ApplianceCards() {
  const container = document.getElementById('applianceCards'); if (!container) return;
  container.innerHTML = '';
  for (let n = 1; n <= 5; n++) container.insertAdjacentHTML('beforeend', buildSingleCP12ApplianceCard(n));
}

function _cc(field, opts) {
  return `<div class="appliance-value-cell choice-cell"><div class="choice-group"><button type="button" class="choice-cycle" data-group="${field}" data-options="${opts}" onclick="cycleCP12Choice(this)"></button><input type="hidden" data-field="${field}"></div></div>`;
}

export function buildSingleCP12ApplianceCard(n) {
  return `<div class="appliance-card" id="cp12App${n}" data-appliance-row="${n}">
    <div class="appliance-main-shell"><div class="appliance-value-row">
      <div class="appliance-value-cell number-cell no-print-toggle" onclick="toggleCP12AppRow(${n})" title="Tap to disable this appliance" style="cursor:pointer"><input class="appliance-number-input" value="${n}" readonly tabindex="-1" style="pointer-events:none;width:100%"></div>
      <div class="appliance-value-cell location"><textarea data-field="app${n}_location" placeholder="Location" rows="1"></textarea></div>
      <div class="appliance-value-cell type"><textarea data-field="app${n}_type" placeholder="Type" rows="1"></textarea></div>
      <div class="appliance-value-cell make"><textarea data-field="app${n}_make" placeholder="Manufacturer" rows="1"></textarea></div>
      <div class="appliance-value-cell model"><textarea data-field="app${n}_model" placeholder="Model" rows="1"></textarea></div>
      ${_cc(`app${n}_ownership`, 'Yes,No')}
      ${_cc(`app${n}_inspected`, 'Yes,No')}
      <div class="appliance-value-cell"><input type="text" data-field="app${n}_flue_type" placeholder="FL"></div>
      <div class="appliance-value-cell"><input type="text" data-field="app${n}_op_pressure" placeholder="20 mbar"></div>
      ${_cc(`app${n}_safety_dev`, 'Pass,Fail,N/A')}
      ${_cc(`app${n}_vent`, 'Pass,Fail,N/A')}
      ${_cc(`app${n}_visual`, 'N/A,Pass,Fail')}
      ${_cc(`app${n}_flue_flow`, 'N/A,Pass,Fail')}
      <div class="appliance-value-cell"><input type="text" data-field="app${n}_combustion" placeholder="N/A"></div>
      ${_cc(`app${n}_serviced`, 'No,Yes')}
      ${_cc(`app${n}_safe_to_use`, 'Yes,No')}
    </div></div>
    <div class="appliance-co-row">
      <span class="appliance-co-label">CO Alarm</span>
      <div class="appliance-co-item">Approved CO Alarm Fitted? ${_cc(`app${n}_co_fitted`, 'Yes,No')}</div>
      <div class="appliance-co-item">Is CO Alarm in Date? ${_cc(`app${n}_co_in_date`, 'Yes,No,N/A')}</div>
      <div class="appliance-co-item">CO Alarm Test Satisfactory? ${_cc(`app${n}_co_test`, 'Yes,No,N/A')}</div>
    </div>
  </div>`;
}

export function toggleCP12AppRow(n) {
  const card = document.getElementById(`cp12App${n}`); if (!card) return;
  card.classList.toggle('is-disabled');
  updateAddApplianceBtn();
}

export function addNextApplianceRow() {
  for (let n = 1; n <= 5; n++) {
    const c = document.getElementById(`cp12App${n}`);
    if (c && c.classList.contains('is-disabled')) { toggleCP12AppRow(n); return; }
  }
}

export function updateAddApplianceBtn() {
  const btn = document.getElementById('btn-add-appliance'); if (!btn) return;
  let hasDisabled = false;
  for (let n = 1; n <= 5; n++) { const c = document.getElementById(`cp12App${n}`); if (c && c.classList.contains('is-disabled')) { hasDisabled = true; break; } }
  btn.hidden = !hasDisabled;
}

// ── CP12 data bridge ──────────────────────────────────────

export function collectCP12FormData() {
  const toISO = uk => { if (!uk || uk.length < 10) return null; const p = uk.split('/'); if (p.length < 3) return null; return `${p[2]}-${p[1]}-${p[0]}`; };
  const appliances = [];
  for (let n = 1; n <= 5; n++) {
    const card = document.getElementById(`cp12App${n}`);
    if (card && !card.classList.contains('is-disabled')) {
      const loc = cp12Field(`app${n}_location`), type = cp12Field(`app${n}_type`);
      if (loc || type) appliances.push({
        location: loc, type, make: cp12Field(`app${n}_make`), model: cp12Field(`app${n}_model`),
        flue_type: cp12Field(`app${n}_flue_type`),
        ownership: cp12Field(`app${n}_ownership`), inspected: cp12Field(`app${n}_inspected`),
        op_pressure: cp12Field(`app${n}_op_pressure`),
        safety_devices: cp12Field(`app${n}_safety_dev`),
        ventilation: cp12Field(`app${n}_vent`),
        visual_condition: cp12Field(`app${n}_visual`),
        flue_flow: cp12Field(`app${n}_flue_flow`),
        combustion: cp12Field(`app${n}_combustion`),
        serviced: cp12Field(`app${n}_serviced`),
        safe_to_use: cp12Field(`app${n}_safe_to_use`),
        co_alarm_fitted: cp12Field(`app${n}_co_fitted`),
        co_alarm_in_date: cp12Field(`app${n}_co_in_date`),
        co_alarm_test: cp12Field(`app${n}_co_test`),
      });
    }
  }
  const defects = [];
  for (let i = 1; i <= 5; i++) {
    const desc = cp12Field(`defect_${i}`); const warn = cp12Field(`defect_warn_${i}`);
    if (desc) defects.push({ description: desc, warning_notice: warn !== 'N/A', warning_type: warn });
  }
  const getSig = fieldKey => {
    const c = document.querySelector(`[data-sig-field="${fieldKey}"]`); if (!c) return null;
    const ctx = c.getContext('2d'); const id = ctx.getImageData(0, 0, c.width, c.height);
    return Array.from(id.data).some((v, i) => i % 4 !== 3 && v !== 0) ? c.toDataURL('image/png') : null;
  };
  const certDate = cp12Field('cert_date'); const nextDate = cp12Field('next_check_date');
  return {
    cert_date: toISO(certDate) || certDate, next_check_date: toISO(nextDate) || nextDate,
    engineer: cp12Field('issuer_name'), engineer_licence_no: cp12Field('landlord_ref'),
    gas_safe_no: cp12Field('gas_safe_no'), business_address: cp12Field('business_address'),
    business_phone: cp12Field('business_phone'), business_email: cp12Field('business_email'),
    business_postcode: cp12Field('business_postcode'),
    landlord_address: cp12Field('landlord_address'), landlord_postcode: cp12Field('landlord_postcode'),
    install_address: cp12Field('install_address'), install_postcode: cp12Field('install_postcode'),
    work_details: cp12Field('work_details'), remedial_action: cp12Field('remedial_action'),
    pipework: [cp12Field('pipe_gas_tight'), cp12Field('pipe_pressure'), cp12Field('pipe_visual'), cp12Field('pipe_meter'), cp12Field('pipe_emergency')],
    appliances, defects,
    sig_issued_name: cp12Field('issuer_name'), sig_issued_image: getSig('sig_issued'),
    sig_received_name: cp12Field('receiver_name'), sig_received_image: getSig('sig_received'),
    recipient_email: cp12Field('recipient_email'),
  };
}

export function populateCP12Form(r) {
  const toUK = iso => {
    if (!iso) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
    return iso;
  };
  setCP12Field('cert_date', toUK(r.cert_date)); setCP12Field('next_check_date', toUK(r.next_check_date));
  setCP12Field('issuer_name', r.engineer || r.sig_issued_name || ''); setCP12Field('landlord_ref', r.engineer_licence_no || '');
  setCP12Field('gas_safe_no', r.gas_safe_no || ''); setCP12Field('business_address', r.business_address || '');
  setCP12Field('business_phone', r.business_phone || ''); setCP12Field('business_email', r.business_email || '');
  setCP12Field('business_postcode', r.business_postcode || '');
  setCP12Field('landlord_address', r.landlord_address || ''); setCP12Field('landlord_postcode', r.landlord_postcode || '');
  setCP12Field('install_address', r.install_address || ''); setCP12Field('install_postcode', r.install_postcode || '');
  setCP12Field('work_details', r.work_details || ''); setCP12Field('remedial_action', r.remedial_action || '');
  setCP12Field('receiver_name', r.sig_received_name || '');
  setCP12Field('recipient_email', r.recipient_email || '');
  const ref = r.ref_number || r.base_ref || '';
  setCP12Field('cert_ref', ref); setCP12Field('cert_ref_p2', ref);
  const pf = ['pipe_gas_tight', 'pipe_pressure', 'pipe_visual', 'pipe_meter', 'pipe_emergency'];
  (r.pipework || []).forEach((v, i) => { if (pf[i]) setCP12Field(pf[i], v); });
  (r.defects || []).forEach((d, i) => {
    if (i < 5) { setCP12Field(`defect_${i + 1}`, d.description || ''); setCP12Field(`defect_warn_${i + 1}`, d.warning_type || (d.warning_notice ? 'Yes' : 'N/A')); }
  });
  (r.appliances || []).forEach((a, i) => {
    const n = i + 1; if (n > 5) return;
    setCP12Field(`app${n}_location`, a.location || ''); setCP12Field(`app${n}_type`, a.type || '');
    setCP12Field(`app${n}_make`, a.make || ''); setCP12Field(`app${n}_model`, a.model || '');
    setCP12Field(`app${n}_flue_type`, a.flue_type || '');
    setCP12Field(`app${n}_ownership`, a.ownership || a.landlord_appliance || 'Yes');
    setCP12Field(`app${n}_inspected`, a.inspected || 'Yes');
    setCP12Field(`app${n}_op_pressure`, a.op_pressure || '20 mbar');
    setCP12Field(`app${n}_safety_dev`, a.safety_devices || 'Pass');
    setCP12Field(`app${n}_vent`, a.ventilation || 'Pass');
    setCP12Field(`app${n}_visual`, a.visual_condition || 'N/A');
    setCP12Field(`app${n}_flue_flow`, a.flue_flow || 'N/A');
    setCP12Field(`app${n}_combustion`, a.combustion || 'N/A');
    setCP12Field(`app${n}_serviced`, a.serviced || 'No');
    setCP12Field(`app${n}_safe_to_use`, a.safe_to_use || 'Yes');
    setCP12Field(`app${n}_co_fitted`, a.co_alarm_fitted || 'No');
    setCP12Field(`app${n}_co_in_date`, a.co_alarm_in_date || 'N/A');
    setCP12Field(`app${n}_co_test`, a.co_alarm_test || 'N/A');
  });
  for (let n = (r.appliances || []).length + 1; n <= 5; n++) {
    const c = document.getElementById(`cp12App${n}`);
    if (c && !c.classList.contains('is-disabled')) toggleCP12AppRow(n);
  }
  refreshChoiceGroups();
  if (r.sig_issued_image) {
    const c = document.querySelector('[data-sig-field="sig_issued"]');
    if (c) { const img = new Image(); img.onload = () => c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.src = r.sig_issued_image; }
  }
  if (r.sig_received_image) {
    const c = document.querySelector('[data-sig-field="sig_received"]');
    if (c) { const img = new Image(); img.onload = () => c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.src = r.sig_received_image; }
  }
}

export function syncSettingsToCP12Form() {
  const vals = {
    company_name: getSetting('gas_co_name', getSetting('company_name', '')),
    gas_safe_no: getSetting('gas_safe_no', ''),
    business_phone: getSetting('gas_co_phone', getSetting('company_phone', '')),
    business_email: getSetting('gas_co_email', getSetting('company_email', '')),
    business_address: getSetting('gas_co_address', getSetting('company_address', '')),
    business_postcode: getSetting('gas_co_postcode', ''),
    issuer_name: getSetting('gas_default_engineer', ''),
    landlord_ref: getSetting('gas_licence', ''),
  };
  Object.entries(vals).forEach(([f, v]) => { if (v) setCP12Field(f, v); });
  const sigData = getSetting('gas_engg_sig_data', '');
  if (sigData) {
    const c = document.querySelector('[data-sig-field="sig_issued"]');
    if (c) {
      const img = new Image();
      img.onload = () => { c.getContext('2d').clearRect(0, 0, c.width, c.height); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); };
      img.src = sigData;
    }
  }
  const logoData = getSetting('gas_logo_data', '');
  if (logoData) {
    // applyCP12Logo is in signatures.js — call as global fallback during migration
    if (typeof applyCP12Logo === 'function') applyCP12Logo(logoData);
  }
}

// ── CP12 form lifecycle ───────────────────────────────────

export function toggleGasView() {
  const wizard = document.getElementById('mobile-gas-wizard');
  const wrap = document.getElementById('cp12Wrap');
  const btn = document.getElementById('btn-gas-toggle-view');
  if (!wizard || !wrap) return;
  const isWizard = !wizard.hidden;
  if (isWizard) {
    mgwSyncToDesktopForm();
    wizard.hidden = true; wrap.style.display = '';
    if (btn) btn.textContent = '📱 Wizard';
    toast('Wizard data synced to A4 form', 'info', 3000);
    if (isAdmin()) {
      const btnC = document.getElementById('btn-gas-complete');
      const btnS = document.getElementById('btn-gas-save');
      if (btnC) btnC.hidden = false;
      if (btnS) btnS.hidden = false;
    }
  } else {
    if (state.gasDirty) {
      toast('⚠ A4 form changes are NOT automatically reflected in the wizard — save first to avoid data loss', 'warn', 7000);
    }
    wrap.style.display = 'none'; wizard.hidden = false; gwRender();
    if (btn) btn.textContent = '📄 A4 Form';
    const btnC = document.getElementById('btn-gas-complete');
    const btnS = document.getElementById('btn-gas-save');
    if (btnC) btnC.hidden = true;
    if (btnS) btnS.hidden = true;
  }
}

export function newGasCert() {
  state.editingGasId = null; state.gasDirty = false;
  state.cachedNextGasSerial = null;
  document.getElementById('gas-form-title').textContent = 'New Gas';
  document.getElementById('gas-form-ref').textContent = 'CP12 · Loading ref…';
  buildCertRefSeq('', '', 'gas').then(function (r) {
    const m = (r.baseRef || '').match(/(\d+)$/);
    if (m) { state.cachedNextGasSerial = parseInt(m[1]); _gwUpdateTitle(); }
    else { const re = document.getElementById('gas-form-ref'); if (re) re.textContent = 'CP12 · Draft'; }
  }).catch(function () { const re = document.getElementById('gas-form-ref'); if (re) re.textContent = 'CP12 · Draft'; });
  document.querySelectorAll('#cp12Wrap [data-field]').forEach(el => {
    if (el.tagName === 'BUTTON') { const o = (el.dataset.options || '').split(','); el.dataset.current = o[0] || ''; el.textContent = o[0] || ''; }
    else el.value = '';
  });
  ['pipe_gas_tight', 'pipe_pressure', 'pipe_visual', 'pipe_meter', 'pipe_emergency'].forEach(f => setCP12Field(f, '✓'));
  refreshChoiceGroups();
  for (let n = 1; n <= 5; n++) {
    setCP12Field(`app${n}_op_pressure`, '20 mbar');
    const c = document.getElementById(`cp12App${n}`);
    if (!c) continue;
    if (n === 1) { if (c.classList.contains('is-disabled')) toggleCP12AppRow(n); }
    else { if (!c.classList.contains('is-disabled')) toggleCP12AppRow(n); }
  }
  updateAddApplianceBtn();
  const t = new Date();
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const yyyy = t.getFullYear();
  const today = `${dd}/${mm}/${yyyy}`;
  setCP12Field('cert_date', today); setCP12Field('next_check_date', oneYearMinusOneDayUK(today));
  document.querySelectorAll('#cp12Wrap .sig-canvas').forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
  for (let i = 1; i <= 5; i++) { setCP12Field(`defect_${i}`, 'N/A'); setCP12Field(`defect_warn_${i}`, 'N/A'); }
  setCP12Field('remedial_action', 'N/A');
  setCP12Field('work_details', 'N/A');
  syncSettingsToCP12Form();
  if (typeof loadCP12Logo === 'function') loadCP12Logo(); // signatures.js global during migration
  _setGasViewMode(false);
  setTimeout(function () { if (typeof _attachGasFormAC === 'function') _attachGasFormAC(); }, 0); // still global
  const wizard = document.getElementById('mobile-gas-wizard');
  const wrap = document.getElementById('cp12Wrap');
  if (wizard && wrap) {
    wrap.style.display = 'none';
    gwInitState();
    wizard.hidden = false;
    gwRender();
  }
  const _tvb2 = document.getElementById('btn-gas-toggle-view');
  if (_tvb2) { _tvb2.textContent = '📄 A4 Form'; _tvb2.hidden = !isAdmin(); }
  const _ginNewEl = document.getElementById('gas-internal-notes');
  if (_ginNewEl) _ginNewEl.value = '';
}

export async function loadGasForm(id) {
  showOverlay('Loading…');
  const { data: r, error } = await sb.from('gas_certs').select('*').eq('id', id).single();
  hideOverlay(); if (error) { toast('Error loading', 'error'); return; }
  state.gasDirty = false;
  state.editingGasId = id;
  document.getElementById('gas-form-title').textContent = r.ref_number ? `View — ${r.ref_number}` : 'View Gas';
  document.getElementById('gas-form-ref').textContent = r.ref_number || 'Draft';
  document.querySelectorAll('#cp12Wrap [data-field]').forEach(el => {
    if (el.tagName === 'BUTTON') { const o = (el.dataset.options || '').split(','); el.dataset.current = o[0] || ''; el.textContent = o[0] || ''; }
    else if (el.tagName !== 'INPUT' || !el.readOnly) el.value = '';
  });
  for (let n = 1; n <= 5; n++) { const c = document.getElementById(`cp12App${n}`); if (c && c.classList.contains('is-disabled')) toggleCP12AppRow(n); }
  populateCP12Form(r); syncSettingsToCP12Form();
  if (typeof loadCP12Logo === 'function') loadCP12Logo(); // signatures.js global during migration
  updateAddApplianceBtn();
  setTimeout(function () { if (typeof _attachGasFormAC === 'function') _attachGasFormAC(); }, 0);
  const _mwz = document.getElementById('mobile-gas-wizard');
  const _cwp = document.getElementById('cp12Wrap');
  if (_mwz) _mwz.hidden = true; if (_cwp) _cwp.style.display = '';
  const _tvb = document.getElementById('btn-gas-toggle-view');
  if (_tvb) _tvb.textContent = '📱 Wizard';
  if (window._applyCP12Zoom) _applyCP12Zoom();
  const btnC = document.getElementById('btn-gas-complete');
  const _gcb = document.getElementById('gas-completed-banner');
  if (r.status === 'completed') {
    btnC.disabled = true; btnC.dataset.completed = '1'; if (_gcb) _gcb.hidden = false;
    const _loadAdm = isAdmin();
    document.getElementById('btn-gas-pdf').hidden = !_loadAdm;
    document.getElementById('btn-gas-print').hidden = !_loadAdm;
    document.getElementById('btn-gas-email').hidden = false;
  } else { btnC.disabled = false; btnC.dataset.completed = ''; if (_gcb) _gcb.hidden = true; }
  const _ginEl = document.getElementById('gas-internal-notes');
  if (_ginEl) _ginEl.value = r.internal_notes || '';
  state.gasCertLoading = true; navigate('gas-new'); state.gasCertLoading = false;
  _setGasViewMode(true);
}

export function getGasFormData() { return collectCP12FormData(); }

export function _setGasViewMode(isView) {
  const wrap = document.getElementById('cp12Wrap');
  const btnEdit = document.getElementById('btn-gas-edit');
  const btnSave = document.getElementById('btn-gas-save');
  const btnComplete = document.getElementById('btn-gas-complete');
  const btnToggle = document.getElementById('btn-gas-toggle-view');
  if (!wrap || !btnEdit || !btnSave || !btnComplete) return;
  const _isAdm = isAdmin();
  if (btnToggle) btnToggle.hidden = !_isAdm;
  if (isView) {
    wrap.classList.add('is-view');
    wrap.style.pointerEvents = 'none';
    btnEdit.hidden = !_isAdm;
    btnSave.hidden = true;
    btnComplete.hidden = true;
  } else {
    wrap.classList.remove('is-view');
    wrap.style.pointerEvents = '';
    btnEdit.hidden = true;
    btnSave.hidden = !_isAdm;
    btnComplete.hidden = !_isAdm;
    if (state.editingGasId && document.getElementById('btn-gas-complete').dataset.completed === '1')
      btnComplete.disabled = true;
  }
}

export function enterGasEditMode() {
  _setGasViewMode(false);
  const title = document.getElementById('gas-form-title');
  if (title) title.textContent = title.textContent.replace(/^View/, 'Edit');
}

// ── CP12 validation ───────────────────────────────────────

export function cp12HasAppliance() {
  for (let n = 1; n <= 5; n++) {
    const card = document.getElementById(`cp12App${n}`);
    if (card && !card.classList.contains('is-disabled') && (cp12Field(`app${n}_location`) || cp12Field(`app${n}_type`))) return true;
  }
  return false;
}

export function cp12RequireAppliance() {
  if (cp12HasAppliance()) return true;
  toast('Please fill in at least one appliance before continuing.', 'error', 5000);
  const appEl = document.getElementById('applianceCards');
  if (appEl) appEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

// ── CP12 save / complete ──────────────────────────────────

export async function saveGas(_fromMgw) {
  if (!_fromMgw && mgwActive()) mgwSyncToDesktopForm();
  const d = getGasFormData();
  if (!d.install_address) { toast('Installation address required', 'error'); return false; }
  showOverlay('Saving…');
  let err;
  const _gasIntNotes = (document.getElementById('gas-internal-notes')?.value || '').trim();
  if (state.editingGasId) {
    ({ error: err } = await sb.from('gas_certs').update({ ...d, internal_notes: _gasIntNotes, updated_at: new Date().toISOString() }).eq('id', state.editingGasId));
  } else {
    const { data: c, error: e } = await sb.from('gas_certs').insert({ ...d, internal_notes: _gasIntNotes, status: 'draft', created_by: state.currentUser.id }).select().single();
    err = e; if (c) state.editingGasId = c.id;
  }
  hideOverlay();
  if (err) { toast('Save failed: ' + err.message, 'error'); return false; }
  state.gasDirty = false; toast('Saved ✓', 'success');
  if (state.editingGasId) {
    const ref = document.getElementById('gas-form-ref').textContent || 'Draft';
    document.getElementById('gas-form-title').textContent = `View — ${ref}`;
    _setGasViewMode(true);
  }
  return true;
}

export async function completeGas() {
  if (!cp12RequireAppliance()) return;
  const d = getGasFormData();
  if (!d.install_address || !d.cert_date) { toast('Address and date required', 'error'); return; }
  const saved = await saveGas();
  if (!saved) return;
  showOverlay('Issuing certificate…');
  const { ref: refNum, baseRef: certBaseRef } = await buildCertRefSeq(d.install_address || '', d.install_postcode, 'gas');
  const { error } = await sb.from('gas_certs').update({ status: 'completed', ref_number: refNum, base_ref: certBaseRef, completed_at: new Date().toISOString() }).eq('id', state.editingGasId);
  hideOverlay();
  if (error) { toast('Error issuing: ' + error.message, 'error'); return; }
  document.getElementById('gas-form-ref').textContent = refNum;
  document.getElementById('gas-form-title').textContent = `View — ${refNum}`;
  const _isAdm = isAdmin();
  document.getElementById('btn-gas-pdf').hidden = !_isAdm;
  document.getElementById('btn-gas-print').hidden = !_isAdm;
  document.getElementById('btn-gas-email').hidden = false;
  setCP12Field('cert_ref', refNum); setCP12Field('cert_ref_p2', refNum);
  toast(`Gas cert issued: ${refNum}`, 'success', 5000);
  _setGasViewMode(true);
  if (typeof _dirCerts !== 'undefined') _dirCerts = null; // still global
  if (typeof _autoSaveDirAfterCert === 'function') _autoSaveDirAfterCert('gas', getGasFormData()).catch(() => {}); // still global
  emailGas(true);
}

// ── CP12 init ─────────────────────────────────────────────

export function initCP12Form() {
  buildCP12ApplianceCards();
  refreshChoiceGroups();
  // Address autocomplete on install + landlord address fields
  const _ia = document.querySelector('[data-field="install_address"]');
  if (_ia) attachAddressAutocomplete(_ia, {
    onSelect(a) {
      setCP12Field('install_address', [a.line1, a.line2, a.line3].filter(Boolean).join('\n'));
      setCP12Field('install_postcode', a.postcode);
    }
  });
  const _la = document.querySelector('[data-field="landlord_address"]');
  if (_la) attachAddressAutocomplete(_la, {
    onSelect(a) {
      setCP12Field('landlord_address', [a.line1, a.line2, a.line3, a.town].filter(Boolean).join('\n'));
      setCP12Field('landlord_postcode', a.postcode);
    }
  });
  document.querySelectorAll('#cp12Wrap .fast-date').forEach(el => attachFastDateInput(el));
  // Signature pads — initCP12SigPad is in signatures.js (still global during migration)
  document.querySelectorAll('#cp12Wrap .sig-canvas').forEach(c => {
    if (typeof initCP12SigPad === 'function') initCP12SigPad(c);
  });
  const certEl = document.getElementById('f_cert_date');
  if (certEl) certEl.addEventListener('input', () => {
    const ne = document.querySelector('[data-field="next_check_date"]');
    if (ne && certEl.value.length === 10) ne.value = oneYearMinusOneDayUK(certEl.value);
  });
  // Auto-save every 4 seconds
  setInterval(function () {
    try { localStorage.setItem('cp12_autosave_v1', JSON.stringify(collectCP12FormData())); } catch (e) {}
  }, 4000);
  // Live reference number preview
  function _refreshGasRef() {
    const addr = cp12Field('install_address');
    const pc = cp12Field('install_postcode');
    if (!addr) return;
    const { prefix, startN } = _refSettings('gas');
    const yy = String(new Date().getFullYear()).slice(-2);
    const score = _pcScore(pc || _extractPC(addr));
    const addrPart = _refAddrPart(addr);
    const serial = state.cachedNextGasSerial || startN;
    const ref = `${prefix}${serial}${yy}${score} / ${addrPart}`;
    setCP12Field('cert_ref', ref);
    setCP12Field('cert_ref_p2', ref);
    if (!state.cachedNextGasSerial && !state.editingGasId) {
      buildCertRefSeq(addr, pc, 'gas').then(({ baseRef }) => {
        const n = parseInt((baseRef || '').replace(/[^0-9]/g, '')) || startN;
        state.cachedNextGasSerial = n;
        _refreshGasRef();
      }).catch(() => {});
    }
  }
  const _addrEl = document.querySelector('[data-field="install_address"]');
  const _pcEl = document.querySelector('[data-field="install_postcode"]');
  if (_addrEl) _addrEl.addEventListener('input', _refreshGasRef);
  if (_pcEl) _pcEl.addEventListener('input', _refreshGasRef);
  // Auto-capitalize
  document.querySelectorAll('#cp12Wrap input[type="text"]:not([readonly]),#cp12Wrap textarea').forEach(function (el) {
    el.addEventListener('input', function () { if (typeof liveCapitalize === 'function') liveCapitalize(this); }); // still global
  });
  // Auto-resize appliance textareas
  document.querySelectorAll('#cp12Wrap .appliance-value-cell textarea').forEach(function (el) {
    el.addEventListener('input', function () { _cp12ResizeTA(this, true); });
    _cp12ResizeTA(el);
  });
  // Boiler autofill
  for (let n = 1; n <= 5; n++) {
    (function (row) {
      const el = document.querySelector(`[data-field="app${row}_type"]`);
      if (!el) return;
      el.addEventListener('input', function () {
        if (/boiler/i.test(this.value)) {
          setCP12Field(`app${row}_flue_type`, 'RS');
          setCP12Field(`app${row}_flue_flow`, 'Pass');
        } else if (/hob|cooker/i.test(this.value)) {
          setCP12Field(`app${row}_flue_type`, 'FL');
          setCP12Field(`app${row}_combustion`, 'N/A');
        }
      });
    })(n);
  }
  // Live certificate preview
  const _cp12Wrap = document.getElementById('cp12Wrap');
  if (_cp12Wrap) {
    _cp12Wrap.addEventListener('input', doGasPreview);
    _cp12Wrap.addEventListener('change', doGasPreview);
  }
  setTimeout(doGasPreview, 300);
}
