// ============================================================
//  history.js — Gas history: load, render, filter, delete,
//               copy, email, open PDF, expiry pill
// ============================================================
import { sb } from '../../lib/supabase.js';
import { getSetting } from '../../lib/settings.js';
import { toast, showOverlay, hideOverlay, confirm2, _softDelete, showEmailProgress, finishEmailProgress, _ibtn, _addrColor, _addrInitials } from '../../lib/utils.js';
import { state } from '../../lib/state.js';
import { PAGE_SIZE, hlText, sortByWordStart, paginationHtml } from '../../lib/search.js';
import { logAppEvent } from '../../audit/audit.js';
import { sendBrevoEmail, buildEmailSubject, getGlobalCC } from '../../lib/brevo.js';
import { parseGasDate, _fmtGasDate } from './helpers.js';
import { loadGasForm } from './cp12.js';
import { buildCP12PdfBase64, downloadCP12PDF } from './pdf.js';

// ── Module-level pagination/search state ──────────────────
let _gasPage = 1, _gasFiltered = [], _gasCurrentQ = '';

// ── Load & render ─────────────────────────────────────────

export async function loadGasHistory() {
  const _gl = document.getElementById('gas-list');
  if (_gl) _gl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  let { data, error } = await sb.from('gas_certs').select('*').is('deleted_at', null).order('created_at', { ascending: false });
  if (error && (error.message || '').includes('deleted_at')) {
    ({ data, error } = await sb.from('gas_certs').select('*').order('created_at', { ascending: false }));
  }
  if (error) { toast('Failed to load Gas certs: ' + error.message, 'error'); return; }
  state.gasReports = data || [];
  _gasFiltered = state.gasReports;
  _gasPage = 1; _gasCurrentQ = '';
  renderGasList(state.gasReports, 1, '');
}

