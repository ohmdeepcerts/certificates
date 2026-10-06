// ========== PAT - FORM MODULE ==========
// Extracted from index.html (lines 3631-3975, 4115-4185, 4484-4524, 4525-4548)

import { sb } from '../../lib/supabase.js';
import { getSetting } from '../../lib/settings.js';
import { toast, showOverlay, hideOverlay, openModal, closeModal, _softDelete } from '../../lib/utils.js';
import { buildCertRefSeq } from '../_core/refgen.js';
import { state } from '../../lib/state.js';
import { idbEnqueue, idbPatchById, refreshSyncBadge } from '../../lib/offline.js';
import { navigate } from '../../nav/navigation.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
// TODO: import _attachPATFormAC from its own module once extracted
// TODO: import _dirCerts, _autoSaveDirAfterCert from their respective modules

// ─── Module-level state ───────────────────────────────
export let patApps = [];
export let patCurrentBaseRef = '';
let _offlineQueueId = null;
let autoCapEnabled = localStorage.getItem('ohm_autocap') !== 'off';

// ─── Helpers ──────────────────────────────────────────
export function patGe(id) { return document.getElementById(id); }
export function patGv(id) { const e = patGe(id); return e ? e.value : ''; }
export function patEsc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function patFd(d) { if (!d) return '—'; const p = d.split('-'); if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0]; return d; }
export function patCalcNext(dateStr, months) {
  if (!dateStr) return '';
  const m = parseInt(months) || 12;
  const d = new Date(dateStr); d.setMonth(d.getMonth() + m); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
export function patWrapTxt(text, maxCh) {
  if (!text) return '';
  const words = text.split(' '); let line = '', out = [];
  words.forEach(w => { if ((line + ' ' + w).trim().length <= maxCh) { line = (line + ' ' + w).trim(); } else { if (line) out.push(line); line = w; } });
  if (line) out.push(line); return out.join('\n');
}

// ─── Smart Ref helpers (internal) ────────────────────
function _pcScore(pc) { let s = 0; for (const ch of (pc || '').replace(/\s/g, '').toUpperCase()) { if (ch >= 'A' && ch <= 'Z') s += ch.charCodeAt(0) - 64; else if (ch >= '0' && ch <= '9') s += parseInt(ch); } return s; }
function _extractPC(addr) { const m = (addr || '').match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i); return m ? m[1].replace(/\s/g, '').toUpperCase() : ''; }
function _refAddrPart(addr) {
  let a = (addr || '').replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi, '').replace(/,?\s*$/, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const tokens = a.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return '';
  if (/^\d/.test(tokens[0])) { return tokens.slice(0, 3).join(' '); }
  const doorIdx = tokens.findIndex(t => /^\d/.test(t));
  if (doorIdx === -1) return tokens.slice(0, 3).join(' ');
  return tokens.slice(0, doorIdx + 3).join(' ');
}
function _refSettings(type) {
  if (type === 'pat') {
    return {
      prefix: (getSetting('pat_ref_prefix', 'PAT') || 'PAT').toUpperCase(),
      startN: parseInt(getSetting('pat_ref_start', '1')) || 1
    };
  }
  if (type === 'el') {
    return {
      prefix: (getSetting('el_ref_prefix', 'EL') || 'EL').toUpperCase(),
      startN: parseInt(getSetting('el_ref_start', '1001')) || 1001
    };
  }
  return {
    prefix: (getSetting('gas_ref_prefix', getSetting('ref_prefix', 'OHM')) || 'OHM').toUpperCase(),
    startN: parseInt(getSetting('gas_ref_start', getSetting('ref_start', '210'))) || 210
  };
}

