// ========== PAT - PREVIEW & PDF MODULE ==========
// Extracted from index.html (lines 4387-4483, 4677-4762)

import { sb } from '../../lib/supabase.js';
import { getSetting } from '../../lib/settings.js';
import { toast, showOverlay, hideOverlay } from '../../lib/utils.js';
import { state } from '../../lib/state.js';
import { logAppEvent } from '../../audit/audit.js';
import {
  patGe, patGv, patEsc, patFd, patWrapTxt,
  patApps, patCurrentBaseRef,
  updatePatSidePanel, getPATFormData, populatePATForm
} from './form.js';

// ─── Debounce state ───────────────────────────────────
let _patPreviewTimer = null;

// ─── Public preview entry points ─────────────────────
export function doPatPreview() {
  state._patDirty = true;
  clearTimeout(_patPreviewTimer);
  _patPreviewTimer = setTimeout(_doPatPreviewNow, 280);
}
export function doPatPreviewImmediate() { _doPatPreviewNow(); }

// ─── Core render ─────────────────────────────────────
function _doPatPreviewNow() {
  const wrap = patGe('pat-cert-pages'); if (!wrap) return;
  wrap.innerHTML = '';
  const ref = patGv('pat-ref'), testDate = patFd(patGv('pat-date'));
  const landlord = (patGv('pat-landlord') || '').trim(), client = (patGv('pat-agency') || '').trim();
  const pc = (patGv('pat-postcode') || '').trim();
  const addr = ((patGv('pat-addr') || '').trim() + (pc ? '\n' + pc : '')), eng = patGv('pat-eng') || '—';
  const isDraft = patGv('pat-status') === 'draft';
  const hc = getSetting('pat_hdr_color', '#1e3a5f'), htc = getSetting('pat_hdr_text', '#ffffff'), rowBg = getSetting('pat_row_color', '#f8fafc');
  const coName = getSetting('pat_co_name', getSetting('company_name', 'Your Company Name'));
  const coPhone = getSetting('pat_co_phone', ''), coEmail = getSetting('pat_co_email', '');
  const coAddr = getSetting('pat_co_address', ''), coWeb = getSetting('pat_co_website', '');
  const coVat = getSetting('pat_co_vat', ''), coReg = getSetting('pat_co_regno', '');
  const niceic = getSetting('niceic_no', '');
  const certTitle = getSetting('pat_cert_title', 'PORTABLE APPLIANCE TEST REPORT');
  const regText = getSetting('pat_reg_text', 'Electricity at Work Regulations 1989');
  const cop = getSetting('pat_cop', 'IET Code of Practice (5th Edition)');
  const certNotes = getSetting('pat_cert_notes', '');
  const sigLabel = getSetting('pat_sig_label', 'Authorised Signature');
  const coLogo = getSetting('pat_logo_data', '');
  const schLogo1 = getSetting('pat_logo2_data', '');
  const schLogo2 = getSetting('pat_logo3_data', '');
  const logoHTML = coLogo ? `<img src="${coLogo}" alt="">` :
    `<div style="font-size:18px;font-weight:900;color:${hc};font-family:DM Sans,Arial,sans-serif">${patEsc(coName)}</div>`;
  const pat1 = schLogo1 ? `<div class="a4-flogo"><img src="${schLogo1}"></div>` : '';
  const pat2 = schLogo2 ? `<div class="a4-flogo"><img src="${schLogo2}"></div>` : '';
  const sigData = getSetting('pat_sig_data', '');
  const sigHTML = sigData ? `<img src="${sigData}" style="width:100%;max-height:30px;object-fit:contain;object-position:left center;display:block">` : '________________';
  const rp1 = 26, rpn = 34;
  wrap.style.setProperty('--a4td', getSetting('pat_td_font', '12') + 'px');
  const pages = []; let pageItems = [], pNum = 1, rowsUsed = 0;
  patApps.forEach(app => {
    const desc = patWrapTxt(app.description, 44); const lines = desc.split('\n').length; const cost = Math.max(1, lines);
    const cap = pNum === 1 ? rp1 : rpn;
    if (rowsUsed + cost > cap && pageItems.length) { pages.push({ items: pageItems, cap, n: pNum }); pageItems = []; pNum++; rowsUsed = 0; }
    pageItems.push({ ...app, _d: desc, _c: cost }); rowsUsed += cost;
  });
  pages.push({ items: pageItems, cap: pNum === 1 ? rp1 : rpn, n: pNum });
  pages.forEach((pg, pi) => {
    let hdr = '';
    if (pi === 0) {
      let cb = '';
      const landlordAddr = (patGv('pat-landlord-addr') || '').trim();
      const clientAddr = (patGv('pat-agency-addr') || '').trim();
      const hasPartyAddr = !!(landlordAddr || clientAddr);
      let partiesHtml = '';
      if (landlord) partiesHtml += `<div><div class="a4-key">Landlord</div><div class="a4-val">${patEsc(landlord)}${landlordAddr ? '<br><span style="font-weight:400;font-size:0.9em">' + patEsc(landlordAddr).replace(/\n/g, '<br>') + '</span>' : ''}</div></div>`;
      if (client) partiesHtml += `<div style="margin-top:5px"><div class="a4-key">Client</div><div class="a4-val">${patEsc(client)}${clientAddr ? '<br><span style="font-weight:400;font-size:0.9em">' + patEsc(clientAddr).replace(/\n/g, '<br>') + '</span>' : ''}</div></div>`;
      let leftColHtml = '';
      if (hasPartyAddr && partiesHtml && addr) {
        leftColHtml = `<div style="display:flex;gap:8px;align-items:stretch"><div class="a4-box" style="flex:1">${partiesHtml}</div><div class="a4-box" style="flex:1"><div class="a4-key">Property Address</div><div class="a4-val" style="font-weight:600">${patEsc(addr)}</div></div></div>`;
      } else {
        cb += partiesHtml;
        if (addr) cb += (cb ? '<div style="margin-top:5px">' : '<div>') + `<div class="a4-key">Property Address</div><div class="a4-val" style="font-weight:600">${patEsc(addr)}</div></div>`;
        if (!cb) cb = '<span style="color:#94a3b8">—</span>';
        leftColHtml = `<div class="a4-box">${cb}</div>`;
      }
      hdr = `<div class="a4-topbar"><div><strong>Date:</strong> ${testDate}</div><div><strong>Ref:</strong> ${patEsc(ref) || '—'}</div></div>`
        + `<div class="a4-hdr" style="border-bottom-color:${hc}"><div class="a4-logo">${logoHTML}</div>`
        + `<div style="flex:1"><div class="a4-coname" style="color:${hc};font-size:${getSetting('pat_coname_size', '26')}px;font-family:DM Sans,Arial,sans-serif">${patEsc(coName)}</div>`
        + `<div class="a4-cotype" style="color:${hc};font-size:${getSetting('pat_cotype_size', '11')}px">${patEsc(certTitle)}</div></div></div>`
        + `<div class="a4-meta">${leftColHtml}`
        + `<div class="a4-box"><div class="a4-key">Testing Company</div>`
        + `<div class="a4-val" style="font-weight:700;margin-bottom:2px">${patEsc(coName)}</div>`
        + `<div style="font-size:.78rem;color:#64748b;white-space:pre-line;margin-bottom:${niceic ? '2px' : '5px'}">${patEsc(coAddr)}</div>`
        + `${niceic ? `<div style="font-size:.72rem;font-weight:700;color:#1e3a5f;margin-bottom:4px;letter-spacing:.3px">NICEIC: ${patEsc(niceic)}</div>` : ''}`
        + `<div style="display:flex;gap:6px;margin-top:2px">`
        + `<div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;background:rgba(255,255,255,.55);padding:6px 8px">`
        + `<div style="font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:6px">Supervisor</div>`
        + `<div style="font-size:.9rem;font-weight:700;color:#1e293b">${patEsc(eng)}</div>`
        + `</div>`
        + `<div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;background:rgba(255,255,255,.55);padding:4px 8px;min-height:36px;display:flex;flex-direction:column;justify-content:center">`
        + `<div style="font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:2px">${patEsc(sigLabel.replace(/:\s*$/, ''))}</div>`
        + `<div>${sigHTML}</div>`
        + `</div></div></div></div>`
        + (certNotes ? `<div style="margin-top:6px;padding:5px 9px;background:#fefce8;border:1px solid #fde68a;border-radius:4px;font-size:.68rem;color:#78350f;line-height:1.4">${patEsc(certNotes)}</div>` : '')
        + (regText ? `<div style="margin-top:4px;font-size:.62rem;color:#64748b;line-height:1.4">${patEsc(regText)}${cop ? ` · ${patEsc(cop)}` : ''}</div>` : '');
    }
    const empty = pg.cap - (pg.items.reduce((s, a) => s + a._c, 0));
    let rows = pg.items.map((app, i) => `<tr style="background:${i % 2 === 0 ? rowBg : ''}"><td style="height:${app._c * 28}px;vertical-align:middle">${patEsc(app.assetId)}</td><td style="height:${app._c * 28}px;vertical-align:middle;white-space:pre-wrap;word-break:break-word">${patEsc(app._d)}</td><td>${patEsc(app.testInstrument)}</td><td>${patFd(app.date)}</td><td>${patEsc(app.retestPeriod)}</td><td>${patFd(app.nextTest)}</td><td><span class="cbadge ${app.result === 'Pass' ? 'pass' : 'fail'}">${patEsc(app.result)}</span></td></tr>`).join('');
    for (let i = 0; i < empty; i++) rows += `<tr style="background:${(pg.items.length + i) % 2 === 0 ? rowBg : ''}"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    const wmDiv = isDraft ? `<div style="opacity:.06;pointer-events:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#1e3a5f;white-space:nowrap;user-select:none">DRAFT</div>` : '';
    const accred = getSetting('pat_accred', '');
    wrap.innerHTML += `<div class="a4">${wmDiv}${hdr}<div style="flex:1 1 0;min-height:0;overflow:hidden"><table class="a4t" style="height:100%;font-family:DM Sans,Arial,sans-serif"><thead><tr>`
      + `<th style="background:${hc};color:${htc};width:70px;font-family:DM Sans,Arial,sans-serif">Asset ID</th><th style="background:${hc};color:${htc};font-family:DM Sans,Arial,sans-serif">Description</th>`
      + `<th style="background:${hc};color:${htc};width:85px;font-family:DM Sans,Arial,sans-serif">Instrument</th><th style="background:${hc};color:${htc};width:86px;font-family:DM Sans,Arial,sans-serif">Test Date</th>`
      + `<th style="background:${hc};color:${htc};width:70px;font-family:DM Sans,Arial,sans-serif">Period</th><th style="background:${hc};color:${htc};width:86px;font-family:DM Sans,Arial,sans-serif">Next Due</th>`
      + `<th style="background:${hc};color:${htc};width:52px;font-family:DM Sans,Arial,sans-serif">Result</th>`
      + `</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<div class="a4-foot"><div class="a4-flogos">${pat1}${pat2}</div>`
      + `<div class="a4-fcontact">${coPhone ? `<span>📞 ${patEsc(coPhone)}</span>` : ''}${coEmail ? `<span>✉ ${patEsc(coEmail)}</span>` : ''}${coWeb ? `<span>🌐 ${patEsc(coWeb)}</span>` : ''}${coVat ? `<span>VAT: ${patEsc(coVat)}</span>` : ''}${coReg ? `<span>Reg: ${patEsc(coReg)}</span>` : ''}</div>`
      + `<div style="text-align:right"><div>Page ${pi + 1} of ${pages.length}</div>${accred ? `<div style="font-size:.6rem;color:#64748b;margin-top:1px">${patEsc(accred)}</div>` : ''}</div></div></div>`;
  });
  updatePatSidePanel();
}

// ─── PDF generation ───────────────────────────────────
export async function openPATPDF(id) {
  const { data: r } = await sb.from('pat_reports').select('*').eq('id', id).single();
  if (r) generatePATPDFFromData(r);
}

export async function generatePATPDF() {
  const d = getPATFormData();
  if (!d.property_address) { toast('Add a property address first', 'warn'); return; }
  generatePATPDFFromData(d);
}

export async function generatePATPDFFromData(r, { returnB64 = false } = {}) {
  showOverlay(returnB64 ? 'Generating PDF for email…' : 'Generating PDF…');
  if (r.id && r.id !== state.editingPATId) { state.editingPATId = r.id; populatePATForm(r); }
  doPatPreviewImmediate();
  await new Promise(res => setTimeout(res, 400));
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pages = document.querySelectorAll('#pat-cert-pages .a4');
    if (!pages.length) { hideOverlay(); toast('No certificate to export', 'warn'); return; }

    // Render each page in an isolated off-screen container so html2canvas
    // does not pick up scroll offsets from the parent overflow container
    const shell = document.createElement('div');
    shell.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;z-index:-1;background:#fff;pointer-events:none';
    document.body.appendChild(shell);

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage('a4', 'portrait');
      const clone = pages[i].cloneNode(true);
      clone.style.cssText = 'width:794px;height:1123px;max-width:794px;padding:20px 24px;box-sizing:border-box;background:#fff;color:#000;font-size:.7rem;display:flex;flex-direction:column;position:relative;box-shadow:none;margin:0;overflow:hidden';
      shell.innerHTML = '';
      shell.appendChild(clone);
      await new Promise(res => setTimeout(res, 80));
      const canvas = await html2canvas(clone, {
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
        width: 794, height: 1123, windowWidth: 794, scrollX: 0, scrollY: 0, logging: false,
        imageTimeout: 5000
      });
      const imgH = 297;
      const imgQuality = returnB64 ? 0.85 : 0.92;
      const imgData = canvas.toDataURL('image/jpeg', imgQuality);
      const imgFmt = 'JPEG';
      if (imgH <= 297) {
        doc.addImage(imgData, imgFmt, 0, 0, 210, imgH);
      } else {
        const _r = canvas.width / 210; let _y = 0; let _first = true;
        while (_y < imgH) {
          if (!_first) doc.addPage('a4', 'portrait'); _first = false;
          const _sh = Math.min(297, imgH - _y); const _sp = Math.round(_sh * _r); const _yp = Math.round(_y * _r);
          const _tc = document.createElement('canvas'); _tc.width = canvas.width; _tc.height = _sp;
          _tc.getContext('2d').drawImage(canvas, 0, _yp, canvas.width, _sp, 0, 0, canvas.width, _sp);
          doc.addImage(_tc.toDataURL('image/jpeg', imgQuality), imgFmt, 0, 0, 210, _sh);
          _y += 297;
        }
      }
    }
    document.body.removeChild(shell);

    const ref = (r.ref_number || r.id || 'PAT').toString().replace(/[^\w-]/g, '_');
    if (returnB64) { hideOverlay(); return doc.output('datauristring').split(',')[1]; }
    const _patPdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
    const _patPdfName = `PAT_${ref}.pdf`;
    if (navigator.canShare && navigator.canShare({ files: [new File([_patPdfBlob], _patPdfName, { type: 'application/pdf' })] })) {
      try { await navigator.share({ files: [new File([_patPdfBlob], _patPdfName, { type: 'application/pdf' })], title: _patPdfName }); }
      catch (e) { if (e.name !== 'AbortError') { doc.save(_patPdfName); toast('PDF downloaded ✓', 'success'); } }
    } else { doc.save(_patPdfName); toast('PDF downloaded ✓', 'success'); }
    await logAppEvent('PDF_DOWNLOADED', 'pat', state.editingPATId, r.ref_number || '');
  } catch (e) { toast('PDF error: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

export function printPATCertificate() {
  doPatPreviewImmediate();
  setTimeout(() => {
    const src = document.getElementById('pat-cert-pages');
    const target = document.getElementById('print-target');
    if (src && target) { target.innerHTML = ''; src.querySelectorAll('.a4').forEach(p => target.appendChild(p.cloneNode(true))); }
    document.body.classList.add('pat-printing');
    window.print();
    document.body.classList.remove('pat-printing');
  }, 400);
}
