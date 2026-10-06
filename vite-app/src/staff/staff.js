import { sb } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { toast, confirm2 } from '../lib/utils.js';
import { getSetting } from '../lib/settings.js';
import { navigate } from '../nav/navigation.js';

// ── Inline helpers ─────────────────────────────────────────────────────────
function patEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Per-staff role/permissions resolver (different from nav._rolePerms which reads current user)
function _staffRolePerms(role, perm) {
  const isAdmin = role === 'admin';
  const isFull  = isAdmin || (role === 'engineer' && !perm);
  return {
    isAdmin, hasFull: isFull,
    hasPAT: isFull || (perm || '').includes('pat'),
    hasGas: isFull || (perm || '').includes('gas'),
    hasEL:  isFull || (perm || '').includes('el'),
  };
}

// ── Modal helpers ──────────────────────────────────────────────────────────
export function showAddStaffModal() {
  document.getElementById('add-staff-name').value  = '';
  document.getElementById('add-staff-email').value = '';
  document.getElementById('add-staff-role').value  = 'engineer';
  document.getElementById('add-perm-pat').checked  = false;
  document.getElementById('add-perm-gas').checked  = false;
  document.getElementById('add-perm-el').checked   = false;
  document.getElementById('add-staff-access-row').style.display = '';
  document.getElementById('add-staff-pw').value    = '';
  document.getElementById('add-staff-error').textContent = '';
  document.getElementById('add-staff-modal').classList.remove('hidden');
}
export function hideAddStaffModal() {
  const m = document.getElementById('add-staff-modal');
  m.classList.add('hidden');
  delete m.dataset.requestId;
}

