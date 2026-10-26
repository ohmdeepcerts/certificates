// ── Styles ────────────────────────────────────────────────────────────────
import './styles/global.css';
import './styles/gas.css';

// ── Theme flash prevention (runs synchronously before paint) ─────────────
try {
  const t = localStorage.getItem('app_theme');
  if (t === 'dark')  document.documentElement.dataset.theme = 'dark';
  else if (t === 'light') document.documentElement.dataset.theme = 'light';
} catch {}

// ── Core imports ──────────────────────────────────────────────────────────
import { sb }                  from './lib/supabase.js';
import { state }               from './lib/state.js';
import { setOfflinePills, syncQueue, refreshSyncBadge } from './lib/offline.js';
import { loadAppSettings }     from './lib/settings.js';
import { initAuthParticles }   from './auth/particles.js';
import { onLogin, onLogout, switchAuthTab, doLogin, doLogout,
         doRequestAccess, doForgot, doSetNewPassword,
         doForceChangePassword, toggleAuthPw }      from './auth/auth.js';
import { navigate, toggleSidebar, closeSidebar,
         toggleDesktopSidebar, hardRefresh,
         showSettingsLeaveModal, closeSettingsLeaveModal,
         saveAndNavigate, leaveWithoutSaving }      from './nav/navigation.js';
import { toast, openModal, closeModal, confirm2 }   from './lib/utils.js';

// ── Expose globals needed by inline HTML onclick handlers ─────────────────
// (Temporary shim — will be removed once HTML templates are modularised.)
Object.assign(window, {
  navigate, toggleSidebar, closeSidebar, toggleDesktopSidebar, hardRefresh,
  doLogin, doLogout, doRequestAccess, doForgot, doSetNewPassword,
  doForceChangePassword, switchAuthTab, toggleAuthPw,
  toast, openModal, closeModal, confirm2,
  showSettingsLeaveModal, closeSettingsLeaveModal,
  saveAndNavigate, leaveWithoutSaving,
});

// Lazy-load cert modules so they register their own window globals
async function _loadCertGlobals() {
  const [pat, gas, el, fire] = await Promise.all([
    import('./certs/pat/form.js'),
    import('./certs/gas/cp12.js'),
    import('./certs/el/wizard.js'),
    import('./certs/fire/wizard.js'),
  ]);
  Object.assign(window, pat);
  Object.assign(window, gas);
  Object.assign(window, el);
  Object.assign(window, fire);
  const [gasWiz, gasPdf, gasPrev, gasHist, dir, eng, settings, patEmail, patPdf, patHist, patScan, gasSig, staff, audit, csv, dash] = await Promise.all([
    import('./certs/gas/wizard.js'),
    import('./certs/gas/pdf.js'),
    import('./certs/gas/preview.js'),
    import('./certs/gas/history.js'),
    import('./directory/directory.js'),
    import('./engineers/engineers.js'),
    import('./settings/settings.js'),
    import('./certs/pat/email.js'),
    import('./certs/pat/pdf.js'),
    import('./certs/pat/history.js'),
    import('./certs/pat/scan.js'),
    import('./certs/gas/signatures.js'),
    import('./staff/staff.js'),
    import('./audit/audit.js'),
    import('./shared/csv.js'),
    import('./dashboard/dashboard.js'),
  ]);
  Object.assign(window, gasWiz);
  Object.assign(window, gasPdf);
  Object.assign(window, gasPrev);
  Object.assign(window, gasHist);
  Object.assign(window, dir);
  Object.assign(window, patHist);
  Object.assign(window, { _showEngineerPicker: eng.showEngineerPicker });
  Object.assign(window, { loadSettingsUI: settings.loadSettingsUI, saveSettings: settings.saveSettings });
  Object.assign(window, { emailPAT: patEmail.emailPAT, emailPATFromList: patEmail.emailPATFromList });
  Object.assign(window, { generatePATPDF: patPdf.generatePATPDF, printPATCertificate: patPdf.printPATCertificate, openPATPDF: patPdf.openPATPDF });
  Object.assign(window, { openScanModal: patScan.openScanModal, closeScanModal: patScan.closeScanModal, handleScanFile: patScan.handleScanFile, runScan: patScan.runScan, renderScanResults: patScan.renderScanResults, addPatScanResults: patScan.addPatScanResults });
  Object.assign(window, gasSig);
  Object.assign(window, { showAddStaffModal: staff.showAddStaffModal, hideAddStaffModal: staff.hideAddStaffModal, doAddStaff: staff.doAddStaff, setStaffPerm: staff.setStaffPerm, toggleStaffActive: staff.toggleStaffActive, resetStaffPassword: staff.resetStaffPassword, approveRequest: staff.approveRequest, rejectRequest: staff.rejectRequest, copyStaffSQL: staff.copyStaffSQL, loadStaff: staff.loadStaff, loadPendingRequests: staff.loadPendingRequests });
  Object.assign(window, { renderAuditPage: audit.renderAuditPage, prevAuditPage: audit.prevAuditPage, nextAuditPage: audit.nextAuditPage, loadAuditLog: audit.loadAuditLog });
  Object.assign(window, { exportPATCSV: csv.exportPATCSV, exportGasCSV: csv.exportGasCSV, exportELCSV: csv.exportELCSV });
  Object.assign(window, { globalSearch: dash.globalSearch, loadDashboard: dash.loadDashboard, loadAnalytics: dash.loadAnalytics, recycleBinRestore: dash.recycleBinRestore, recycleBinPurge: dash.recycleBinPurge, loadCompliance: dash.loadCompliance, filterCompliance: dash.filterCompliance });
}

