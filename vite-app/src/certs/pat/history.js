// ========== PAT - HISTORY & RENEWALS MODULE ==========
// Extracted from index.html (lines 4186-4386)

import { sb } from '../../lib/supabase.js';
import { toast, showOverlay, hideOverlay, _softDelete, confirm2, _ibtn, _addrColor, _addrInitials } from '../../lib/utils.js';
import { state } from '../../lib/state.js';
import { parseGasDate } from '../gas/helpers.js';
import { patFd } from './form.js';
import { loadPATForm } from './form.js';

// ─── Module-level state ───────────────────────────────
let _patSortApps = 0, _patSortExp = 0;
let _compAll = [];

// ─── History helpers ──────────────────────────────────
function _patExpiryPill(r) {
  if (r.status !== 'completed') return '';
  const dates = (r.appliances || []).map(a => a.nextTest || a.next_test || '').filter(Boolean).sort();
  if (!dates.length) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(dates[0]) - today) / (864e5));
  let bg, col, bord, sub;
  if (days < 0) { bg = '#fee2e2'; col = '#dc2626'; bord = '#fca5a5'; sub = 'OVERDUE'; }
  else if (days <= 30) { bg = '#fff7ed'; col = '#ea580c'; bord = '#fed7aa'; sub = 'DAYS'; }
  else if (days <= 90) { bg = '#fefce8'; col = '#ca8a04'; bord = '#fef08a'; sub = 'DAYS'; }
  else { bg = '#f0fdf4'; col = '#16a34a'; bord = '#86efac'; sub = 'DAYS'; }
  const num = Math.abs(days);
  return `<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;padding:6px 12px;border-radius:10px;background:${bg};border:1.5px solid ${bord};gap:1px;flex-shrink:0">
    <span style="font-size:16px;font-weight:800;color:${col};line-height:1;letter-spacing:-.02em">${num}</span>
    <span style="font-size:8px;font-weight:700;color:${col};opacity:.7;text-transform:uppercase;letter-spacing:.1em;line-height:1;margin-top:2px">${sub}</span>
  </span>`;
}

export function _patEarliestExp(r) { const d = (r.appliances || []).map(a => a.nextTest || '').filter(Boolean).sort(); return d[0] || ''; }

// ─── Load PAT history ─────────────────────────────────
export async function loadPATHistory() {
  const _pl = document.getElementById('pat-list'); if (_pl) _pl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  let { data, error } = await sb.from('pat_reports').select('*').is('deleted_at', null).order('created_at', { ascending: false });
  if (error && (error.message || '').includes('deleted_at')) { ({ data, error } = await sb.from('pat_reports').select('*').order('created_at', { ascending: false })); }
  if (error) { toast('Failed to load PAT reports: ' + error.message, 'error'); return; }
  state.patReports = data || [];
  renderPATList(state.patReports);
}

