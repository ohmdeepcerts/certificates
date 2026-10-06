// ========== BREVO EMAIL SERVICE ==========
// Extracted from index.html lines 3067-3073, 4799-4818

import { sb }           from './supabase.js';
import { getSetting }   from './settings.js';
import { toast }        from './utils.js';

export async function sendBrevoEmail(to, toName, subject, htmlContent, pdfBase64, pdfFilename, bcc, cc) {
  const fromEmail = getSetting('email_from') || 'Compliance@ohmelectricals.co.uk';
  const fromName  = getSetting('email_from_name') || getSetting('pat_co_name', getSetting('gas_co_name', 'OHM Electrical Engineering Ltd'));
  const toClean   = (to || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!toClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toClean)) {
    toast('Invalid email: "' + to + '"', 'error');
    return false;
  }
  const fromEmailClean = (fromEmail || '').trim().toLowerCase();
  const payload = {
    sender:      { name: fromName, email: fromEmailClean },
    to:          [{ email: toClean, name: toName || toClean }],
    subject,
    htmlContent,
  };
  if (bcc) {
    const bccClean = (bcc || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bccClean)) payload.bcc = [{ email: bccClean }];
  }
  if (cc) {
    const ccArr = (cc || '').split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (ccArr.length) payload.cc = ccArr.map(e => ({ email: e }));
  }
  if (pdfBase64 && pdfFilename) payload.attachment = [{ content: pdfBase64, name: pdfFilename }];

  const { data, error } = await sb.functions.invoke('send-email', { body: payload });
  if (error) throw new Error(error.message || 'Email function error');
  if (data && !data.ok) throw new Error(data.error || 'Email send failed');
  return { ok: true, messageId: (data && data.messageId) || '' };
}

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

export function getGlobalCC() {
  return getSetting('email_cc', '') || '';
}
