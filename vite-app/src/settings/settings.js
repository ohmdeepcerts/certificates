import { sb } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { toast, showOverlay, hideOverlay } from '../lib/utils.js';
import { getSetting, upsertSetting } from '../lib/settings.js';
import { logAppEvent } from '../audit/audit.js';

// ── Email method toggle ────────────────────────────────────────────────────
export function toggleEmailMethod() {
  const m       = document.getElementById('s-email-method').value;
  const btnScript = document.getElementById('method-btn-script');
  const btnBrevo  = document.getElementById('method-btn-brevo');
  if (btnScript && btnBrevo) {
    if (m === 'brevo') {
      btnBrevo.style.cssText  = 'border:2px solid var(--accent);border-radius:8px;padding:16px;cursor:pointer;background:var(--accent);color:#fff';
      btnScript.style.cssText = 'border:2px solid var(--border);border-radius:8px;padding:16px;cursor:pointer;background:var(--surface2);color:var(--text)';
    } else {
      btnScript.style.cssText = 'border:2px solid var(--accent);border-radius:8px;padding:16px;cursor:pointer;background:var(--accent);color:#fff';
      btnBrevo.style.cssText  = 'border:2px solid var(--border);border-radius:8px;padding:16px;cursor:pointer;background:var(--surface2);color:var(--text)';
    }
  }
  document.getElementById('email-section-script').style.display = m === 'script' ? '' : 'none';
  document.getElementById('email-section-brevo').style.display  = m === 'brevo'  ? '' : 'none';
}

// ── App theme ──────────────────────────────────────────────────────────────
export function setAppTheme(mode) {
  try { localStorage.setItem('app_theme', mode); } catch (e) {}
  const r = document.documentElement;
  if (mode === 'dark')       r.dataset.theme = 'dark';
  else if (mode === 'light') r.dataset.theme = 'light';
  else                       delete r.dataset.theme;
  ['system', 'light', 'dark'].forEach(m => {
    const b = document.getElementById('theme-btn-' + m);
    if (b) { b.style.background = m === mode ? 'var(--accent)' : ''; b.style.color = m === mode ? '#fff' : ''; b.style.borderColor = m === mode ? 'var(--accent)' : ''; }
  });
}

// ── Sidebar app name ───────────────────────────────────────────────────────
export function updateSidebarAppName() {
  const name    = getSetting('app_name', '');
  const titleEl = document.querySelector('.sidebar-title');
  const logoEl  = document.querySelector('.sidebar-logo');
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (titleEl) titleEl.textContent = parts.slice(1).join(' ') || parts[0];
    if (logoEl)  logoEl.textContent  = parts[0].substring(0, 4).toUpperCase();
  } else {
    if (titleEl) titleEl.textContent = 'Certificates';
    if (logoEl)  logoEl.textContent  = 'OHM';
  }
}

// ── Email helpers (used by cert modules) ──────────────────────────────────
export function buildEmailSubject(certType, ref, address) {
  const tmpl = getSetting('email_subject_tmpl', '');
  if (!tmpl) return `${certType} Certificate — ${ref || address || ''}`;
  const co = getSetting('pat_co_name', getSetting('gas_co_name', getSetting('company_name', '')));
  return tmpl
    .replace(/\{cert_type\}/gi, certType)
    .replace(/\{ref\}/gi, ref || '')
    .replace(/\{address\}/gi, address || '')
    .replace(/\{company\}/gi, co);
}
export function getGlobalCC() { return getSetting('email_cc', '') || ''; }