export function renderPATList(reports) {
  const el = document.getElementById('pat-list');
  if (!reports.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No PAT tests found</p></div>'; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all = state.patReports;
  const tot = all.length, comp = all.filter(r => r.status === 'completed').length, dr = all.filter(r => r.status !== 'completed').length;
  const dsCount = all.filter(r => { const e = _patEarliestExp(r); if (!e) return false; const d = Math.ceil((new Date(e) - today) / 864e5); return d >= 0 && d <= 30; }).length;
  const mkRow = (r, hl = '') => {
    const isDraft = r.status !== 'completed'; const addr = r.property_address || 'No address';
    const [abg, atx] = _addrColor(addr); const ini = (_addrInitials(addr) || '?').toUpperCase();
    const appCount = (r.appliances || []).length;
    return `<div class="pat-card" style="${hl ? 'border-color:' + hl + ';' : ''}${isDraft ? 'opacity:.82' : ''}">
      <div style="width:36px;height:36px;border-radius:50%;background:${abg};color:${atx};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px">${ini}</div>
      <div class="pat-card-body">
        <div class="pat-card-top">
          <span class="pat-card-addr">${addr}</span>
          ${_patExpiryPill(r)}
        </div>
        <div class="pat-card-bot">
          <code class="pat-ref-chip">${r.ref_number || 'DRAFT'}</code>
          <span class="pat-card-date">${patFd(r.test_date) || 'No date'}</span>
          <span class="pat-card-sub">&middot; ${appCount} appliance${appCount !== 1 ? 's' : ''}</span>
          <div class="pat-card-btns">
            ${_ibtn('Open', 'fa-eye', `loadPATForm('${r.id}')`)}
            ${!isDraft ? _ibtn('Copy', 'fa-copy', `copyPAT('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('PDF', 'fa-file-pdf', `openPATPDF('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('Email', 'fa-envelope', `emailPATFromList('${r.id}')`) : ''}
            ${_ibtn('Delete', 'fa-trash', `deletePAT('${r.id}')`, true)}
          </div>
        </div>
      </div>
    </div>`;
  };
  const tile = (n, lbl, col) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:90px"><div style="font-size:22px;font-weight:600;color:${col || 'var(--text)'}">${n}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${lbl}</div></div>`;
  const sec = (dot, lbl, cnt) => `<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 0 5px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></span>${lbl}${cnt ? ' (' + cnt + ')' : ''}</div>`;
  const dueSoonRs = reports.filter(r => { if (r.status !== 'completed') return false; const e = _patEarliestExp(r); if (!e) return false; const d = Math.ceil((new Date(e) - today) / 864e5); return d >= 0 && d <= 30; });
  const doneRs = reports.filter(r => r.status === 'completed' && !dueSoonRs.includes(r));
  const draftRs = reports.filter(r => r.status !== 'completed');
  let html = `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">${tile(tot, 'Total reports')}${tile(comp, 'Completed', '#16a34a')}${tile(dsCount, 'Due ≤ 30 days', '#d97706')}${tile(dr, 'Drafts')}</div>`;
  if (dueSoonRs.length) html += sec('#f59e0b', 'Due soon', dueSoonRs.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + dueSoonRs.map(r => mkRow(r, '#fde68a')).join('') + `</div>`;
  if (doneRs.length) html += sec('#10b981', 'Completed', doneRs.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + doneRs.map(r => mkRow(r)).join('') + `</div>`;
  if (draftRs.length) html += sec('#94a3b8', 'Drafts', draftRs.length) + `<div style="display:flex;flex-direction:column;gap:6px">` + draftRs.map(r => mkRow(r)).join('') + `</div>`;
  el.innerHTML = html;
}

export function togglePatAppSort() {
  _patSortApps = _patSortApps === 1 ? -1 : _patSortApps === -1 ? 0 : 1; _patSortExp = 0;
  const btn = document.getElementById('pat-sort-apps-btn');
  if (btn) btn.textContent = _patSortApps === 1 ? '↓ Most Apps' : _patSortApps === -1 ? '↑ Fewest Apps' : '↕ Appliances';
  if (btn) btn.style.color = _patSortApps ? 'var(--accent)' : '';
  document.getElementById('pat-sort-exp-btn').style.color = ''; document.getElementById('pat-sort-exp-btn').textContent = '↕ Expiry';
  filterPATList();
}
export function togglePatExpSort() {
  _patSortExp = _patSortExp === 1 ? -1 : _patSortExp === -1 ? 0 : 1; _patSortApps = 0;
  const btn = document.getElementById('pat-sort-exp-btn');
  if (btn) btn.textContent = _patSortExp === 1 ? '↑ Soonest' : _patSortExp === -1 ? '↓ Latest' : '↕ Expiry';
  if (btn) btn.style.color = _patSortExp ? 'var(--accent)' : '';
  document.getElementById('pat-sort-apps-btn').style.color = ''; document.getElementById('pat-sort-apps-btn').textContent = '↕ Appliances';
  filterPATList();
}
export function filterPATList() {
  const q = document.getElementById('pat-search').value.toLowerCase();
  const s = document.getElementById('pat-filter').value;
  let list = state.patReports.filter(r => {
    const matchS = !s || r.status === s;
    const matchQ = !q || (r.property_address || '').toLowerCase().includes(q) || (r.ref_number || '').toLowerCase().includes(q) || (r.landlord_name || '').toLowerCase().includes(q);
    return matchS && matchQ;
  });
  if (_patSortApps !== 0) list = [...list].sort((a, b) => _patSortApps * ((b.appliances || []).length - (a.appliances || []).length));
  if (_patSortExp !== 0) list = [...list].sort((a, b) => { const ea = _patEarliestExp(a) || '9999', eb = _patEarliestExp(b) || '9999'; return _patSortExp * (ea < eb ? -1 : ea > eb ? 1 : 0); });
  renderPATList(list);
}

export async function deletePAT(id) {
  const isAdmin = state.currentProfile?.role === 'admin';
  confirm2('Delete PAT Test', isAdmin ? 'Permanently delete this report?' : 'Move to Recycle Bin? Admins can restore it.', async () => {
    await _softDelete('pat_reports', id, loadPATHistory);
  });
}

export async function copyPAT(id) {
  showOverlay('Copying…');
  try {
    const { data: r, error } = await sb.from('pat_reports').select('*').eq('id', id).single();
    if (error || !r) { toast('Could not load certificate', 'error'); return; }
    const copy = { ...r };
    delete copy.id; delete copy.created_at; delete copy.updated_at;
    copy.status = 'draft'; copy.ref_number = null; copy.test_date = new Date().toISOString().slice(0, 10);
    copy.internal_notes = '';
    const { data: newR, error: insErr } = await sb.from('pat_reports').insert(copy).select().single();
    if (insErr) { toast('Copy failed: ' + insErr.message, 'error'); return; }
    toast('Copied as new draft', 'success');
    await loadPATForm(newR.id);
  } catch (e) { toast('Copy error: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

// ─── Renewals / Compliance ────────────────────────────
export async function loadCompliance() {
  const el = document.getElementById('comp-list');
  if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><p>Loading…</p></div>';
  const today = new Date();
  const items = [];
  const [{ data: pats }, { data: gases }, { data: els }] = await Promise.all([
    sb.from('pat_reports').select('id,ref_number,property_address,appliances,engineer').eq('status', 'completed'),
    sb.from('gas_certs').select('id,ref_number,install_address,next_check_date,engineer,cert_date').eq('status', 'completed'),
    sb.from('el_certs').select('id,ref_number,data,created_at').order('created_at', { ascending: false })
  ]);
  (pats || []).forEach(r => {
    const dates = (r.appliances || []).map(a => { const nd = a.nextTest || a.next_test; return nd ? new Date(nd) : null; }).filter(Boolean);
    if (!dates.length) return;
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const count = (r.appliances || []).length;
    items.push({ type: 'pat', id: r.id, ref: r.ref_number || '—', address: r.property_address || '—', engineer: r.engineer || '—', label: count + ' appliance' + (count === 1 ? '' : 's'), assetId: '', due: earliest, overdue: earliest < today, daysLeft: Math.round((earliest - today) / 86400000) });
  });
  (gases || []).forEach(r => {
    if (!r.next_check_date) return;
    const d = parseGasDate(r.next_check_date); if (!d) return;
    items.push({ type: 'gas', id: r.id, ref: r.ref_number || '—', address: r.install_address || '—', engineer: r.engineer || '—', label: 'Annual Gas Safety Check', assetId: '', certDate: r.cert_date || '', due: d, overdue: d < today, daysLeft: Math.round((d - today) / 86400000) });
  });
  (els || []).forEach(r => {
    const d = r.data || {}; const nd = d.nextTestDate || ''; if (!nd) return;
    const parts = nd.split('/'); if (parts.length !== 3) return;
    const due = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); if (isNaN(due)) return;
    const addr = [d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode].filter(Boolean).join(', ') || d.premisesAddress || '—';
    items.push({ type: 'el', id: r.id, ref: r.ref_number || d.ref || '—', address: addr, engineer: d.engineerName || '—', label: (d.certType || 'EL') + ' Certificate', assetId: '', certDate: d.testDate || '', due, overdue: due < today, daysLeft: Math.round((due - today) / 86400000) });
  });
  _compAll = items;
  const compBadge = document.getElementById('compliance-badge');
  if (compBadge) { const tot = items.filter(i => i.daysLeft <= 60).length; compBadge.textContent = tot; compBadge.hidden = tot === 0; }
  filterCompliance();
}

export function filterCompliance() {
  const search = (document.getElementById('comp-search')?.value || '').toLowerCase().trim();
  const type = document.getElementById('comp-type')?.value || '';
  const urgency = document.getElementById('comp-urgency')?.value || '60';
  const sort = document.getElementById('comp-sort')?.value || 'date-asc';
  const today = new Date();
  let items = [..._compAll];
  if (urgency === 'overdue') items = items.filter(i => i.overdue);
  else if (urgency === '7') items = items.filter(i => i.daysLeft <= 7);
  else if (urgency === '30') items = items.filter(i => i.daysLeft <= 30);
  else if (urgency === '60') items = items.filter(i => i.daysLeft <= 60);
  if (type) items = items.filter(i => i.type === type);
  if (search) items = items.filter(i => i.address.toLowerCase().includes(search) || i.ref.toLowerCase().includes(search) || i.label.toLowerCase().includes(search) || i.assetId.toLowerCase().includes(search) || i.engineer.toLowerCase().includes(search));
  if (sort === 'date-asc') items.sort((a, b) => a.due - b.due);
  else if (sort === 'date-desc') items.sort((a, b) => b.due - a.due);
  else if (sort === 'address') items.sort((a, b) => a.address.localeCompare(b.address));
  else if (sort === 'type') items.sort((a, b) => a.type.localeCompare(b.type) || a.due - b.due);
  const overdue = items.filter(i => i.overdue).length;
  const thisWeek = items.filter(i => !i.overdue && i.daysLeft <= 7).length;
  const thisMonth = items.filter(i => !i.overdue && i.daysLeft > 7 && i.daysLeft <= 30).length;
  const sub = document.getElementById('comp-subtitle');
  if (sub) sub.textContent = `${_compAll.length} total items across PAT, Gas & EL · ${_compAll.filter(i => i.overdue).length} overdue`;
  const summary = document.getElementById('comp-summary');
  if (summary && items.length) {
    summary.innerHTML = `<span style="color:var(--error);font-weight:600">⚠ ${overdue} overdue</span><span style="color:#92400e;font-weight:600">⏰ ${thisWeek} this week</span><span style="color:var(--muted)">📅 ${thisMonth} this month</span><span style="color:var(--muted);margin-left:auto">${items.length} shown</span>`;
  } else if (summary) { summary.innerHTML = ''; }
  const elList = document.getElementById('comp-list'); if (!elList) return;
  if (!items.length) { elList.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><p>Nothing due for the selected filters</p></div>'; return; }
  elList.innerHTML = items.map(i => {
    const dStr = i.due.toLocaleDateString('en-GB');
    const urgClass = i.overdue ? 'overdue' : i.daysLeft <= 7 ? 'urgent' : 'due';
    const urgLabel = i.overdue ? `OVERDUE ${Math.abs(i.daysLeft)}d ago` : i.daysLeft === 0 ? 'TODAY' : i.daysLeft === 1 ? 'Tomorrow' : 'Due ' + dStr;
    const typeBadge = i.type === 'pat' ? `<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">📋 PAT</span>` : i.type === 'el' ? `<span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">⚡ EL</span>` : `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">🔥 Gas</span>`;
    const meta = i.type === 'pat' ? `${i.label}${i.assetId ? ' · Asset: ' + i.assetId : ''}` : i.certDate ? `Last cert: ${i.certDate}` : i.label || 'Annual Safety Check';
    const action = i.type === 'pat' ? `<button class="btn btn-primary btn-sm" onclick="loadPATForm('${i.id}')">Open PAT</button>` : i.type === 'el' ? `<button class="btn btn-primary btn-sm" onclick="startNewEL()">New EL</button>` : `<button class="btn btn-primary btn-sm" onclick="navigate('gas-new')">New Gas</button>`;
    return `<div class="cert-row"><div class="cert-row-info"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${typeBadge}<span class="cert-ref">${i.ref}</span><span class="badge badge-${urgClass}">${urgLabel}</span></div><div class="cert-address">${i.address}</div><div class="cert-meta">${meta} · Engineer: ${i.engineer}</div></div>${action}</div>`;
  }).join('');
}