// ── Staff list ─────────────────────────────────────────────────────────────
export async function loadStaff() {
  const el = document.getElementById('staff-list');
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Loading…</p></div>';
  const [profilesRes, requestsRes] = await Promise.all([
    sb.from('profiles').select('*').order('full_name'),
    sb.from('staff_requests').select('*').eq('status', 'pending').order('created_at'),
  ]);
  const notice = document.getElementById('staff-setup-notice');
  if (profilesRes.error || !profilesRes.data || profilesRes.data.length === 0) {
    notice && (notice.hidden = false);
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No staff found. Run the SQL setup first.</p></div>';
    return;
  }
  if (profilesRes.data.length === 1 && profilesRes.data[0].role === undefined) {
    notice && (notice.hidden = false);
  } else {
    notice && (notice.hidden = true);
  }
  // Pending requests
  const section = document.getElementById('pending-requests-section');
  const list    = document.getElementById('pending-requests-list');
  const reqs    = requestsRes.data || [];
  if (reqs.length && section && list) {
    section.hidden = false;
    list.innerHTML = reqs.map(r => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--warn-dim,rgba(245,158,11,0.08));border:1px solid var(--warn,#f59e0b);border-radius:var(--radius);flex-wrap:wrap;margin-bottom:8px">
        <div style="flex:1;min-width:160px">
          <div style="font-weight:600;font-size:13px">${patEsc(r.full_name)}</div>
          <div style="font-size:12px;color:var(--muted)">${patEsc(r.email)}</div>
          ${r.message ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">"${patEsc(r.message)}"</div>` : ''}
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="approveRequest('${r.id}','${patEsc(r.full_name)}','${patEsc(r.email)}')">✓ Approve</button>
          <button class="btn btn-danger btn-sm" onclick="rejectRequest('${r.id}','${patEsc(r.full_name)}')">✕ Reject</button>
        </div>
      </div>`).join('');
  } else if (section) { section.hidden = true; }
  renderStaffList(profilesRes.data);
}

export function renderStaffList(staff) {
  const el = document.getElementById('staff-list');
  if (!staff || !staff.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No staff members found.</p></div>';
    return;
  }
  el.innerHTML = '<div style="display:grid;gap:10px">' + staff.map(s => {
    const isMe   = s.id === state.currentUser?.id;
    const active = s.is_active !== false;
    const role   = s.role || 'engineer';
    const perm   = s.permissions || '';
    const name   = s.full_name || s.email || 'Unknown';
    const initials = (name[0] || '?').toUpperCase();
    const { isAdmin: sa, hasFull: sf, hasPAT: sp, hasGas: sg, hasEL: se } = _staffRolePerms(role, perm);
    const chip = (key, label, on) => `<button type="button" class="perm-chip${on ? ' perm-chip-on' : ''}" data-key="${key}" onclick="setStaffPerm('${s.id}','${key}',this)">${label}</button>`;
    const permsHTML = isMe
      ? `<span style="font-size:11px;font-weight:600;color:var(--muted);padding:3px 8px;border:1px solid var(--border);border-radius:6px">${sa ? 'Admin' : sf ? 'Full Access' : 'Staff'}</span>`
      : `<div style="display:flex;gap:4px;flex-wrap:wrap" data-perm-wrap>
           ${chip('pat', '📋 PAT', sp && !sf)}
           ${chip('gas', '🔥 Gas', sg && !sf)}
           ${chip('el',  '💡 EL',  se && !sf)}
           ${chip('full', 'Full', sf && !sa)}
           ${chip('admin', 'Admin', sa)}
         </div>`;
    const actBtns = isMe ? '' : `<button class="btn btn-sm ${active ? 'btn-secondary' : 'btn-primary'}" onclick="toggleStaffActive('${s.id}',${active})">${active ? 'Deactivate' : 'Activate'}</button><button class="btn btn-sm btn-secondary" onclick="resetStaffPassword('${s.email}','${s.id}')">🔑 Reset PW</button>`;
    return `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);flex-wrap:wrap">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:140px">
        <div style="font-weight:600;font-size:14px">${name}${isMe ? ' <span style="font-size:11px;color:var(--muted)">(you)</span>' : ''}</div>
        <div style="font-size:12px;color:var(--muted)">${s.email || ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${permsHTML}${actBtns}</div>
    </div>`;
  }).join('') + '</div>';
}

// ── Add staff ──────────────────────────────────────────────────────────────
export async function doAddStaff() {
  const name  = document.getElementById('add-staff-name').value.trim();
  const email = document.getElementById('add-staff-email').value.trim().toLowerCase();
  const role  = document.getElementById('add-staff-role').value;
  const pw    = document.getElementById('add-staff-pw').value;
  const perms = [];
  if (role === 'engineer') {
    if (document.getElementById('add-perm-pat').checked) perms.push('pat');
    if (document.getElementById('add-perm-gas').checked) perms.push('gas');
    if (document.getElementById('add-perm-el').checked)  perms.push('el');
  }
  const permissions = perms.join(',');
  const errEl = document.getElementById('add-staff-error');
  errEl.textContent = '';
  if (!name || !email || !pw)  { errEl.textContent = 'All fields are required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Invalid email address.'; return; }
  if (pw.length < 8)           { errEl.textContent = 'Password must be at least 8 characters.'; return; }
  const btn = document.querySelector('#add-staff-modal .btn-primary');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const { data: signUpData, error: signUpErr } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name } } });
    if (signUpErr) throw new Error(signUpErr.message);
    const uid = signUpData?.user?.id;
    if (!uid) throw new Error('Account created but no user ID returned. Check Supabase Auth for the new user.');
    const { error: profileErr } = await sb.from('profiles').upsert({ id: uid, email, full_name: name, role, permissions, is_active: true, must_change_password: true }, { onConflict: 'id' });
    if (profileErr) throw new Error('Auth account created but profile save failed: ' + profileErr.message);
    const reqId = document.getElementById('add-staff-modal').dataset.requestId;
    if (reqId) {
      await sb.from('staff_requests').update({ status: 'approved' }).eq('id', reqId);
      delete document.getElementById('add-staff-modal').dataset.requestId;
    }
    hideAddStaffModal();
    toast(`${name} added! They must set a new password on first login.`, 'success', 5000);
    loadStaff();
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

// ── Permission chips ───────────────────────────────────────────────────────
export async function setStaffPerm(userId, key, btn) {
  const wrap = btn.closest('[data-perm-wrap]');
  if (!wrap) return;
  const cur = {};
  wrap.querySelectorAll('.perm-chip[data-key]').forEach(c => cur[c.dataset.key] = c.classList.contains('perm-chip-on'));
  const nowOn = !cur[key];
  let newRole = 'engineer', newPerms = '';
  if (key === 'admin') {
    newRole = nowOn ? 'admin' : 'engineer'; newPerms = '';
  } else if (key === 'full') {
    newRole = 'engineer'; newPerms = '';
  } else {
    const pat = key === 'pat' ? nowOn : cur['pat'];
    const gas = key === 'gas' ? nowOn : cur['gas'];
    const el  = key === 'el'  ? nowOn : cur['el'];
    const p = []; if (pat) p.push('pat'); if (gas) p.push('gas'); if (el) p.push('el');
    newRole = 'engineer'; newPerms = p.join(',');
  }
  const { error } = await sb.from('profiles').update({ role: newRole, permissions: newPerms }).eq('id', userId);
  if (error) { toast('Failed: ' + error.message, 'error'); return; }
  toast('Access updated', 'success');
  loadStaff();
}

export async function toggleStaffActive(userId, currentlyActive) {
  const { error } = await sb.from('profiles').update({ is_active: !currentlyActive }).eq('id', userId);
  if (error) { toast('Failed to update status: ' + error.message, 'error'); loadStaff(); return; }
  toast(currentlyActive ? 'Staff member deactivated' : 'Staff member activated', 'success');
  loadStaff();
}

export async function resetStaffPassword(email, userId) {
  if (!confirm('Send password reset email to ' + email + '?\n\nThey will receive a link to set a new password. Their account will also be flagged to prompt a password change on next login.')) return;
  const [resetRes] = await Promise.all([
    sb.auth.resetPasswordForEmail(email, { redirectTo: 'https://ohmdeepcerts.github.io/certificates/' }),
    sb.from('profiles').update({ must_change_password: true }).eq('id', userId),
  ]);
  if (resetRes.error) { toast('Error: ' + resetRes.error.message, 'error'); return; }
  toast('Reset email sent to ' + email, 'success', 5000);
}

export async function doForceChangePassword() {
  const pw    = document.getElementById('force-pw-new').value;
  const pw2   = document.getElementById('force-pw-confirm').value;
  const errEl = document.getElementById('force-pw-error');
  errEl.textContent = '';
  if (pw.length < 8)  { errEl.textContent = 'Password must be at least 8 characters.'; return; }
  if (pw !== pw2)      { errEl.textContent = 'Passwords do not match.'; return; }
  const btn = document.querySelector('#force-pw-modal .btn-primary');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { error: pwErr } = await sb.auth.updateUser({ password: pw });
    if (pwErr) throw new Error(pwErr.message);
    await sb.from('profiles').update({ must_change_password: false }).eq('id', state.currentUser.id);
    state.currentProfile.must_change_password = false;
    document.getElementById('force-pw-modal').classList.add('hidden');
    toast('Password set! Welcome.', 'success');
    navigate('dashboard');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Set Password & Continue →';
  }
}

export async function loadPendingRequests() {
  const section = document.getElementById('pending-requests-section');
  const list    = document.getElementById('pending-requests-list');
  const { data, error } = await sb.from('staff_requests').select('*').eq('status', 'pending').order('created_at');
  if (error || !data || !data.length) { section && (section.hidden = true); return; }
  section && (section.hidden = false);
  list.innerHTML = data.map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--warn-dim,rgba(245,158,11,0.08));border:1px solid var(--warn,#f59e0b);border-radius:var(--radius);flex-wrap:wrap;margin-bottom:8px">
      <div style="flex:1;min-width:160px">
        <div style="font-weight:600;font-size:13px">${patEsc(r.full_name)}</div>
        <div style="font-size:12px;color:var(--muted)">${patEsc(r.email)}</div>
        ${r.message ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">"${patEsc(r.message)}"</div>` : ''}
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="approveRequest('${r.id}','${patEsc(r.full_name)}','${patEsc(r.email)}')">✓ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="rejectRequest('${r.id}','${patEsc(r.full_name)}')">✕ Reject</button>
      </div>
    </div>`).join('');
}

export function approveRequest(requestId, name, email) {
  document.getElementById('add-staff-name').value  = name;
  document.getElementById('add-staff-email').value = email;
  const defRole = getSetting('default_new_role', 'engineer');
  const defPerm = getSetting('default_new_permissions', '');
  document.getElementById('add-staff-role').value = defRole;
  if (defRole === 'engineer' && defPerm) {
    const ps = defPerm.split(',');
    const pe = document.getElementById('add-perm-pat');
    const pg = document.getElementById('add-perm-gas');
    const pl = document.getElementById('add-perm-el');
    if (pe) pe.checked = ps.includes('pat');
    if (pg) pg.checked = ps.includes('gas');
    if (pl) pl.checked = ps.includes('el');
  }
  document.getElementById('add-staff-pw').value    = '';
  document.getElementById('add-staff-error').textContent = '';
  document.getElementById('add-staff-modal').dataset.requestId = requestId;
  document.getElementById('add-staff-modal').classList.remove('hidden');
}

export async function rejectRequest(requestId, name) {
  confirm2('Reject Request', `Reject access request from ${name}?`, async () => {
    await sb.from('staff_requests').update({ status: 'rejected' }).eq('id', requestId);
    toast(`Request from ${name} rejected.`, 'info');
    loadPendingRequests();
  });
}

export function copyStaffSQL() {
  const sql = document.getElementById('staff-sql-block').textContent;
  navigator.clipboard.writeText(sql).then(() => {
    const btn = document.getElementById('copy-sql-btn');
    btn.textContent = '✓ Copied!'; btn.style.background = 'var(--success,#22c55e)'; btn.style.color = '#fff';
    setTimeout(() => { btn.textContent = '📋 Copy'; btn.style.background = ''; btn.style.color = ''; }, 2000);
  }).catch(() => toast('Copy failed — select the SQL manually', 'error'));
}

// Backward-compat globals for HTML onclick= handlers
window.showAddStaffModal    = showAddStaffModal;
window.hideAddStaffModal    = hideAddStaffModal;
window.doAddStaff           = doAddStaff;
window.setStaffPerm         = setStaffPerm;
window.toggleStaffActive    = toggleStaffActive;
window.resetStaffPassword   = resetStaffPassword;
window.doForceChangePassword = doForceChangePassword;
window.approveRequest       = approveRequest;
window.rejectRequest        = rejectRequest;
window.copyStaffSQL         = copyStaffSQL;