// ── Test email ─────────────────────────────────────────────────────────────
export async function sendTestEmail() {
  const to = document.getElementById('s-test-email').value.trim().toLowerCase();
  if (!to) { toast('Enter a test email address', 'warn'); return; }
  const method = document.getElementById('s-email-method').value;
  if (method === 'brevo') {
    const fromEmail = document.getElementById('s-from-email').value.trim() || getSetting('email_from') || 'Compliance@ohmelectricals.co.uk';
    const fromName  = document.getElementById('s-from-name').value.trim()  || getSetting('email_from_name') || getSetting('company_name', 'OHM Electrical Engineering Ltd');
    const html = `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto"><div style="background:#1a3a6b;color:#fff;padding:20px 24px;border-radius:4px 4px 0 0"><h2 style="margin:0">OHM ELECTRICAL ENGINEERING LTD</h2><p style="margin:4px 0 0;font-size:13px">Certificate Email System</p></div><div style="padding:24px;background:#fff;border:1px solid #e0e0e0;border-top:0;border-radius:0 0 4px 4px"><p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:12px 16px;color:#15803d;font-weight:bold">&#10003; Brevo email integration is working. PAT and CP12 certificates will arrive with PDF attachments.</p><p style="color:#555">Sent from: <strong>${fromEmail}</strong></p></div></div>`;
    showOverlay('Sending test email…');
    try {
      await window.sendBrevoEmail(to, 'Test', `Test — OHM Certificates Email System`, html, null, null, null);
      toast('Test email sent ✓ — check inbox &amp; spam for ' + to, 'success', 6000);
    } catch (e) {
      toast('Failed: ' + e.message, 'error', 7000);
    } finally {
      hideOverlay();
    }
  } else {
    toast('Test only available for Brevo — switch method to Brevo first', 'warn', 4000);
  }
}

