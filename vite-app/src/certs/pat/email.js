// ========== PAT - EMAIL MODULE ==========

import { sb }                                                  from '../../lib/supabase.js';
import { getSetting }                                          from '../../lib/settings.js';
import { state }                                               from '../../lib/state.js';
import { toast, showOverlay, hideOverlay,
         showEmailProgress, finishEmailProgress }              from '../../lib/utils.js';
import { logAppEvent }                                         from '../../audit/audit.js';
import { generatePATPDFFromData }                              from './pdf.js';
import { sendBrevoEmail, buildEmailSubject, getGlobalCC }    from '../../lib/brevo.js';

export async function emailPAT(autoTriggered = false) {
  if (!state.editingPATId) {
    if (!autoTriggered) toast('No report loaded', 'warn');
    return;
  }
  await emailPATFromList(state.editingPATId, autoTriggered);
}

export async function emailPATFromList(id, autoTriggered = false) {
  const _emailSteps = [
    { label: 'Loading certificate' },
    { label: 'Rendering PDF' },
    { label: 'Sending email' },
  ];
  if (!autoTriggered) showEmailProgress(_emailSteps, 0);
  else showOverlay('Sending email…');

  let r;
  try {
    const { data, error } = await sb.from('pat_reports').select('*').eq('id', id).single();
    if (error || !data) { toast('Could not load certificate', 'error'); hideOverlay(); return; }
    r = data;
  } catch (e) { toast('Error: ' + e.message, 'error'); hideOverlay(); return; }

  const toEmail = (r.email_address || '').trim() || getSetting('email_fallback', '');
  if (!toEmail) {
    toast('No email address on this certificate. Add a Fallback Email in Settings → Email → Email Defaults', 'warn');
    hideOverlay();
    return;
  }

  const bcc = getSetting('email_bcc', '');
  const client = r.landlord_name || r.client_name || 'Customer';
  const html = _buildPATEmailHTML(r);

  try {
    if (!autoTriggered) showEmailProgress(_emailSteps, 1);
    const b64     = await generatePATPDFFromData(r, { returnB64: true });
    const pdfName = `PAT_${(r.ref_number || r.id).replace(/[^\w-]/g, '_')}.pdf`;
    if (!autoTriggered) showEmailProgress(_emailSteps, 2);

    const subj = buildEmailSubject('PAT Test', r.ref_number || '', r.property_address || '');
    const cc = getGlobalCC();

    await sendBrevoEmail(toEmail, client, subj, html, b64, pdfName, bcc, cc || undefined);

    if (!autoTriggered) { finishEmailProgress(); await new Promise(res => setTimeout(res, 600)); }
    toast('Email sent to ' + toEmail + (bcc ? ' (BCC: ' + bcc + ')' : ''), 'success');
    await logAppEvent('EMAILED', 'pat', r.id, r.ref_number);
  } catch (e) {
    toast('Email failed: ' + e.message, 'error');
  } finally {
    hideOverlay();
  }
}

