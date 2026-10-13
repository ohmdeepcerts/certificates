import { sb } from '../../lib/supabase.js';
import { state } from '../../lib/state.js';
import { toast, showOverlay, hideOverlay } from '../../lib/utils.js';
import { getSetting } from '../../lib/settings.js';
import { sendBrevoEmail, buildEmailSubject, getGlobalCC } from '../../lib/brevo.js';
import { fireBuildCertHTML } from './pdf.js';

export async function fireEmailCert(rec) {
  var toEmail = prompt('Send certificate to email address:', rec.clientEmail || '');
  if (!toEmail || !toEmail.trim()) return;
  toEmail = toEmail.trim();
  await _sendFireEmail(rec, toEmail, false);
}

export async function fireAutoEmail(rec, silent = false) {
  var toEmail = (rec.clientEmail||'').trim();
  if (!toEmail) return;
  await _sendFireEmail(rec, toEmail, silent);
}

async function _sendFireEmail(rec, toEmail, silent) {
  showOverlay('Sending certificate…');
  try {
    var certHtml = fireBuildCertHTML(rec);
    var blob = new Blob([certHtml], { type:'text/html' });
    var reader = new FileReader();
    reader.onloadend = async () => {
      try {
        var b64 = reader.result.split(',')[1];
        var pdfName = 'fire-alarm-cert-' + (rec.ref||'cert').replace(/[^a-z0-9]/gi,'-').replace(/-+/g,'-') + '.pdf';
        var client = rec.clientName || 'Client';
        var subj = buildEmailSubject('Fire Alarm Certificate', rec.ref || '', rec.premAddr1 || '');
        var bcc = getSetting('email_bcc','');
        var cc  = getGlobalCC();
        var html = _buildFireEmailHTML(rec);
        var result = await sendBrevoEmail(toEmail, client, subj, html, b64, pdfName, bcc||undefined, cc||undefined);
        hideOverlay();
        if (result && !result.error) {
          try {
            await sb.from('email_sends').insert({
              cert_ref: rec.ref, cert_type: rec.certType || 'FA',
              to_email: toEmail, subject: subj,
              sent_by: state.currentUser?.id,
              sent_by_email: state.currentUser?.email,
              sent_at: new Date().toISOString(),
            });
          } catch(e) {}
          if (!silent) toast('Certificate sent to ' + toEmail, 'success');
        }
      } catch(e) { hideOverlay(); if (!silent) toast('Email failed: ' + e.message, 'error'); }
    };
    reader.readAsDataURL(blob);
  } catch(e) { hideOverlay(); if (!silent) toast('Email failed: ' + e.message, 'error'); }
}

