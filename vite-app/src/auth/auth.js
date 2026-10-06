import { sb } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { showOverlay, hideOverlay, toast, applyStoredTheme, _restoreDesktopSidebar, _refreshSyncBadge } from '../lib/utils.js';
import { loadAppSettings, getSetting } from '../lib/settings.js';
import { navigate } from '../nav/navigation.js';
import { applySidebarPermissions, _rolePerms } from './permissions.js';

// ── Auth tabs ──────────────────────────────────────────────────────────────
export function switchAuthTab(tab) {
  document.querySelectorAll('#auth-screen .auth-tabs .auth-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('#auth-screen .auth-panel').forEach(p => p.classList.remove('on'));
  clearAuthError();
  const tabBar = document.getElementById('auth-tab-bar');
  if (tabBar) tabBar.style.display = (tab === 'forgot' || tab === 'reset') ? 'none' : 'flex';
  if (tab === 'login') {
    document.getElementById('auth-login').classList.add('on');
    document.querySelectorAll('#auth-screen .auth-tabs .auth-tab')[0].classList.add('on');
  } else if (tab === 'register') {
    document.getElementById('auth-register').classList.add('on');
    document.querySelectorAll('#auth-screen .auth-tabs .auth-tab')[1].classList.add('on');
  } else if (tab === 'forgot') {
    document.getElementById('auth-forgot').classList.add('on');
  } else if (tab === 'reset') {
    document.getElementById('auth-reset').classList.add('on');
  }
}
export function toggleAuthPw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}
export function clearAuthError() {
  const e = document.getElementById('auth-err');
  if (e) { e.classList.remove('on'); e.textContent = ''; }
}
export function showAuthError(msg) {
  const e = document.getElementById('auth-err');
  if (e) { e.textContent = msg; e.classList.add('on'); }
}