// ── Load Settings UI ───────────────────────────────────────────────────────
export function loadSettingsUI() {
  state.settingsDirty = false;
  if (!window._settingsListenerBound) {
    const sv = document.getElementById('view-settings');
    if (sv) {
      sv.addEventListener('input',  () => { state.settingsDirty = true; }, true);
      sv.addEventListener('change', () => { state.settingsDirty = true; }, true);
    }
    window._settingsListenerBound = true;
  }
  // PAT company
  document.getElementById('s-pat-co-name').value      = getSetting('pat_co_name', '');
  document.getElementById('s-pat-co-sub').value        = getSetting('pat_co_sub', '');
  document.getElementById('s-pat-co-phone').value      = getSetting('pat_co_phone', '');
  document.getElementById('s-pat-co-email').value      = getSetting('pat_co_email', '');
  document.getElementById('s-pat-co-address').value    = getSetting('pat_co_address', '');
  document.getElementById('s-pat-co-website').value    = getSetting('pat_co_website', '');
  document.getElementById('s-pat-co-vat').value        = getSetting('pat_co_vat', '');
  document.getElementById('s-pat-co-regno').value      = getSetting('pat_co_regno', '');
  document.getElementById('s-pat-co-insurance').value  = getSetting('pat_co_insurance', '');
  // Gas company
  document.getElementById('s-gas-co-name').value       = getSetting('gas_co_name', '');
  document.getElementById('s-gas-engineer').value      = getSetting('gas_default_engineer', '');
  document.getElementById('s-gas-co-address').value    = getSetting('gas_co_address', '');
  document.getElementById('s-gas-co-postcode').value   = getSetting('gas_co_postcode', '');
  document.getElementById('s-gas-co-phone').value      = getSetting('gas_co_phone', '');
  document.getElementById('s-gas-co-email').value      = getSetting('gas_co_email', '');
  document.getElementById('s-gas-safe-no').value       = getSetting('gas_safe_no', '');
  document.getElementById('s-gas-licence').value       = getSetting('gas_licence', '');
  const gasLogoFields = [['gas_logo_data', 'pr-gas-logo'], ['gas_engg_sig_data', 'pr-gas-sig']];
  gasLogoFields.forEach(([key, previewId]) => {
    const d = getSetting(key, '');
    if (d) { const el = document.getElementById(previewId); if (el) el.innerHTML = `<img src="${d}" style="max-height:70px;object-fit:contain">`; }
  });
  // EL company
  document.getElementById('s-el-co-name').value               = getSetting('el_co_name', '');
  document.getElementById('s-el-engineer').value               = getSetting('el_engineer', '');
  document.getElementById('s-el-co-addr1').value               = getSetting('el_co_addr1', '');
  document.getElementById('s-el-co-addr2').value               = getSetting('el_co_addr2', '');
  document.getElementById('s-el-co-addr3').value               = getSetting('el_co_addr3', '');
  document.getElementById('s-el-co-postcode').value            = getSetting('el_co_postcode', '');
  document.getElementById('s-el-co-phone').value               = getSetting('el_co_phone', '');
  document.getElementById('s-el-co-email').value               = getSetting('el_co_email', '');
  document.getElementById('s-el-co-website').value             = getSetting('el_co_website', 'https://www.ohmelectricals.co.uk');
  const _elcsz = getSetting('el_coname_size', '22');
  document.getElementById('s-el-coname-size').value = _elcsz;
  document.getElementById('s-el-coname-size-v').textContent = _elcsz + 'px';
  document.getElementById('s-el-position').value              = getSetting('el_position', '');
  document.getElementById('s-el-body').value                  = getSetting('el_body', '');
  document.getElementById('s-el-enrol-no').value              = getSetting('el_enrol_no', '');
  document.getElementById('s-el-ref-prefix').value            = getSetting('el_ref_prefix', 'EL');
  document.getElementById('s-el-ref-start').value             = getSetting('el_ref_start', '1001');
  document.getElementById('s-el-client-email-default').value  = getSetting('el_client_email_default', 'gbelectricalcertificates@hotmail.com');
  document.getElementById('s-el-inst1-brand').value           = getSetting('el_inst1_brand', '');
  document.getElementById('s-el-inst1-model').value           = getSetting('el_inst1_model', '');
  document.getElementById('s-el-inst2-brand').value           = getSetting('el_inst2_brand', '');
  document.getElementById('s-el-inst2-model').value           = getSetting('el_inst2_model', '');
  const elLogoFields = [['el_logo_data', 'pr-el-logo'], ['el_body_logo_data', 'pr-el-body-logo'], ['el_sig_data', 'pr-el-sig']];
  elLogoFields.forEach(([key, previewId]) => {
    const d = getSetting(key, '');
    if (d) { const el = document.getElementById(previewId); if (el) el.innerHTML = `<img src="${d}" style="max-height:70px;object-fit:contain">`; }
  });
  // Email
  document.getElementById('s-email-method').value     = getSetting('email_method', 'script');
  toggleEmailMethod();
  document.getElementById('s-script-url').value       = getSetting('email_script_url');
  document.getElementById('s-brevo-key').value        = getSetting('brevo_api_key');
  document.getElementById('s-from-email').value       = getSetting('email_from');
  document.getElementById('s-from-name').value        = getSetting('email_from_name');
  document.getElementById('s-fallback-email').value   = getSetting('email_fallback', '');
  document.getElementById('s-bcc-email').value        = getSetting('email_bcc', '');
  document.getElementById('s-cc-email').value         = getSetting('email_cc', '');
  document.getElementById('s-email-subject-tmpl').value = getSetting('email_subject_tmpl', '');
  const _remEl  = document.getElementById('s-reminder-enabled'); if (_remEl)  _remEl.value  = getSetting('reminder_enabled', 'on');
  const _remDEl = document.getElementById('s-reminder-days');    if (_remDEl) _remDEl.value = getSetting('reminder_days', '30');
  // PAT
  document.getElementById('s-pat-ref-prefix').value   = getSetting('pat_ref_prefix', 'PAT');
  document.getElementById('s-pat-ref-start').value    = getSetting('pat_ref_start', '1');
  document.getElementById('s-gas-ref-prefix').value   = getSetting('gas_ref_prefix', getSetting('ref_prefix', 'OHM'));
  document.getElementById('s-gas-ref-start').value    = getSetting('gas_ref_start', getSetting('ref_start', '210'));
  document.getElementById('s-pat-period').value       = getSetting('pat_period', '12');
  document.getElementById('s-pat-engineer').value     = getSetting('pat_default_engineer');
  document.getElementById('s-pat-instrument').value   = getSetting('pat_default_instrument', '');
  document.getElementById('s-pat-result').value       = getSetting('pat_default_result', 'Pass');
  document.getElementById('s-pat-hdr-color').value    = getSetting('pat_hdr_color', '#1e3a5f');
  document.getElementById('s-pat-hdr-text').value     = getSetting('pat_hdr_text', '#ffffff');
  document.getElementById('s-pat-row-color').value    = getSetting('pat_row_color', '#f8fafc');
  const _csz  = getSetting('pat_coname_size', '26'); document.getElementById('s-pat-coname-size').value = _csz;  document.getElementById('s-pat-coname-size-v').textContent = _csz  + 'px';
  const _ctsz = getSetting('pat_cotype_size', '11'); document.getElementById('s-pat-cotype-size').value = _ctsz; document.getElementById('s-pat-cotype-size-v').textContent = _ctsz + 'px';
  const _tdsz = getSetting('pat_td_font', '12');     document.getElementById('s-pat-td-font').value     = _tdsz; document.getElementById('s-pat-td-font-v').textContent     = _tdsz + 'px';
  document.getElementById('s-gemini-key').value       = getSetting('gemini_key', '');
  const _ipcEl = document.getElementById('s-idealpc-key'); if (_ipcEl) _ipcEl.value = getSetting('ideal_postcodes_key', '');
  document.getElementById('s-pat-cert-title').value   = getSetting('pat_cert_title', 'PORTABLE APPLIANCE TEST REPORT');
  document.getElementById('s-pat-sig-label').value    = getSetting('pat_sig_label', 'Authorised Signature');
  document.getElementById('s-pat-accred').value       = getSetting('pat_accred', '');
  document.getElementById('s-pat-reg-text').value     = getSetting('pat_reg_text', 'Electricity at Work Regulations 1989');
  document.getElementById('s-pat-cop').value          = getSetting('pat_cop', 'IET Code of Practice (5th Edition)');
  document.getElementById('s-pat-cert-notes').value   = getSetting('pat_cert_notes', '');
  const logoFields = [['pat_logo_data', 'pr-logo'], ['pat_logo2_data', 'pr-pat1'], ['pat_logo3_data', 'pr-pat2'], ['pat_sig_data', 'pr-sig']];
  logoFields.forEach(([key, previewId]) => {
    const d = getSetting(key, '');
    if (d) { const el = document.getElementById(previewId); if (el) el.innerHTML = `<img src="${d}" style="max-height:70px;object-fit:contain">`; }
  });
  // Profile
  document.getElementById('s-profile-name').value    = state.currentProfile?.full_name  || '';
  document.getElementById('s-profile-email').value   = state.currentProfile?.email      || state.currentUser?.email || '';
  document.getElementById('s-profile-gas').value     = state.currentProfile?.gas_safe_no || '';
  document.getElementById('s-profile-licence').value = state.currentProfile?.licence_no  || '';
  document.getElementById('s-app-name').value        = getSetting('app_name', '');
  const _drEl = document.getElementById('s-default-role');        if (_drEl) _drEl.value = getSetting('default_new_role', 'engineer');
  const _dpEl = document.getElementById('s-default-permissions'); if (_dpEl) _dpEl.value = getSetting('default_new_permissions', '');
  const _at = localStorage.getItem('app_theme') || 'system';
  ['system', 'light', 'dark'].forEach(m => {
    const b = document.getElementById('theme-btn-' + m);
    if (b) { b.style.background = m === _at ? 'var(--accent)' : ''; b.style.color = m === _at ? '#fff' : ''; b.style.borderColor = m === _at ? 'var(--accent)' : ''; }
  });
}