function _buildPATEmailHTML(r) {
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const co       = getSetting('pat_co_name', getSetting('company_name', 'OHM Electrical Engineering Ltd'));
  const coPhone  = getSetting('pat_co_phone', getSetting('company_phone', ''));
  const coWebsite = getSetting('pat_co_website', '');
  const apps     = r.appliances || [];
  const total    = apps.length;
  const pass     = apps.filter(a => (a.result || '').toLowerCase() === 'pass').length;
  const fail     = total - pass;
  const client   = r.landlord_name || r.client_name || 'Customer';
  const addrParts = (r.property_address || '').split('\n').map(l => l.trim()).filter(Boolean);
  const addrHtml  = addrParts.map(esc).join('<br>');
  const nxtDates  = apps.map(a => a.nextTest || a.next_test || '').filter(Boolean).sort();
  const due       = nxtDates[0] || r.next_test_date || '';
  const contactParts = [];
  if (coPhone) contactParts.push(esc(coPhone));
  if (coWebsite) contactParts.push('<a href="' + esc(coWebsite) + '" style="color:#0891b2;text-decoration:none">' + esc(coWebsite.replace(/^https?:\/\//, '')) + '</a>');
  const contactLine = contactParts.join('&ensp;&middot;&ensp;');
  const landlordRow = r.landlord_name
    ? '<tr><td style="padding:9px 16px;background:#eef4fa;font-size:10px;font-weight:700;color:#3d5a7a;width:36%;border-bottom:1px solid #dae5f0;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Landlord</td><td style="padding:9px 16px;font-size:13px;color:#182420;border-bottom:1px solid #dae5f0;vertical-align:top">' + esc(r.landlord_name) + '</td></tr>'
    : '';
  const agencyRow = r.agency_name
    ? '<tr><td style="padding:9px 16px;background:#eef4fa;font-size:10px;font-weight:700;color:#3d5a7a;width:36%;border-bottom:1px solid #dae5f0;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Client</td><td style="padding:9px 16px;font-size:13px;color:#182420;border-bottom:1px solid #dae5f0;vertical-align:top">' + esc(r.agency_name) + '</td></tr>'
    : '';
  const failBorderColor = fail > 0 ? '#f87171' : '#86efac';
  const failBg = fail > 0 ? '#fef2f2' : '#f0fdf4';
  const failTextColor = fail > 0 ? '#dc2626' : '#16a34a';
  const lbl = t => '<td style="padding:9px 16px;background:#eef4fa;font-size:10px;font-weight:700;color:#3d5a7a;width:36%;border-bottom:1px solid #dae5f0;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">' + t + '</td>';
  const val = v => '<td style="padding:9px 16px;font-size:13px;color:#182420;border-bottom:1px solid #dae5f0;vertical-align:top">' + v + '</td>';
  const calUrl = due ? (() => {
    const parts = due.split('/');
    if (parts.length === 3) {
      const yyyymmdd = parts[2] + parts[1] + parts[0];
      const _d = new Date(+parts[2], +parts[1]-1, +parts[0]+1);
      const nextDay = '' + _d.getFullYear() + String(_d.getMonth()+1).padStart(2,'0') + String(_d.getDate()).padStart(2,'0');
      return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='
        + encodeURIComponent('PAT Retest Due — ' + (addrParts[0] || ''))
        + '&dates=' + yyyymmdd + '/' + nextDay
        + '&details=' + encodeURIComponent('Portable Appliance Testing retest due.\nCertificate ref: ' + (r.ref_number || ''))
        + '&location=' + encodeURIComponent(addrParts.join(', '));
    }
    return '';
  })() : '';
  const calBtn = calUrl
    ? '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px">'
      + '<tr><td style="background:linear-gradient(90deg,#1a3d6b,#1e5fa8);border:1px solid #0891b2;border-radius:5px;padding:0">'
      + '<a href="' + calUrl + '" style="display:inline-block;padding:11px 22px;color:#e8f4fc;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:.02em;font-family:Arial,sans-serif">&#128197;&ensp;Add Retest to Calendar</a>'
      + '</td></tr></table>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#e5ecf5;font-family:Arial,Helvetica,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#e5ecf5"><tr><td align="center" style="padding:28px 16px">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fafcff;border-radius:6px;overflow:hidden;border:1px solid #c0cfdf;box-shadow:0 4px 24px rgba(20,50,100,.13)">'

    + '<tr><td height="6" style="background:linear-gradient(90deg,#1a3d6b,#1e5fa8 60%,#0891b2);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '<tr><td style="background:#fafcff;padding:20px 28px 0">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:top"><div style="font-size:19px;font-weight:900;color:#0d2444;letter-spacing:-.02em;line-height:1.1">' + esc(co) + '</div>'
    + '<div style="font-size:10px;color:#4a5568;margin-top:3px">' + contactLine + '</div></td>'
    + '<td style="text-align:right;vertical-align:middle"><div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0891b2">PAT</div></td>'
    + '</tr></table>'
    + '<div style="height:8px;border-bottom:1.5px solid #c0d8ea;margin:10px 0 0"></div>'
    + '</td></tr>'

    + '<tr><td style="background:#fafcff;padding:14px 28px 0">'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#0891b2;margin-bottom:4px">Portable Appliance Testing</div>'
    + '<div style="font-size:24px;font-weight:700;color:#1a3d6b;line-height:1.2;font-family:Georgia,serif">PAT Test Certificate</div>'
    + '</td></tr>'

    + '<tr><td style="background:linear-gradient(90deg,#1a3d6b,#1e5fa8);border-top:1px solid #0891b2;padding:10px 28px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><div style="font-size:10px;color:rgba(232,244,252,.7);letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px">Certificate Reference</div>'
    + '<div style="font-family:monospace;font-size:17px;font-weight:700;color:#e8f4fc;letter-spacing:.06em">' + esc(r.ref_number || '—') + '</div></td>'
    + '<td style="text-align:right;vertical-align:bottom"><div style="font-size:11px;color:rgba(255,255,255,.75)">' + esc(r.test_date || '') + '</div></td>'
    + '</tr></table>'
    + '</td></tr>'

    + '<tr><td style="padding:24px 28px">'
    + '<p style="margin:0 0 16px;font-size:15px;color:#182420">Dear ' + esc(client) + ',</p>'
    + '<p style="margin:0 0 22px;font-size:13px;color:#4a5568;line-height:1.7">Please find attached your Portable Appliance Testing (PAT) certificate. This test was carried out in full accordance with the <em>Electricity at Work Regulations 1989</em> and the IET Code of Practice (5th Edition).</p>'

    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dae5f0;border-radius:5px;overflow:hidden;margin:0 0 24px;border-collapse:collapse">'
    + landlordRow + agencyRow
    + '<tr>' + lbl('Property') + val(addrHtml || '—') + '</tr>'
    + '<tr>' + lbl('Test Date') + val(esc(r.test_date || '—')) + '</tr>'
    + (due ? '<tr><td style="padding:9px 16px;background:#eef4fa;font-size:10px;font-weight:700;color:#3d5a7a;width:36%;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Retest Due</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#0e4d7a;vertical-align:top">' + esc(due) + '</td></tr>' : '')
    + '</table>'

    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse"><tr>'
    + '<td width="33%" style="padding-right:6px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dae5f0;border-radius:5px;text-align:center"><tr><td style="padding:14px 8px"><div style="font-size:26px;font-weight:800;color:#1a3d6b;line-height:1;margin-bottom:3px">' + total + '</div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5a7a9a">Appliances</div></td></tr></table></td>'
    + '<td width="33%" style="padding:0 3px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + failBorderColor + ';background:' + failBg + ';border-radius:5px;text-align:center"><tr><td style="padding:14px 8px"><div style="font-size:26px;font-weight:800;color:' + failTextColor + ';line-height:1;margin-bottom:3px">' + fail + '</div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + failTextColor + '">Failed</div></td></tr></table></td>'
    + '<td width="34%" style="padding-left:6px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #86efac;background:#f0fdf4;border-radius:5px;text-align:center"><tr><td style="padding:14px 8px"><div style="font-size:26px;font-weight:800;color:#16a34a;line-height:1;margin-bottom:3px">' + pass + '</div><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#16a34a">Passed</div></td></tr></table></td>'
    + '</tr></table>'

    + calBtn

    + '<p style="margin:0;font-size:12px;color:#8b968f;line-height:1.7">If you have any queries regarding this certificate, please do not hesitate to contact us.</p>'
    + '</td></tr>'

    + '<tr><td style="background:#eef4fa;border-top:2px solid #0891b2;padding:14px 28px;text-align:center">'
    + '<div style="font-size:12px;font-weight:700;color:#0d2444">' + esc(co) + '</div>'
    + (contactLine ? '<div style="font-size:11px;color:#4a5568;margin-top:3px">' + contactLine + '</div>' : '')
    + '</td></tr>'

    + '<tr><td height="5" style="background:linear-gradient(90deg,#1a3d6b,#1e5fa8 60%,#0891b2);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}