function _buildFireEmailHTML(rec) {
  var e = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var co = getSetting('company_name', 'OHM Electrical Engineering Ltd');
  var coPhone = getSetting('company_phone', getSetting('el_co_phone', ''));
  var coWebsite = getSetting('el_co_website', '');
  var addrParts = [rec.premisesName, rec.premAddr1, rec.premAddr2, rec.premAddr3, rec.premPostcode].filter(Boolean);
  var addrHtml = addrParts.map(e).join('<br>');
  var sat = (rec.outcome || '').toUpperCase() === 'SATISFACTORY' || (rec.outcome || '').toUpperCase() === 'PASS';
  var contactParts = [];
  if (coPhone) contactParts.push(e(coPhone));
  if (coWebsite) contactParts.push('<a href="' + e(coWebsite) + '" style="color:#d97706;text-decoration:none">' + e(coWebsite.replace(/^https?:\/\//, '')) + '</a>');
  var contactLine = contactParts.join('&ensp;&middot;&ensp;');
  var calUrl = rec.nextInspDate ? (function() {
    var parts = (rec.nextInspDate || '').split('/');
    if (parts.length !== 3) return '';
    var yyyymmdd = parts[2] + parts[1] + parts[0];
    var _d = new Date(+parts[2], +parts[1]-1, +parts[0]+1);
    var nextDay = '' + _d.getFullYear() + String(_d.getMonth()+1).padStart(2,'0') + String(_d.getDate()).padStart(2,'0');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='
      + encodeURIComponent('Fire Alarm Inspection Due — ' + (addrParts[1] || addrParts[0] || ''))
      + '&dates=' + yyyymmdd + '/' + nextDay
      + '&details=' + encodeURIComponent('Fire alarm system inspection due.\nCertificate ref: ' + (rec.ref || ''))
      + '&location=' + encodeURIComponent(addrParts.join(', '));
  })() : '';
  var calBtn = calUrl
    ? '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px">'
      + '<tr><td style="background:linear-gradient(90deg,#7f1d1d,#991b1b);border:1px solid #d97706;border-radius:5px;padding:0">'
      + '<a href="' + calUrl + '" style="display:inline-block;padding:11px 22px;color:#fef3e2;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:.02em;font-family:Arial,sans-serif">&#128197;&ensp;Add Next Inspection to Calendar</a>'
      + '</td></tr></table>'
    : '';
  var lbl = function(t) { return '<td style="padding:9px 16px;background:#f8f0ee;font-size:10px;font-weight:700;color:#6b3030;width:36%;border-bottom:1px solid #e8d5d0;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">' + t + '</td>'; };
  var val = function(v) { return '<td style="padding:9px 16px;font-size:13px;color:#182420;border-bottom:1px solid #e8d5d0;vertical-align:top">' + v + '</td>'; };

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#f2e8e5;font-family:Arial,Helvetica,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2e8e5"><tr><td align="center" style="padding:28px 16px">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffaf8;border-radius:6px;overflow:hidden;border:1px solid #e0ccc8;box-shadow:0 4px 24px rgba(100,15,15,.12)">'

    + '<tr><td height="6" style="background:linear-gradient(90deg,#7f1d1d,#991b1b 60%,#d97706);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '<tr><td style="background:#fffaf8;padding:20px 28px 0">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:top"><div style="font-size:19px;font-weight:900;color:#3d0f0f;letter-spacing:-.02em;line-height:1.1">' + e(co) + '</div>'
    + '<div style="font-size:10px;color:#6b5050;margin-top:3px">' + contactLine + '</div></td>'
    + '<td style="text-align:right;vertical-align:middle"><div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d97706">' + e(rec.certType || 'FA') + '</div></td>'
    + '</tr></table>'
    + '<div style="height:8px;border-bottom:1.5px solid #e0c8c8;margin:10px 0 0"></div>'
    + '</td></tr>'

    + '<tr><td style="background:#fffaf8;padding:14px 28px 0">'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#d97706;margin-bottom:4px">Fire Alarm</div>'
    + '<div style="font-size:24px;font-weight:700;color:#7f1d1d;line-height:1.2;font-family:Georgia,serif">Fire Alarm Certificate</div>'
    + '</td></tr>'

    + '<tr><td style="background:linear-gradient(90deg,#7f1d1d,#991b1b);border-top:1px solid #d97706;padding:10px 28px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><div style="font-size:10px;color:rgba(254,243,226,.7);letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px">Certificate Reference</div>'
    + '<div style="font-family:monospace;font-size:17px;font-weight:700;color:#fef3e2;letter-spacing:.06em">' + e(rec.ref || '—') + '</div></td>'
    + '<td style="text-align:right;vertical-align:bottom"><div style="font-size:11px;color:rgba(255,255,255,.75)">' + e(rec.testDate || '') + '</div></td>'
    + '</tr></table>'
    + '</td></tr>'

    + '<tr><td style="padding:24px 28px">'
    + '<p style="margin:0 0 16px;font-size:15px;color:#182420">Dear ' + e(rec.clientName || 'Client') + ',</p>'
    + '<p style="margin:0 0 22px;font-size:13px;color:#6b5050;line-height:1.7">Please find attached your Fire Alarm Certificate for the premises listed below. Please retain this document for your records and compliance purposes.</p>'

    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8d5d0;border-radius:5px;overflow:hidden;margin:0 0 24px;border-collapse:collapse">'
    + '<tr>' + lbl('Premises') + val(addrHtml || '—') + '</tr>'
    + '<tr>' + lbl('Test Date') + val(e(rec.testDate || '—')) + '</tr>'
    + '<tr>' + lbl('Outcome')
    + (sat
      ? '<td style="padding:9px 16px;font-size:13px;font-weight:700;color:#15803d;border-bottom:1px solid #e8d5d0;vertical-align:top;background:linear-gradient(90deg,rgba(21,128,61,.06),transparent)">&#10003;&ensp;SATISFACTORY</td>'
      : '<td style="padding:9px 16px;font-size:13px;font-weight:700;color:#991b1b;border-bottom:1px solid #e8d5d0;vertical-align:top">&#9888;&ensp;' + e(rec.outcome || 'SEE REPORT') + '</td>')
    + '</tr>'
    + (rec.nextInspDate
      ? '<tr><td style="padding:9px 16px;background:#f8f0ee;font-size:10px;font-weight:700;color:#6b3030;width:36%;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Next Inspection</td>'
        + '<td style="padding:9px 16px;font-size:13px;font-weight:700;color:#182420;vertical-align:top">' + e(rec.nextInspDate) + '</td></tr>'
      : '')
    + '</table>'

    + calBtn

    + '<p style="margin:0;font-size:12px;color:#8b968f;line-height:1.7">If you have any queries regarding this certificate, please do not hesitate to contact us.</p>'
    + '</td></tr>'

    + '<tr><td style="background:#f8f0ee;border-top:2px solid #d97706;padding:14px 28px;text-align:center">'
    + '<div style="font-size:12px;font-weight:700;color:#3d0f0f">' + e(co) + '</div>'
    + (contactLine ? '<div style="font-size:11px;color:#6b5050;margin-top:3px">' + contactLine + '</div>' : '')
    + '</td></tr>'

    + '<tr><td height="5" style="background:linear-gradient(90deg,#7f1d1d,#991b1b 60%,#d97706);font-size:0;line-height:0">&nbsp;</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}