// ── Save Settings ──────────────────────────────────────────────────────────
export async function saveSettings() {
  showOverlay('Saving…');
  const pairs = [
    ['pat_co_name',       document.getElementById('s-pat-co-name').value],
    ['pat_co_sub',        document.getElementById('s-pat-co-sub').value],
    ['pat_co_phone',      document.getElementById('s-pat-co-phone').value],
    ['pat_co_email',      document.getElementById('s-pat-co-email').value],
    ['pat_co_address',    document.getElementById('s-pat-co-address').value],
    ['pat_co_website',    document.getElementById('s-pat-co-website').value],
    ['pat_co_vat',        document.getElementById('s-pat-co-vat').value],
    ['pat_co_regno',      document.getElementById('s-pat-co-regno').value],
    ['pat_co_insurance',  document.getElementById('s-pat-co-insurance').value],
    ['gas_co_name',       document.getElementById('s-gas-co-name').value],
    ['gas_default_engineer', document.getElementById('s-gas-engineer').value],
    ['gas_co_address',    document.getElementById('s-gas-co-address').value],
    ['gas_co_postcode',   document.getElementById('s-gas-co-postcode').value],
    ['gas_co_phone',      document.getElementById('s-gas-co-phone').value],
    ['gas_co_email',      document.getElementById('s-gas-co-email').value],
    ['gas_safe_no',       document.getElementById('s-gas-safe-no').value],
    ['gas_licence',       document.getElementById('s-gas-licence').value],
    ['el_co_name',        document.getElementById('s-el-co-name').value],
    ['el_coname_size',    document.getElementById('s-el-coname-size').value],
    ['el_engineer',       document.getElementById('s-el-engineer').value],
    ['el_co_addr1',       document.getElementById('s-el-co-addr1').value],
    ['el_co_addr2',       document.getElementById('s-el-co-addr2').value],
    ['el_co_addr3',       document.getElementById('s-el-co-addr3').value],
    ['el_co_postcode',    document.getElementById('s-el-co-postcode').value],
    ['el_co_phone',       document.getElementById('s-el-co-phone').value],
    ['el_co_email',       document.getElementById('s-el-co-email').value],
    ['el_co_website',     document.getElementById('s-el-co-website').value],
    ['el_position',       document.getElementById('s-el-position').value],
    ['el_body',           document.getElementById('s-el-body').value],
    ['el_enrol_no',       document.getElementById('s-el-enrol-no').value],
    ['el_ref_prefix',     (document.getElementById('s-el-ref-prefix').value || 'EL').toUpperCase()],
    ['el_ref_start',      document.getElementById('s-el-ref-start').value || '1001'],
    ['el_client_email_default', document.getElementById('s-el-client-email-default').value || ''],
    ['el_inst1_brand',    document.getElementById('s-el-inst1-brand').value],
    ['el_inst1_model',    document.getElementById('s-el-inst1-model').value],
    ['el_inst2_brand',    document.getElementById('s-el-inst2-brand').value],
    ['el_inst2_model',    document.getElementById('s-el-inst2-model').value],
    ['email_method',      document.getElementById('s-email-method').value],
    ['email_script_url',  document.getElementById('s-script-url').value],
    ['brevo_api_key',     document.getElementById('s-brevo-key').value],
    ['email_from',        document.getElementById('s-from-email').value],
    ['email_from_name',   document.getElementById('s-from-name').value],
    ['email_fallback',    document.getElementById('s-fallback-email').value],
    ['email_bcc',         document.getElementById('s-bcc-email').value],
    ['email_cc',          document.getElementById('s-cc-email').value],
    ['email_subject_tmpl', document.getElementById('s-email-subject-tmpl').value],
    ['reminder_enabled',  (document.getElementById('s-reminder-enabled') || { value: 'on' }).value],
    ['reminder_days',     (document.getElementById('s-reminder-days') || { value: '30' }).value || '30'],
    ['app_name',          document.getElementById('s-app-name').value],
    ['pat_ref_prefix',    (document.getElementById('s-pat-ref-prefix').value || 'PAT').toUpperCase()],
    ['pat_ref_start',     document.getElementById('s-pat-ref-start').value || '1'],
    ['gas_ref_prefix',    (document.getElementById('s-gas-ref-prefix').value || 'OHM').toUpperCase()],
    ['gas_ref_start',     document.getElementById('s-gas-ref-start').value || '210'],
    ['pat_period',        document.getElementById('s-pat-period').value],
    ['pat_default_engineer', document.getElementById('s-pat-engineer').value],
    ['pat_default_instrument', document.getElementById('s-pat-instrument').value],
    ['pat_default_result', document.getElementById('s-pat-result').value],
    ['pat_hdr_color',     document.getElementById('s-pat-hdr-color').value],
    ['pat_hdr_text',      document.getElementById('s-pat-hdr-text').value],
    ['pat_row_color',     document.getElementById('s-pat-row-color').value],
    ['pat_coname_size',   document.getElementById('s-pat-coname-size').value],
    ['pat_cotype_size',   document.getElementById('s-pat-cotype-size').value],
    ['pat_td_font',       document.getElementById('s-pat-td-font').value],
    ['gemini_key',        document.getElementById('s-gemini-key').value],
    ['pat_cert_title',    document.getElementById('s-pat-cert-title').value || 'PORTABLE APPLIANCE TEST REPORT'],
    ['pat_sig_label',     document.getElementById('s-pat-sig-label').value || 'Authorised Signature'],
    ['pat_accred',        document.getElementById('s-pat-accred').value],
    ['pat_reg_text',      document.getElementById('s-pat-reg-text').value],
    ['pat_cop',           document.getElementById('s-pat-cop').value],
    ['pat_cert_notes',    document.getElementById('s-pat-cert-notes').value],
    ['ideal_postcodes_key', (document.getElementById('s-idealpc-key') || { value: '' }).value],
  ];
  const _now = new Date().toISOString();
  const { error: _settErr } = await sb.from('app_config').upsert(pairs.map(([key, val]) => ({ key, value: val, updated_at: _now })), { onConflict: 'key' });
  if (!_settErr) {
    pairs.forEach(([k, v]) => { state.appSettings[k] = v; });
  } else {
    for (const [k, v] of pairs) await upsertSetting(k, v);
  }
  const profileUpdate = {
    full_name:   document.getElementById('s-profile-name').value,
    gas_safe_no: document.getElementById('s-profile-gas').value,
    licence_no:  document.getElementById('s-profile-licence').value,
  };
  await sb.from('profiles').update(profileUpdate).eq('id', state.currentUser.id);
  Object.assign(state.currentProfile, profileUpdate);
  hideOverlay();
  toast('Settings saved ✓', 'success');
  state.settingsDirty = false;
  updateSidebarAppName();
}

