import { sb } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { toast, showOverlay, hideOverlay, confirm2 } from '../lib/utils.js';
import { navigate } from '../nav/navigation.js';
import { getSetting } from '../lib/settings.js';
import { patFd } from '../certs/pat/form.js';
import { parseGasDate } from '../certs/gas/helpers.js';
import { hlText, sortByWordStart } from '../lib/search.js';

let _gsTimer = null;
let _compAll = [];
let _dashChartMonthly = null;
let _dashChartMix = null;

// ========== RECYCLE BIN ==========
export async function loadRecycleBin() {
  if (!_isAdminUser()) { toast('Admin access required', 'warn'); return; }
  const el = document.getElementById('recycle-bin-list');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  try {
    // Test if deleted_at column exists
    const _colCheck = await sb.from('pat_reports').select('deleted_at').limit(1);
    if (_colCheck.error && (_colCheck.error.message || '').includes('deleted_at')) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚙️</div><p style="max-width:400px">Recycle Bin requires a one-time database migration.<br><br>Go to <strong>Settings → Backend → Staff Setup</strong>, copy the SQL, and run Step 8 in your <a href="https://supabase.com/dashboard/project/iihnfgmsfshrgrhargxz/sql/new" target="_blank" style="color:var(--accent)">Supabase SQL Editor</a>.</p></div>';
      return;
    }
    const [{ data: pats }, { data: gases }, { data: els }] = await Promise.all([
      sb.from('pat_reports').select('id,ref_number,status,test_date,client_name,deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      sb.from('gas_certs').select('id,ref_number,status,cert_date,install_address,deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      sb.from('el_certs').select('id,ref_number,premises_name,deleted_at,created_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    ]);
    const items = [
      ...(pats || []).map(r => ({ tbl: 'pat_reports', type: 'PAT', id: r.id, label: r.ref_number || r.id.slice(-6).toUpperCase(), sub: r.client_name || patFd(r.test_date), deleted_at: r.deleted_at })),
      ...(gases || []).map(r => ({ tbl: 'gas_certs', type: 'Gas CP12', id: r.id, label: r.ref_number || (r.install_address || '').slice(0, 40) || r.id.slice(-6).toUpperCase(), sub: patFd(r.cert_date), deleted_at: r.deleted_at })),
      ...(els || []).map(r => ({ tbl: 'el_certs', type: 'EL', id: r.id, label: r.ref_number || r.premises_name || r.id.slice(-6).toUpperCase(), sub: '', deleted_at: r.deleted_at }))
    ].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    if (!items.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗑️</div><p>Recycle Bin is empty</p></div>'; return; }
    el.innerHTML = `<div style="margin-bottom:12px;font-size:13px;color:var(--muted)">${items.length} deleted item${items.length === 1 ? '' : 's'} — restore or permanently purge below.</div>`
      + items.map(i => `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;background:var(--surface)">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${i.label} <span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:999px;margin-left:4px">${i.type}</span></div>
          ${i.sub ? `<div style="font-size:12px;color:var(--muted)">${i.sub}</div>` : ''}
          <div style="font-size:11px;color:var(--muted)">Deleted ${new Date(i.deleted_at).toLocaleDateString('en-GB')}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="recycleBinRestore('${i.tbl}','${i.id}')">↩ Restore</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5" onclick="recycleBinPurge('${i.tbl}','${i.id}')">🗑 Purge</button>
      </div>`).join('');
  } catch (e) { el.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>'; }
}

export async function recycleBinRestore(tbl, id) {
  const { error } = await sb.from(tbl).update({ deleted_at: null }).eq('id', id);
  if (error) { toast('Restore failed: ' + error.message, 'error'); return; }
  toast('Restored', 'success'); loadRecycleBin();
}

export function recycleBinPurge(tbl, id) {
  confirm2('Permanently Purge', 'This cannot be undone. Delete forever?', async () => {
    const { error } = await sb.from(tbl).delete().eq('id', id);
    if (error) { toast('Purge failed: ' + error.message, 'error'); return; }
    toast('Permanently deleted', 'warn'); loadRecycleBin();
  });
}

// ========== ANALYTICS ==========
export async function loadAnalytics() {
  const el = document.getElementById('analytics-content');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), ym: d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') }); }
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
    const _aFallback = async (q, qFb) => { const r = await q; return (r.error && (r.error.message || '').includes('deleted_at')) ? qFb : r; };
    const [{ data: pats }, { data: gases }, { data: els }] = await Promise.all([
      _aFallback(sb.from('pat_reports').select('id,status,test_date,created_at').gte('created_at', cutoff).is('deleted_at', null), sb.from('pat_reports').select('id,status,test_date,created_at').gte('created_at', cutoff)),
      _aFallback(sb.from('gas_certs').select('id,status,cert_date,created_at').gte('created_at', cutoff).is('deleted_at', null), sb.from('gas_certs').select('id,status,cert_date,created_at').gte('created_at', cutoff)),
      _aFallback(sb.from('el_certs').select('id,outcome,created_at').gte('created_at', cutoff).is('deleted_at', null), sb.from('el_certs').select('id,outcome,created_at').gte('created_at', cutoff))
    ]);
    const mkBuckets = () => Object.fromEntries(months.map(m => [m.ym, 0]));
    const patM = mkBuckets(), patDoneM = mkBuckets(), gasM = mkBuckets(), gasDoneM = mkBuckets(), elM = mkBuckets(), elSatM = mkBuckets();
    const ym = d => { const dt = new Date(d); return dt.getFullYear() + '-' + (dt.getMonth() + 1).toString().padStart(2, '0'); };
    (pats || []).forEach(r => { const k = ym(r.created_at); if (k in patM) { patM[k]++; if (r.status === 'completed') patDoneM[k]++; } });
    (gases || []).forEach(r => { const k = ym(r.created_at); if (k in gasM) { gasM[k]++; if (r.status === 'completed') gasDoneM[k]++; } });
    (els || []).forEach(r => { const k = ym(r.created_at); if (k in elM) { elM[k]++; if (r.outcome === 'SATISFACTORY') elSatM[k]++; } });
    const maxVal = Math.max(1, ...months.map(m => patM[m.ym] + gasM[m.ym] + elM[m.ym]));
    const bar = (v, total, color) => { const pct = Math.round((v / maxVal) * 100); return `<div title="${v}" style="height:${pct}%;min-height:${v ? 3 : 0}px;background:${color};border-radius:3px 3px 0 0;transition:height .3s"></div>`; };
    const totPat = (pats || []).length, totPDone = (pats || []).filter(r => r.status === 'completed').length;
    const totGas = (gases || []).length, totGDone = (gases || []).filter(r => r.status === 'completed').length;
    const totEl = (els || []).length, totElSat = (els || []).filter(r => r.outcome === 'SATISFACTORY').length;
    el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card accent"><div class="stat-label">PAT (6 months)</div><div class="stat-value">${totPat}</div><div class="stat-sub">${totPDone} completed</div></div>
      <div class="stat-card success"><div class="stat-label">Gas CP12 (6 months)</div><div class="stat-value">${totGas}</div><div class="stat-sub">${totGDone} completed</div></div>
      <div class="stat-card" style="background:var(--surface2)"><div class="stat-label">EL (6 months)</div><div class="stat-value">${totEl}</div><div class="stat-sub">${totElSat} satisfactory</div></div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px">
      <div style="font-weight:700;font-size:14px;margin-bottom:16px">Monthly Volume — Last 6 Months</div>
      <div style="display:flex;align-items:flex-end;gap:12px;height:140px;padding-bottom:24px;position:relative">
        ${months.map(m => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0">
          <div style="width:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:2px">
            ${bar(patM[m.ym], maxVal, '#3b82f6')}
            ${bar(gasM[m.ym], maxVal, '#f59e0b')}
            ${bar(elM[m.ym], maxVal, '#8b5cf6')}
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:6px;white-space:nowrap">${m.label}</div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:8px">
        <span><span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:4px"></span>PAT</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;margin-right:4px"></span>Gas</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#8b5cf6;border-radius:2px;margin-right:4px"></span>EL</span>
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
      <div style="font-weight:700;font-size:14px;margin-bottom:12px">Completion Rates (6 months)</div>
      ${[{ label: 'PAT', done: totPDone, total: totPat, color: '#3b82f6' }, { label: 'Gas CP12', done: totGDone, total: totGas, color: '#f59e0b' }, { label: 'EL', done: totElSat, total: totEl, color: '#8b5cf6' }].map(({ label, done, total, color }) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${label}</span><span style="font-weight:600">${pct}% <span style="color:var(--muted);font-weight:400">(${done}/${total})</span></span></div>
          <div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .4s"></div></div>
        </div>`;
    }).join('')}
    </div>`;
  } catch (e) { el.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>'; }
}

export async function globalSearch(q) {
  const box = document.getElementById('gs-results'); if (!box) return;
  q = (q || '').trim();
  if (q.length < 2) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div style="padding:12px 16px;color:var(--muted);font-size:13px">Searching…</div>';
  clearTimeout(_gsTimer);
  _gsTimer = setTimeout(async () => {
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = [];
    try {
      const [p, g, e, f] = await Promise.all([
        sb.from('pat_reports').select('id,ref_number,property_address,status,engineer,test_date').or(`ref_number.ilike.%${q}%,property_address.ilike.%${q}%,landlord_name.ilike.%${q}%`).limit(6),
        sb.from('gas_certs').select('id,ref_number,install_address,status,engineer,cert_date').or(`ref_number.ilike.%${q}%,install_address.ilike.%${q}%,recipient_email.ilike.%${q}%`).limit(6),
        sb.from('el_certs').select('id,ref_number,premises_name,outcome,test_date').or(`ref_number.ilike.%${q}%,premises_name.ilike.%${q}%`).limit(6),
        sb.from('fire_certs').select('id,ref_number,premises_address,outcome,cert_type').or(`ref_number.ilike.%${q}%,premises_address.ilike.%${q}%`).is('deleted_at', null).limit(6)
      ]);
      const wkey = r => r.ref_number || '';
      var patSorted = sortByWordStart(p.data||[], r => (r.ref_number||'')+' '+(r.property_address||''), q);
      var gasSorted = sortByWordStart(g.data||[], r => (r.ref_number||'')+' '+(r.install_address||''), q);
      var elSorted  = sortByWordStart(e.data||[], r => (r.ref_number||'')+' '+(r.premises_name||''), q);
      var fireSorted = sortByWordStart(f.data||[], r => (r.ref_number||'')+' '+(r.premises_address||''), q);
      patSorted.forEach(r => rows.push({ type: 'PAT', label: hlText(r.ref_number||'—', q), sub: hlText((r.property_address||'').substring(0,50), q), status: r.status, action: "loadPATForm('"+r.id+"')" }));
      gasSorted.forEach(r => rows.push({ type: 'Gas', label: hlText(r.ref_number||'—', q), sub: hlText((r.install_address||'').substring(0,50), q), status: r.status, action: "navigate('gas-new');loadGasForm('"+r.id+"')" }));
      elSorted.forEach(r  => rows.push({ type: 'EL',  label: hlText(r.ref_number||'—', q), sub: hlText((r.premises_name||'').substring(0,50), q), status: r.outcome, action: "navigate('el-history')" }));
      fireSorted.forEach(r => rows.push({ type: 'FA',  label: hlText(r.ref_number||'—', q), sub: hlText((r.premises_address||'').substring(0,50), q), status: r.outcome, action: "navigate('fire-history')" }));
    } catch (ex) { box.innerHTML = '<div style="padding:12px 16px;color:var(--muted);font-size:13px">Search error</div>'; return; }
    if (!rows.length) { box.innerHTML = '<div style="padding:12px 16px;color:var(--muted);font-size:13px">No results for "' + esc(q) + '"</div>'; return; }
    const typeColor = { PAT: '#dbeafe', Gas: '#fef3c7', EL: '#ede9fe', FA: '#dcfce7' };
    const typeText  = { PAT: '#1e40af', Gas: '#92400e', EL: '#5b21b6', FA: '#166534' };
    box.innerHTML = rows.map(r => '<div onclick="'+r.action+';document.getElementById(\'gs-results\').hidden=true;document.getElementById(\'global-search\').value=\'\'" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'"><span style="background:'+(typeColor[r.type]||'#f3f4f6')+';color:'+(typeText[r.type]||'#374151')+';font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap">'+r.type+'</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.label+'</div><div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.sub+'</div></div><span style="font-size:10px;color:var(--muted)">'+esc(r.status||'')+'</span></div>').join('');
  }, 300);
}

// ========== DASHBOARD ==========
export async function loadDashboard() {
  // Update date subtitle
  const dateSub = document.getElementById('dash-date-sub');
  if (dateSub) dateSub.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let pats, gases, els, fires;
  if (!navigator.onLine) {
    try {
      const _dc = JSON.parse(localStorage.getItem('_cache_dashboard') || 'null');
      if (_dc) { pats = _dc.pats; gases = _dc.gases; els = _dc.els; fires = _dc.fires; const _ago = new Date(_dc.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); toast('Offline — showing dashboard loaded at ' + _ago, 'info'); }
    } catch {}
  } else {
    const [{ data: _dp }, { data: _dg }, { data: _de }, { data: _df }] = await Promise.all([
      sb.from('pat_reports').select('id,ref_number,status,test_date,appliances,property_address,engineer,created_at').order('created_at', { ascending: false }),
      sb.from('gas_certs').select('id,ref_number,status,cert_date,next_check_date,install_address,engineer,created_at').order('created_at', { ascending: false }),
      sb.from('el_certs').select('id,ref_number,data,created_at').order('created_at', { ascending: false }),
      sb.from('fire_certs').select('id,ref_number,status,premises_address,cert_type,created_at').is('deleted_at', null).order('created_at', { ascending: false })
    ]);
    pats = _dp; gases = _dg; els = _de; fires = _df;
    try { localStorage.setItem('_cache_dashboard', JSON.stringify({ pats, gases, els, fires, ts: Date.now() })); } catch {}
  }
  if (!pats && !gases && !els) {
    const actEl = document.getElementById('dash-activity'); if (actEl) actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📵</div><p>Offline — no cached data</p></div>';
    return;
  }

  const today = new Date(); const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

  // PAT stats
  const patTotal = pats?.length || 0;
  const patDone = (pats || []).filter(r => r.status === 'completed').length;
  let patDue = 0;
  (pats || []).filter(r => r.status === 'completed').forEach(r => {
    (r.appliances || []).forEach(a => { const nt = a.nextTest || a.next_test; if (nt) { const d = new Date(nt); if (d >= today && d <= in30) patDue++; } });
  });

  // Gas stats
  const gasTotal = gases?.length || 0;
  const gasDone = (gases || []).filter(r => r.status === 'completed').length;
  let gasDue = 0;
  const _gasRenewals = [];
  (gases || []).filter(r => r.status === 'completed' && r.next_check_date).forEach(r => {
    const d = parseGasDate(r.next_check_date); if (!d) return;
    if (d >= today && d <= in30) gasDue++;
    const daysLeft = Math.round((d - today) / 86400000);
    if (daysLeft <= 60) _gasRenewals.push({ type: 'gas', label: (r.install_address || r.ref_number || '').substring(0, 38), date: d, days: daysLeft, overdue: d < today });
  });

  // EL stats
  const elCerts = (els || []).map(r => ({ ...(r.data || {}), id: r.id, ref_number: r.ref_number, created_at: r.created_at }));
  const elTotal = elCerts.length;
  const elSat = elCerts.filter(r => r.outcome === 'SATISFACTORY').length;
  const elUnsat = elCerts.filter(r => r.outcome === 'UNSATISFACTORY').length;
  const _elRenewals = [];
  elCerts.filter(r => r.nextTestDate || r.nextInspDate).forEach(r => {
    const nd = r.nextTestDate || r.nextInspDate; if (!nd) return;
    let d; if (nd.includes('/')) { const p = nd.split('/'); d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])); } else { d = new Date(nd); }
    if (isNaN(d)) return;
    const daysLeft = Math.round((d - today) / 86400000);
    if (daysLeft <= 60) _elRenewals.push({ type: 'el', label: (r.premAddr1 || r.premisesAddress || r.ref_number || '').substring(0, 38), date: d, days: daysLeft, overdue: d < today });
  });

  // Fire stats
  const fireTotal = fires?.length || 0;
  const fireDone = (fires || []).filter(r => r.status === 'completed').length;

  // Populate stat IDs (legacy + new)
  const _set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  _set('stat-pat-total', patTotal); _set('stat-pat-complete', patDone); _set('stat-pat-due', patDue);
  _set('stat-gas-total', gasTotal); _set('stat-gas-complete', gasDone); _set('stat-gas-due', gasDue);
  _set('stat-el-total', elTotal); _set('stat-el-sat', elSat); _set('stat-el-unsat', elUnsat);
  _set('stat-fire-total', fireTotal); _set('stat-fire-complete', fireDone);

  // Compliance badge
  const compBadge = document.getElementById('compliance-badge');
  if (compBadge) { const tot = patDue + gasDue; compBadge.textContent = tot; compBadge.hidden = tot === 0; }

  // Health score
  _renderHealthScore(patTotal, patDone, patDue, gasTotal, gasDone, gasDue, elTotal, elSat, elUnsat, fireTotal);

  // Sparklines (from last 6 months of created_at)
  _drawDashSparks(pats, gases, els, fires);

  // Charts
  _buildDashCharts(pats, gases, els, fires);

  // Renewals widget (combine gas + el, sorted by days)
  const allRenewals = [..._gasRenewals, ..._elRenewals].sort((a, b) => a.days - b.days).slice(0, 6);
  _buildDashRenewals(allRenewals);

  // Activity feed
  _buildDashActivity(pats || [], gases || [], fires || []);

  // Expiry reminders banner (legacy)
  try {
    const _remEnabled = getSetting('reminder_enabled', 'on');
    if (_remEnabled !== 'off') {
      const _remDays = parseInt(getSetting('reminder_days', '30')) || 30;
      const _remCutoff = new Date(today); _remCutoff.setDate(_remCutoff.getDate() + _remDays);
      const _expItems = [];
      (pats || []).filter(r => r.status === 'completed').forEach(r => {
        (r.appliances || []).forEach(a => { const nt = a.nextTest || a.next_test; if (nt) { const d = new Date(nt); if (d >= today && d <= _remCutoff) _expItems.push({ type: 'PAT', label: `PAT — ${r.ref_number || r.id.slice(-6).toUpperCase()}`, date: nt, days: Math.round((d - today) / 86400000) }); } });
      });
      (gases || []).filter(r => r.status === 'completed' && r.next_check_date).forEach(r => {
        const d = parseGasDate(r.next_check_date); if (d && d >= today && d <= _remCutoff) { const addr = (r.install_address || '').substring(0, 30); _expItems.push({ type: 'Gas', label: `Gas CP12 — ${addr || r.id.slice(-6).toUpperCase()}`, date: r.next_check_date, days: Math.round((d - today) / 86400000) }); }
      });
      elCerts.filter(r => r.nextInspDate).forEach(r => {
        const d = new Date(r.nextInspDate); if (d && d >= today && d <= _remCutoff) { _expItems.push({ type: 'EL', label: `EL — ${r.address1 || r.premAddr1 || r.id || ''}`.substring(0, 40), date: r.nextInspDate, days: Math.round((d - today) / 86400000) }); }
      });
      const _banner = document.getElementById('expiry-reminder-banner');
      if (_banner) {
        if (_expItems.length) {
          _expItems.sort((a, b) => a.days - b.days);
          _banner.hidden = false;
          _banner.innerHTML = '<strong>🔔 Expiry Reminders</strong> — ' + _expItems.length + ' certificate' + (1 === _expItems.length ? '' : 's') + ' expiring within ' + _remDays + ' days:<ul style="margin:8px 0 0;padding-left:20px">' + _expItems.slice(0, 8).map(i => `<li style="margin-bottom:3px">${i.label} <span style="color:${i.days <= 7 ? 'var(--error)' : 'var(--muted)'}">(${i.days === 0 ? 'today' : i.days + ' day' + (1 === i.days ? '' : 's')})</span></li>`).join('') + (_expItems.length > 8 ? `<li>…and ${_expItems.length - 8} more</li>` : '') + `</ul><button onclick="this.closest('#expiry-reminder-banner').hidden=true" style="margin-top:8px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0">Dismiss</button>`;
        } else { _banner.hidden = true; }
      }
    }
  } catch (e) { }
}

function _renderHealthScore(patTotal, patDone, patDue, gasTotal, gasDone, gasDue, elTotal, elSat, elUnsat, fireTotal) {
  const total = patTotal + gasTotal + elTotal + fireTotal;
  if (!total) { const s = document.getElementById('dash-health-score'); if (s) s.innerHTML = '—<sup>%</sup>'; return; }
  const issues = patDue + gasDue + elUnsat;
  const score = Math.max(0, Math.round(100 - (issues / Math.max(total, 1)) * 100));
  const el = document.getElementById('dash-health-score');
  if (el) { el.innerHTML = score + '<sup>%</sup>'; el.style.color = score >= 85 ? '#3fb950' : score >= 65 ? '#d29922' : '#f85149'; }
  const sub = document.getElementById('dash-health-sub');
  if (sub) sub.textContent = `${total} active certificates · ${issues || 'no'} issue${issues === 1 ? '' : 's'} · updated just now`;
  const pills = document.getElementById('dash-health-pills'); if (!pills) return;
  const parts = [];
  if (patDone > 0) parts.push(`<span class="dhpill dhpill-g">PAT ${patDone} issued</span>`);
  if (gasDone > 0) parts.push(`<span class="dhpill dhpill-g">Gas ${gasDone} issued</span>`);
  if (patDue > 0)  parts.push(`<span class="dhpill dhpill-w">${patDue} PAT due</span>`);
  if (gasDue > 0)  parts.push(`<span class="dhpill dhpill-w">${gasDue} Gas due</span>`);
  if (elUnsat > 0) parts.push(`<span class="dhpill dhpill-e">${elUnsat} EICR unsatisfactory</span>`);
  pills.innerHTML = parts.join('');
}

function _drawDashSparks(pats, gases, els, fires) {
  const now = new Date();
  const buckets = () => Array(6).fill(0);
  const mIdx = d => { const m = Math.floor((now - new Date(d)) / (30.5 * 86400000)); return m >= 0 && m < 6 ? 5 - m : -1; };
  const pb = buckets(), gb = buckets(), eb = buckets(), fb = buckets();
  (pats || []).forEach(r => { const i = mIdx(r.created_at); if (i >= 0) pb[i]++; });
  (gases || []).forEach(r => { const i = mIdx(r.created_at); if (i >= 0) gb[i]++; });
  (els || []).forEach(r => { const i = mIdx(r.created_at); if (i >= 0) eb[i]++; });
  (fires || []).forEach(r => { const i = mIdx(r.created_at); if (i >= 0) fb[i]++; });
  _drawSpark('spark-pat', pb, '#3b82f6');
  _drawSpark('spark-gas', gb, '#10b981');
  _drawSpark('spark-el',  eb, '#8b5cf6');
  _drawSpark('spark-fire', fb, '#ef4444');
}

function _drawSpark(id, data, color) {
  const canvas = document.getElementById(id); if (!canvas) return;
  const W = canvas.offsetWidth || 180, H = 34;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const max = Math.max(...data, 1);
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * (H - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = color + '28'; ctx.fill();
}

function _buildDashCharts(pats, gases, els, fires) {
  const Chart = window.Chart; if (!Chart) return;
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleString('default', { month: 'short' }), ym: d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') };
  });
  const mkB = () => Object.fromEntries(months.map(m => [m.ym, 0]));
  const ym = d => { const dt = new Date(d); return dt.getFullYear() + '-' + (dt.getMonth() + 1).toString().padStart(2, '0'); };
  const pb = mkB(), gb = mkB(), eb = mkB(), fb = mkB();
  (pats || []).forEach(r => { const k = ym(r.created_at); if (k in pb) pb[k]++; });
  (gases || []).forEach(r => { const k = ym(r.created_at); if (k in gb) gb[k]++; });
  (els || []).forEach(r => { const k = ym(r.created_at); if (k in eb) eb[k]++; });
  (fires || []).forEach(r => { const k = ym(r.created_at); if (k in fb) fb[k]++; });
  const labels = months.map(m => m.label);
  const gridC = 'rgba(255,255,255,.06)', tickC = '#8b949e';

  if (_dashChartMonthly) { _dashChartMonthly.destroy(); _dashChartMonthly = null; }
  const mCtx = document.getElementById('dash-chart-monthly'); if (mCtx) {
    _dashChartMonthly = new Chart(mCtx, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'PAT',  data: months.map(m => pb[m.ym]), backgroundColor: '#3b82f680' },
        { label: 'Gas',  data: months.map(m => gb[m.ym]), backgroundColor: '#10b98180' },
        { label: 'EL',   data: months.map(m => eb[m.ym]), backgroundColor: '#8b5cf680' },
        { label: 'Fire', data: months.map(m => fb[m.ym]), backgroundColor: '#ef444480' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 10 }, color: tickC } } }, scales: { x: { stacked: true, grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } }, y: { stacked: true, grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } } } }
    });
  }

  if (_dashChartMix) { _dashChartMix.destroy(); _dashChartMix = null; }
  const xCtx = document.getElementById('dash-chart-mix'); if (xCtx) {
    const totP = (pats||[]).length, totG = (gases||[]).length, totE = (els||[]).length, totF = (fires||[]).length;
    _dashChartMix = new Chart(xCtx, {
      type: 'doughnut',
      data: { labels: ['PAT','Gas CP12','Electrical','Fire Alarm'], datasets: [{ data: [totP, totG, totE, totF], backgroundColor: ['#3b82f6','#10b981','#8b5cf6','#ef4444'], borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { font: { size: 10 }, color: tickC, padding: 10, boxWidth: 10 } } } }
    });
  }
}