// ── Sign-in / sign-up ─────────────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { showAuthError('Please enter email and password.'); return; }
  showOverlay('Signing in…');
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  hideOverlay();
  if (error) showAuthError(error.message);
}
export async function doRequestAccess() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const msg   = document.getElementById('reg-msg')?.value.trim() ?? '';
  if (!name || !email) { showAuthError('Name and email are required.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError('Enter a valid email address.'); return; }
  showOverlay('Sending request…');
  const { error } = await sb.from('staff_requests').insert({ full_name: name, email, message: msg || null, status: 'pending' });
  hideOverlay();
  if (error) { showAuthError('Could not send request: ' + error.message); return; }
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-email').value = '';
  if (document.getElementById('reg-msg')) document.getElementById('reg-msg').value = '';
  clearAuthError();
  switchAuthTab('login');
  toast('Access request sent! An admin will review it and set up your account.', 'success', 7000);
}
export async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showAuthError('Enter your email.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://ohmdeepcerts.github.io/certificates/',
  });
  if (error) showAuthError(error.message);
  else { toast('Reset email sent!', 'success'); switchAuthTab('login'); }
}
export async function doSetNewPassword() {
  const p  = document.getElementById('reset-pass').value;
  const p2 = document.getElementById('reset-pass2').value;
  if (p.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
  if (p !== p2) { showAuthError('Passwords do not match.'); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) { showAuthError(error.message); return; }
  state.inPasswordRecovery = false;
  toast('Password updated! Signing you in…', 'success');
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
}
export async function doLogout() {
  await sb.auth.signOut();
}

// ── onLogin / onLogout ────────────────────────────────────────────────────
export async function onLogin(user) {
  state.currentUser = user;
  document.getElementById('auth-screen').classList.add('gone');
  document.getElementById('app').classList.add('visible');
  document.getElementById('app').style.display = 'flex';
  _restoreDesktopSidebar();
  _refreshSyncBadge();
  const { syncQueue } = await import('../lib/offline.js');
  if (navigator.onLine) syncQueue();

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  state.currentProfile = profile ?? { id: user.id, email: user.email, full_name: user.email, role: 'engineer' };

  if (state.currentProfile.is_active === false) {
    document.getElementById('auth-screen').classList.remove('gone');
    document.getElementById('app').classList.remove('visible');
    document.getElementById('app').style.display = 'none';
    const err = document.getElementById('login-err');
    if (err) { err.textContent = 'Your account has been deactivated. Contact your administrator.'; err.classList.add('on'); }
    await sb.auth.signOut();
    state.currentUser = null; state.currentProfile = null;
    return;
  }

  const name = state.currentProfile.full_name ?? state.currentProfile.email ?? 'User';
  document.getElementById('user-name-display').textContent = name;
  document.getElementById('user-role-display').textContent = state.currentProfile.role ?? 'engineer';
  document.getElementById('user-avatar').textContent = (name[0] ?? 'U').toUpperCase();
  applySidebarPermissions(state.currentProfile.role ?? 'engineer');

  await loadAppSettings();
  applyStoredTheme();
  updateSidebarAppName();

  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
  const isAdminUser = (state.currentProfile.role ?? 'engineer') === 'admin';

  if (!isInstalled && !isAdminUser) {
    document.getElementById('auth-screen').classList.remove('gone');
    document.getElementById('app').classList.remove('visible');
    document.getElementById('app').style.display = 'none';
    const pwaDiv = document.createElement('div');
    pwaDiv.id = 'pwa-gate-msg';
    pwaDiv.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px 24px;max-width:400px;margin:40px auto;text-align:center;font-family:inherit';
    pwaDiv.innerHTML = '<div style="font-size:42px;margin-bottom:12px">📲</div><div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">Install Required</div><div style="font-size:14px;color:var(--muted);margin-bottom:20px;line-height:1.6">Please install this app before logging in. In your browser tap <strong>Share → Add to Home Screen</strong> (iOS) or the install icon in the address bar (Android / Chrome).</div><button onclick="sb.auth.signOut()" style="padding:10px 24px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">Sign Out</button>';
    if (!document.getElementById('pwa-gate-msg')) document.getElementById('auth-screen').appendChild(pwaDiv);
    await sb.auth.signOut();
    state.currentUser = null; state.currentProfile = null;
    return;
  }

  if (state.currentProfile.must_change_password) {
    document.getElementById('force-pw-error').textContent = '';
    document.getElementById('force-pw-new').value = '';
    document.getElementById('force-pw-confirm').value = '';
    document.getElementById('force-pw-modal').classList.remove('hidden');
    return;
  }

  const { hasFull, hasPAT, hasGas, hasEL, hasFire } = _rolePerms(state.currentProfile.role ?? 'engineer');
  if (!hasFull) {
    if (hasPAT) navigate('pat-history');
    else if (hasGas) navigate('gas-history');
    else if (hasEL) navigate('el-history');
    else if (hasFire) navigate('fire-history');
    else navigate('settings');
  } else {
    navigate('dashboard');
  }
}

export function onLogout() {
  state.currentUser = null; state.currentProfile = null;
  document.getElementById('app').classList.remove('visible');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').classList.remove('gone');
  clearAuthError();
}

export function updateSidebarAppName() {
  const n = document.getElementById('sidebar-app-name');
  if (n) n.textContent = getSetting('company_name', 'OHM Certificates');
}

// Force change password (first login)
export async function doForceChangePassword() {
  const p  = document.getElementById('force-pw-new').value;
  const p2 = document.getElementById('force-pw-confirm').value;
  const errEl = document.getElementById('force-pw-error');
  if (p.length < 8) { if (errEl) errEl.textContent = 'Password must be at least 8 characters.'; return; }
  if (p !== p2)     { if (errEl) errEl.textContent = 'Passwords do not match.'; return; }
  showOverlay('Updating password…');
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) { hideOverlay(); if (errEl) errEl.textContent = error.message; return; }
  await sb.from('profiles').update({ must_change_password: false }).eq('id', state.currentUser.id);
  hideOverlay();
  document.getElementById('force-pw-modal').classList.add('hidden');
  toast('Password set successfully!', 'success');
  navigate('dashboard');
}