// ── Settings tabs ──────────────────────────────────────────────────────────
export function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`pane-${tab}`).classList.add('active');
  if (tab === 'ref') { updateRefPreview(); loadRefStats(); }
}

export function updateRefPreview() {
  const gPrefix = ((document.getElementById('s-gas-ref-prefix') || {}).value || 'OHM').toUpperCase();
  const gStart  = parseInt((document.getElementById('s-gas-ref-start') || {}).value) || 210;
  const pPrefix = ((document.getElementById('s-pat-ref-prefix') || {}).value || 'PAT').toUpperCase();
  const pStart  = parseInt((document.getElementById('s-pat-ref-start') || {}).value) || 1;
  const yy = String(new Date().getFullYear()).slice(-2);
  const gEl = document.getElementById('gas-ref-eg');
  const pEl = document.getElementById('pat-ref-eg');
  if (gEl) gEl.textContent = `${gPrefix}${gStart}${yy}36 / 5 EXAMPLE RD`;
  if (pEl) pEl.textContent = `${pPrefix}${pStart}${yy}44 / 1 MARINA POINT`;
}

export async function loadRefStats() {
  if (!sb || !state.currentUser) return;
  const note = document.getElementById('ref-count-note');
  if (note) note.textContent = 'Loading…';
  try {
    const [{ count: patCount }, { count: gasCount }] = await Promise.all([
      sb.from('pat_reports').select('id', { count: 'exact', head: true }),
      sb.from('gas_certs').select('id', { count: 'exact', head: true }),
    ]);
    const p = patCount || 0, g = gasCount || 0;
    const cp = document.getElementById('ref-count-pat');
    const cg = document.getElementById('ref-count-gas');
    const ct = document.getElementById('ref-count-total');
    if (cp) cp.textContent = p;
    if (cg) cg.textContent = g;
    if (ct) ct.textContent = p + g;
    if (note) note.textContent = 'Total certificates ever issued under this account.';
    const [{ data: recentPat }, { data: recentGas }] = await Promise.all([
      sb.from('pat_reports').select('ref_number,created_at').order('created_at', { ascending: false }).limit(5),
      sb.from('gas_certs').select('ref_number,created_at').order('created_at', { ascending: false }).limit(5),
    ]);
    const allRecent = [
      ...(recentPat || []).map(r => ({ ref: r.ref_number, type: 'PAT', ts: r.created_at })),
      ...(recentGas || []).map(r => ({ ref: r.ref_number, type: 'Gas', ts: r.created_at })),
    ].filter(r => r.ref).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 8);
    const listEl = document.getElementById('ref-recent-list');
    if (listEl) {
      if (!allRecent.length) { listEl.innerHTML = '<div style="color:var(--muted);font-size:12px">No certificates issued yet.</div>'; return; }
      listEl.innerHTML = allRecent.map(r => {
        const d  = new Date(r.ts);
        const ds = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
        return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)"><span style="font-family:monospace;font-weight:600;flex:1;color:var(--text)">${r.ref || '—'}</span><span style="font-size:11px;background:var(--accent-dim);color:var(--accent);padding:2px 6px;border-radius:4px;white-space:nowrap">${r.type}</span><span style="font-size:11px;color:var(--muted);white-space:nowrap">${ds}</span></div>`;
      }).join('');
    }
  } catch (e) { if (note) note.textContent = 'Could not load counts.'; }
}