export function renderGasList(reports, page, q) {
  page = page || 1; q = q || '';
  const el = document.getElementById('gas-list');
  if (!reports.length) {
    el.innerHTML = q.length >= 2
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No CP12s matching "<strong>${q}</strong>"</p></div>`
      : '<div class="empty-state"><div class="empty-icon">🔥</div><p>No CP12s found</p></div>';
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all = state.gasReports;
  const tot = all.length, comp = all.filter(r => r.status === 'completed').length, dr = all.filter(r => r.status !== 'completed').length;
  const _gasExpDays = r => {
    if (!r.next_check_date || r.status !== 'completed') return null;
    const p = parseGasDate(r.next_check_date);
    return p ? Math.ceil((p - today) / 864e5) : null;
  };
  const dsCount = all.filter(r => { const d = _gasExpDays(r); return d !== null && d >= 0 && d <= 30; }).length;
  const isSearch = q.length >= 2;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = reports.slice(start, start + PAGE_SIZE);
  const mkRow = (r, hl = '', q = '') => {
    const isDraft = r.status !== 'completed'; const addr = r.install_address || 'No address';
    const [abg, atx] = _addrColor(addr);
    const ini = _addrInitials(addr).toUpperCase() || (addr.slice(0, 2) || '?').toUpperCase();
    const addrHtml = q ? hlText(addr, q) : addr;
    const refHtml  = q ? hlText(r.ref_number || 'DRAFT', q) : (r.ref_number || 'DRAFT');
    return `<div class="pat-card" style="${hl ? 'border-color:' + hl + ';' : ''}${isDraft ? 'opacity:.82' : ''}">
      <div style="width:36px;height:36px;border-radius:50%;background:${abg};color:${atx};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px">${ini}</div>
      <div class="pat-card-body">
        <div class="pat-card-top">
          <span class="pat-card-addr">${addrHtml}</span>
          ${_gasExpiryPill(r)}
        </div>
        <div class="pat-card-bot">
          <code class="pat-ref-chip">${refHtml}</code>
          <span class="pat-card-date">${_fmtGasDate(r.cert_date) || 'No date'}</span>
          <span class="pat-card-sub">&middot; Next: ${_fmtGasDate(r.next_check_date) || '—'}</span>
          <div class="pat-card-btns">
            ${_ibtn('Open', 'fa-eye', `loadGasForm('${r.id}')`)}
            ${!isDraft ? _ibtn('Copy', 'fa-copy', `copyGas('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('PDF', 'fa-file-pdf', `openGasPDF('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('Email', 'fa-envelope', `emailCP12FromList('${r.id}')`) : ''}
            ${_ibtn('Delete', 'fa-trash', `deleteGas('${r.id}')`, true)}
          </div>
        </div>
      </div>
    </div>`;
  };
  const tile = (n, lbl, col) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:90px"><div style="font-size:22px;font-weight:600;color:${col || 'var(--text)'};">${n}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${lbl}</div></div>`;
  const sec = (dot, lbl, cnt) => `<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 0 5px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></span>${lbl}${cnt ? ' (' + cnt + ')' : ''}</div>`;
  let html = `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">${tile(tot, 'Total CP12s')}${tile(comp, 'Completed', '#16a34a')}${tile(dsCount, 'Due ≤ 30 days', '#d97706')}${tile(dr, 'Drafts')}</div>`;
  if (isSearch) {
    html += `<div style="font-size:12px;color:var(--muted);padding:2px 0 10px">${reports.length} result${reports.length !== 1 ? 's' : ''} matching "<strong style="color:var(--text)">${q}</strong>"</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:6px">' + pageItems.map(r => mkRow(r, '', q)).join('') + '</div>';
  } else {
    const dueSoonRs = pageItems.filter(r => { const d = _gasExpDays(r); return d !== null && d >= 0 && d <= 30; });
    const doneRs = pageItems.filter(r => r.status === 'completed' && !dueSoonRs.includes(r));
    const draftRs = pageItems.filter(r => r.status !== 'completed');
    const allDueSoon = reports.filter(r => { const d = _gasExpDays(r); return d !== null && d >= 0 && d <= 30; });
    const allDone = reports.filter(r => r.status === 'completed' && !allDueSoon.includes(r));
    const allDrafts = reports.filter(r => r.status !== 'completed');
    if (dueSoonRs.length) html += sec('#f59e0b', 'Due soon', allDueSoon.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + dueSoonRs.map(r => mkRow(r, '#fde68a')).join('') + `</div>`;
    if (doneRs.length)    html += sec('#10b981', 'Completed', allDone.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + doneRs.map(r => mkRow(r)).join('') + `</div>`;
    if (draftRs.length)   html += sec('#94a3b8', 'Drafts', allDrafts.length) + `<div style="display:flex;flex-direction:column;gap:6px">` + draftRs.map(r => mkRow(r)).join('') + `</div>`;
  }
  html += paginationHtml(page, reports.length, 'gasPrevPage()', 'gasNextPage()');
  el.innerHTML = html;
}

export function gasPrevPage() { if (_gasPage > 1) { _gasPage--; renderGasList(_gasFiltered, _gasPage, _gasCurrentQ); document.getElementById('gas-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }
export function gasNextPage() { if (_gasPage < Math.ceil(_gasFiltered.length / PAGE_SIZE)) { _gasPage++; renderGasList(_gasFiltered, _gasPage, _gasCurrentQ); document.getElementById('gas-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }

let _gasSortExp = 0;

export function toggleGasExpSort() {
  _gasSortExp = _gasSortExp === 1 ? -1 : _gasSortExp === -1 ? 0 : 1;
  const btn = document.getElementById('gas-sort-exp-btn');
  if (btn) btn.textContent = _gasSortExp === 1 ? '↑ Soonest' : _gasSortExp === -1 ? '↓ Latest' : '↕ Expiry';
  if (btn) btn.style.color = _gasSortExp ? 'var(--accent)' : '';
  filterGasList();
}

export function filterGasList() {
  const q = (document.getElementById('gas-search')?.value || '');
  _gasCurrentQ = q.trim().toLowerCase();
  const s = document.getElementById('gas-filter').value;
  let list = state.gasReports.filter(r => {
    const mS = !s || r.status === s;
    if (_gasCurrentQ.length < 2) return mS;
    const lq = _gasCurrentQ;
    const mQ =
      (r.install_address    || '').toLowerCase().includes(lq) ||
      (r.install_postcode   || '').toLowerCase().includes(lq) ||
      (r.ref_number         || '').toLowerCase().includes(lq) ||
      (r.landlord_address   || '').toLowerCase().includes(lq) ||
      (r.sig_received_name  || '').toLowerCase().includes(lq) ||
      (r.recipient_email    || '').toLowerCase().includes(lq);
    return mS && mQ;
  });
  if (_gasCurrentQ.length >= 2) {
    list = sortByWordStart(list, r => [r.install_address, r.install_postcode, r.ref_number, r.sig_received_name].join(' '), _gasCurrentQ);
  }
  if (_gasSortExp !== 0) list = [...list].sort((a, b) => {
    const pa = parseGasDate(a.next_check_date);
    const pb = parseGasDate(b.next_check_date);
    const ea = pa ? pa.toISOString().slice(0, 10) : '9999';
    const eb = pb ? pb.toISOString().slice(0, 10) : '9999';
    return _gasSortExp * (ea < eb ? -1 : ea > eb ? 1 : 0);
  });
  _gasFiltered = list; _gasPage = 1;
  renderGasList(list, 1, _gasCurrentQ);
}

export async function deleteGas(id) {
  const _isAdm = typeof _isAdminUser === 'function' ? _isAdminUser() : (state.currentProfile?.role === 'admin');
  confirm2('Delete Gas Cert', _isAdm ? 'Permanently delete this certificate?' : 'Move to Recycle Bin? Admins can restore it.', async () => {
    await _softDelete('gas_certs', id, loadGasHistory);
  });
}

export async function copyGas(id) {
  showOverlay('Copying…');
  try {
    const { data: r, error } = await sb.from('gas_certs').select('*').eq('id', id).single();
    if (error || !r) { toast('Could not load certificate', 'error'); return; }
    const copy = { ...r };
    delete copy.id; delete copy.created_at; delete copy.updated_at;
    copy.status = 'draft'; copy.ref_number = null; copy.cert_date = new Date().toISOString().slice(0, 10);
    copy.internal_notes = '';
    const { data: newR, error: insErr } = await sb.from('gas_certs').insert(copy).select().single();
    if (insErr) { toast('Copy failed: ' + insErr.message, 'error'); return; }
    toast('Copied as new draft', 'success');
    await loadGasForm(newR.id);
  } catch (e) { toast('Copy error: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

export async function emailCP12FromList(id) {
  const _steps = [{ label: 'Loading certificate' }, { label: 'Rendering PDF' }, { label: 'Sending email' }];
  showEmailProgress(_steps, 0);
  let r;
  try {
    const { data, error } = await sb.from('gas_certs').select('*').eq('id', id).single();
    if (error || !data) { toast('Could not load certificate', 'error'); hideOverlay(); return; }
    r = data;
  } catch (e) { toast('Error: ' + e.message, 'error'); hideOverlay(); return; }
  const toEmail = (r.recipient_email || '').trim() || r.business_email || getSetting('email_fallback', '');
  if (!toEmail) { toast('No recipient email on this certificate. Add a Fallback Email in Settings → Email → Email Defaults', 'warn'); hideOverlay(); return; }
  await loadGasForm(id);
  const bcc = getSetting('email_bcc', '');
  const toName = (r.sig_received_name || '').trim();
  let _gasRef1 = r.ref_number || ''; if (_gasRef1 && _gasRef1.trim().startsWith('{')) { try { const _p = JSON.parse(_gasRef1); _gasRef1 = _p.ref || _p.baseRef || ''; } catch (e) {} }
  const subject = buildEmailSubject('Gas Safety', _gasRef1 || '', r.install_address || '');
  const pdfName = `Gas_${(_gasRef1 || r.id).replace(/[^\w-]/g, '_')}.pdf`;
  const html = _buildCP12EmailHtml(r);
  const _gasCC = getGlobalCC();
  showEmailProgress(_steps, 1);
  try {
    const b64 = await buildCP12PdfBase64();
    showEmailProgress(_steps, 2);
    const result = await sendBrevoEmail(toEmail, toName, subject, html, b64, pdfName, bcc, _gasCC || undefined);
    finishEmailProgress();
    await new Promise(res => setTimeout(res, 600));
    sb.from('email_sends').insert({
      cert_id: r.id, cert_type: 'gas', cert_ref: r.ref_number,
      to_email: toEmail, to_name: toName, subject,
      brevo_message_id: result.messageId || null, status: 'sent',
      sent_by: state.currentUser?.id, sent_by_email: state.currentUser?.email
    }).then(({ error }) => { if (error) console.warn('email_sends insert:', error.message); });
    toast('Email sent ✓ — ' + toEmail, 'success', 5000);
    await logAppEvent('EMAILED', 'gas', r.id, r.ref_number, { to: toEmail, brevo_message_id: result.messageId || null });
  } catch (e) { toast('Email failed: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

export async function openGasPDF(id) { await loadGasForm(id); await downloadCP12PDF(null); }

export function _buildCP12EmailHtml(r) {
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtDate = s => { if (!s) return '—'; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
  const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const fmtDateExp = s => { if (!s) return '—'; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${_mon[parseInt(m[2], 10) - 1]}/${m[1]}` : s; };
  const addrHtml = (r.install_address || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const co = getSetting('gas_co_name', 'OHM Electrical Engineering Ltd');
  const coPhone = getSetting('gas_co_phone', '');
  const coEmail = getSetting('gas_co_email', '');
  const navy = getSetting('gas_hdr_color', '#1e3a5f');
  const gasSafe = r.gas_safe_no || getSetting('gas_safe_no', '');
  const _llFirst = (r.landlord_address || '').split('\n')[0].trim();
  const _addrRx = /^(flat\b|apt\b|apartment\b|unit\b|suite\b|room\b|block\b|ground\s+floor|first\s+floor|second\s+floor|top\s+floor|basement|\d)/i;
  const _llIsName = _llFirst && !_addrRx.test(_llFirst);
  const toName = esc((r.sig_received_name || '').trim());
  const contactLine = [coPhone ? '&#128222; ' + esc(coPhone) : '', coEmail ? '&#9993; ' + esc(coEmail) : ''].filter(Boolean).join('&nbsp;&nbsp;&nbsp;');
  const landlordRow = _llIsName ? `<tr><td class="em-lbl" style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b;width:110px;vertical-align:top;">Client</td><td class="em-val" style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;text-align:right;">${esc(_llFirst)}</td></tr>` : '';
  const _gcalDate = (r.next_check_date || '').replace(/-/g, '');
  const _gcalUrl = _gcalDate ? (() => { const _e = new Date(r.next_check_date); _e.setDate(_e.getDate() + 1); const _ed = _e.toISOString().slice(0, 10).replace(/-/g, ''); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Gas Safety Check Due — ' + (r.install_address || '').split('\n')[0])}&dates=${_gcalDate}/${_ed}&details=${encodeURIComponent('Annual gas safety inspection due.\nCertificate ref: ' + (r.ref_number || ''))}&location=${encodeURIComponent((r.install_address || '').replace(/\n/g, ', '))}`; })() : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>.em-card{background-color:#ffffff}.em-bdy{background-color:#ffffff}.em-lbl{color:#64748b;background-color:#ffffff}.em-val{color:#1e293b;background-color:#ffffff}@media(prefers-color-scheme:dark){.em-card{background-color:#1e293b!important}.em-bdy{background-color:#1e293b!important}.em-lbl{color:#94a3b8!important;background-color:#1e293b!important}.em-val{color:#e2e8f0!important;background-color:#1e293b!important}}</style></head>
<body style="margin:0;padding:28px 12px 40px;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" class="em-card" style="background:#ffffff;border-radius:10px;overflow:hidden;border-top:4px solid #f59e0b;">
<tr><td style="background:${navy};padding:22px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td colspan="2" style="padding-bottom:5px;"><div style="font-size:18px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(co)}</div></td></tr>
    <tr><td style="vertical-align:middle;"><div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.12em;text-transform:uppercase;">CP12 &middot; Landlord Gas Safety Record</div></td>
    <td align="right" style="white-space:nowrap;padding-left:8px;vertical-align:middle;"><span style="display:inline-block;background:rgba(16,185,129,.18);border:1.5px solid rgba(16,185,129,.5);color:#34d399;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:20px;white-space:nowrap;">&#10003; Certificate Issued</span></td>
  </tr></table>
</td></tr>
<tr><td class="em-bdy" style="padding:26px 28px 0;">
  <p style="font-size:15px;color:#475569;margin:0 0 5px 0;">Dear <strong style="color:#1e293b;">${toName || 'Client'}</strong>,</p>
  <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 22px 0;">Please find attached your Gas Safety Certificate (CP12) for the property below. This inspection was carried out in accordance with the <em>Gas Safety (Installation and Use) Regulations 1998</em> by a qualified Gas Safe registered engineer.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
    <tr><td colspan="2" style="background:${navy};padding:10px 18px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.85);">Certificate Reference</td><td align="right" style="font-size:14px;font-weight:700;color:#ffffff;letter-spacing:.03em;">${esc(r.ref_number || '—')}</td></tr></table></td></tr>
    ${landlordRow}
    <tr><td class="em-lbl" style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b;width:110px;vertical-align:top;">Property</td><td class="em-val" style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;text-align:right;">${addrHtml}${r.install_postcode ? ' ' + esc(r.install_postcode) : ''}</td></tr>
    <tr><td class="em-lbl" style="padding:10px 18px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">Certificate Date</td><td class="em-val" style="padding:10px 18px;font-size:14px;color:#1e293b;font-weight:500;text-align:right;">${esc(fmtDate(r.cert_date))}</td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;margin-bottom:16px;"><tr><td style="padding:16px 18px;"><table cellpadding="0" cellspacing="0"><tr><td width="46" style="vertical-align:middle;padding-right:14px;"><div style="width:42px;height:42px;background:#f59e0b;border-radius:21px;text-align:center;font-size:22px;line-height:42px;mso-line-height-rule:exactly;">&#128293;</div></td><td style="vertical-align:middle;"><div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309;margin-bottom:3px;">Next Annual Check Due</div><div style="font-size:21px;font-weight:700;color:#1e293b;line-height:1;">${esc(fmtDateExp(r.next_check_date))}</div><div style="font-size:12px;color:#475569;margin-top:3px;">Gas appliances must be inspected every 12 months by law. Please book your next service before this date.</div>${_gcalUrl ? `<div style="margin-top:10px;"><a href="${_gcalUrl}" target="_blank" style="display:inline-block;background:#4285f4;color:#ffffff;font-size:11px;font-weight:700;padding:7px 14px;border-radius:5px;text-decoration:none;letter-spacing:.02em;">&#128197; Add to Google Calendar</a></div>` : ''}</td></tr></table></td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:8px;margin-bottom:16px;"><tr><td style="padding:14px 18px;"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c;margin-bottom:6px;">Landlord Legal Obligations</div><div style="font-size:13px;color:#7f1d1d;line-height:1.7;">Under the <em>Gas Safety (Installation &amp; Use) Regulations 1998</em>, landlords must:<br>&bull;&nbsp; Have all gas appliances inspected annually by a Gas Safe engineer.<br>&bull;&nbsp; Provide a copy of this certificate to existing tenants within 28 days.<br>&bull;&nbsp; Provide a copy to new tenants before move-in.</div></td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #e2e8f0;border-radius:8px;background:#f8fafc;margin-bottom:22px;"><tr><td style="padding:13px 18px;"><table cellpadding="0" cellspacing="0"><tr><td style="font-size:26px;padding-right:13px;vertical-align:middle;">&#128206;</td><td><div style="font-size:13px;color:#1e293b;font-weight:500;">Certificate PDF is attached to this email</div><div style="font-size:11px;color:#475569;margin-top:2px;">Please save for your records, provide a copy to your tenant, and retain for at least two years as required by law.</div></td></tr></table></td></tr></table>
  <p style="font-size:14px;color:#475569;line-height:1.8;margin:0 0 26px 0;">If you have any questions regarding this certificate, please do not hesitate to get in touch.<br><strong style="color:#1e293b;">${esc(co)}</strong><br>${contactLine}</p>
</td></tr>
<tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
<tr><td style="background:#f1f5f9;padding:16px 28px 20px;">
  <p style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin:0 0 5px 0;">Certificate Ownership</p>
  <p style="font-size:11px;color:#94a3b8;line-height:1.7;margin:0 0 11px 0;">This certificate remains the property of ${esc(co)} until payment for the associated works has been received in full.</p>
  <p style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin:0 0 5px 0;">Certificate Integrity</p>
  <p style="font-size:11px;color:#94a3b8;line-height:1.7;margin:0;">Forging, altering or reproducing this certificate without written permission is unlawful and may result in legal action.</p>
</td></tr>
</table>
<p style="text-align:center;margin-top:12px;font-size:11px;color:#94a3b8;line-height:1.8;">${esc(co)}${coPhone ? '&nbsp;&nbsp;&#183;&nbsp;&nbsp;' + esc(coPhone) : ''}<br>This email was sent automatically upon certificate completion.</p>
</td></tr></table></td></tr></table>
</body></html>`;
}

export async function emailGas(autoTriggered = false) {
  if (!state.editingGasId) { toast('No certificate loaded', 'warn'); return; }
  const { data: r } = await sb.from('gas_certs').select('*').eq('id', state.editingGasId).single();
  if (!r) { toast('Not found', 'error'); return; }
  const toEmail = (r.recipient_email || '').trim() || r.business_email || getSetting('gas_co_email') || getSetting('email_fallback', '');
  if (!toEmail) { toast('No recipient email — add one in the Landlord section (Email) or Settings → Email', 'warn'); return; }
  const toName = (r.sig_received_name || '').trim();
  let _gasRef2 = r.ref_number || ''; if (_gasRef2 && _gasRef2.trim().startsWith('{')) { try { const _p = JSON.parse(_gasRef2); _gasRef2 = _p.ref || _p.baseRef || ''; } catch (e) {} }
  const subject = buildEmailSubject('Gas Safety', _gasRef2 || '', r.install_address || '');
  const pdfName = `Gas_${(_gasRef2 || r.id).replace(/[^\w-]/g, '_')}.pdf`;
  const html = _buildCP12EmailHtml(r);
  const _gasCC2 = getGlobalCC();
  if (autoTriggered) {
    showOverlay('Sending email…');
  } else {
    const _gasSteps = [{ label: 'Loading certificate' }, { label: 'Rendering PDF' }, { label: 'Sending email' }];
    showEmailProgress(_gasSteps, 1);
  }
  try {
    const b64 = await buildCP12PdfBase64();
    if (!autoTriggered) showEmailProgress([{ label: 'Loading certificate' }, { label: 'Rendering PDF' }, { label: 'Sending email' }], 2);
    const bcc = getSetting('email_bcc', '');
    const result = await sendBrevoEmail(toEmail, toName, subject, html, b64, pdfName, bcc, _gasCC2 || undefined);
    if (!autoTriggered) { finishEmailProgress(); await new Promise(res => setTimeout(res, 600)); }
    sb.from('email_sends').insert({
      cert_id: r.id, cert_type: 'gas', cert_ref: r.ref_number,
      to_email: toEmail, to_name: toName, subject,
      brevo_message_id: result.messageId || null,
      status: 'sent',
      sent_by: state.currentUser?.id, sent_by_email: state.currentUser?.email
    }).then(({ error }) => { if (error) console.warn('email_sends insert:', error.message); });
    toast('Email sent ✓ — ' + toEmail, 'success', 5000);
    await logAppEvent('EMAILED', 'gas', r.id, r.ref_number, { to: toEmail, brevo_message_id: result.messageId || null });
  } catch (e) { toast('Email failed: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

// ── Expiry pill ───────────────────────────────────────────

export function _gasExpiryPill(r) {
  if (r.status !== 'completed' || !r.next_check_date) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(r.next_check_date) - today) / (864e5));
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
