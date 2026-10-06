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
        var html = `<p>Dear ${client},</p>
<p>Please find attached your Fire Alarm Certificate (ref: ${rec.ref||'—'}).</p>
<p><strong>Premises:</strong> ${[rec.premAddr1, rec.premAddr2, rec.premAddr3, rec.premPostcode].filter(Boolean).join(', ')}</p>
<p><strong>Test date:</strong> ${rec.testDate||'—'}</p>
<p><strong>Outcome:</strong> ${rec.outcome||'—'}</p>
${rec.nextInspDate?`<p><strong>Next inspection due:</strong> ${rec.nextInspDate}</p>`:''}
<p>Please keep this certificate in a safe place and make it available on request.</p>
<p>Kind regards,<br>${getSetting('company_name','OHM Electrical Engineering Ltd')}</p>`;

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