export async function runSerialGapCheck() {
  const btn = document.getElementById('gap-check-btn');
  const out = document.getElementById('ref-gap-list');
  if (!out) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  out.innerHTML = '<div style="color:var(--muted);font-size:12px">Scanning serial numbers and audit history…</div>';
  try {
    const [{ data: gasData }, { data: patData }, { data: auditData }] = await Promise.all([
      sb.from('gas_certs').select('base_ref').not('base_ref', 'is', null),
      sb.from('pat_reports').select('base_ref').not('base_ref', 'is', null),
      sb.from('audit_events').select('event_type,cert_ref,cert_type,created_at,user_email,metadata').order('created_at', { ascending: false }).limit(2000),
    ]);
    function findGaps(rows) {
      const entries = rows.map(r => {
        const m = (r.base_ref || '').trim().match(/^([A-Za-z]+)(\d+)$/);
        if (!m) return null;
        const n = parseInt(m[2]);
        return n <= 9999 ? { prefix: m[1], n } : null;
      }).filter(Boolean);
      if (!entries.length) return [];
      const nums   = entries.map(e => e.n);
      const prefix = entries[0].prefix;
      const min    = Math.min(...nums), max = Math.max(...nums);
      const set    = new Set(nums);
      const gaps   = [];
      for (let i = min; i <= max; i++) { if (!set.has(i)) gaps.push({ n: i, prefix }); }
      return gaps;
    }
    function autoReason(serialRef) {
      const evts = (auditData || []).filter(e => e.cert_ref && e.cert_ref.startsWith(serialRef));
      const prev  = evts.find(e => e.event_type === 'SERIAL_GAP_NOTED');
      if (prev) return { reason: prev.metadata?.reason || 'Previously noted', alreadyLogged: true };
      const del = evts.find(e => e.event_type === 'DELETED');
      if (del) return { reason: `Deleted by ${del.user_email || 'unknown'} on ${new Date(del.created_at).toLocaleDateString('en-GB')}`, alreadyLogged: false };
      const sup = evts.find(e => e.event_type === 'SUPERSEDED');
      if (sup) return { reason: `Superseded on ${new Date(sup.created_at).toLocaleDateString('en-GB')}`, alreadyLogged: false };
      return { reason: 'Gap detected — no audit trail found', alreadyLogged: false };
    }
    const gasGaps = findGaps(gasData || []).map(g => ({ ...g, type: 'gas' }));
    const patGaps = findGaps(patData || []).map(g => ({ ...g, type: 'pat' }));
    const allGaps = [...gasGaps, ...patGaps];
    if (!allGaps.length) {
      out.innerHTML = '<div style="color:#10b981;font-size:13px;font-weight:600;padding:8px 0">✓ No gaps found — all serial sequences are complete.</div>';
      if (btn) { btn.disabled = false; btn.textContent = 'Run Sequence Check'; }
      return;
    }
    const results = [];
    for (const g of allGaps) {
      const serialRef           = `${g.prefix}${g.n}`;
      const { reason, alreadyLogged } = autoReason(serialRef);
      if (!alreadyLogged) await logAppEvent('SERIAL_GAP_NOTED', g.type, null, serialRef, { reason, gap_serial: serialRef, auto: true });
      results.push({ ...g, serialRef, reason, alreadyLogged });
    }
    const newCount = results.filter(r => !r.alreadyLogged).length;
    out.innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">${allGaps.length} gap${allGaps.length > 1 ? 's' : ''} found${newCount ? ` — ${newCount} auto-logged to audit` : ''}.</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Missing Serial</th>
          <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Type</th>
          <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Reason (auto-detected)</th>
          <th style="text-align:left;padding:6px 8px;font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Status</th>
        </tr></thead>
        <tbody>${results.map(r => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 8px;font-family:monospace;font-weight:700;color:var(--text)">${r.serialRef}</td>
          <td style="padding:6px 8px"><span class="badge badge-${r.type === 'gas' ? 'due' : 'done'}">${r.type.toUpperCase()}</span></td>
          <td style="padding:6px 8px;font-size:12px;color:var(--muted)">${r.reason}</td>
          <td style="padding:6px 8px;font-size:12px;color:${r.alreadyLogged ? '#6b7280' : '#10b981'}">${r.alreadyLogged ? 'Previously noted' : '✓ Auto-logged'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    if (newCount) toast(`${newCount} gap${newCount > 1 ? 's' : ''} auto-logged to audit ✓`, 'success');
  } catch (e) {
    out.innerHTML = `<div style="color:#ef4444;font-size:12px">Error: ${e.message}</div>`;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Run Sequence Check'; }
}

export async function saveSubAccountDefaults() {
  const role = (document.getElementById('s-default-role')        || { value: 'engineer' }).value || 'engineer';
  const perm = (document.getElementById('s-default-permissions') || { value: '' }).value        || '';
  await Promise.all([upsertSetting('default_new_role', role), upsertSetting('default_new_permissions', perm)]);
  toast('Sub-account defaults saved', 'success');
}

// Backward-compat globals for HTML onclick= handlers
window.toggleEmailMethod    = toggleEmailMethod;
window.setAppTheme          = setAppTheme;
window.updateSidebarAppName = updateSidebarAppName;
window.buildEmailSubject    = buildEmailSubject;
window.getGlobalCC          = getGlobalCC;
window.sendTestEmail        = sendTestEmail;
window.saveSettings         = saveSettings;
window.switchSettingsTab    = switchSettingsTab;
window.updateRefPreview     = updateRefPreview;
window.loadRefStats         = loadRefStats;
window.runSerialGapCheck    = runSerialGapCheck;
window.saveSubAccountDefaults = saveSubAccountDefaults;