function _buildDashRenewals(items) {
  const el = document.getElementById('dash-renewals'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state" style="padding:12px 0"><div class="empty-icon">✓</div><p>No renewals due in next 60 days</p></div>'; return; }
  el.innerHTML = items.map(i => {
    const cls = i.overdue ? 'red' : i.days <= 14 ? 'amber' : 'green';
    const daysTxt = i.overdue ? `<span style="font-size:11px">${Math.abs(i.days)}d ago</span>` : `<span style="font-size:15px">${i.days}</span><span>DAYS</span>`;
    const typeLbl = i.type === 'gas' ? 'GAS' : i.type === 'el' ? 'EICR' : i.type.toUpperCase();
    return `<div class="dash-ren-row"><div class="dash-ren-days ${cls}">${daysTxt}</div><div class="dash-ren-info"><strong>${i.label || '—'}</strong><span>${i.type === 'gas' ? 'Annual gas safety check' : 'Periodic inspection due'}</span></div><div class="dash-ren-type ${i.type}">${typeLbl}</div></div>`;
  }).join('');
}

function _buildDashActivity(pats, gases, fires) {
  const el = document.getElementById('dash-activity'); if (!el) return;
  const rows = [];
  const fmt = d => { if (!d) return '—'; const dt = new Date(d); const diff = Math.floor((Date.now() - dt) / 86400000); return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff + 'd ago'; };
  (pats || []).slice(0, 4).forEach(r => {
    rows.push({ type: 'pat', name: r.ref_number || r.id.slice(-6).toUpperCase(), meta: (r.property_address || '').substring(0, 45) || 'No address', time: fmt(r.created_at), status: r.status === 'completed' ? 'issued' : 'draft', statusLbl: r.status === 'completed' ? 'Issued' : 'Draft' });
  });
  (gases || []).slice(0, 4).forEach(r => {
    rows.push({ type: 'gas', name: r.ref_number || r.id.slice(-6).toUpperCase(), meta: (r.install_address || '').substring(0, 45) || 'No address', time: fmt(r.created_at), status: r.status === 'completed' ? 'issued' : 'draft', statusLbl: r.status === 'completed' ? 'Issued' : 'Draft' });
  });
  (fires || []).slice(0, 3).forEach(r => {
    rows.push({ type: 'fire', name: r.ref_number || r.id.slice(-6).toUpperCase(), meta: (r.premises_address || '').substring(0, 45) || 'No address', time: fmt(r.created_at), status: r.status === 'completed' ? 'issued' : 'draft', statusLbl: r.status === 'completed' ? 'Issued' : 'Draft' });
  });
  rows.sort((a, b) => (a.time < b.time ? 1 : -1));
  if (!rows.length) { el.innerHTML = '<div class="empty-state" style="padding:8px 0"><div class="empty-icon">📋</div><p>No certificates yet</p></div>'; return; }
  el.innerHTML = rows.slice(0, 8).map(r =>
    `<div class="dash-act-row"><div class="dash-act-dot ${r.type}"></div><div class="dash-act-info"><div class="dash-act-name">${r.name}</div><div class="dash-act-meta">${r.meta}</div></div><div class="dash-act-time">${r.time}</div><div class="dash-act-status das-${r.status}">${r.statusLbl}</div></div>`
  ).join('');
}

export function dashAIChat() {
  const input = document.getElementById('dash-ai-input');
  const msgs = document.getElementById('dash-ai-msgs');
  if (!input || !msgs) return;
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  const esc = s => s.replace(/</g, '&lt;');
  msgs.insertAdjacentHTML('beforeend', `<div class="dash-msg you"><div class="dash-msg-ava you">Me</div><div class="dash-msg-bub">${esc(text)}</div></div>`);
  msgs.scrollTop = msgs.scrollHeight;
  const lower = text.toLowerCase();
  let resp = 'That\'s a great compliance question. Based on current UK standards (BS 5839-1:2025, BS 7671:2018+A2, Gas Safety Regs 1998, IET CoP 5th Ed), I recommend cross-referencing with the relevant BSI standard or your NICEIC technical helpline for a definitive answer on your specific scenario.';
  if (lower.includes('hmo') || lower.includes('ld2') || lower.includes('grade')) resp = 'For a 2-storey HMO, BS 5839-6:2019+A1:2023 requires a minimum Grade D2, Category LD2 system — mains-powered interlinked detectors with battery backup in all escape routes AND habitable rooms. A Grade D1 system without tamper-proof battery backup does NOT satisfy the standard for HMOs.';
  else if (lower.includes('c2') || lower.includes('eicr') || lower.includes('7671')) resp = 'Under BS 7671:2018+A2:2022, a C2 code means "potentially dangerous" — the defect presents a risk of injury. Examples: no RCD protection for circuits in bathrooms, accessible live parts, inadequate earthing. A C2 does not make the property uninhabitable but requires remediation. The landlord must act within 28 days under SI 2020/312.';
  else if (lower.includes('pat') || lower.includes('portable') || lower.includes('interval')) resp = 'Under IET CoP 5th Edition, PAT intervals are risk-based. Recommended intervals: hotel/residential — 1 year; offices — 2–4 years for low-risk; construction sites — 3 months for 110V equipment; schools — annually. There is no single statutory interval — the frequency should reflect the environment and equipment type.';
  else if (lower.includes('gas') || lower.includes('cp12') || lower.includes('annual')) resp = 'The Gas Safety (Installation & Use) Regs 1998 require landlords to have all gas appliances inspected annually by a Gas Safe registered engineer. There is no grace period — if the CP12 is one day overdue, the landlord is in breach. Tenants must receive a copy within 28 days of issue. Under GSR Reg 36, a copy must also be provided to any new tenant before they move in.';
  else if (lower.includes('bs 5839') || lower.includes('5839-1') || lower.includes('2025')) resp = 'BS 5839-1:2025 (commercial) is the current edition. Key changes from 2017: updated L-category definitions, enhanced commissioning requirements for L1 life-protection systems, and expanded coverage requirements for L2 systems in high-rise buildings. Your fire alarm certificates already reference the 2025 edition, so you are compliant.';
  else if (lower.includes('niceic') || lower.includes('scheme')) resp = 'As a NICEIC Approved Contractor, OHM Electrical Engineering Ltd must include the NICEIC scheme number on all EL (Electrical Installation Certificate) and EICR documents. Without it, the certificate may not be accepted by insurers, mortgage lenders, or local authorities. It should also appear on PAT reports for commercial clients.';
  setTimeout(() => {
    msgs.insertAdjacentHTML('beforeend', `<div class="dash-msg"><div class="dash-msg-ava ai">AI</div><div class="dash-msg-bub">${esc(resp)}</div></div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }, 550);
}

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
  const el = document.getElementById('comp-list'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><p>Nothing due for the selected filters</p></div>'; return; }
  el.innerHTML = items.map(i => {
    const dStr = i.due.toLocaleDateString('en-GB');
    const urgClass = i.overdue ? 'overdue' : i.daysLeft <= 7 ? 'urgent' : 'due';
    const urgLabel = i.overdue ? `OVERDUE ${Math.abs(i.daysLeft)}d ago` : i.daysLeft === 0 ? 'TODAY' : i.daysLeft === 1 ? 'Tomorrow' : 'Due ' + dStr;
    const typeBadge = i.type === 'pat' ? `<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">📋 PAT</span>` : i.type === 'el' ? `<span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">⚡ EL</span>` : `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">🔥 Gas</span>`;
    const meta = i.type === 'pat' ? `${i.label}${i.assetId ? ' · Asset: ' + i.assetId : ''}` : i.certDate ? `Last cert: ${i.certDate}` : i.label || 'Annual Safety Check';
    const action = i.type === 'pat' ? `<button class="btn btn-primary btn-sm" onclick="loadPATForm('${i.id}')">Open PAT</button>` : i.type === 'el' ? `<button class="btn btn-primary btn-sm" onclick="startNewEL()">New EL</button>` : `<button class="btn btn-primary btn-sm" onclick="startNewGas()">New Gas</button>`;
    return `<div class="cert-row"><div class="cert-row-info"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${typeBadge}<span class="cert-ref">${i.ref}</span><span class="badge badge-${urgClass}">${urgLabel}</span></div><div class="cert-address">${i.address}</div><div class="cert-meta">${meta} · Engineer: ${i.engineer}</div></div>${action}</div>`;
  }).join('');
}

function _isAdminUser() {
  return (state.currentProfile?.role || 'engineer') === 'admin';
}

// Aliases matching the stub names (called from navigate/view routing)
export { loadCompliance as loadCompliancePage };
export { loadAnalytics as loadAnalyticsPage };
export { loadRecycleBin as renderRecycleBin };

// expose globals for onclick handlers
Object.assign(window, {
  loadDashboard,
  globalSearch,
  dashAIChat,
  loadCompliance,
  loadCompliancePage: loadCompliance,
  filterCompliance,
  loadAnalytics,
  loadAnalyticsPage: loadAnalytics,
  loadRecycleBin,
  renderRecycleBin: loadRecycleBin,
  recycleBinRestore,
  recycleBinPurge,
});
