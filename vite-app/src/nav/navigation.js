import { state } from '../lib/state.js';
import { saveSettings, loadSettingsUI } from '../settings/settings.js';
import { loadAuditLog } from '../audit/audit.js';
import { newPAT, doPatPreview } from '../certs/pat/form.js';
import { loadPATHistory } from '../certs/pat/history.js';

// ── Settings leave guard ───────────────────────────────────────────────────
export function showSettingsLeaveModal() {
  document.getElementById('settings-leave-modal').classList.remove('hidden');
}
export function closeSettingsLeaveModal() {
  document.getElementById('settings-leave-modal').classList.add('hidden');
  state.pendingNav = null;
}
export async function saveAndNavigate() {
  await saveSettings();
  state.settingsDirty = false;
  const v = state.pendingNav;
  state.pendingNav = null;
  closeSettingsLeaveModal();
  _doNavigate(v);
}
export function leaveWithoutSaving() {
  state.settingsDirty = false;
  const v = state.pendingNav;
  state.pendingNav = null;
  closeSettingsLeaveModal();
  _doNavigate(v);
}

// ── Route guard ────────────────────────────────────────────────────────────
export function canNavigate(view) {
  if (!state.currentProfile) return true;
  const { hasFull, hasPAT, hasGas, hasEL, hasFire } = _rolePerms(state.currentProfile.role ?? 'engineer');
  if (view === 'settings') return hasFull;
  if (['pat-new', 'pat-history'].includes(view)) return hasPAT;
  if (['gas-new', 'gas-history'].includes(view)) return hasGas;
  if (['el-new', 'el-history'].includes(view)) return hasEL;
  if (['fire-new', 'fire-history'].includes(view)) return hasFire;
  return hasFull;
}

export function _rolePerms(role) {
  const perm = (state.currentProfile?.permissions) ?? '';
  const isAdmin = role === 'admin';
  const isFull = isAdmin || (role === 'engineer' && !perm);
  return {
    isAdmin, hasFull: isFull,
    hasPAT:  isFull || perm.includes('pat'),
    hasGas:  isFull || perm.includes('gas'),
    hasEL:   isFull || perm.includes('el'),
    hasFire: isFull || perm.includes('fire'),
  };
}

// ── Navigate ───────────────────────────────────────────────────────────────
export function navigate(view) {
  if (state.currentView === 'settings' && state.settingsDirty && view !== 'settings') {
    state.pendingNav = view; showSettingsLeaveModal(); return;
  }
  if (state.patDirty && state.currentView === 'pat-new' && view !== 'pat-new') {
    if (!confirm('You have unsaved PAT form changes. Leave without saving?')) return;
    state.patDirty = false;
  }
  if (state.gasDirty && state.currentView === 'gas-new' && view !== 'gas-new') {
    if (!confirm('You have unsaved Gas cert changes. Leave without saving?')) return;
    state.gasDirty = false;
  }
  if (state.elDirty && state.currentView === 'el-new' && view !== 'el-new') {
    if (!confirm('You have unsaved EL cert changes. Leave without saving?')) return;
    state.elDirty = false;
  }
  if (state.fireDirty && state.currentView === 'fire-new' && view !== 'fire-new') {
    if (!confirm('You have unsaved Fire cert changes. Leave without saving?')) return;
    state.fireDirty = false;
  }
  _doNavigate(view);
}

export function _doNavigate(view) {
  if (!canNavigate(view)) return;
  state.currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) { viewEl.classList.add('active'); viewEl.scrollTop = 0; }
  else { document.getElementById('view-dashboard')?.classList.add('active'); state.currentView = 'dashboard'; }
  document.getElementById('content-area').scrollTop = 0;
  closeSidebar();

  // Lazy-load view data
  import('../dashboard/dashboard.js').then(m => {
    if (view === 'dashboard') m.loadDashboard();
    else if (view === 'analytics') m.loadAnalytics();
    else if (view === 'recycle-bin') m.loadRecycleBin();
  });
  if (view === 'pat-history' || view === 'pat-new') {
    if (view === 'pat-history') loadPATHistory();
    else if (view === 'pat-new') { if (!state.editingPATId) newPAT(); else doPatPreview(); }
  }
  if (view === 'gas-history' || view === 'gas-new') {
    import('../certs/gas/history.js').then(m => { if (view === 'gas-history') m.loadGasHistory(); });
    import('../certs/gas/cp12.js').then(m => {
      if (view === 'gas-new') { if (!state.editingGasId) m.newGasCert(); if (window._applyCP12Zoom) window._applyCP12Zoom(); }
    });
  }
  if (view === 'el-history' || view === 'el-new') {
    import('../certs/el/wizard.js').then(m => {
      if (view === 'el-new') m.elRenderStep();
      else if (view === 'el-history') m.loadELHistory();
    });
  }
  if (view === 'fire-history' || view === 'fire-new') {
    import('../certs/fire/wizard.js').then(m => {
      if (view === 'fire-new') m.fireRenderStep();
      else if (view === 'fire-history') m.loadFireHistory();
    });
  }
  if (view === 'settings')   loadSettingsUI();
  if (view === 'audit')      loadAuditLog();
  if (view === 'staff')      import('../staff/staff.js').then(m => m.loadStaff());
  if (view === 'compliance') import('../directory/directory.js').then(m => m.loadCompliance());
  if (view === 'directory')  import('../directory/directory.js').then(m => m.renderDirectoryPage());
  if (view === 'appliances') import('../directory/directory.js').then(m => m.renderAppliancesPage());
}

// ── Sidebar helpers ────────────────────────────────────────────────────────
export function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}
export function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}
export function toggleDesktopSidebar() {
  if (window.innerWidth <= 768) return;
  const s = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-expand-btn');
  const collapsed = s.classList.toggle('collapsed');
  if (btn) btn.style.display = collapsed ? 'flex' : 'none';
  try { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : ''); } catch {}
}

export async function hardRefresh() {
  try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } catch {}
  window.location.href = window.location.pathname + '?v=' + Date.now();
}