export function updatePatRef() {
  const el = patGe('pat-ref');
  if (!el || el.dataset.manual === 'true') return;
  const addr = (patGv('pat-addr') || '').trim();
  if (!addr) return;
  const pc = (patGv('pat-postcode') || '').trim();
  const { prefix, startN } = _refSettings('pat');
  const yy = String(new Date().getFullYear()).slice(-2);
  const score = _pcScore(pc || _extractPC(addr));
  const addrPart = _refAddrPart(addr);
  const serial = state._cachedNextPATSerial || startN;
  el.value = `${prefix}${serial}${yy}${score} / ${addrPart}`;
  if (!state._cachedNextPATSerial && !state.editingPATId) {
    buildCertRefSeq(addr, pc, 'pat').then(({ baseRef }) => {
      const n = parseInt((baseRef || '').replace(/[^0-9]/g, '')) || startN;
      state._cachedNextPATSerial = n;
      updatePatRef();
    }).catch(() => {});
  }
  doPatPreview();
}

// ─── Dynamic import proxy to break circular dependency with pdf.js ──
export function doPatPreview() {
  state._patDirty = true;
  import('./pdf.js').then(m => m.doPatPreview());
}

// ─── Appliance rows ──────────────────────────────────
export function addPATRow(data = null) {
  let nextId = '';
  if (!data && patApps.length) {
    for (let _k = patApps.length - 1; _k >= 0; _k--) {
      const m = (patApps[_k].assetId || '').match(/^(.*?)(\d+)$/);
      if (m) { nextId = m[1] + String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0'); break; }
    }
  }
  const today = patGv('pat-date') || new Date().toISOString().split('T')[0];
  const periodMonths = getSetting('pat_period', '12');
  const period = periodMonths + ' Months';
  const a = data || {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    assetId: nextId, description: '',
    testInstrument: getSetting('pat_default_instrument', ''),
    date: today, retestPeriod: period,
    nextTest: patCalcNext(today, periodMonths),
    result: getSetting('pat_default_result', 'Pass')
  };
  patApps.push(a);
  _appendPATRow(patApps.length - 1);
  updatePatRef();
}

function _appendPATRow(i) {
  const tbody = patGe('pat-app-body'); if (!tbody) return;
  const a = patApps[i]; if (!a) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    `<td><input class="pat-ti" id="pat-a${i}" value="${patEsc(a.assetId)}" onchange="patUpd(${i},'assetId',this.value)" placeholder="A001"></td>`
    + `<td><textarea class="pat-ti" id="pat-d${i}" style="height:auto;min-height:28px;resize:none;overflow:hidden;width:100%;box-sizing:border-box" onchange="patUpd(${i},'description',this.value)" oninput="liveCapitalize(this);patAutoH(this)" onkeydown="patDTab(event,${i})">${patEsc(a.description)}</textarea></td>`
    + `<td><input class="pat-ti" id="pat-i${i}" value="${patEsc(a.testInstrument)}" onchange="patUpd(${i},'testInstrument',this.value)"></td>`
    + `<td><input type="date" class="pat-ti" id="pat-t${i}" value="${patEsc(a.date)}" onchange="patUpdDate(${i},this.value)"></td>`
    + `<td><select class="pat-ts" id="pat-p${i}" onchange="patUpdPer(${i},this.value)">${['3', '6', '12', '24', '48'].map(n => `<option value="${n} Months"${a.retestPeriod === n + ' Months' ? ' selected' : ''}>${n}m</option>`).join('')}</select></td>`
    + `<td><input type="date" class="pat-ti" value="${patEsc(a.nextTest)}" readonly style="opacity:.45;cursor:default;"></td>`
    + `<td><select class="pat-ts" id="pat-r${i}" onchange="patUpd(${i},'result',this.value);this.style.color=this.value==='Pass'?'#16a34a':'#dc2626';this.style.fontWeight='700'" style="color:${a.result === 'Pass' ? '#16a34a' : '#dc2626'};font-weight:700"><option value="Pass"${a.result === 'Pass' ? ' selected' : ''}>Pass</option><option value="Fail"${a.result === 'Fail' ? ' selected' : ''}>Fail</option></select></td>`
    + `<td style="text-align:center"><button type="button" class="btn-remove-row" title="Delete row" onclick="delPATRow(${i})">✕</button></td>`;
  tbody.appendChild(tr);
  setTimeout(() => { const d = patGe('pat-d' + i); if (d) { patAutoH(d); d.focus(); } }, 0);
  const sum = patGe('pat-app-sum');
  if (sum) { const p = patApps.filter(r => r.result === 'Pass').length, f = patApps.filter(r => r.result === 'Fail').length, t = patApps.length; sum.textContent = t + ' item' + (t !== 1 ? 's' : '') + ' · ' + p + ' Pass / ' + f + ' Fail'; }
}

export function renderPATRows(opts = {}) {
  const tbody = patGe('pat-app-body'); if (!tbody) return;
  tbody.innerHTML = '';
  patApps.forEach((a, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><input class="pat-ti" id="pat-a${i}" value="${patEsc(a.assetId)}" onchange="patUpd(${i},'assetId',this.value)" placeholder="A001"></td>`
      + `<td><textarea class="pat-ti" id="pat-d${i}" style="height:auto;min-height:28px;resize:none;overflow:hidden;width:100%;box-sizing:border-box" onchange="patUpd(${i},'description',this.value)" oninput="liveCapitalize(this);patAutoH(this)" onkeydown="patDTab(event,${i})">${patEsc(a.description)}</textarea></td>`
      + `<td><input class="pat-ti" id="pat-i${i}" value="${patEsc(a.testInstrument)}" onchange="patUpd(${i},'testInstrument',this.value)"></td>`
      + `<td><input type="date" class="pat-ti" id="pat-t${i}" value="${patEsc(a.date)}" onchange="patUpdDate(${i},this.value)"></td>`
      + `<td><select class="pat-ts" id="pat-p${i}" onchange="patUpdPer(${i},this.value)">${['3', '6', '12', '24', '48'].map(n => `<option value="${n} Months"${a.retestPeriod === n + ' Months' ? ' selected' : ''}>${n}m</option>`).join('')}</select></td>`
      + `<td><input type="date" class="pat-ti" value="${patEsc(a.nextTest)}" readonly style="opacity:.45;cursor:default;"></td>`
      + `<td><select class="pat-ts" id="pat-r${i}" onchange="patUpd(${i},'result',this.value);this.style.color=this.value==='Pass'?'#16a34a':'#dc2626';this.style.fontWeight='700'" style="color:${a.result === 'Pass' ? '#16a34a' : '#dc2626'};font-weight:700"><option value="Pass"${a.result === 'Pass' ? ' selected' : ''}>Pass</option><option value="Fail"${a.result === 'Fail' ? ' selected' : ''}>Fail</option></select></td>`
      + `<td style="text-align:center"><button type="button" class="btn-remove-row" title="Delete row" onclick="delPATRow(${i})">✕</button></td>`;
    tbody.appendChild(tr);
  });
  setTimeout(() => { document.querySelectorAll('#pat-app-body textarea').forEach(patAutoH); }, 0);
  if (opts.focusDesc !== undefined) { setTimeout(() => { const d = patGe('pat-d' + opts.focusDesc); if (d) d.focus(); }, 0); }
  const sum = patGe('pat-app-sum');
  if (sum) { const p = patApps.filter(a => a.result === 'Pass').length, f = patApps.filter(a => a.result === 'Fail').length, t = patApps.length; sum.textContent = t + ' item' + (t !== 1 ? 's' : '') + ' · ' + p + ' Pass / ' + f + ' Fail'; }
}

export function patUpd(i, f, v) { if (patApps[i]) patApps[i][f] = v; doPatPreview(); updatePatSidePanel(); }
export function patDTab(e, i) {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  patUpd(i, 'description', e.target.value);
  const aEl = patGe('pat-a' + i);
  if (aEl && aEl.value !== patApps[i].assetId) patUpd(i, 'assetId', aEl.value);
  if (i === patApps.length - 1) {
    addPATRow();
  } else if (!patApps[i + 1].assetId) {
    const _m = (patApps[i].assetId || '').match(/^(.*?)(\d+)$/);
    if (_m) { const _nid = _m[1] + String(parseInt(_m[2], 10) + 1).padStart(_m[2].length, '0'); patApps[i + 1].assetId = _nid; const _na = patGe('pat-a' + (i + 1)); if (_na) _na.value = _nid; }
  }
  setTimeout(() => { const d = patGe('pat-d' + (i + 1)); if (d) d.focus(); }, 30);
}
export function patUpdDate(i, v) { if (!patApps[i]) return; patApps[i].date = v; patApps[i].nextTest = patCalcNext(v, parseInt(patApps[i].retestPeriod)); const _nd = patGe('pat-t' + i)?.closest('tr')?.cells[5]?.querySelector('input'); if (_nd) _nd.value = patApps[i].nextTest || ''; doPatPreview(); }
export function patUpdPer(i, v) { if (!patApps[i]) return; patApps[i].retestPeriod = v; patApps[i].nextTest = patCalcNext(patApps[i].date, parseInt(v)); const _nd = patGe('pat-t' + i)?.closest('tr')?.cells[5]?.querySelector('input'); if (_nd) _nd.value = patApps[i].nextTest || ''; doPatPreview(); }
export function patDateChanged(v) {
  if (!v) return;
  const expEl = patGe('pat-expiry');
  if (expEl && !expEl.value) {
    const d = new Date(v); d.setDate(d.getDate() + 364);
    expEl.value = d.toISOString().split('T')[0];
  }
  doPatPreview();
}
export function applyPATDatesToAll() {
  const testDate = patGv('pat-date');
  const expiry = patGv('pat-expiry');
  if (!testDate && !expiry) { alert('Please set a Test Date first.'); return; }
  if (!patApps.length) { alert('No appliances to apply to.'); return; }
  patApps.forEach(a => {
    if (testDate) a.date = testDate;
    if (expiry) a.nextTest = expiry;
    else if (testDate) a.nextTest = patCalcNext(testDate, parseInt(a.retestPeriod));
  });
  renderPATRows(); doPatPreview();
  const msg = `Applied${testDate ? ' test date ' + patFd(testDate) : ''}${expiry && testDate ? ' and' : ''}${expiry ? ' expiry ' + patFd(expiry) : ''}  to ${patApps.length} appliance${patApps.length !== 1 ? 's' : ''}.`;
  toast(msg, 'success', 3000);
}
export function applyPatHeaderDate(v) { patDateChanged(v); }
export function delPATRow(i) { patApps.splice(i, 1); renderPATRows(); updatePatRef(); doPatPreview(); }
export function clearPATForm() { if (!confirm('Clear all form data?')) return; newPAT(); }

export function populatePATForm(r) {
  patCurrentBaseRef = r.base_ref || (r.ref_number || '').split(' / ')[0].replace(/\d+$/, '').trim();
  const refEl = patGe('pat-ref');
  refEl.value = r.ref_number || '';
  refEl.dataset.manual = 'true';
  patGe('pat-status').value = r.status || 'draft';
  patGe('pat-date').value = r.test_date || '';
  const firstNext = (r.appliances && r.appliances[0]) ? r.appliances[0].nextTest || r.appliances[0].next_test : '';
  const expEl = patGe('pat-expiry'); if (expEl) expEl.value = firstNext || '';
  patGe('pat-eng').value = r.engineer || '';
  patGe('pat-landlord').value = r.landlord_name || '';
  patGe('pat-landlord-addr').value = r.landlord_address || '';
  patGe('pat-agency').value = r.agency_name || '';
  patGe('pat-agency-addr').value = r.agency_address || '';
  const _fa = (r.property_address || '').trim(), _fl = _fa.split('\n');
  const _ukPc = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
  if (_fl.length > 1 && _ukPc.test(_fl[_fl.length - 1].trim())) { patGe('pat-postcode').value = _fl[_fl.length - 1].trim().toUpperCase(); patGe('pat-addr').value = _fl.slice(0, -1).join('\n'); }
  else { patGe('pat-addr').value = _fa; patGe('pat-postcode').value = ''; }
  patGe('pat-phone').value = r.phone_number || '';
  patGe('pat-email').value = r.email_address || '';
  const _pinEl = patGe('pat-internal-notes'); if (_pinEl) _pinEl.value = r.internal_notes || '';
  patApps.splice(0, patApps.length, ...(r.appliances || []).map(a => ({
    id: a.id || Date.now().toString(36),
    assetId: a.assetId || a.asset_id || '',
    description: a.description || '',
    testInstrument: a.testInstrument || a.test_instrument || a.instrument || '',
    date: a.date || r.test_date || '',
    retestPeriod: (() => { const _rp = a.retestPeriod || a.retest_period || '12 Months'; return /^\d+$/.test(_rp.trim()) ? _rp.trim() + ' Months' : _rp; })(),
    nextTest: (() => { const _d = a.date || r.test_date || ''; const _p = (a.retestPeriod || a.retest_period || '12 Months'); return _d ? patCalcNext(_d, parseInt(_p)) : a.nextTest || a.next_test || ''; })(),
    result: a.result === 'PASS' ? 'Pass' : a.result === 'FAIL' ? 'Fail' : (a.result || 'Pass')
  })));
  if (!patApps.length) { addPATRow(); addPATRow(); } else { renderPATRows(); }
  doPatPreview();
}

export function getPATFormData() {
  return {
    ref_number: patGv('pat-ref'),
    base_ref: patCurrentBaseRef || patGv('pat-ref').split(' / ')[0].replace(/\d+$/, '').trim(),
    status: patGv('pat-status'),
    test_date: patGv('pat-date'),
    engineer: patGv('pat-eng'),
    landlord_name: patGv('pat-landlord'),
    landlord_address: patGv('pat-landlord')?.trim() ? patGv('pat-landlord-addr') : '',
    agency_name: patGv('pat-agency'),
    agency_address: patGv('pat-agency')?.trim() ? patGv('pat-agency-addr') : '',
    property_address: ((patGv('pat-addr') || '').trim() + (patGv('pat-postcode') ? '\n' + (patGv('pat-postcode') || '').trim() : '')),
    phone_number: patGv('pat-phone'),
    email_address: patGv('pat-email'),
    internal_notes: patGv('pat-internal-notes'),
    appliances: JSON.parse(JSON.stringify(patApps))
  };
}

export function startNewPAT() { state.editingPATId = null; _offlineQueueId = null; navigate('pat-new'); }
export async function newPAT() {
  state.editingPATId = null; _offlineQueueId = null; patApps.splice(0); state._patDirty = false;
  state._cachedNextPATSerial = null;
  patGe('pat-edit-banner').hidden = true;
  patGe('pat-form-title').textContent = 'New PAT Test';
  patGe('pat-form-ref').textContent = 'Set dates then click Apply to All · Ctrl+S = Draft';
  patGe('btn-pat-pdf').hidden = false;
  patGe('btn-pat-email').hidden = true;
  patGe('btn-pat-complete').disabled = false;
  patGe('btn-pat-complete2').disabled = false;
  const today = new Date().toISOString().split('T')[0];
  const exp364 = new Date(); exp364.setDate(exp364.getDate() + 364);
  patGe('pat-ref').value = '';
  patGe('pat-status').value = 'draft';
  patGe('pat-date').value = today;
  const _expEl = patGe('pat-expiry'); if (_expEl) _expEl.value = exp364.toISOString().split('T')[0];
  patGe('pat-eng').value = getSetting('pat_default_engineer', '');
  patGe('pat-landlord').value = ''; patGe('pat-agency').value = '';
  patGe('pat-landlord-addr').value = ''; patGe('pat-agency-addr').value = '';
  patGe('pat-addr').value = ''; patGe('pat-postcode').value = ''; patGe('pat-phone').value = ''; patGe('pat-email').value = ''; const _pnEl = patGe('pat-internal-notes'); if (_pnEl) _pnEl.value = '';
  patGe('pat-app-body').innerHTML = '';
  patCurrentBaseRef = '';
  const refEl = patGe('pat-ref');
  if (refEl) { refEl.dataset.manual = 'false'; refEl.value = ''; }
  addPATRow(); addPATRow();
  _syncAutoCapBtn();
  // Attach address autocomplete to property address + landlord address fields
  const _addrEl = patGe('pat-addr');
  if (_addrEl) attachAddressAutocomplete(_addrEl, {
    onSelect(a) {
      patGe('pat-addr').value    = [a.line1, a.line2, a.line3].filter(Boolean).join('\n');
      patGe('pat-postcode').value = a.postcode;
      ['pat-addr', 'pat-postcode'].forEach(id => patGe(id)?.dispatchEvent(new Event('input', { bubbles: true })));
    }
  });
  const _llAddrEl = patGe('pat-landlord-addr');
  if (_llAddrEl) attachAddressAutocomplete(_llAddrEl, {
    onSelect(a) {
      patGe('pat-landlord-addr').value = [a.line1, a.line2, a.line3, a.town].filter(Boolean).join('\n');
      patGe('pat-landlord-addr')?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  try {
    const saved = localStorage.getItem('pat_autosave');
    if (saved) {
      const d = JSON.parse(saved);
      if (d && (d.property_address || '').trim()) {
        const rb = patGe('pat-restore-banner'); if (rb) rb.hidden = false;
      }
    }
  } catch (e) {}
}

export function _syncAutoCapBtn() {
  const btn = document.getElementById('autocap-btn');
  if (!btn) return;
  btn.innerHTML = autoCapEnabled ? '<i class="fa-solid fa-toggle-on"></i> Auto-Capitalize: On' : '<i class="fa-solid fa-toggle-off"></i> Auto-Capitalize: Off';
  btn.classList.toggle('on', autoCapEnabled);
}

export async function loadPATForm(id) {
  showOverlay('Loading…');
  const { data: r, error } = await sb.from('pat_reports').select('*').eq('id', id).single();
  hideOverlay();
  if (error) { toast('Error loading report', 'error'); return; }
  state._patDirty = false;
  state.editingPATId = id;
  patGe('pat-form-title').textContent = r.ref_number ? `Edit — ${r.ref_number}` : 'Edit PAT Test';
  patGe('pat-form-ref').textContent = r.ref_number || 'Draft';
  const isDone = r.status === 'completed';
  patGe('pat-edit-banner').hidden = isDone;
  const _cb = patGe('pat-completed-banner'); if (_cb) _cb.hidden = !isDone;
  const rb = patGe('pat-restore-banner'); if (rb) rb.hidden = true;
  patGe('btn-pat-pdf').hidden = false;
  patGe('btn-pat-email').hidden = !isDone;
  patGe('btn-pat-complete').disabled = isDone;
  patGe('btn-pat-complete2').disabled = isDone;
  populatePATForm(r);
  navigate('pat-new');
  _syncAutoCapBtn();
}

// ─── Save & Complete ─────────────────────────────────
export async function savePAT() {
  const d = getPATFormData();
  if (!d.property_address) { toast('Property address required', 'error'); return; }
  if (!(patGv('pat-postcode') || '').trim()) { toast('Postcode is required — enter it in the Postcode field', 'error'); patGe('pat-postcode').focus(); return; }
  if (!navigator.onLine) {
    const existingId = state.editingPATId && state.editingPATId !== '__offline__' ? state.editingPATId : null;
    const localId = await idbEnqueue({ type: 'pat_upsert', form: d, supabaseId: existingId, userId: state.currentUser.id, ts: Date.now() });
    if (!state.editingPATId) { state.editingPATId = '__offline__'; _offlineQueueId = localId; }
    refreshSyncBadge();
    toast('Saved offline — will sync when online', 'success');
    return;
  }
  showOverlay('Saving…');
  let err;
  if (state.editingPATId && state.editingPATId !== '__offline__') {
    ({ error: err } = await sb.from('pat_reports').update({ ...d, updated_at: new Date().toISOString() }).eq('id', state.editingPATId));
  } else {
    const { data: created, error: e } = await sb.from('pat_reports').insert({ ...d, created_by: state.currentUser.id }).select().single();
    err = e; if (created) state.editingPATId = created.id;
  }
  hideOverlay();
  if (err) { toast('Save failed: ' + err.message, 'error'); }
  else { toast('Saved ✓', 'success'); state._patDirty = false; }
}

export async function completePAT() {
  const d = getPATFormData();
  if (!d.property_address || !d.test_date) { toast('Address and date required', 'error'); return; }
  if (!(patGv('pat-postcode') || '').trim()) { toast('Postcode is required — enter it in the Postcode field', 'error'); patGe('pat-postcode').focus(); return; }
  if (patGe('pat-ref').dataset.manual !== 'true') {
    const { ref: r, baseRef: b } = await buildCertRefSeq(d.property_address, (patGv('pat-postcode') || '').trim(), 'pat');
    patGe('pat-ref').value = r; patCurrentBaseRef = b;
  }
  await savePAT();
  if (!state.editingPATId) { toast('Save failed', 'error'); return; }
  const refNum = patGv('pat-ref') || d.ref_number;
  if (state.editingPATId === '__offline__') {
    if (_offlineQueueId != null) await idbPatchById(_offlineQueueId, { status: 'completed', ref_number: refNum, base_ref: patCurrentBaseRef || refNum, completed_at: new Date().toISOString() });
    _offlineQueueId = null;
    refreshSyncBadge();
    patGe('pat-ref').value = refNum;
    patGe('pat-status').value = 'completed';
    patGe('pat-form-ref').textContent = refNum;
    patGe('pat-form-title').textContent = `PAT — ${refNum}`;
    patGe('btn-pat-email').hidden = false;
    patGe('btn-pat-complete').disabled = true;
    patGe('btn-pat-complete2').disabled = true;
    doPatPreview();
    toast(`Certificate queued offline: ${refNum} — will sync when online`, 'success', 5000);
    return;
  }
  showOverlay('Issuing certificate…');
  const { error } = await sb.from('pat_reports').update({ status: 'completed', ref_number: refNum, base_ref: patCurrentBaseRef || refNum, completed_at: new Date().toISOString() }).eq('id', state.editingPATId);
  hideOverlay();
  if (error) { toast('Error issuing: ' + error.message, 'error'); return; }
  patGe('pat-ref').value = refNum;
  patGe('pat-status').value = 'completed';
  patGe('pat-form-ref').textContent = refNum;
  patGe('pat-form-title').textContent = `PAT — ${refNum}`;
  patGe('btn-pat-email').hidden = false;
  patGe('btn-pat-complete').disabled = true;
  patGe('btn-pat-complete2').disabled = true;
  doPatPreview();
  toast(`Certificate issued: ${refNum}`, 'success', 5000);
  // TODO: import _dirCerts and _autoSaveDirAfterCert from their module
  // _dirCerts = null;
  // _autoSaveDirAfterCert('pat', getPATFormData()).catch(() => {});
  import('./email.js').then(m => m.emailPAT(true));
}

// ─── Side Panel ──────────────────────────────────────
export function updatePatSidePanel() {
  const addr = (patGv('pat-addr') || '').trim();
  const status = patGv('pat-status') || 'draft';
  const ref = patGv('pat-ref') || '';
  const eng = patGv('pat-eng') || '';
  const total = patApps.length;
  const passes = patApps.filter(a => a.result === 'Pass').length;
  const fails = patApps.filter(a => a.result === 'Fail').length;
  const rate = total > 0 ? Math.round(passes / total * 100) : 0;
  const sc = document.getElementById('sw-status');
  if (sc) { sc.className = 'sw-cert-status ' + (status === 'completed' ? 'complete' : 'draft'); sc.textContent = status === 'completed' ? '✅ Complete' : '📝 Draft'; }
  const sa = document.getElementById('sw-prop-addr'); if (sa) sa.textContent = addr || '—';
  const ct = document.getElementById('sw-app-count'); if (ct) ct.textContent = total;
  const cp = document.getElementById('sw-pass-count'); if (cp) cp.textContent = passes;
  const cf = document.getElementById('sw-fail-count'); if (cf) cf.textContent = fails;
  const cr = document.getElementById('sw-rate'); if (cr) cr.textContent = rate + '%';
  const ring = document.getElementById('sw-ring-pass');
  if (ring) { const offset = 163.4 - (163.4 * (rate / 100)); ring.style.strokeDashoffset = offset; }
  const pagesEl = document.getElementById('sw-pages-dots');
  if (pagesEl) {
    const pages = document.querySelectorAll('#pat-cert-pages .a4').length || 1;
    pagesEl.innerHTML = '';
    for (let i = 0; i < pages; i++) { const d = document.createElement('div'); d.className = 'sw-pdot ' + (i === 0 ? 'active' : ''); pagesEl.appendChild(d); }
  }
  const fields = [
    { id: 'sw-f-date', label: 'Test Date', ok: !!(patGv('pat-date')) },
    { id: 'sw-f-eng', label: 'Engineer', ok: !!eng },
    { id: 'sw-f-addr', label: 'Property Address', ok: !!addr },
    { id: 'sw-f-apps', label: 'Appliances (≥1)', ok: total > 0 },
  ];
  const sw = document.getElementById('sw-fields');
  if (sw) sw.innerHTML = fields.map(f => `<div class="sw-field ${f.ok ? 'done' : 'miss'}"><i class="fa-solid fa-${f.ok ? 'circle-check' : 'circle-xmark'}"></i> ${f.label}</div>`).join('');
}

// ─── Auto-Capitalize ─────────────────────────────────
export function toggleAutoCap() {
  autoCapEnabled = !autoCapEnabled;
  localStorage.setItem('ohm_autocap', autoCapEnabled ? 'on' : 'off');
  const btn = document.getElementById('autocap-btn');
  if (btn) { btn.innerHTML = autoCapEnabled ? '<i class="fa-solid fa-toggle-on"></i> Auto-Capitalize: On' : '<i class="fa-solid fa-toggle-off"></i> Auto-Capitalize: Off'; btn.classList.toggle('on', autoCapEnabled); }
  toast('Auto-capitalize ' + (autoCapEnabled ? 'on' : 'off'), 'info', 1800);
}
export function capitalizeAddress(el) {
  if (!autoCapEnabled) { updatePatRef(); doPatPreview(); return; }
  const pos = el.selectionStart, posEnd = el.selectionEnd;
  el.value = el.value.split('\n').map(line => line.replace(/(?<![a-zA-Z'])[a-z]/g, c => c.toUpperCase())).join('\n');
  el.setSelectionRange(pos, posEnd);
  updatePatRef(); doPatPreview(); updatePatSidePanel();
}
export function patAutoH(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
export function liveCapitalize(el) {
  if (!autoCapEnabled) return;
  const pos = el.selectionStart, posEnd = el.selectionEnd;
  el.value = el.value.replace(/(?<![a-zA-Z'])[a-z]/g, c => c.toUpperCase());
  el.setSelectionRange(pos, posEnd);
}
