// ========== PAT - EMAIL MODULE ==========
// Extracted from index.html (lines 4820-4913)

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

  const bcc      = getSetting('email_bcc', '');
  const co       = getSetting('pat_co_name', getSetting('company_name', 'OHM Electrical Engineering Ltd'));
  const coPhone  = getSetting('pat_co_phone', '');
  const coEmail  = getSetting('pat_co_email', '');
  const navy     = getSetting('pat_hdr_color', '#1e3a5f');
  const apps     = r.appliances || [];
  const total    = apps.length;
  const pass     = apps.filter(a => (a.result || '').toLowerCase() === 'pass').length;
  const fail     = total - pass;

  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const addrHtml = (r.property_address || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const client   = r.landlord_name || r.client_name || 'Customer';

  const nxtDates = apps.map(a => a.nextTest || a.next_test || '').filter(Boolean).sort();
  const due      = nxtDates[0] || r.next_test_date || '';

  const failStyle = fail > 0 ? 'border:1px solid #ef4444;background:#fef2f2;' : 'border:1px solid #e2e8f0;';
  const failColor = fail > 0 ? '#ef4444' : '#94a3b8';

  const landlordRow = r.landlord_name
    ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:110px;vertical-align:top">Landlord</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;text-align:right">${esc(r.landlord_name)}</td></tr>`
    : '';
  const agencyRow = r.agency_name
    ? `<tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:110px;vertical-align:top">Client</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;text-align:right">${esc(r.agency_name)}</td></tr>`
    : '';

  const contactLine = [
    coPhone ? '&#128222; ' + esc(coPhone) : '',
    coEmail ? '&#9993; '  + esc(coEmail) : '',
  ].filter(Boolean).join('&nbsp;&nbsp;&nbsp;');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:28px 12px 40px;background:#eef1f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">
<tr><td style="background:${navy};padding:22px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td colspan="2" style="padding-bottom:5px;"><div style="font-size:18px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(co)}</div></td></tr>
    <tr><td style="vertical-align:middle;"><div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.12em;text-transform:uppercase;">Portable Appliance Testing</div></td>
    <td align="right" style="white-space:nowrap;padding-left:8px;vertical-align:middle;"><span style="display:inline-block;background:rgba(16,185,129,.18);border:1.5px solid rgba(16,185,129,.5);color:#34d399;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:20px;white-space:nowrap;">&#10003; Certificate Issued</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:26px 28px 0;">
  <p style="font-size:15px;color:#475569;margin:0 0 5px 0;">Dear <strong style="color:#1e293b;">${esc(client)}</strong>,</p>
  <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 22px 0;">Please find attached your PAT (Portable Appliance Testing) certificate for the property below. This test was carried out in full accordance with the <em>Electricity at Work Regulations 1989</em> and the IET Code of Practice (5th Edition).</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
    <tr><td colspan="2" style="background:${navy};padding:10px 18px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6);">Certificate Reference</td><td align="right" style="font-size:14px;font-weight:700;color:#ffffff;letter-spacing:.03em;">${esc(r.ref_number || '—')}</td></tr></table></td></tr>
    ${landlordRow}${agencyRow}
    <tr><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;width:110px;vertical-align:top">Property</td><td style="padding:10px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;text-align:right;">${addrHtml}</td></tr>
    <tr><td style="padding:10px 18px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8">Test Date</td><td style="padding:10px 18px;font-size:14px;color:#1e293b;font-weight:500;text-align:right;">${esc(r.test_date || '—')}</td></tr>
  </table>
  ${due ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;margin-bottom:16px;"><tr><td style="padding:16px 18px;"><table cellpadding="0" cellspacing="0"><tr><td width="46" style="vertical-align:middle;padding-right:14px;"><div style="width:42px;height:42px;background:#f59e0b;border-radius:21px;text-align:center;font-size:22px;line-height:42px;mso-line-height-rule:exactly;">&#9888;</div></td><td style="vertical-align:middle;"><div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309;margin-bottom:3px;">Next Retest Due</div><div style="font-size:21px;font-weight:700;color:#1e293b;line-height:1;">${esc(due)}</div><div style="font-size:12px;color:#475569;margin-top:3px;">Please ensure retesting is booked before this date to remain compliant.</div></td></tr></table></td></tr></table>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
    <td width="33%" style="padding-right:4px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;text-align:center;"><tr><td style="padding:14px 8px;"><div style="font-size:24px;font-weight:700;color:#1e293b;line-height:1;margin-bottom:4px;">${total}</div><div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Appliances</div></td></tr></table></td>
    <td width="33%" style="padding:0 4px;"><table width="100%" cellpadding="0" cellspacing="0" style="${failStyle}border-radius:8px;text-align:center;"><tr><td style="padding:14px 8px;"><div style="font-size:24px;font-weight:700;color:${failColor};line-height:1;margin-bottom:4px;">${fail}</div><div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${failColor};">Failed</div></td></tr></table></td>
    <td width="34%" style="padding-left:4px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #10b981;border-radius:8px;background:#ecfdf5;text-align:center;"><tr><td style="padding:14px 8px;"><div style="font-size:24px;font-weight:700;color:#10b981;line-height:1;margin-bottom:4px;">${pass}</div><div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#10b981;">Passed</div></td></tr></table></td>
  </tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #e2e8f0;border-radius:8px;background:#f8fafc;margin-bottom:22px;"><tr><td style="padding:13px 18px;"><table cellpadding="0" cellspacing="0"><tr><td style="font-size:26px;padding-right:13px;vertical-align:middle;">&#128206;</td><td><div style="font-size:13px;color:#1e293b;font-weight:500;">Certificate PDF is attached to this email</div><div style="font-size:11px;color:#475569;margin-top:2px;">Please save for your records and share with your letting agent, local authority, or any relevant party if required.</div></td></tr></table></td></tr></table>
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
