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
  const _mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
  const fmtDateLong = s => { if (!s) return '—'; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]} ${_mon[parseInt(m[2],10)-1]} ${m[1]}` : s; };
  const addrParts = (r.install_address || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (r.install_postcode && !addrParts.some(p => p === r.install_postcode.trim())) addrParts.push(r.install_postcode.trim());
  const addrHtml = addrParts.map(esc).join('<br>');
  const co = getSetting('gas_co_name', getSetting('company_name', 'MK Heating'));
  const coPhone = getSetting('gas_co_phone', getSetting('company_phone', ''));
  const coWebsite = getSetting('gas_co_website', '');
  const _llFirst = (r.landlord_address || '').split('\n')[0].trim();
  const _addrRx = /^(flat\b|apt\b|apartment\b|unit\b|suite\b|room\b|block\b|ground\s+floor|first\s+floor|second\s+floor|top\s+floor|basement|\d)/i;
  const _llIsName = _llFirst && !_addrRx.test(_llFirst);
  const toName = (r.sig_received_name || '').trim();
  const contactParts = [];
  if (coPhone) contactParts.push(esc(coPhone));
  if (coWebsite) contactParts.push('<a href="' + esc(coWebsite) + '" style="color:#d97706;text-decoration:none">' + esc(coWebsite.replace(/^https?:\/\//, '')) + '</a>');
  const contactLine = contactParts.join('&ensp;&middot;&ensp;');
  const _gcalDate = (r.next_check_date || '').replace(/-/g, '');
  const _gcalUrl = _gcalDate ? (() => {
    const _e = new Date(r.next_check_date); _e.setDate(_e.getDate() + 1);
    const _ed = _e.toISOString().slice(0, 10).replace(/-/g, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='
      + encodeURIComponent('Gas Safety Check Due — ' + (addrParts[0] || ''))
      + '&dates=' + _gcalDate + '/' + _ed
      + '&details=' + encodeURIComponent('Annual gas safety inspection due.\nCertificate ref: ' + (r.ref_number || ''))
      + '&location=' + encodeURIComponent(addrParts.join(', '));
  })() : '';
  const calBtn = _gcalUrl
    ? '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px">'
      + '<tr><td style="background:linear-gradient(90deg,#1e3a5f,#2b5182);border:1px solid #d97706;border-radius:5px;padding:0">'
      + '<a href="' + _gcalUrl + '" style="display:inline-block;padding:11px 22px;color:#f4ecd8;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:.02em;font-family:Arial,sans-serif">&#128197;&ensp;Add Next Service to Calendar</a>'
      + '</td></tr></table>'
    : '';
  const lbl = t => '<td style="padding:9px 16px;background:#eff3f8;font-size:10px;font-weight:700;color:#4a6080;width:36%;border-bottom:1px solid #dde5ef;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">' + t + '</td>';
  const val = (v, extra) => '<td style="padding:9px 16px;font-size:13px;color:#182420;border-bottom:1px solid #dde5ef;vertical-align:top' + (extra || '') + '">' + v + '</td>';
  const landlordRow = _llIsName ? '<tr>' + lbl('Client') + val(esc(_llFirst)) + '</tr>' : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#e8ecf2;font-family:Arial,Helvetica,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8ecf2"><tr><td align="center" style="padding:28px 16px">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fafcfe;border-radius:6px;overflow:hidden;border:1px solid #c8d3e0;box-shadow:0 4px 24px rgba(15,34,64,.13)">'

    + '<tr><td height="6" style="background:linear-gradient(90deg,#1e3a5f,#2b5182 60%,#d97706);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '<tr><td style="background:#fafcfe;padding:20px 28px 0">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:top"><div style="font-size:19px;font-weight:900;color:#0d2240;letter-spacing:-.02em;line-height:1.1">' + esc(co) + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:3px">' + contactLine + '</div></td>'
    + '<td style="text-align:right;vertical-align:middle"><div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d97706">CP12</div></td>'
    + '</tr></table>'
    + '<div style="height:8px;border-bottom:1.5px solid #c8d8ea;margin:10px 0 0"></div>'
    + '</td></tr>'

    + '<tr><td style="background:#fafcfe;padding:14px 28px 0">'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#d97706;margin-bottom:4px">Gas Safety</div>'
    + '<div style="font-size:24px;font-weight:700;color:#1e3a5f;line-height:1.2;font-family:Georgia,serif">Landlord Gas Safety Record (CP12)</div>'
    + '</td></tr>'

    + '<tr><td style="background:linear-gradient(90deg,#1e3a5f,#2b5182);border-top:1px solid #d97706;padding:10px 28px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><div style="font-size:10px;color:rgba(244,236,216,.7);letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px">Certificate Reference</div>'
    + '<div style="font-family:monospace;font-size:17px;font-weight:700;color:#f4ecd8;letter-spacing:.06em">' + esc(r.ref_number || '—') + '</div></td>'
    + '<td style="text-align:right;vertical-align:bottom"><div style="font-size:11px;color:rgba(255,255,255,.75)">' + fmtDate(r.cert_date) + '</div></td>'
    + '</tr></table>'
    + '</td></tr>'

    + '<tr><td style="padding:24px 28px">'
    + '<p style="margin:0 0 16px;font-size:15px;color:#182420">Dear ' + esc(toName || 'Client') + ',</p>'
    + '<p style="margin:0 0 22px;font-size:13px;color:#4a5568;line-height:1.7">Please find attached your Gas Safety Certificate (CP12) for the property listed below. This inspection was carried out in accordance with the <em>Gas Safety (Installation and Use) Regulations 1998</em> by a qualified Gas Safe registered engineer.</p>'

    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dde5ef;border-radius:5px;overflow:hidden;margin:0 0 24px;border-collapse:collapse">'
    + landlordRow
    + '<tr>' + lbl('Property') + val(addrHtml) + '</tr>'
    + '<tr>' + lbl('Certificate Date') + val(esc(fmtDate(r.cert_date))) + '</tr>'
    + '<tr><td style="padding:9px 16px;background:#eff3f8;font-size:10px;font-weight:700;color:#4a6080;width:36%;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Next Check Due</td>'
    + '<td style="padding:9px 16px;font-size:13px;font-weight:700;color:#92400e;vertical-align:top">' + esc(fmtDateLong(r.next_check_date)) + '</td></tr>'
    + '</table>'

    + calBtn

    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border:1.5px solid #fed7aa;border-radius:5px;margin:0 0 24px">'
    + '<tr><td style="padding:14px 18px">'
    + '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#92400e;margin-bottom:6px">Landlord Legal Obligations</div>'
    + '<div style="font-size:12px;color:#78350f;line-height:1.7">Under the <em>Gas Safety (Installation &amp; Use) Regulations 1998</em>, landlords must:<br>&bull;&nbsp; Have all gas appliances inspected annually by a Gas Safe registered engineer.<br>&bull;&nbsp; Provide a copy of this certificate to existing tenants within 28 days of the check.<br>&bull;&nbsp; Provide a copy to new tenants before they move in.</div>'
    + '</td></tr></table>'

    + '<p style="margin:0;font-size:12px;color:#8b968f;line-height:1.7">If you have any queries regarding this certificate, please do not hesitate to contact us.</p>'
    + '</td></tr>'

    + '<tr><td style="background:#eff3f8;border-top:2px solid #d97706;padding:14px 28px;text-align:center">'
    + '<div style="font-size:12px;font-weight:700;color:#0d2240">' + esc(co) + '</div>'
    + (contactLine ? '<div style="font-size:11px;color:#4a5568;margin-top:3px">' + contactLine + '</div>' : '')
    + '</td></tr>'

    + '<tr><td height="5" style="background:linear-gradient(90deg,#1e3a5f,#2b5182 60%,#d97706);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
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
