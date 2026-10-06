import { sb } from './supabase.js';
import { state, isAdmin } from './state.js';

// ── Overlay ────────────────────────────────────────────────────────────────
export function showOverlay(msg) {
  document.getElementById('overlay-simple').style.display = 'flex';
  document.getElementById('overlay-progress').style.display = 'none';
  document.getElementById('overlay-msg').textContent = msg || 'Loading…';
  document.getElementById('loading-overlay').classList.add('active');
}
export function hideOverlay() {
  document.getElementById('loading-overlay').classList.remove('active');
  document.getElementById('overlay-simple').style.display = 'flex';
  document.getElementById('overlay-progress').style.display = 'none';
}

// stepDefs = [{label:'Rendering PDF'}, …], currentIdx = 0-based
export function showEmailProgress(stepDefs, currentIdx) {
  document.getElementById('overlay-simple').style.display = 'none';
  document.getElementById('overlay-progress').style.display = 'block';
  document.getElementById('loading-overlay').classList.add('active');
  document.getElementById('ovp-title').textContent = 'Sending certificate email';
  document.getElementById('ovp-step').textContent = stepDefs[currentIdx]?.label || '';
  const pct = Math.round(((currentIdx + 0.5) / stepDefs.length) * 100);
  document.getElementById('ovp-bar').style.width = pct + '%';
  document.getElementById('ovp-steps').innerHTML = stepDefs.map((s, i) => {
    const done = i < currentIdx, active = i === currentIdx;
    const ic = done ? '✓' : active ? '◉' : '○';
    const col = done ? '#10b981' : active ? '#3b82f6' : '#94a3b8';
    return `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:${col};font-weight:${active ? '600' : '400'};margin-bottom:7px"><span style="font-size:13px;width:16px;text-align:center">${ic}</span>${s.label}</div>`;
  }).join('');
}
export function finishEmailProgress() {
  document.getElementById('ovp-bar').style.width = '100%';
  document.getElementById('ovp-step').textContent = 'Done ✓';
  document.getElementById('ovp-steps').querySelectorAll('div').forEach(d => {
    d.style.color = '#10b981'; d.style.fontWeight = '400';
    d.querySelectorAll('span')[0].textContent = '✓';
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = null) {
  if (duration === null) duration = type === 'error' ? 7000 : type === 'warn' ? 5000 : 3500;
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── Modal helpers ──────────────────────────────────────────────────────────
export function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
export function confirm2(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok').onclick = () => { closeModal('confirm-modal'); cb(); };
  openModal('confirm-modal');
}

// ── Soft delete ────────────────────────────────────────────────────────────
export async function _softDelete(tbl, id, afterFn) {
  const ts = new Date().toISOString();
  if (isAdmin()) {
    const { error } = await sb.from(tbl).delete().eq('id', id);
    if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
    toast('Permanently deleted', 'warn');
  } else {
    const { error } = await sb.from(tbl).update({ deleted_at: ts, updated_at: ts }).eq('id', id);
    if (error) {
      if ((error.message || '').includes('deleted_at')) {
        toast('Recycle Bin not set up yet — run SQL migration in Settings → Backend', 'warn', 5000);
      } else {
        toast('Delete failed: ' + error.message, 'error');
      }
      return;
    }
    toast('Moved to Recycle Bin', 'warn');
  }
  if (afterFn) afterFn();
}

// ── Date helpers ──────────────────────────────────────────────────────────
export function todayUK() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function isoToUK(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB');
}
export function ukToISO(uk) {
  if (!uk) return '';
  const [d, m, y] = uk.split('/');
  return `${y}-${m}-${d}`;
}
export function fmtDateShort(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// ── Theme ──────────────────────────────────────────────────────────────────
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem('app_theme');
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
    else if (t === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  } catch {}
}

// ── Sidebar helpers ────────────────────────────────────────────────────────
export function _restoreDesktopSidebar() {
  try {
    const s = localStorage.getItem('sidebar_collapsed');
    if (s === 'true') document.getElementById('app')?.classList.add('sidebar-collapsed');
  } catch {}
}
export function _refreshSyncBadge() {
  try {
    const store = indexedDB.open('certQueue', 1);
    store.onsuccess = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) return;
      const cnt = db.transaction('queue', 'readonly').objectStore('queue').count();
      cnt.onsuccess = () => {
        const badge = document.getElementById('sync-badge');
        if (badge) badge.style.display = cnt.result > 0 ? 'inline-flex' : 'none';
      };
    };
  } catch {}
}

// ── String escape for HTML ────────────────────────────────────────────────
export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── History list UI helpers ───────────────────────────────────────────────
export function _ibtn(label, icon, onclick, danger = false) {
  return `<button onclick="${onclick}" title="${label}" style="width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${danger ? '#fca5a5' : 'var(--border)'};border-radius:6px;background:var(--surface);color:${danger ? '#dc2626' : 'var(--muted)'};cursor:pointer;font-size:12px"><i class="fa-solid ${icon}"></i></button>`;
}

export function _addrInitials(s) {
  const w = (s || '').replace(/^\d+\s*/, '').split(/[\s,]+/).filter(x => x.length > 1 && !/^\d+$/.test(x));
  return ((w[0] || '')[0] || '') + ((w[1] || '')[0] || (w[0] || '')[1] || '');
}

export function _addrColor(s) {
  let h = 0;
  for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  const hue = [220, 155, 270, 35, 330, 180][Math.abs(h) % 6];
  return [`hsla(${hue},60%,50%,.15)`, `hsl(${hue},55%,45%)`];
}