// ── App init ──────────────────────────────────────────────────────────────
async function init() {
  initAuthParticles();

  if (window.location.hash.includes('type=recovery')) {
    state.inPasswordRecovery = true;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    switchAuthTab('reset');
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      await _loadCertGlobals();
      await onLogin(session.user);
    }
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.inPasswordRecovery = true;
      document.getElementById('auth-screen').classList.remove('gone');
      document.getElementById('app').classList.remove('visible');
      document.getElementById('app').style.display = 'none';
      switchAuthTab('reset');
      return;
    }
    if (event === 'SIGNED_IN' && session && !state.currentUser && !state.inPasswordRecovery) {
      await _loadCertGlobals();
      await onLogin(session.user);
    }
    if (event === 'SIGNED_OUT') { state.inPasswordRecovery = false; onLogout(); }
  });

  // Keyboard shortcuts
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('reg-msg')?.addEventListener('keydown', e => { if (e.key === 'Enter') doRequestAccess(); });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'KeyS' && state.currentView === 'pat-new') {
      e.preventDefault();
      window.savePAT?.();
    }
  });

  // PAT auto-save every 15s
  setInterval(() => {
    if (state.currentView === 'pat-new' && window.patApps?.length) {
      try { localStorage.setItem('pat_autosave', JSON.stringify(window.getPATFormData?.())); } catch {}
    }
  }, 15000);

  // CP12 form init (gas)
  window.initCP12Form?.();

  // Service worker — register and show in-app banner when a new version is ready
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/certificates/sw.js')
      .then(() => {
        const hadController = !!navigator.serviceWorker.controller;
        let _swUpdating = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController || _swUpdating) return;
          _swUpdating = true;
          if (document.getElementById('sw-update-banner')) return;
          const banner = document.createElement('div');
          banner.id = 'sw-update-banner';
          banner.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;z-index:99999;display:flex;align-items:center;gap:10px;box-shadow:0 6px 24px rgba(0,0,0,.5);white-space:nowrap;';
          banner.innerHTML = '<i class="fa-solid fa-rotate" style="color:#60a5fa"></i><span>New version available</span><button onclick="window.location.reload()" style="background:#3b82f6;border:none;color:#fff;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;margin-left:4px;">Refresh</button>';
          document.body.appendChild(banner);
        });
      })
      .catch(() => {});
  }

  // Online / offline handlers
  let _netPillTick = null;
  window.addEventListener('online', () => {
    clearInterval(_netPillTick);
    setOfflinePills(false);
    syncQueue();
  });
  window.addEventListener('offline', () => {
    setOfflinePills(true);
    refreshSyncBadge();
    _netPillTick = setInterval(() => {
      if (!navigator.onLine) setOfflinePills(true);
      else clearInterval(_netPillTick);
    }, 30000);
  });
  if (!navigator.onLine) setOfflinePills(true);
}

init();
