import { sb }      from '../lib/supabase.js';
import { state }   from '../lib/state.js';
import { toast }   from '../lib/utils.js';
import { navigate } from '../nav/navigation.js';

// ── Cache ──────────────────────────────────────────────────────────────────
const _dir = { agents: null, landlords: null, properties: null, contacts: null, appliances: null };
const _dirTable = { agents: 'directory_agents', landlords: 'directory_landlords', properties: 'directory_properties', contacts: 'directory_contacts' };
let _dirActiveTab = 'agents';
window._dirActiveTab = 'agents';
let _dirPage = 1;
const _DIR_PAGE_SIZE = 20;
let _dirLastQ = '';
let _dirLastTab = '';

function _inferAppCat(t) {
  const s = (t || '').toLowerCase();
  if (/boiler/.test(s)) return 'Boiler'; if (/cooker|range/.test(s)) return 'Cooker';
  if (/hob/.test(s)) return 'Hob'; if (/fire/.test(s)) return 'Fire';
  if (/water.*heat|heat.*water/.test(s)) return 'Water Heater'; if (/heater/.test(s)) return 'Heater';
  if (/tumble|dryer/.test(s)) return 'Tumble Dryer'; return 'Other';
}

export async function _autoSaveDirAfterCert(certType, data) {
  try {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const now = new Date().toISOString(), uid = state.currentUser?.id || null;
    let addr1 = '', postcode = '', addrLines = [];
    if (certType === 'gas') {
      addrLines = (data.install_address || '').split('\n').map(l => l.trim()).filter(Boolean);
      addr1 = addrLines[0] || ''; postcode = (data.install_postcode || '').trim().toUpperCase();
    } else {
      const patAddr = document.getElementById('pat-addr');
      const patPc = document.getElementById('pat-postcode');
      addrLines = (patAddr?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
      addr1 = addrLines[0] || ''; postcode = (patPc?.value || '').trim().toUpperCase();
    }
    if (addr1) {
      if (!_dir.properties) await dirLoad('properties');
      const exists = (_dir.properties || []).some(r => norm(r.addr1) === norm(addr1) && (!postcode || norm(r.postcode) === norm(postcode)));
      if (!exists) {
        const rec = { addr1, addr2: addrLines[1] || '', town: addrLines[2] || '', county: addrLines[3] || '', postcode, is_active: true, usage_count: 0, created_at: now, created_by: uid };
        const { data: c } = await sb.from('directory_properties').insert(rec).select().single();
        if (c) { if (!_dir.properties) _dir.properties = []; _dir.properties.push(c); }
      }
    }
    let lName = '', lLines = [];
    if (certType === 'gas') {
      lLines = (data.landlord_address || '').split('\n').map(l => l.trim()).filter(Boolean);
      lName = lLines[0] || '';
    } else { lName = (data.landlord_name || '').trim(); lLines = [(data.landlord_address || '').trim()]; }
    if (lName) {
      if (!_dir.landlords) await dirLoad('landlords');
      const exists = (_dir.landlords || []).some(r => norm(r.landlord_name || r.company_name) === norm(lName));
      if (!exists) {
        const lAddr = (certType === 'gas' ? lLines.slice(1) : lLines).filter(Boolean);
        const rec = { landlord_name: lName, company_name: '', addr1: lAddr[0] || '', addr2: lAddr[1] || '', town: lAddr[2] || '', postcode: (certType === 'gas' ? (data.landlord_postcode || '').toUpperCase() : ''), is_active: true, usage_count: 0, created_at: now, created_by: uid };
        const { data: c } = await sb.from('directory_landlords').insert(rec).select().single();
        if (c) { if (!_dir.landlords) _dir.landlords = []; _dir.landlords.push(c); }
      }
    }
    if (certType === 'pat') {
      const aName = (data.agency_name || '').trim();
      if (aName) {
        if (!_dir.agents) await dirLoad('agents');
        const exists = (_dir.agents || []).some(r => norm(r.agency_name || r.contact_name) === norm(aName));
        if (!exists) {
          const aL = (data.agency_address || '').split(/[,\n]/).map(l => l.trim()).filter(Boolean);
          const rec = { agency_name: aName, addr1: aL[0] || '', addr2: aL[1] || '', town: aL[2] || '', is_active: true, usage_count: 0, created_at: now, created_by: uid };
          const { data: c } = await sb.from('directory_agents').insert(rec).select().single();
          if (c) { if (!_dir.agents) _dir.agents = []; _dir.agents.push(c); }
        }
      }
    }
    // Auto-link property to landlord (gas) or agent (PAT) when both are known
    if (addr1) {
      const propRec = (_dir.properties || []).find(r => norm(r.addr1) === norm(addr1) && (!postcode || norm(r.postcode) === norm(postcode)));
      if (propRec) {
        if (certType === 'gas' && lName) {
          const llRec = (_dir.landlords || []).find(r => norm(r.landlord_name || r.company_name) === norm(lName));
          if (llRec && !propRec.landlord_id) {
            const { data: upd } = await sb.from('directory_properties').update({ landlord_id: llRec.id }).eq('id', propRec.id).select().single();
            if (upd) propRec.landlord_id = upd.landlord_id;
          }
        } else if (certType === 'pat') {
          const aName2 = (data.agency_name || '').trim();
          if (aName2) {
            const agRec = (_dir.agents || []).find(r => norm(r.agency_name || r.contact_name) === norm(aName2));
            if (agRec && !propRec.agent_id) {
              const { data: upd } = await sb.from('directory_properties').update({ agent_id: agRec.id }).eq('id', propRec.id).select().single();
              if (upd) propRec.agent_id = upd.agent_id;
            }
          }
        }
      }
    }
    if (certType === 'gas' && (data.appliances || []).length) {
      if (!_dir.appliances) { const { data: a } = await sb.from('appliance_templates').select('*'); _dir.appliances = a || []; }
      for (const app of data.appliances) {
        if (!app.type) continue;
        const norm2 = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const exists = (_dir.appliances || []).some(r => norm2(r.name) === norm2(app.type) && (!app.make || !r.manufacturer || norm2(r.manufacturer) === norm2(app.make)));
        if (!exists) {
          const rec = { name: app.type, manufacturer: app.make || '', model: app.model || '', category: _inferAppCat(app.type), is_active: true, usage_count: 0, created_at: now, created_by: uid };
          const { data: c } = await sb.from('appliance_templates').insert(rec).select().single();
          if (c) _dir.appliances.push(c);
        }
      }
    }
  } catch (e) { /* silent */ }
}

export async function backfillDirFromReports(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
  const res = document.getElementById('backfill-result');
  if (res) res.innerHTML = '<span style="color:var(--muted)">Reading reports…</span>';
  const counts = { properties: 0, landlords: 0, agents: 0, appliances: 0 };
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const now = new Date().toISOString(), uid = state.currentUser?.id || null;
  try {
    await Promise.all(['properties', 'landlords', 'agents'].map(t => dirLoad(t)));
    const { data: apData } = await sb.from('appliance_templates').select('*');
    _dir.appliances = apData || [];

    async function _tryProp(addr, postcode) {
      const lines = (addr || '').split('\n').map(l => l.trim()).filter(Boolean);
      const a1 = lines[0] || ''; const pc = (postcode || '').trim().toUpperCase();
      if (!a1) return;
      if ((_dir.properties || []).some(r => norm(r.addr1) === norm(a1) && (!pc || norm(r.postcode) === norm(pc)))) return;
      const rec = { addr1: a1, addr2: lines[1] || '', town: lines[2] || '', county: lines[3] || '', postcode: pc, is_active: true, usage_count: 0, created_at: now, created_by: uid };
      const { data: c } = await sb.from('directory_properties').insert(rec).select().single();
      if (c) { if (!_dir.properties) _dir.properties = []; _dir.properties.push(c); counts.properties++; }
    }
    async function _tryLandlord(name, addr, postcode) {
      const n = (name || '').trim(); if (!n) return;
      if ((_dir.landlords || []).some(r => norm(r.landlord_name || r.company_name) === norm(n))) return;
      const lines = (addr || '').split(/[,\n]/).map(l => l.trim()).filter(Boolean);
      const rec = { landlord_name: n, company_name: '', addr1: lines[0] || '', addr2: lines[1] || '', town: lines[2] || '', postcode: (postcode || '').toUpperCase(), is_active: true, usage_count: 0, created_at: now, created_by: uid };
      const { data: c } = await sb.from('directory_landlords').insert(rec).select().single();
      if (c) { if (!_dir.landlords) _dir.landlords = []; _dir.landlords.push(c); counts.landlords++; }
    }
    async function _tryAgent(name, addr) {
      const n = (name || '').trim(); if (!n) return;
      if ((_dir.agents || []).some(r => norm(r.agency_name || r.contact_name) === norm(n))) return;
      const lines = (addr || '').split(/[,\n]/).map(l => l.trim()).filter(Boolean);
      const rec = { agency_name: n, addr1: lines[0] || '', addr2: lines[1] || '', town: lines[2] || '', is_active: true, usage_count: 0, created_at: now, created_by: uid };
      const { data: c } = await sb.from('directory_agents').insert(rec).select().single();
      if (c) { if (!_dir.agents) _dir.agents = []; _dir.agents.push(c); counts.agents++; }
    }
    async function _tryAppliance(type, make, model) {
      if (!type) return;
      if ((_dir.appliances || []).some(r => norm(r.name) === norm(type) && (!make || !r.manufacturer || norm(r.manufacturer) === norm(make)))) return;
      const rec = { name: type, manufacturer: make || '', model: model || '', category: _inferAppCat(type), is_active: true, usage_count: 0, created_at: now, created_by: uid };
      const { data: c } = await sb.from('appliance_templates').insert(rec).select().single();
      if (c) { _dir.appliances.push(c); counts.appliances++; }
    }

    if (res) res.innerHTML = '<span style="color:var(--muted)">Reading CP12 certificates…</span>';
    const { data: gasCerts } = await sb.from('gas_certs').select('install_address,install_postcode,landlord_address,landlord_postcode,appliances');
    for (const r of gasCerts || []) {
      await _tryProp(r.install_address, r.install_postcode);
      if (r.landlord_address) {
        const ll = (r.landlord_address || '').split('\n').map(s => s.trim()).filter(Boolean);
        await _tryLandlord(ll[0], ll.slice(1).join('\n'), r.landlord_postcode);
      }
      for (const app of r.appliances || []) { await _tryAppliance(app.type, app.make || app.manufacturer, app.model); }
    }

    if (res) res.innerHTML = '<span style="color:var(--muted)">Reading PAT reports…</span>';
    const { data: patReps } = await sb.from('pat_reports').select('property_address,landlord_name,landlord_address,agency_name,agency_address');
    for (const r of patReps || []) {
      const pLines = (r.property_address || '').split('\n').map(s => s.trim()).filter(Boolean);
      const _ukPc = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
      const lastLine = pLines[pLines.length - 1] || '';
      const hasPc = _ukPc.test(lastLine);
      const pAddr = hasPc ? pLines.slice(0, -1).join('\n') : r.property_address || '';
      const pPc = hasPc ? lastLine : '';
      await _tryProp(pAddr, pPc);
      if (r.landlord_name) await _tryLandlord(r.landlord_name, r.landlord_address, '');
      if (r.agency_name) await _tryAgent(r.agency_name, r.agency_address);
    }

    const total = counts.properties + counts.landlords + counts.agents + counts.appliances;
    const msg = total === 0
      ? '<span style="color:var(--success,#22c55e)">✓ All records already in Directory — nothing to import.</span>'
      : `<span style="color:var(--success,#22c55e)">✓ Imported: ${counts.properties} properties, ${counts.landlords} landlords, ${counts.agents} agencies, ${counts.appliances} appliances.</span>`;
    if (res) res.innerHTML = msg;
  } catch (e) {
    if (res) res.innerHTML = `<span style="color:#dc2626">Error: ${e.message}</span>`;
  }
  if (btn) { btn.disabled = false; btn.textContent = '⬇ Import from All Reports'; }
}

export async function dirLoad(type) {
  const tbl = _dirTable[type]; if (!tbl) return [];
  if (!navigator.onLine) {
    try {
      const _c = JSON.parse(localStorage.getItem('_cache_dir_' + type) || 'null');
      if (_c) { _dir[type] = _c.data; return _dir[type]; }
    } catch {}
    _dir[type] = []; return [];
  }
  try {
    const { data } = await sb.from(tbl).select('*').order('usage_count', { ascending: false });
    _dir[type] = data || [];
    try { localStorage.setItem('_cache_dir_' + type, JSON.stringify({ data: _dir[type], ts: Date.now() })); } catch {}
  } catch (e) { _dir[type] = []; }
  return _dir[type];
}

function _dirMatchScore(type, r, ql) {
  let s = 0;
  const fields = type === 'agents' ? [r.agency_name, r.contact_name, r.email, r.postcode, r.phone, r.mobile, r.town, r.addr1] :
    type === 'landlords' ? [r.landlord_name, r.company_name, r.email, r.postcode, r.phone, r.mobile, r.town, r.addr1] :
    type === 'properties' ? [r.addr1, r.addr2, r.town, r.postcode, r.property_ref] :
    type === 'contacts' ? [r.name, r.email, r.phone, r.company, r.role] :
    type === 'appliances' ? [r.name, r.manufacturer, r.model, r.category] : [];
  for (const f of fields) {
    if (!f) continue; const fl = f.toLowerCase();
    if (fl.startsWith(ql)) s += 3;
  }
  return s;
}

export async function dirSearch(type, q) {
  if (!_dir[type]) await dirLoad(type);
  const recs = (_dir[type] || []).filter(r => r.is_active !== false);
  if (!q || q.length < 2) return [...recs].sort((a, b) => (b.last_used_at || '') > (a.last_used_at || '') ? 1 : -1).slice(0, 8);
  const ql = q.toLowerCase();
  return recs.filter(r => _dirMatchScore(type, r, ql) > 0).sort((a, b) => _dirMatchScore(type, b, ql) - _dirMatchScore(type, a, ql)).slice(0, 10);
}

export async function applianceSearch(q) {
  if (!_dir.appliances) {
    try { const { data } = await sb.from('appliance_templates').select('*').order('usage_count', { ascending: false }); _dir.appliances = data || []; }
    catch (e) { _dir.appliances = []; }
  }
  const recs = (_dir.appliances || []).filter(r => r.is_active !== false);
  if (!q || q.length < 2) return [...recs].sort((a, b) => (b.last_used_at || '') > (a.last_used_at || '') ? 1 : -1).slice(0, 8);
  const ql = q.toLowerCase();
  return recs.filter(r => _dirMatchScore('appliances', r, ql) > 0).sort((a, b) => _dirMatchScore('appliances', b, ql) - _dirMatchScore('appliances', a, ql)).slice(0, 10);
}

export async function dirTrackUsage(type, id) {
  const tbl = type === 'appliances' ? 'appliance_templates' : _dirTable[type];
  if (!tbl || !id) return;
  const cache = _dir[type === 'appliances' ? 'appliances' : type] || [];
  const rec = cache.find(r => r.id === id);
  const newCount = (rec?.usage_count || 0) + 1;
  try { await sb.from(tbl).update({ usage_count: newCount, last_used_at: new Date().toISOString() }).eq('id', id); } catch (e) {}
  if (rec) { rec.usage_count = newCount; rec.last_used_at = new Date().toISOString(); }
}

// ── Autocomplete ────────────────────────────────────────────────────────────
let _acDD = null, _acTimer = null, _acIdx = -1, _acItems = [], _acCurInput = null;

function _initAcDD() {
  _acDD = document.getElementById('dir-ac-dd');
  if (!_acDD) { _acDD = document.createElement('div'); _acDD.id = 'dir-ac-dd'; document.body.appendChild(_acDD); }
  if (_acDD._init) return; _acDD._init = true;
  document.addEventListener('pointerdown', e => {
    if (!_acDD.contains(e.target) && e.target !== _acCurInput) _hideAcDD();
  }, { capture: true, passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') _hideAcDD(); });
}

export function _hideAcDD() {
  if (_acDD) _acDD.style.display = 'none';
  _acIdx = -1; _acItems = [];
}

function _posAcDD(el) {
  const r = el.getBoundingClientRect();
  _acDD.style.left = r.left + 'px';
  _acDD.style.width = Math.max(r.width, 260) + 'px';
  const spaceBelow = window.innerHeight - r.bottom - 4;
  if (spaceBelow < 180 && r.top > 200) { _acDD.style.bottom = (window.innerHeight - r.top + 4) + 'px'; _acDD.style.top = ''; }
  else { _acDD.style.top = (r.bottom + 4) + 'px'; _acDD.style.bottom = ''; }
  _acDD.style.display = 'block';
}

function _dirName(type, r) {
  if (!r) return type.slice(0, -1);
  if (type === 'agents') return r.agency_name || r.contact_name || '—';
  if (type === 'landlords') return r.landlord_name || r.company_name || '—';
  if (type === 'properties') return [r.addr1, r.town, r.postcode].filter(Boolean).join(', ');
  if (type === 'contacts') return r.name || '—';
  if (type === 'appliances') return (r.category ? r.category + ' — ' : '') + r.name;
  return '—';
}
function _dirSub(type, r) {
  if (!r) return '';
  if (type === 'agents') return [r.addr1, r.town, r.postcode].filter(Boolean).join(' · ') + (r.email ? ' · ' + r.email : '');
  if (type === 'landlords') return [r.addr1, r.town, r.postcode].filter(Boolean).join(' · ') + (r.email ? ' · ' + r.email : '');
  if (type === 'properties') return [r.addr2].filter(Boolean).join('') + (r.property_ref ? ' · Ref: ' + r.property_ref : '');
  if (type === 'contacts') return [r.company, r.role, r.email].filter(Boolean).join(' · ');
  if (type === 'appliances') return [r.manufacturer, r.model].filter(Boolean).join(' ');
  return '';
}

function _hlText(s, q) {
  if (!s || !q) return s || '';
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return s;
  return s.slice(0, i) + '<mark style="background:rgba(88,166,255,.22);border-radius:2px;padding:0">' + s.slice(i, i + q.length) + '</mark>' + s.slice(i + q.length);
}

function _renderAcDD(items, type, inputEl, q, onSelect) {
  _acItems = items; _acCurInput = inputEl;
  const _closeBtn = `<div style="padding:4px 14px;text-align:right;border-bottom:1px solid var(--border)"><button onclick="_hideAcDD()" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--muted);padding:2px 6px">✕ Close</button></div>`;
  if (!items.length && q.length >= 2) {
    _acDD.innerHTML = _closeBtn + `<div style="padding:10px 14px;font-size:13px;color:var(--muted)">No matches for "${q}"</div>`;
    _posAcDD(inputEl); return;
  }
  if (!items.length) { _hideAcDD(); return; }
  let html = _closeBtn + items.map((item, idx) => `<div class="ac-item" data-idx="${idx}" onclick="_acPick(${idx})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border)">
    <div style="font-size:13px;font-weight:500;color:var(--text)">${_hlText(_dirName(type, item), q)}</div>
    ${_dirSub(type, item) ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${_hlText(_dirSub(type, item), q)}</div>` : ''}
  </div>`).join('');
  _acDD.innerHTML = html;
  _acDD._onSelect = onSelect; _acDD._type = type; _acDD._q = q;
  _acIdx = -1; _posAcDD(inputEl);
}

export function _acPick(idx) {
  const item = _acItems[idx]; if (!item) return;
  const onSel = _acDD._onSelect, type = _acDD._type;
  _hideAcDD();
  if (type && item.id) dirTrackUsage(type, item.id);
  if (onSel) onSel(item);
}

export function _acQuickAdd(e, type, prefill) { e.stopPropagation(); _hideAcDD(); openDirEditModal(type, null, prefill); }

function _acKbd(e) {
  if (!_acDD || _acDD.style.display === 'none') return;
  const its = _acDD.querySelectorAll('.ac-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); _acIdx = Math.min(_acIdx + 1, its.length - 1); its.forEach((el, i) => el.classList.toggle('focused', i === _acIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _acIdx = Math.max(_acIdx - 1, 0); its.forEach((el, i) => el.classList.toggle('focused', i === _acIdx)); }
  else if (e.key === 'Enter' && _acIdx >= 0) { e.preventDefault(); _acPick(_acIdx); }
  else if (e.key === 'Tab') { _hideAcDD(); }
}

function _renderAcDDCombined(items, inputEl, q, onSelect) {
  _acItems = items; _acCurInput = inputEl;
  const closeBtn = '<div style="padding:4px 14px;text-align:right;border-bottom:1px solid var(--border)"><button onclick="_hideAcDD()" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--muted);padding:2px 6px">✕ Close</button></div>';
  if (!items.length) {
    if (q.length >= 2) { _acDD.innerHTML = closeBtn + '<div style="padding:10px 14px;font-size:13px;color:var(--muted)">No matches — this will be saved as new</div>'; _posAcDD(inputEl); }
    else _hideAcDD();
    return;
  }
  const html = closeBtn + items.map((item, idx) => {
    const isAgent = item._dirType === 'agents';
    const typeLabel = isAgent ? 'Agency' : 'Landlord';
    const typeBg = isAgent ? 'rgba(16,185,129,.15)' : 'rgba(99,102,241,.15)';
    const typeColor = isAgent ? '#059669' : '#6366f1';
    const name = _dirName(item._dirType, item);
    const sub = _dirSub(item._dirType, item);
    return '<div class="ac-item" data-idx="' + idx + '" onclick="_acPick(' + idx + ')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border)">'
      + '<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;background:' + typeBg + ';color:' + typeColor + ';white-space:nowrap">' + typeLabel + '</span>'
      + '<span style="font-size:13px;font-weight:500;color:var(--text)">' + _hlText(name, q) + '</span></div>'
      + (sub ? '<div style="font-size:11px;color:var(--muted);margin-top:2px;margin-left:52px">' + _hlText(sub, q) + '</div>' : '')
      + '</div>';
  }).join('');
  _acDD.innerHTML = html;
  _acDD._onSelect = onSelect; _acDD._type = '_combined'; _acDD._q = q;
  _acIdx = -1; _posAcDD(inputEl);
}

export function attachDirACLandlordAgent(inputEl, onSelect) {
  if (!_acDD) _initAcDD();
  if (inputEl._acAttached) return; inputEl._acAttached = true;
  const _doSearch = async (q) => {
    const [ll, ag] = await Promise.all([dirSearch('landlords', q), dirSearch('agents', q)]);
    const combined = [...ll.map(r => ({ ...r, _dirType: 'landlords' })), ...ag.map(r => ({ ...r, _dirType: 'agents' }))].slice(0, 8);
    _renderAcDDCombined(combined, inputEl, q, onSelect);
  };
  inputEl.addEventListener('focus', async () => { _acCurInput = inputEl; const q = inputEl.value.trim(); if (q.length >= 2) await _doSearch(q); });
  inputEl.addEventListener('input', () => {
    clearTimeout(_acTimer); _acCurInput = inputEl;
    const q = inputEl.value.trim();
    _acTimer = setTimeout(async () => { if (q.length < 2) { _hideAcDD(); return; } await _doSearch(q); }, 200);
  });
  inputEl.addEventListener('keydown', _acKbd);
}

export async function quickSaveDirContact(type, name, addr1, addr2, town, postcode, email) {
  const now = new Date().toISOString();
  const uid = state.currentUser?.id || null;
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').trim(); if (!n) return null;
  if (type === 'landlords') {
    if ((_dir.landlords || []).some(r => norm(r.landlord_name || r.company_name) === norm(n))) return 'exists';
    const rec = { landlord_name: n, company_name: '', addr1: addr1 || '', addr2: addr2 || '', town: town || '', postcode: (postcode || '').toUpperCase(), email: email || '', is_active: true, usage_count: 0, created_at: now, created_by: uid };
    const { data: c } = await sb.from('directory_landlords').insert(rec).select().single();
    if (c) { if (!_dir.landlords) _dir.landlords = []; _dir.landlords.push(c); try { localStorage.setItem('_cache_dir_landlords', JSON.stringify({ data: _dir.landlords, ts: Date.now() })); } catch {} return c; }
    return null;
  }
  if (type === 'agents') {
    if ((_dir.agents || []).some(r => norm(r.agency_name || r.contact_name) === norm(n))) return 'exists';
    const rec = { agency_name: n, addr1: addr1 || '', addr2: addr2 || '', town: town || '', postcode: (postcode || '').toUpperCase(), email: email || '', is_active: true, usage_count: 0, created_at: now, created_by: uid };
    const { data: c } = await sb.from('directory_agents').insert(rec).select().single();
    if (c) { if (!_dir.agents) _dir.agents = []; _dir.agents.push(c); try { localStorage.setItem('_cache_dir_agents', JSON.stringify({ data: _dir.agents, ts: Date.now() })); } catch {} return c; }
    return null;
  }
  return null;
}

export function attachDirAC(inputEl, type, onSelect) {
  if (!_acDD) _initAcDD();
  if (inputEl._acAttached) return; inputEl._acAttached = true;
  inputEl.addEventListener('focus', async () => {
    _acCurInput = inputEl;
    const q = inputEl.value.trim();
    if (q.length >= 2) { const res = await dirSearch(type, q); _renderAcDD(res, type, inputEl, q, onSelect); }
  });
  inputEl.addEventListener('input', () => {
    clearTimeout(_acTimer); _acCurInput = inputEl;
    const q = inputEl.value.trim();
    _acTimer = setTimeout(async () => {
      if (q.length < 2) { _hideAcDD(); return; }
      const res = await dirSearch(type, q); _renderAcDD(res, type, inputEl, q, onSelect);
    }, 200);
  });
  inputEl.addEventListener('keydown', _acKbd);
}

export function attachApplianceAC(inputEl, onSelect) {
  if (!_acDD) _initAcDD();
  if (inputEl._acAttached) return; inputEl._acAttached = true;
  const type = 'appliances';
  inputEl.addEventListener('focus', async () => {
    _acCurInput = inputEl;
    const q = inputEl.value.trim();
    const recent = await applianceSearch(q.length >= 2 ? q : '');
    if (recent.length) _renderAcDD(recent, type, inputEl, q, onSelect);
  });
  inputEl.addEventListener('input', () => {
    clearTimeout(_acTimer); _acCurInput = inputEl;
    const q = inputEl.value.trim();
    _acTimer = setTimeout(async () => {
      const res = await applianceSearch(q); _renderAcDD(res, type, inputEl, q, onSelect);
    }, 200);
  });
  inputEl.addEventListener('keydown', _acKbd);
}

// ── Fill helpers ────────────────────────────────────────────────────────────
function _fillToast(msg) { toast(msg + ' — filled from Directory ✓', 'success', 2200); }

function _dirFillAgentPAT(rec) {
  const n = document.getElementById('pat-agency');
  const a = document.getElementById('pat-agency-addr');
  const ph = document.getElementById('pat-phone');
  const em = document.getElementById('pat-email');
  if (n) { n.value = rec.agency_name || rec.contact_name || ''; n.dataset.dirId = rec.id; }
  if (a) { const pts = [rec.addr1, rec.addr2, rec.town, rec.county, rec.postcode].filter(Boolean); a.value = pts.join('\n'); }
  if (ph && rec.phone && !ph.value) ph.value = rec.phone;
  if (em && rec.email && !em.value) em.value = rec.email;
  _fillToast('Agency'); window.doPatPreview?.();
}
function _dirFillLandlordPAT(rec) {
  const n = document.getElementById('pat-landlord');
  const a = document.getElementById('pat-landlord-addr');
  if (n) { n.value = rec.landlord_name || rec.company_name || ''; n.dataset.dirId = rec.id; }
  if (a) { const pts = [rec.addr1, rec.addr2, rec.town, rec.county, rec.postcode].filter(Boolean); a.value = pts.join('\n'); }
  _fillToast('Landlord'); window.doPatPreview?.();
}
function _dirFillPropertyPAT(rec) {
  const a = document.getElementById('pat-addr');
  const pc = document.getElementById('pat-postcode');
  if (a) { const pts = [rec.addr1, rec.addr2, rec.town, rec.county].filter(Boolean); a.value = pts.join('\n'); a.dataset.dirId = rec.id; }
  if (pc) pc.value = rec.postcode || '';
  _fillToast('Property address');
  _offerLinkedContacts(rec, 'pat');
  window.doPatPreview?.();
}
function _dirFillPropertyGas(rec) {
  const a = document.querySelector('[data-field="install_address"]');
  const pc = document.querySelector('[data-field="install_postcode"]');
  if (a) { const pts = [rec.addr1, rec.addr2, rec.town, rec.county].filter(Boolean); a.value = pts.join('\n'); a.dataset.dirId = rec.id; }
  if (pc) pc.value = rec.postcode || '';
  _fillToast('Property address');
  _offerLinkedContacts(rec, 'gas');
}
function _dirFillLandlordGas(rec) {
  const a = document.querySelector('[data-field="landlord_address"]');
  const pc = document.querySelector('[data-field="landlord_postcode"]');
  if (a) { const name = rec.landlord_name || rec.company_name || ''; const pts = [name, rec.addr1, rec.addr2, rec.town, rec.county, rec.postcode].filter(Boolean); a.value = pts.join('\n'); a.dataset.dirId = rec.id; }
  if (pc) pc.value = rec.postcode || '';
  _fillToast('Landlord');
}

function _offerLinkedContacts(propRec, formType) {
  if (!propRec.landlord_id && !propRec.agent_id) return;
  const ll = propRec.landlord_id ? (_dir.landlords || []).find(r => r.id === propRec.landlord_id) : null;
  const ag = propRec.agent_id ? (_dir.agents || []).find(r => r.id === propRec.agent_id) : null;
  if (!ll && !ag) return;
  const bid = 'dir-linked-banner'; let ban = document.getElementById(bid);
  if (!ban) {
    ban = document.createElement('div'); ban.id = bid;
    ban.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:600;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:14px 16px;max-width:300px;box-shadow:0 4px 20px rgba(0,0,0,.35);font-size:13px';
    document.body.appendChild(ban);
  }
  let h = '<div style="font-weight:600;color:var(--accent);margin-bottom:8px">📇 Saved contacts for this property</div>';
  if (ll) h += `<div style="margin-bottom:3px;font-size:12px">Landlord: <strong>${ll.landlord_name || ll.company_name}</strong></div>`;
  if (ag) h += `<div style="margin-bottom:8px;font-size:12px">Agency: <strong>${ag.agency_name || ag.contact_name}</strong></div>`;
  h += '<div style="display:flex;gap:5px;flex-wrap:wrap">';
  if (ll && ag) h += `<button onclick="_applyLinked('both','${formType}')" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px">Apply Both</button>`;
  if (ll) h += `<button onclick="_applyLinked('landlord','${formType}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px">Landlord</button>`;
  if (ag) h += `<button onclick="_applyLinked('agent','${formType}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px">Agency</button>`;
  h += `<button onclick="this.closest('#dir-linked-banner').remove()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:var(--muted)">Ignore</button></div>`;
  ban.innerHTML = h; ban._propRec = propRec; ban._formType = formType;
  clearTimeout(ban._t); ban._t = setTimeout(() => { if (ban.parentNode) ban.remove(); }, 25000);
}

export function _applyLinked(which, formType) {
  const ban = document.getElementById('dir-linked-banner'); if (!ban) return;
  const pr = ban._propRec; ban.remove();
  const ll = pr.landlord_id ? (_dir.landlords || []).find(r => r.id === pr.landlord_id) : null;
  const ag = pr.agent_id ? (_dir.agents || []).find(r => r.id === pr.agent_id) : null;
  if ((which === 'landlord' || which === 'both') && ll) {
    if (formType === 'gw') window._gwFillLandlord?.(ll);
    else if (formType === 'gas') _dirFillLandlordGas(ll);
    else _dirFillLandlordPAT(ll);
  }
  if ((which === 'agent' || which === 'both') && ag && formType === 'pat') { _dirFillAgentPAT(ag); }
}

// ── Form wiring ─────────────────────────────────────────────────────────────
export function _attachPATFormAC() {
  const ag = document.getElementById('pat-agency');
  const la = document.getElementById('pat-landlord');
  const ad = document.getElementById('pat-addr');
  if (ag) attachDirAC(ag, 'agents', _dirFillAgentPAT);
  if (la) attachDirAC(la, 'landlords', _dirFillLandlordPAT);
  if (ad) attachDirAC(ad, 'properties', _dirFillPropertyPAT);
}
export function _attachGasFormAC() {
  const ia = document.querySelector('[data-field="install_address"]');
  const la = document.querySelector('[data-field="landlord_address"]');
  if (ia) attachDirAC(ia, 'properties', _dirFillPropertyGas);
  if (la) attachDirAC(la, 'landlords', _dirFillLandlordGas);
  for (let n = 1; n <= 5; n++) {
    const te = document.querySelector(`[data-field="app${n}_type"]`);
    if (te) {
      const nn = n; attachApplianceAC(te, rec => {
        window.setCP12Field?.(`app${nn}_type`, rec.name || '');
        if (rec.manufacturer) window.setCP12Field?.(`app${nn}_make`, rec.manufacturer);
        if (rec.model) window.setCP12Field?.(`app${nn}_model`, rec.model);
        const d = rec.defaults || {};
        if (d.flue_type) window.setCP12Field?.(`app${nn}_flue_type`, d.flue_type);
        if (d.location) window.setCP12Field?.(`app${nn}_location`, d.location);
        dirTrackUsage('appliances', rec.id);
        toast('Appliance template applied ✓', 'success', 2000);
      });
    }
  }
}

// ── Directory page ───────────────────────────────────────────────────────────
export async function switchDirTab(type) {
  _dirActiveTab = type;
  window._dirActiveTab = type;
  _dirPage = 1;
  document.querySelectorAll('.dir-tab').forEach(t => t.classList.remove('active'));
  const tb = document.getElementById('dtab-' + type); if (tb) tb.classList.add('active');
  document.getElementById('dir-search-input').value = '';
  await renderDirectoryPage();
}

let _dirCerts = null;
async function _loadDirCerts() {
  if (_dirCerts) return;
  const [gr, pr] = await Promise.all([
    sb.from('gas_certs').select('id,install_address,install_postcode,cert_date,next_check_date,status,landlord_address').in('status', ['completed', 'draft']),
    sb.from('pat_reports').select('id,property_address,test_date,status,landlord_name,agency_name')
  ]);
  _dirCerts = { gas: gr.data || [], pat: pr.data || [] };
}
const _dn = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function _propCompliance(prop) {
  if (!_dirCerts) return null;
  const pc = _dn(prop.postcode); const a1 = _dn(prop.addr1);
  const gas = _dirCerts.gas.filter(c => (pc && _dn(c.install_postcode) === pc) || (a1 && _dn(c.install_address || '').startsWith(a1)));
  const pat = _dirCerts.pat.filter(p => { const pa = _dn(p.property_address || ''); return (pc && pa.includes(pc)) || (a1 && pa.includes(a1)); });
  const completed = gas.filter(c => c.status === 'completed').sort((a, b) => new Date(b.cert_date || 0) - new Date(a.cert_date || 0));
  const latest = completed[0];
  let status = 'none', expText = 'No Gas cert', expDate = null;
  if (latest) {
    expDate = latest.next_check_date ? new Date(latest.next_check_date) : null;
    if (expDate) {
      const days = Math.floor((expDate - new Date()) / 86400000);
      if (days < 0) { status = 'expired'; expText = 'Gas expired ' + expDate.toLocaleDateString('en-GB'); }
      else if (days <= 60) { status = 'expiring'; expText = 'Expires ' + expDate.toLocaleDateString('en-GB') + ' (' + days + 'd)'; }
      else { status = 'valid'; expText = 'Valid to ' + expDate.toLocaleDateString('en-GB'); }
    } else { status = 'valid'; expText = 'Gas issued ' + new Date(latest.cert_date || '').toLocaleDateString('en-GB'); }
  }
  const days = expDate ? Math.floor((expDate - new Date()) / 86400000) : null;
  return { gas, pat, completed, latest, status, expText, days };
}
function _landlordCompliance(ll) {
  const _n = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const llName = _n(ll.landlord_name || ll.company_name);
  const matched = new Set((_dir.properties || []).filter(p => p.is_active !== false && p.landlord_id === ll.id).map(p => p.id));
  if (_dirCerts && llName) {
    _dirCerts.gas.forEach(c => {
      if (!c.landlord_address) return;
      if (_n((c.landlord_address || '').split('\n')[0]) !== llName) return;
      const pc = _n(c.install_postcode); const a1 = _n((c.install_address || '').split('\n')[0]);
      const prop = (_dir.properties || []).find(p => p.is_active !== false && ((pc && _n(p.postcode) === pc) || (a1 && _n(p.addr1) === a1)));
      if (prop) matched.add(prop.id);
    });
  }
  const props = (_dir.properties || []).filter(p => matched.has(p.id));
  let valid = 0, expiring = 0, expired = 0, missing = 0, totalGas = 0, totalPat = 0;
  props.forEach(p => {
    const c = _propCompliance(p); if (!c) { missing++; return; }
    totalGas += c.gas.length; totalPat += c.pat.length;
    if (c.status === 'valid') valid++; else if (c.status === 'expiring') expiring++; else if (c.status === 'expired') expired++; else missing++;
  });
  return { propCount: props.length, valid, expiring, expired, missing, totalGas, totalPat };
}
function _agentCompliance(ag) {
  const _n = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const agName = _n(ag.agency_name || ag.contact_name);
  const matched = new Set((_dir.properties || []).filter(p => p.is_active !== false && p.agent_id === ag.id).map(p => p.id));
  if (_dirCerts && agName) {
    _dirCerts.pat.forEach(c => {
      if (!c.agency_name) return;
      if (_n(c.agency_name) !== agName) return;
      const pa = _n(c.property_address || '');
      const prop = (_dir.properties || []).find(p => p.is_active !== false && pa && (pa.includes(_n(p.addr1)) || (p.postcode && pa.includes(_n(p.postcode)))));
      if (prop) matched.add(prop.id);
    });
  }
  const props = (_dir.properties || []).filter(p => matched.has(p.id));
  let valid = 0, expiring = 0, expired = 0, missing = 0;
  props.forEach(p => { const c = _propCompliance(p); if (!c) { missing++; return; } if (c.status === 'valid') valid++; else if (c.status === 'expiring') expiring++; else if (c.status === 'expired') expired++; else missing++; });
  return { propCount: props.length, valid, expiring, expired, missing };
}

export async function renderDirectoryPage() {
  const el = document.getElementById('dir-list-area'); if (!el) return;
  const type = _dirActiveTab;
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  await Promise.all([
    _dir[type] ? null : dirLoad(type),
    (type === 'landlords' || type === 'agents') && !_dir.properties ? dirLoad('properties') : null,
    _loadDirCerts()
  ].filter(Boolean));
  const q = (document.getElementById('dir-search-input')?.value || '').trim();
  const showArch = document.getElementById('dir-show-archived')?.checked;
  let recs = _dir[type] || [];
  if (!showArch) recs = recs.filter(r => r.is_active !== false);
  if (q.length >= 2) { const ql = q.toLowerCase(); recs = recs.filter(r => _dirMatchScore(type, r, ql) > 0); }
  if (type !== _dirLastTab || q !== _dirLastQ) { _dirPage = 1; _dirLastTab = type; _dirLastQ = q; }
  if (!recs.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📇</div><p>No ${type} found${q ? ' matching "' + q + '"' : ''}</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openDirEditModal('${type}')">+ Add First</button></div>`;
    return;
  }
  const total = recs.length;
  const totalPages = Math.ceil(total / _DIR_PAGE_SIZE);
  if (_dirPage < 1) _dirPage = 1;
  if (_dirPage > totalPages) _dirPage = totalPages;
  const start = (_dirPage - 1) * _DIR_PAGE_SIZE;
  const pageRecs = recs.slice(start, start + _DIR_PAGE_SIZE);
  const q2 = q.length >= 2 ? q : '';
  el.innerHTML = '<div class="dir-list">' + pageRecs.map(r => _dirCard(type, r, q2)).join('') + '</div>' + _dirPaginationHtml(total, _dirPage, totalPages);
}

function _dirPaginationHtml(total, page, totalPages) {
  if (totalPages <= 1) return '';
  const start = (page - 1) * _DIR_PAGE_SIZE + 1;
  const end = Math.min(page * _DIR_PAGE_SIZE, total);
  const prevDis = page <= 1 ? ' disabled' : '';
  const nextDis = page >= totalPages ? ' disabled' : '';
  let pages = '';
  const lo = Math.max(1, page - 2), hi = Math.min(totalPages, page + 2);
  if (lo > 1) pages += `<button class="dir-pg-btn" onclick="window._dirGoPage(1)">1</button>${lo > 2 ? '<span class="dir-pg-gap">…</span>' : ''}`;
  for (let i = lo; i <= hi; i++) pages += `<button class="dir-pg-btn${i === page ? ' active' : ''}" onclick="window._dirGoPage(${i})">${i}</button>`;
  if (hi < totalPages) pages += `${hi < totalPages - 1 ? '<span class="dir-pg-gap">…</span>' : ''}<button class="dir-pg-btn" onclick="window._dirGoPage(${totalPages})">${totalPages}</button>`;
  return `<div class="dir-pagination"><button class="dir-pg-btn"${prevDis} onclick="window._dirGoPage(${page - 1})">‹ Prev</button>${pages}<button class="dir-pg-btn"${nextDis} onclick="window._dirGoPage(${page + 1})">Next ›</button><span class="dir-pg-info">${start}–${end} of ${total}</span></div>`;
}

window._dirGoPage = function(n) { _dirPage = n; renderDirectoryPage(); };

function _cpill(cls, icon, txt) { return `<span class="cpill cpill-${cls}">${icon} ${txt}</span>`; }
function _daysPillHtml(days) {
  if (days === null || days === undefined) return '';
  let bg, fg, bdr;
  if (days > 180) { bg = 'rgba(34,197,94,.13)'; fg = '#16a34a'; bdr = 'rgba(34,197,94,.35)'; }
  else if (days > 90) { bg = 'rgba(101,163,13,.13)'; fg = '#4d7c0f'; bdr = 'rgba(101,163,13,.35)'; }
  else if (days > 60) { bg = 'rgba(234,179,8,.13)'; fg = '#a16207'; bdr = 'rgba(234,179,8,.4)'; }
  else if (days > 30) { bg = 'rgba(234,88,12,.13)'; fg = '#c2410c'; bdr = 'rgba(234,88,12,.35)'; }
  else if (days > 0) { bg = 'rgba(220,38,38,.13)'; fg = '#dc2626'; bdr = 'rgba(220,38,38,.35)'; }
  else { bg = 'rgba(127,29,29,.15)'; fg = '#991b1b'; bdr = 'rgba(127,29,29,.45)'; }
  const txt = days <= 0 ? `Expired ${Math.abs(days)}d ago` : `${days} days`;
  return `<span style="display:inline-flex;align-items:center;font-size:12px;font-weight:800;padding:3px 10px;border-radius:20px;background:${bg};color:${fg};border:1px solid ${bdr};letter-spacing:.01em;line-height:1.6">${txt}</span>`;
}
function _complianceBorderColor(status, days) {
  if (status === 'expired' || (days !== null && days <= 0)) return '#ef4444';
  if (status === 'expiring' || status === 'valid') {
    if (days === null) return status === 'valid' ? '#22c55e' : '#f59e0b';
    if (days > 180) return '#22c55e'; if (days > 90) return '#65a30d'; if (days > 60) return '#eab308';
    if (days > 30) return '#f97316'; if (days > 0) return '#ef4444'; return '#b91c1c';
  }
  return 'var(--border)';
}
function _dirCard(type, r, q) {
  const name = _dirName(type, r); const sub = _dirSub(type, r);
  const arch = r.is_active === false;
  let pills = ''; let footer = ''; let extraBtns = ''; let cardStyle = '';
  if (type === 'properties') {
    const c = _propCompliance(r);
    const days = c ? c.days : null;
    const borderColor = c ? _complianceBorderColor(c.status, days) : 'var(--border)';
    cardStyle = `border-left:4px solid ${borderColor};border-radius:2px 10px 10px 2px`;
    if (c) {
      const gasIcon = { valid: '✓', expiring: '⚠', expired: '✕', none: '—' }[c.status] || '—';
      const gasLabel = 'Gas · ' + c.expText + (c.status === 'valid' && days !== null ? ' · ' + days + 'd' : '');
      pills += _cpill(c.status, gasIcon, gasLabel);
      const latestPat = [...c.pat].filter(p => p.status === 'completed').sort((a, b) => new Date(b.test_date || 0) - new Date(a.test_date || 0))[0];
      if (latestPat && latestPat.test_date) { const pd = new Date(latestPat.test_date).toLocaleDateString('en-GB'); pills += _cpill('info', '📋', 'PAT · Tested ' + pd); }
      else pills += _cpill('none', '📋', 'PAT · None');
      const ll = r.landlord_id ? (_dir.landlords || []).find(l => l.id === r.landlord_id) : null;
      if (ll) footer += `<span>👤 ${ll.landlord_name || ll.company_name || 'Landlord'}</span>`;
      if (c.gas.length) footer += `<span>📄 ${c.gas.length} Gas</span>`;
    }
    extraBtns = `<button class="dir-new-btn" onclick="showNewCertDD(this,'${r.id}')">+ New <span style="font-size:9px;opacity:.8">▾</span></button>`;
  } else if (type === 'landlords') {
    const c = _landlordCompliance(r);
    pills += _cpill('info', '🏠', c.propCount + ' propert' + (c.propCount === 1 ? 'y' : 'ies'));
    if (c.valid) pills += _cpill('valid', '✓', c.valid + ' compliant');
    if (c.expiring) pills += _cpill('expiring', '⚠', c.expiring + ' expiring');
    if (c.expired) pills += _cpill('expired', '✕', c.expired + ' expired');
    if (c.missing) pills += _cpill('none', '—', c.missing + ' no cert');
    if (c.totalGas || c.totalPat) footer += `<span>${c.totalGas} Gas · ${c.totalPat} PAT</span>`;
    if (r.email) footer += `<span>${r.email}</span>`;
    if (r.phone) footer += `<span>${r.phone}</span>`;
  } else if (type === 'agents') {
    const c = _agentCompliance(r);
    pills += _cpill('info', '🏠', c.propCount + ' propert' + (c.propCount === 1 ? 'y' : 'ies'));
    if (c.valid) pills += _cpill('valid', '✓', c.valid + ' compliant');
    if (c.expiring) pills += _cpill('expiring', '⚠', c.expiring + ' expiring');
    if (c.expired) pills += _cpill('expired', '✕', c.expired + ' expired');
    if (r.email) footer += `<span>${r.email}</span>`;
    if (r.phone) footer += `<span>${r.phone}</span>`;
  } else {
    const usedTxt = r.usage_count ? `Used ${r.usage_count}×` : 'Never used';
    footer = usedTxt + (r.last_used_at ? ' · Last ' + new Date(r.last_used_at).toLocaleDateString('en-GB') : '');
  }
  return `<div class="dir-card${arch ? ' dir-card-archived' : ''}"${cardStyle ? ` style="${cardStyle}"` : ''}>
    <div class="dir-card-avatar" onclick="openDirDetail('${type}','${r.id}')" style="cursor:pointer">${(name[0] || '?')}</div>
    <div class="dir-card-body" onclick="openDirDetail('${type}','${r.id}')" style="cursor:pointer">
      <div class="dir-card-name">${_hlText(name, q)}${arch ? ' <span style="font-size:10px;color:var(--muted);font-weight:600">[archived]</span>' : ''}</div>
      ${sub ? `<div class="dir-card-sub">${_hlText(sub, q)}</div>` : ''}
      ${pills ? `<div class="dir-pills">${pills}</div>` : ''}
      ${footer ? `<div class="dir-card-footer">${footer}</div>` : ''}
    </div>
    <div class="dir-card-actions">
      ${extraBtns}
      <button class="dir-act-btn" onclick="openDirEditModal('${type}','${r.id}')">Edit</button>
      ${(type === 'landlords' || type === 'agents') ? `<button class="dir-act-btn" onclick="dirOpenMerge('${type}','${r.id}')">Merge…</button>` : ''}
      ${type === 'landlords' ? `<button class="dir-act-btn" style="color:#059669" onclick="dirChangeType('landlords','${r.id}')">→ Agency</button>` : ''}
      ${type === 'agents' ? `<button class="dir-act-btn" style="color:#6366f1" onclick="dirChangeType('agents','${r.id}')">→ Landlord</button>` : ''}
      <button class="dir-act-btn" style="color:${arch ? 'var(--success)' : 'var(--muted)'}" onclick="dirToggleArchive('${type}','${r.id}',${r.is_active !== false})">${arch ? 'Restore' : 'Archive'}</button>
    </div>
  </div>`;
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function _getDirDetailDrawer() {
  let ov = document.getElementById('dir-detail-ov');
  let dr = document.getElementById('dir-detail-dr');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'dir-detail-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:8499;background:rgba(0,0,0,.3);display:none;opacity:0;transition:opacity .2s';
    ov.onclick = () => window.closeDirDetail();
    document.body.appendChild(ov);
  }
  if (!dr) {
    dr = document.createElement('div'); dr.id = 'dir-detail-dr';
    dr.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:460px;max-width:100vw;background:var(--surface);border-left:1px solid var(--border);z-index:8500;display:flex;flex-direction:column;box-shadow:-6px 0 40px rgba(0,0,0,.18);transform:translateX(100%);transition:transform .25s cubic-bezier(.4,0,.2,1)';
    document.body.appendChild(dr);
  }
  return { dr, ov };
}

export function openDirDetail(type, id) {
  const rec = (_dir[type] || []).find(r => r.id === id); if (!rec) return;
  const { dr, ov } = _getDirDetailDrawer();
  dr.innerHTML = _buildDetailHtml(type, rec);
  ov.style.display = 'block';
  requestAnimationFrame(() => { ov.style.opacity = '1'; dr.style.transform = 'translateX(0)'; });
}

window.closeDirDetail = function() {
  const dr = document.getElementById('dir-detail-dr');
  const ov = document.getElementById('dir-detail-ov');
  if (!dr) return;
  dr.style.transform = 'translateX(100%)';
  if (ov) { ov.style.opacity = '0'; setTimeout(() => { ov.style.display = 'none'; }, 200); }
};

function _buildDetailHtml(type, r) {
  const _e = v => (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = _dirName(type, r);
  const sub = _dirSub(type, r);
  const typeLabel = type === 'landlords' ? 'Landlord' : type === 'agents' ? 'Agency' : type === 'properties' ? 'Property' : 'Contact';
  const body = type === 'properties' ? _detailProperty(r) : (type === 'landlords' || type === 'agents') ? _detailEntity(type, r) : '';
  return `<div style="padding:16px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0">
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:4px">${typeLabel}</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);line-height:1.2">${_e(name)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">${_e(sub)}</div>` : ''}
    </div>
    <button onclick="closeDirDetail()" style="background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:var(--muted);padding:2px 4px;flex-shrink:0;margin-top:-2px">×</button>
  </div>
  <div style="flex:1;overflow-y:auto;padding:18px 20px 24px">${body}</div>
  <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
    <button class="btn btn-secondary" onclick="closeDirDetail();openDirEditModal('${type}','${r.id}')">✏ Edit</button>
    ${type === 'properties' ? `<button class="btn btn-primary" onclick="closeDirDetail();setTimeout(()=>showNewCertDD(document.body,'${r.id}'),50)">+ New Cert</button>` : ''}
  </div>`;
}

function _detailSectionTitle(t) {
  return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px">${t}</div>`;
}

function _detailEntity(type, r) {
  const _e = v => (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const _n = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isLandlord = type === 'landlords';
  // Build matched property set (same logic as compliance)
  const matched = new Set((_dir.properties || []).filter(p => p.is_active !== false && (isLandlord ? p.landlord_id === r.id : p.agent_id === r.id)).map(p => p.id));
  if (_dirCerts) {
    const nameKey = _n(isLandlord ? (r.landlord_name || r.company_name) : (r.agency_name || r.contact_name));
    if (nameKey) {
      if (isLandlord) {
        _dirCerts.gas.forEach(c => {
          if (!c.landlord_address || _n((c.landlord_address || '').split('\n')[0]) !== nameKey) return;
          const pc = _n(c.install_postcode); const a1 = _n((c.install_address || '').split('\n')[0]);
          const prop = (_dir.properties || []).find(p => p.is_active !== false && ((pc && _n(p.postcode) === pc) || (a1 && _n(p.addr1) === a1)));
          if (prop) matched.add(prop.id);
        });
      } else {
        _dirCerts.pat.forEach(c => {
          if (!c.agency_name || _n(c.agency_name) !== nameKey) return;
          const pa = _n(c.property_address || '');
          const prop = (_dir.properties || []).find(p => p.is_active !== false && pa && (pa.includes(_n(p.addr1)) || (p.postcode && pa.includes(_n(p.postcode)))));
          if (prop) matched.add(prop.id);
        });
      }
    }
  }
  const props = (_dir.properties || []).filter(p => matched.has(p.id));
  // Contact info
  const contactFields = [];
  if (r.email) contactFields.push(['✉', 'Email', r.email]);
  if (r.phone) contactFields.push(['📞', 'Phone', r.phone]);
  if (r.mobile) contactFields.push(['📱', 'Mobile', r.mobile]);
  if (r.addr1) contactFields.push(['📍', 'Address', [r.addr1, r.addr2, r.town, r.county, r.postcode].filter(Boolean).join(', ')]);
  if (r.notes) contactFields.push(['📝', 'Notes', r.notes]);
  let contactHtml = contactFields.length ? `<div style="margin-bottom:20px">${_detailSectionTitle('Contact Details')}${contactFields.map(([ic, lb, vl]) =>
    `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
      <span style="width:18px;flex-shrink:0">${ic}</span>
      <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">${lb}</div><div style="font-size:13px;color:var(--text)">${_e(vl)}</div></div>
    </div>`).join('')}</div>` : '';
  // Properties
  let propsHtml = props.length === 0
    ? `<div style="padding:14px;background:var(--bg);border-radius:10px;text-align:center;color:var(--muted);font-size:13px">No properties linked yet</div>`
    : props.map(p => {
        const c = _propCompliance(p);
        const borderColor = c ? _complianceBorderColor(c.status, c.days) : 'var(--border)';
        const sCol = { valid: '#22c55e', expiring: '#f59e0b', expired: '#ef4444', none: 'var(--muted)' }[c?.status || 'none'];
        const sIco = { valid: '✓', expiring: '⚠', expired: '✕', none: '—' }[c?.status || 'none'];
        return `<div style="padding:10px 12px;border:1px solid var(--border);border-left:4px solid ${borderColor};border-radius:2px 8px 8px 2px;margin-bottom:8px;cursor:pointer;background:var(--bg)" onclick="closeDirDetail();setTimeout(()=>openDirDetail('properties','${p.id}'),60)">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${_e(p.addr1)}</div>
          ${[p.addr2, p.town, p.postcode].filter(Boolean).length ? `<div style="font-size:11px;color:var(--muted)">${_e([p.addr2, p.town, p.postcode].filter(Boolean).join(', '))}</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${c ? `<span style="font-size:11px;font-weight:700;color:${sCol}">${sIco} ${c.expText}</span>` : ''}
            ${c && c.pat.length ? `<span style="font-size:11px;color:var(--muted)">· ${c.pat.length} PAT</span>` : ''}
            <span style="font-size:11px;color:var(--accent);margin-left:auto">View →</span>
          </div>
        </div>`;
      }).join('');
  return contactHtml + _detailSectionTitle(`${isLandlord ? 'Properties' : 'Managed Properties'} (${props.length})`) + propsHtml;
}

function _detailProperty(p) {
  const _e = v => (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!_dirCerts) return '<p style="color:var(--muted);font-size:13px;text-align:center;padding:20px">Loading certificate history…</p>';
  const pc = _dn(p.postcode); const a1 = _dn(p.addr1);
  const gasCerts = (_dirCerts.gas || [])
    .filter(c => (pc && _dn(c.install_postcode) === pc) || (a1 && _dn((c.install_address || '').split('\n')[0]) === a1))
    .sort((a, b) => new Date(b.cert_date || 0) - new Date(a.cert_date || 0));
  const patCerts = (_dirCerts.pat || [])
    .filter(c => { const pa = _dn(c.property_address || ''); return (pc && pa.includes(pc)) || (a1 && pa.includes(a1)); })
    .sort((a, b) => new Date(b.test_date || 0) - new Date(a.test_date || 0));
  // Linked landlord/agent buttons
  const ll = p.landlord_id ? (_dir.landlords || []).find(l => l.id === p.landlord_id) : null;
  const ag = p.agent_id ? (_dir.agents || []).find(a => a.id === p.agent_id) : null;
  const linksHtml = (ll || ag) ? `<div style="margin-bottom:18px;display:flex;gap:8px;flex-wrap:wrap">
    ${ll ? `<button style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px;font-weight:700;color:var(--text)" onclick="closeDirDetail();setTimeout(()=>openDirDetail('landlords','${ll.id}'),60)">👤 ${_e(ll.landlord_name || ll.company_name)}</button>` : ''}
    ${ag ? `<button style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px;font-weight:700;color:var(--text)" onclick="closeDirDetail();setTimeout(()=>openDirDetail('agents','${ag.id}'),60)">🏢 ${_e(ag.agency_name || ag.contact_name)}</button>` : ''}
  </div>` : '';
  // Gas history
  const gasRows = gasCerts.length === 0
    ? `<div style="padding:14px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--muted);text-align:center">No gas certificates found</div>`
    : gasCerts.map((c, i) => {
        const isLatest = i === 0 && c.status === 'completed';
        const certDate = c.cert_date ? new Date(c.cert_date).toLocaleDateString('en-GB') : '—';
        const expDate = c.next_check_date ? new Date(c.next_check_date).toLocaleDateString('en-GB') : null;
        const days = c.next_check_date ? Math.floor((new Date(c.next_check_date) - new Date()) / 86400000) : null;
        let badge = 'Superseded'; let bCol = 'var(--muted)';
        if (c.status === 'draft') { badge = 'Draft'; bCol = '#6366f1'; }
        else if (isLatest) {
          if (days === null) { badge = 'Valid'; bCol = '#22c55e'; }
          else if (days < 0) { badge = 'Expired'; bCol = '#ef4444'; }
          else if (days <= 60) { badge = 'Expiring · ' + days + 'd'; bCol = '#f59e0b'; }
          else { badge = 'Valid · ' + days + 'd'; bCol = '#22c55e'; }
        }
        const landlordName = c.landlord_address ? _e((c.landlord_address || '').split('\n')[0]) : null;
        return `<div style="padding:11px 13px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg);${i > 0 ? 'opacity:.7' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:12px;font-weight:800;color:${bCol}">🔥 ${badge}</span>
            <button style="font-size:11px;font-weight:700;color:var(--accent);background:none;border:none;cursor:pointer;padding:0" onclick="closeDirDetail();navigate('gas-cert-${c.id}')">View cert →</button>
          </div>
          <div style="font-size:12px;color:var(--text)">Issued: <strong>${certDate}</strong>${expDate ? ` · Expires: <strong>${expDate}</strong>` : ''}</div>
          ${landlordName ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">👤 ${landlordName}</div>` : ''}
        </div>`;
      }).join('');
  // PAT history
  const patRows = patCerts.length === 0
    ? `<div style="padding:14px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--muted);text-align:center">No PAT certificates found</div>`
    : patCerts.map((c, i) => {
        const testDate = c.test_date ? new Date(c.test_date).toLocaleDateString('en-GB') : '—';
        const badge = i === 0 ? 'Latest' : 'Superseded';
        const bCol = i === 0 ? '#22c55e' : 'var(--muted)';
        return `<div style="padding:11px 13px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg);${i > 0 ? 'opacity:.7' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:12px;font-weight:800;color:${bCol}">⚡ ${badge}</span>
            <button style="font-size:11px;font-weight:700;color:var(--accent);background:none;border:none;cursor:pointer;padding:0" onclick="closeDirDetail();navigate('pat-cert-${c.id}')">View cert →</button>
          </div>
          <div style="font-size:12px;color:var(--text)">Tested: <strong>${testDate}</strong>${c.status === 'draft' ? ' <span style="color:var(--muted)">(Draft)</span>' : ''}</div>
        </div>`;
      }).join('');
  return linksHtml
    + `<div style="margin-bottom:20px">${_detailSectionTitle('Gas Safety History (' + gasCerts.length + ')')}${gasRows}</div>`
    + `<div>${_detailSectionTitle('PAT Test History (' + patCerts.length + ')')}${patRows}</div>`;
}

export function showNewCertDD(btn, propId) {
  let dd = document.getElementById('dir-new-cert-dd');
  if (!dd) {
    dd = document.createElement('div'); dd.id = 'dir-new-cert-dd';
    document.body.appendChild(dd);
    document.addEventListener('click', function(e) {
      const d = document.getElementById('dir-new-cert-dd');
      if (d && d.style.display !== 'none' && !d.contains(e.target) && !e.target.closest('.dir-new-btn')) d.style.display = 'none';
    }, true);
  }
  dd.innerHTML = `<div style="padding:4px 0">
    <button class="dnd-item" onclick="newCP12FromDir('${propId}');document.getElementById('dir-new-cert-dd').style.display='none'">
      <span class="dnd-icon" style="background:rgba(239,68,68,.1)">🔥</span>
      <span><div style="font-size:13px;font-weight:700;color:var(--text)">CP12 Gas Safety</div><div style="font-size:11px;color:var(--muted);font-weight:500;margin-top:1px">Annual landlord certificate</div></span>
    </button>
    <button class="dnd-item" onclick="newPATFromDir('${propId}');document.getElementById('dir-new-cert-dd').style.display='none'">
      <span class="dnd-icon" style="background:rgba(59,130,246,.1)">⚡</span>
      <span><div style="font-size:13px;font-weight:700;color:var(--text)">PAT Electrical Test</div><div style="font-size:11px;color:var(--muted);font-weight:500;margin-top:1px">Portable appliance testing</div></span>
    </button>
  </div>`;
  const rect = btn.getBoundingClientRect();
  dd.style.display = 'block';
  let left = rect.right - 220; if (left < 8) left = 8;
  let top = rect.bottom + 5; if (top + 200 > window.innerHeight) top = rect.top - 200 - 5;
  dd.style.left = left + 'px'; dd.style.top = top + 'px';
}

export function newCP12FromDir(propId) {
  const p = (_dir.properties || []).find(r => r.id === propId); if (!p) return;
  navigate('gas-new');
  setTimeout(() => {
    const addr = [p.addr1, p.addr2, p.town, p.county].filter(Boolean).join('\n');
    window.setCP12Field?.('install_address', addr); window.setCP12Field?.('install_postcode', p.postcode || '');
    const ll = p.landlord_id ? (_dir.landlords || []).find(l => l.id === p.landlord_id) : null;
    if (ll) {
      const la = [ll.addr1, ll.addr2, ll.town, ll.county].filter(Boolean).join('\n');
      const ln = ll.landlord_name || ll.company_name || '';
      window.setCP12Field?.('landlord_address', ln + (la ? '\n' + la : '')); window.setCP12Field?.('landlord_postcode', ll.postcode || '');
      window.setCP12Field?.('recipient_email', ll.email || '');
    }
  }, 250);
}

export function newPATFromDir(propId) {
  const p = (_dir.properties || []).find(r => r.id === propId); if (!p) return;
  navigate('pat-new');
  setTimeout(() => {
    const addr = [p.addr1, p.addr2, p.town, p.county].filter(Boolean).join('\n');
    const patAddr = document.getElementById('pat-addr'); if (patAddr) patAddr.value = addr;
    const patPc = document.getElementById('pat-postcode'); if (patPc) patPc.value = p.postcode || '';
    const ll = p.landlord_id ? (_dir.landlords || []).find(l => l.id === p.landlord_id) : null;
    if (ll) {
      const patLl = document.getElementById('pat-landlord'); if (patLl) patLl.value = ll.landlord_name || ll.company_name || '';
      const patEm = document.getElementById('pat-email'); if (patEm) patEm.value = ll.email || '';
    }
    window.updatePatRef?.();
  }, 250);
}

export async function dirToggleArchive(type, id, currentlyActive) {
  const tbl = _dirTable[type]; if (!tbl) return;
  const { error } = await sb.from(tbl).update({ is_active: !currentlyActive, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (_dir[type]) { const i = _dir[type].findIndex(r => r.id === id); if (i >= 0) _dir[type][i].is_active = !currentlyActive; }
  toast(currentlyActive ? 'Archived' : 'Restored', 'success'); renderDirectoryPage();
}

let _dirEditType = null, _dirEditId = null;
function _getDirEditModal() {
  let m = document.getElementById('dir-edit-modal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'dir-edit-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;z-index:9100;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);padding:16px';
  m.innerHTML = `
    <div style="background:var(--surface);border-radius:14px;width:100%;max-width:640px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div id="dir-edit-modal-title" style="font-size:16px;font-weight:700;color:var(--text)"></div>
        <button onclick="closeDirEditModal()" style="background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:var(--muted);padding:2px 6px">×</button>
      </div>
      <div id="dir-edit-modal-body" style="padding:18px 20px;overflow-y:auto;flex:1"></div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeDirEditModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveDirRecord()">Save</button>
      </div>
    </div>`;
  m.addEventListener('pointerdown', e => { if (e.target === m) closeDirEditModal(); });
  document.body.appendChild(m);
  return m;
}

export function openDirEditModal(type, id = null, prefill = '') {
  _dirEditType = type; _dirEditId = id || null;
  const rec = id ? (_dir[type] || []).find(r => r.id === id) : null;
  const labels = { agents: 'Agency', landlords: 'Landlord', properties: 'Property', contacts: 'Contact' };
  const m = _getDirEditModal();
  document.getElementById('dir-edit-modal-title').textContent = (id ? 'Edit ' : 'New ') + (labels[type] || type);
  document.getElementById('dir-edit-modal-body').innerHTML = _dirForm(type, rec, prefill);
  delete m.dataset.dupConfirmed;
  if (type === 'properties') setTimeout(_populateDirSelects, 0);
  m.style.display = 'flex';
}
export function closeDirEditModal() { const m = document.getElementById('dir-edit-modal'); if (m) m.style.display = 'none'; _dirEditType = null; _dirEditId = null; }

function _dirForm(type, rec, pf = '') {
  const v = (f, fb = '') => rec ? (rec[f] || fb) : (f === 'agency_name' || f === 'landlord_name' || f === 'addr1' || f === 'name' ? pf : fb);
  const esc = s => (s || '').replace(/"/g, '&quot;');
  const inp = (f, lbl, t2 = 'text', req = false) => `<div class="field-group"><label>${lbl}${req ? ' <span style="color:var(--error)">*</span>' : ''}</label><input type="${t2}" id="de-${f}" value="${esc(v(f))}" placeholder="${lbl}" class="form-control"></div>`;
  const ta = (f, lbl, rows = 2) => `<div class="field-group"><label>${lbl}</label><textarea id="de-${f}" rows="${rows}" class="form-control" style="resize:vertical">${v(f)}</textarea></div>`;
  const row = (...cols) => `<div class="field-grid">${cols.join('')}</div>`;
  if (type === 'agents') return row(inp('agency_name', 'Agency / Company Name', 'text', true), inp('contact_name', 'Contact Person')) + row(inp('email', 'Email', 'email'), inp('email2', 'Secondary Email', 'email')) + row(inp('cc_emails', 'CC Emails (comma-separated)'), inp('phone', 'Telephone', 'tel')) + row(inp('mobile', 'Mobile', 'tel'), inp('addr1', 'Address Line 1')) + row(inp('addr2', 'Address Line 2'), inp('town', 'Town / City')) + row(inp('county', 'County'), inp('postcode', 'Postcode')) + ta('notes', 'Notes');
  if (type === 'landlords') return row(inp('landlord_name', 'Landlord Name', 'text', true), inp('company_name', 'Company Name')) + row(inp('email', 'Email', 'email'), inp('email2', 'Secondary Email', 'email')) + row(inp('cc_emails', 'CC Emails (comma-separated)'), inp('phone', 'Telephone', 'tel')) + row(inp('mobile', 'Mobile', 'tel'), inp('addr1', 'Address Line 1')) + row(inp('addr2', 'Address Line 2'), inp('town', 'Town / City')) + row(inp('county', 'County'), inp('postcode', 'Postcode')) + ta('notes', 'Notes');
  if (type === 'contacts') return row(inp('name', 'Full Name', 'text', true), inp('company', 'Company')) + row(inp('role', 'Role / Title'), inp('email', 'Email', 'email')) + row(inp('phone', 'Telephone', 'tel'), inp('mobile', 'Mobile', 'tel')) + ta('notes', 'Notes');
  if (type === 'properties') return row(inp('addr1', 'Address Line 1', 'text', true), inp('addr2', 'Address Line 2')) + row(inp('town', 'Town / City'), inp('county', 'County')) + row(inp('postcode', 'Postcode', 'text', true), inp('property_ref', 'Property Ref (optional)')) + '<div class="field-grid"><div class="field-group"><label>Linked Landlord</label><select id="de-landlord_id" class="form-control"><option value="">— None —</option></select></div><div class="field-group"><label>Linked Agent</label><select id="de-agent_id" class="form-control"><option value="">— None —</option></select></div></div>' + '<div class="field-grid"><div class="field-group"><label>Expiry Reminders</label><select id="de-expiry_reminder" class="form-control"><option value="">Use global setting</option><option value="on">On — always remind</option><option value="off">Off — never remind</option></select><div style="font-size:11px;color:var(--muted);margin-top:3px">Override global reminder setting for this property only</div></div></div>' + ta('access_notes', 'Access Notes') + ta('keysafe', 'Keysafe / Entry Code', 1) + ta('notes', 'Notes');
  return '';
}

async function _populateDirSelects() {
  if (!_dir.landlords) await dirLoad('landlords');
  if (!_dir.agents) await dirLoad('agents');
  const rec = _dirEditId ? (_dir.properties || []).find(r => r.id === _dirEditId) : null;
  const ls = document.getElementById('de-landlord_id');
  const as = document.getElementById('de-agent_id');
  (_dir.landlords || []).filter(r => r.is_active !== false).forEach(r => {
    const o = document.createElement('option'); o.value = r.id; o.textContent = r.landlord_name || r.company_name || '—';
    if (rec && rec.landlord_id === r.id) o.selected = true; if (ls) ls.appendChild(o);
  });
  (_dir.agents || []).filter(r => r.is_active !== false).forEach(r => {
    const o = document.createElement('option'); o.value = r.id; o.textContent = r.agency_name || r.contact_name || '—';
    if (rec && rec.agent_id === r.id) o.selected = true; if (as) as.appendChild(o);
  });
  const erSel = document.getElementById('de-expiry_reminder');
  if (erSel && rec && rec.expiry_reminder) erSel.value = rec.expiry_reminder;
}

export async function saveDirRecord() {
  const type = _dirEditType; const tbl = _dirTable[type]; if (!tbl) return;
  const gv = id => (document.getElementById('de-' + id) || {}).value?.trim() || '';
  let data = {}, pk = '';
  if (type === 'agents') { pk = 'agency_name'; data = { agency_name: gv('agency_name'), contact_name: gv('contact_name'), email: gv('email'), email2: gv('email2'), cc_emails: gv('cc_emails'), phone: gv('phone'), mobile: gv('mobile'), addr1: gv('addr1'), addr2: gv('addr2'), town: gv('town'), county: gv('county'), postcode: gv('postcode').toUpperCase(), notes: gv('notes') }; }
  else if (type === 'landlords') { pk = 'landlord_name'; data = { landlord_name: gv('landlord_name'), company_name: gv('company_name'), email: gv('email'), email2: gv('email2'), cc_emails: gv('cc_emails'), phone: gv('phone'), mobile: gv('mobile'), addr1: gv('addr1'), addr2: gv('addr2'), town: gv('town'), county: gv('county'), postcode: gv('postcode').toUpperCase(), notes: gv('notes') }; }
  else if (type === 'properties') { pk = 'addr1'; data = { addr1: gv('addr1'), addr2: gv('addr2'), town: gv('town'), county: gv('county'), postcode: gv('postcode').toUpperCase(), property_ref: gv('property_ref'), landlord_id: gv('landlord_id') || null, agent_id: gv('agent_id') || null, expiry_reminder: gv('expiry_reminder') || null, access_notes: gv('access_notes'), keysafe: gv('keysafe'), notes: gv('notes') }; }
  else if (type === 'contacts') { pk = 'name'; data = { name: gv('name'), company: gv('company'), role: gv('role'), email: gv('email'), phone: gv('phone'), mobile: gv('mobile'), notes: gv('notes') }; }
  if (!data[pk]) { toast('Required field missing', 'warn'); return; }
  const existing = (_dir[type] || []).filter(r => _dirEditId ? r.id !== _dirEditId : true);
  const norm = s => (s || '').toLowerCase().replace(/\s+ltd\.?$|\s+limited\.?$/, '').replace(/[^a-z0-9]/g, '');
  const isDup = existing.some(r => norm(data[pk]) && norm(data[pk]) === norm(r[pk]));
  const _dem = document.getElementById('dir-edit-modal');
  if (isDup && !_dem?.dataset.dupConfirmed) {
    if (!confirm('A similar record already exists. Save anyway?')) return;
    if (_dem) _dem.dataset.dupConfirmed = '1';
  }
  data.updated_at = new Date().toISOString();
  let error;
  if (_dirEditId) {
    ({ error } = await sb.from(tbl).update(data).eq('id', _dirEditId));
    if (!error && _dir[type]) { const i = _dir[type].findIndex(r => r.id === _dirEditId); if (i >= 0) Object.assign(_dir[type][i], data); }
  } else {
    data.is_active = true; data.usage_count = 0; data.created_at = new Date().toISOString(); data.created_by = state.currentUser?.id || null;
    let created; ({ data: created, error } = await sb.from(tbl).insert(data).select().single());
    if (!error && created) { if (!_dir[type]) _dir[type] = []; _dir[type].push(created); }
  }
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(_dirEditId ? 'Record updated ✓' : 'Saved to Directory ✓', 'success');
  closeDirEditModal(); renderDirectoryPage();
}

// ── Change Type ──────────────────────────────────────────────────────────────
export function dirChangeType(type, id) {
  if (type !== 'landlords' && type !== 'agents') return;
  const rec = (_dir[type] || []).find(r => r.id === id);
  if (!rec) { toast('Record not found — try refreshing', 'error'); return; }
  const newType = type === 'landlords' ? 'agents' : 'landlords';
  const name = _dirName(type, rec);
  const newLabel = newType === 'agents' ? 'Agency' : 'Landlord';
  const _esc2 = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let m = document.getElementById('dir-changetype-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'dir-changetype-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px';
    document.body.appendChild(m);
  }
  m.innerHTML = `<div style="background:var(--surface);border-radius:14px;width:100%;max-width:400px;box-shadow:0 8px 40px rgba(0,0,0,.4);padding:24px">
    <div style="font-size:16px;font-weight:700;margin-bottom:10px">Move to ${newLabel}?</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:18px"><strong>${_esc2(name)}</strong> will be moved from ${type === 'landlords' ? 'Landlord' : 'Agency'} to ${newLabel}.<br><br>All linked properties will be updated automatically.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="document.getElementById('dir-changetype-modal').style.display='none'">Cancel</button>
      <button class="btn btn-primary" onclick="window._dirDoChangeType('${type}','${id}')">Move to ${newLabel}</button>
    </div>
  </div>`;
  m.style.display = 'flex';
}

window._dirDoChangeType = async function(type, id) {
  document.getElementById('dir-changetype-modal').style.display = 'none';
  const rec = (_dir[type] || []).find(r => r.id === id);
  if (!rec) { toast('Record not found', 'error'); return; }
  const newType = type === 'landlords' ? 'agents' : 'landlords';
  const newLabel = newType === 'agents' ? 'Agency' : 'Landlord';
  const shared = { email: rec.email||'', email2: rec.email2||'', cc_emails: rec.cc_emails||'', phone: rec.phone||'', mobile: rec.mobile||'', addr1: rec.addr1||'', addr2: rec.addr2||'', town: rec.town||'', county: rec.county||'', postcode: (rec.postcode||'').toUpperCase(), notes: rec.notes||'', is_active: rec.is_active !== false, usage_count: rec.usage_count||0, created_at: rec.created_at||new Date().toISOString(), created_by: rec.created_by||null };
  const newRec = newType === 'agents'
    ? { ...shared, agency_name: rec.landlord_name || rec.company_name || '', contact_name: rec.company_name ? rec.landlord_name : '' }
    : { ...shared, landlord_name: rec.agency_name || rec.contact_name || '', company_name: '' };
  const { data: ins, error: insErr } = await sb.from(_dirTable[newType]).insert(newRec).select().single();
  if (insErr || !ins) { toast('Move failed: ' + (insErr?.message || 'unknown'), 'error'); return; }
  const propField = type === 'landlords' ? 'landlord_id' : 'agent_id';
  const newField = type === 'landlords' ? 'agent_id' : 'landlord_id';
  const props = (_dir.properties || []).filter(p => p[propField] === id);
  if (props.length) {
    await sb.from('directory_properties').update({ [propField]: null, [newField]: ins.id }).in('id', props.map(p => p.id));
    props.forEach(p => { p[propField] = null; p[newField] = ins.id; });
  }
  await sb.from(_dirTable[type]).delete().eq('id', id);
  if (_dir[type]) { _dir[type] = _dir[type].filter(r => r.id !== id); try { localStorage.setItem('_cache_dir_'+type, JSON.stringify({data:_dir[type],ts:Date.now()})); } catch {} }
  if (!_dir[newType]) _dir[newType] = [];
  _dir[newType].push(ins);
  try { localStorage.setItem('_cache_dir_'+newType, JSON.stringify({data:_dir[newType],ts:Date.now()})); } catch {}
  toast(`Moved to ${newLabel} ✓`, 'success');
  switchDirTab(newType);
};

// ── Merge ────────────────────────────────────────────────────────────────────
let _mergeType = null, _mergeKeepId = null, _mergeOtherId = null;

function _mergeGetModal() {
  let m = document.getElementById('dir-merge-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'dir-merge-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
    document.body.appendChild(m);
    m.addEventListener('pointerdown', e => { if (e.target === m) dirCloseMerge(); });
  }
  return m;
}

export function dirOpenMerge(type, id) {
  if (type !== 'landlords' && type !== 'agents') return;
  _mergeType = type; _mergeKeepId = id; _mergeOtherId = null;
  const rec = (_dir[type]||[]).find(r => r.id === id);
  if (!rec) return;
  const _esc = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const typeLabel = type === 'agents' ? 'Agency' : 'Landlord';
  const m = _mergeGetModal();
  m.innerHTML = `<div style="background:var(--surface);border-radius:14px;width:100%;max-width:520px;box-shadow:0 8px 40px rgba(0,0,0,.4);margin:auto">
    <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;font-size:15px">🔀 Merge ${typeLabel}</div>
      <button onclick="dirCloseMerge()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1">✕</button>
    </div>
    <div style="padding:16px 18px">
      <div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px">
        <div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.05em;margin-bottom:3px">MERGING FROM</div>
        <div style="font-weight:600">${_esc(_dirName(type,rec))}</div>
        ${rec.addr1?`<div style="color:var(--muted);font-size:12px;margin-top:2px">${_esc(rec.addr1)}${rec.postcode?', '+_esc(rec.postcode):''}</div>`:''}
      </div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px">Search for the duplicate to merge with:</div>
      <input id="dir-merge-q" type="text" class="form-control" placeholder="Type a name…" oninput="dirMergeSearch(this.value)" autocomplete="off">
      <div id="dir-merge-results" style="margin-top:8px"></div>
    </div>
  </div>`;
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('dir-merge-q')?.focus(), 60);
}

export function dirCloseMerge() {
  const m = document.getElementById('dir-merge-modal');
  if (m) m.style.display = 'none';
  _mergeType = null; _mergeKeepId = null; _mergeOtherId = null;
}

export function dirMergeSearch(q) {
  const res = document.getElementById('dir-merge-results'); if (!res) return;
  const _esc = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (q.trim().length < 2) { res.innerHTML = ''; return; }
  const ql = q.trim().toLowerCase();
  const recs = (_dir[_mergeType]||[]).filter(r => r.id !== _mergeKeepId && r.is_active !== false && _dirMatchScore(_mergeType, r, ql) > 0).slice(0, 6);
  if (!recs.length) { res.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:6px 2px">No matches</div>`; return; }
  res.innerHTML = recs.map(r => `<div onclick="dirMergePick('${r.id}')" style="padding:9px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);margin-bottom:6px;font-size:13px;background:var(--surface2)">
    <div style="font-weight:600">${_esc(_dirName(_mergeType,r))}</div>
    ${r.addr1?`<div style="color:var(--muted);font-size:12px;margin-top:2px">${_esc(r.addr1)}${r.postcode?', '+_esc(r.postcode):''}</div>`:''}
  </div>`).join('');
}

export function dirMergePick(otherId) {
  _mergeOtherId = otherId;
  const a = (_dir[_mergeType]||[]).find(r => r.id === _mergeKeepId);
  const b = (_dir[_mergeType]||[]).find(r => r.id === otherId);
  if (!a || !b) return;
  const _esc = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const type = _mergeType;
  const typeLabel = type === 'agents' ? 'Agency' : 'Landlord';
  const fields = type === 'agents'
    ? [['agency_name','Agency Name'],['contact_name','Contact Person'],['email','Email'],['email2','Secondary Email'],['phone','Phone'],['mobile','Mobile'],['addr1','Address Line 1'],['addr2','Address Line 2'],['town','Town'],['county','County'],['postcode','Postcode'],['notes','Notes']]
    : [['landlord_name','Landlord Name'],['company_name','Company'],['email','Email'],['email2','Secondary Email'],['phone','Phone'],['mobile','Mobile'],['addr1','Address Line 1'],['addr2','Address Line 2'],['town','Town'],['county','County'],['postcode','Postcode'],['notes','Notes']];
  let rows = '';
  fields.forEach(([f, lbl]) => {
    const va = (a[f]||'').trim(), vb = (b[f]||'').trim();
    if (!va && !vb) return;
    if (!va || !vb || va === vb) {
      rows += `<tr><td style="padding:7px 8px;font-size:11px;color:var(--muted);white-space:nowrap;border-bottom:1px solid var(--border)">${lbl}</td><td colspan="2" style="padding:7px 8px;font-size:13px;border-bottom:1px solid var(--border)">${_esc(va||vb)}<input type="hidden" name="mf_${f}" value="${_esc(va||vb)}"></td></tr>`;
    } else {
      rows += `<tr><td style="padding:7px 8px;font-size:11px;color:var(--muted);white-space:nowrap;vertical-align:top;border-bottom:1px solid var(--border)">${lbl}</td>
        <td style="padding:7px 6px;border-bottom:1px solid var(--border)"><label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="mf_${f}" value="${_esc(va)}" style="margin-top:3px;flex-shrink:0" checked><span>${_esc(va)}</span></label></td>
        <td style="padding:7px 6px;border-bottom:1px solid var(--border)"><label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:13px"><input type="radio" name="mf_${f}" value="${_esc(vb)}" style="margin-top:3px;flex-shrink:0"><span>${_esc(vb)}</span></label></td>
      </tr>`;
    }
  });
  const m = _mergeGetModal();
  m.innerHTML = `<div style="background:var(--surface);border-radius:14px;width:100%;max-width:600px;box-shadow:0 8px 40px rgba(0,0,0,.4);margin:auto">
    <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;font-size:15px">🔀 Choose Which Details to Keep</div>
      <button onclick="dirCloseMerge()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--muted);line-height:1">✕</button>
    </div>
    <div style="padding:16px 18px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:rgba(99,102,241,.1);border:2px solid rgba(99,102,241,.4);border-radius:8px;padding:10px 12px;font-size:13px">
          <div style="font-size:10px;font-weight:700;color:#6366f1;letter-spacing:.05em;margin-bottom:4px">← LEFT COLUMN</div>
          <div style="font-weight:600">${_esc(_dirName(type,a))}</div>
          ${a.addr1?`<div style="color:var(--muted);font-size:12px;margin-top:2px">${_esc(a.addr1)}</div>`:''}
        </div>
        <div style="background:rgba(16,185,129,.1);border:2px solid rgba(16,185,129,.4);border-radius:8px;padding:10px 12px;font-size:13px">
          <div style="font-size:10px;font-weight:700;color:#059669;letter-spacing:.05em;margin-bottom:4px">RIGHT COLUMN →</div>
          <div style="font-weight:600">${_esc(_dirName(type,b))}</div>
          ${b.addr1?`<div style="color:var(--muted);font-size:12px;margin-top:2px">${_esc(b.addr1)}</div>`:''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Where both records differ, pick which value to keep. The other record will be deleted.</div>
      <div id="dir-merge-fields-form" style="overflow-x:auto;border:1px solid var(--border);border-radius:8px">
        <table style="width:100%;border-collapse:collapse">${rows || '<tr><td colspan="3" style="padding:12px;text-align:center;font-size:13px;color:var(--muted)">No conflicting fields — safe to merge</td></tr>'}</table>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="dirConfirmMerge()" style="flex:2;min-width:180px;background:var(--accent,#b91c1c);color:#fff;border:none;border-radius:8px;padding:10px 16px;cursor:pointer;font-weight:600;font-size:13px">✓ Merge &amp; Keep Left Record</button>
        <button onclick="dirCloseMerge()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px;color:var(--muted)">Cancel</button>
      </div>
    </div>
  </div>`;
  m.style.display = 'flex';
}

export async function dirConfirmMerge() {
  const type = _mergeType, keepId = _mergeKeepId, discardId = _mergeOtherId;
  if (!type || !keepId || !discardId) return;
  const form = document.getElementById('dir-merge-fields-form');
  const merged = {};
  if (form) {
    form.querySelectorAll('input[name^="mf_"]').forEach(inp => {
      if (inp.type === 'hidden' || (inp.type === 'radio' && inp.checked)) {
        merged[inp.name.replace('mf_', '')] = inp.value;
      }
    });
  }
  merged.updated_at = new Date().toISOString();
  const { error: updErr } = await sb.from(_dirTable[type]).update(merged).eq('id', keepId);
  if (updErr) { toast('Merge failed: ' + updErr.message, 'error'); return; }
  const propField = type === 'landlords' ? 'landlord_id' : 'agent_id';
  const propsToUpdate = (_dir.properties||[]).filter(p => p[propField] === discardId);
  if (propsToUpdate.length) {
    await sb.from('directory_properties').update({ [propField]: keepId }).in('id', propsToUpdate.map(p => p.id));
    propsToUpdate.forEach(p => { p[propField] = keepId; });
  }
  await sb.from(_dirTable[type]).delete().eq('id', discardId);
  if (_dir[type]) {
    const keepRec = _dir[type].find(r => r.id === keepId);
    if (keepRec) Object.assign(keepRec, merged);
    _dir[type] = _dir[type].filter(r => r.id !== discardId);
    try { localStorage.setItem('_cache_dir_'+type, JSON.stringify({data:_dir[type],ts:Date.now()})); } catch {}
  }
  dirCloseMerge();
  toast('Merged successfully ✓', 'success');
  renderDirectoryPage();
}

// ── Appliances page ──────────────────────────────────────────────────────────
const _APP_CATS = ['Boiler', 'Cooker', 'Hob', 'Oven', 'Fire', 'Water Heater', 'Heater', 'Washing Machine', 'Fridge', 'Freezer', 'Microwave', 'Kettle', 'Toaster', 'Dishwasher', 'Tumble Dryer', 'Vacuum Cleaner', 'Other'];

export async function renderAppliancesPage() {
  const el = document.getElementById('app-list-area'); if (!el) return;
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  if (!_dir.appliances) {
    try { const { data } = await sb.from('appliance_templates').select('*').order('category').order('name'); _dir.appliances = data || []; }
    catch (e) { _dir.appliances = []; }
  }
  const q = (document.getElementById('app-search-input')?.value || '').trim();
  const cat = document.getElementById('app-cat-filter')?.value || '';
  const showArch = document.getElementById('app-show-archived')?.checked;
  let recs = _dir.appliances || [];
  if (!showArch) recs = recs.filter(r => r.is_active !== false);
  if (q.length >= 2) { const ql = q.toLowerCase(); recs = recs.filter(r => _dirMatchScore('appliances', r, ql) > 0); }
  if (cat) recs = recs.filter(r => r.category === cat);
  if (!recs.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔧</div><p>No appliances found${q ? ' matching "' + q + '"' : ''}</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openApplianceEditModal()">+ Add First Appliance</button></div>`;
    return;
  }
  const q2 = q.length >= 2 ? q : '';
  el.innerHTML = '<div class="dir-list">' + recs.map(r => _appCard(r, q2)).join('') + '</div>';
}

function _appCard(r, q) {
  const arch = r.is_active === false;
  const dispName = (r.category ? r.category + ' — ' : '') + r.name;
  const sub = [r.manufacturer, r.model].filter(Boolean).join(' · ');
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px${arch ? ';opacity:.5' : ''}">
    <div style="width:36px;height:36px;border-radius:8px;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🔧</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:600;color:var(--text)">${_hlText(dispName, q)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${_hlText(sub, q)}</div>` : ''}
      <div style="font-size:11px;color:var(--muted);margin-top:3px">${r.usage_count ? `Used ${r.usage_count}×` : 'Never used'}${r.last_used_at ? ' · Last used ' + new Date(r.last_used_at).toLocaleDateString('en-GB') : ''}${arch ? ' <span style="color:var(--warn);font-weight:700">[ARCHIVED]</span>' : ''}</div>
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0">
      <button onclick="openApplianceEditModal('${r.id}')" style="padding:5px 10px;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text)">Edit</button>
      <button onclick="appToggleArchive('${r.id}',${r.is_active !== false})" style="padding:5px 10px;font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;color:${arch ? 'var(--success)' : 'var(--muted)'}">${arch ? 'Restore' : 'Archive'}</button>
    </div>
  </div>`;
}

export async function appToggleArchive(id, currentlyActive) {
  const { error } = await sb.from('appliance_templates').update({ is_active: !currentlyActive, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  if (_dir.appliances) { const i = _dir.appliances.findIndex(r => r.id === id); if (i >= 0) _dir.appliances[i].is_active = !currentlyActive; }
  toast(currentlyActive ? 'Archived' : 'Restored', 'success'); renderAppliancesPage();
}

function _getAppEditModal() {
  let m = document.getElementById('app-edit-modal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'app-edit-modal';
  m.style.cssText = 'display:none;position:fixed;inset:0;z-index:9100;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);padding:16px';
  m.innerHTML = `
    <div style="background:var(--surface);border-radius:14px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div id="app-edit-modal-title" style="font-size:16px;font-weight:700;color:var(--text)"></div>
        <button onclick="closeApplianceEditModal()" style="background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:var(--muted);padding:2px 6px">×</button>
      </div>
      <div id="app-edit-modal-body" style="padding:18px 20px;overflow-y:auto;flex:1"></div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeApplianceEditModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveApplianceRecord()">Save</button>
      </div>
    </div>`;
  m.addEventListener('pointerdown', e => { if (e.target === m) closeApplianceEditModal(); });
  document.body.appendChild(m);
  return m;
}

let _appEditId = null;
export function openApplianceEditModal(id = null) {
  _appEditId = id || null;
  const rec = id ? (_dir.appliances || []).find(r => r.id === id) : null;
  _getAppEditModal();
  document.getElementById('app-edit-modal-title').textContent = id ? 'Edit Appliance' : 'New Appliance';
  const v = f => rec ? (rec[f] || '') : ''; const esc = s => (s || '').replace(/"/g, '&quot;');
  const defs = rec?.defaults || {};
  const catOpts = _APP_CATS.map(c => `<option value="${c}"${c === v('category') ? ' selected' : ''}>${c}</option>`).join('');
  const defSel = (f, opts) => `<div class="field-group"><label style="text-transform:capitalize">${f.replace(/_/g, ' ')}</label><select id="ape-d-${f}" class="form-control"><option value="">— Not set —</option>${opts.map(o => `<option value="${o}"${(defs[f] || '') == o ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
  document.getElementById('app-edit-modal-body').innerHTML =
    `<div class="field-grid"><div class="field-group"><label>Name *</label><input type="text" id="ape-name" value="${esc(v('name'))}" placeholder="e.g. Worcester Bosch Greenstar 30i" class="form-control"></div><div class="field-group"><label>Category</label><select id="ape-category" class="form-control"><option value="">— Select —</option>${catOpts}</select></div></div>` +
    `<div class="field-grid"><div class="field-group"><label>Manufacturer</label><input type="text" id="ape-manufacturer" value="${esc(v('manufacturer'))}" class="form-control"></div><div class="field-group"><label>Model</label><input type="text" id="ape-model" value="${esc(v('model'))}" class="form-control"></div></div>` +
    `<div class="field-grid"><div class="field-group"><label>Fuel Type</label><input type="text" id="ape-fuel_type" value="${esc(v('fuel_type'))}" placeholder="e.g. Natural Gas" class="form-control"></div><div class="field-group"><label>Default Location</label><input type="text" id="ape-default_location" value="${esc(v('default_location'))}" placeholder="e.g. Kitchen" class="form-control"></div></div>` +
    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin:14px 0 8px;padding-top:10px;border-top:1px solid var(--border)">Gas CP12 Defaults <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none">— engineers must confirm all inspection results</span></div>` +
    `<div class="field-grid">` + defSel('flue_type', ['RS', 'BF', 'OF', 'SE', 'Fan Assisted', 'Open Flue', 'Room Sealed']) +
    `<div class="field-group"><label>Operating Pressure</label><input type="text" id="ape-d-op_pressure" value="${esc(defs.op_pressure || '')}" placeholder="e.g. 20 mbar" class="form-control"></div></div>` +
    `<div class="field-grid">` + ['safety_devices', 'ventilation', 'visual_condition', 'flue_flow'].map(f => defSel(f, ['Pass', 'Fail', 'N/A'])).join('') + `</div><div class="field-grid">` +
    defSel('serviced', ['No', 'Yes']) + defSel('safe_to_use', ['Yes', 'No']) + `</div>` +
    `<div class="field-group" style="margin-top:10px"><label>Notes</label><textarea id="ape-notes" rows="2" class="form-control" style="resize:vertical">${v('notes')}</textarea></div>`;
  document.getElementById('app-edit-modal').style.display = 'flex';
}
export function closeApplianceEditModal() { const m = document.getElementById('app-edit-modal'); if (m) m.style.display = 'none'; _appEditId = null; }

export async function saveApplianceRecord() {
  const gv = id => (document.getElementById('ape-' + id) || {}).value?.trim() || '';
  const gd = id => (document.getElementById('ape-d-' + id) || {}).value?.trim() || '';
  if (!gv('name')) { toast('Appliance name required', 'warn'); return; }
  const defs = {};
  ['flue_type', 'op_pressure', 'safety_devices', 'ventilation', 'visual_condition', 'flue_flow', 'serviced', 'safe_to_use'].forEach(f => { const vv = gd(f); if (vv) defs[f] = vv; });
  const data = { name: gv('name'), category: gv('category'), manufacturer: gv('manufacturer'), model: gv('model'), fuel_type: gv('fuel_type'), default_location: gv('default_location'), notes: gv('notes'), defaults: defs, updated_at: new Date().toISOString() };
  let error;
  if (_appEditId) {
    ({ error } = await sb.from('appliance_templates').update(data).eq('id', _appEditId));
    if (!error && _dir.appliances) { const i = _dir.appliances.findIndex(r => r.id === _appEditId); if (i >= 0) Object.assign(_dir.appliances[i], data); }
  } else {
    data.is_active = true; data.usage_count = 0; data.created_at = new Date().toISOString(); data.created_by = state.currentUser?.id || null;
    let created; ({ data: created, error } = await sb.from('appliance_templates').insert(data).select().single());
    if (!error && created) { if (!_dir.appliances) _dir.appliances = []; _dir.appliances.push(created); }
  }
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(_appEditId ? 'Appliance updated ✓' : 'Appliance saved ✓', 'success');
  closeApplianceEditModal(); renderAppliancesPage();
}

export async function loadCompliance() {
  await _loadDirCerts();
}
