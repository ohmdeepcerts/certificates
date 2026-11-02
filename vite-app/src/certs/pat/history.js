// ========== PAT - HISTORY & RENEWALS MODULE ==========
// Extracted from index.html (lines 4186-4386)

import { sb } from '../../lib/supabase.js';
import { toast, showOverlay, hideOverlay, _softDelete, _deleteCert, confirm2, _ibtn, _addrColor, _addrInitials } from '../../lib/utils.js';
import { state } from '../../lib/state.js';
import { parseGasDate } from '../gas/helpers.js';
import { patFd } from './form.js';
import { loadPATForm } from './form.js';
import { getSetting } from '../../lib/settings.js';
import { PAGE_SIZE, hlText, sortByWordStart, paginationHtml } from '../../lib/search.js';

function _buildPATCertHTML(r) {
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const wrapTxt = (s, w) => { if (!s) return ''; const words = s.split(' '); let lines = [], cur = ''; words.forEach(wrd => { if ((cur + ' ' + wrd).trim().length > w && cur) { lines.push(cur); cur = wrd; } else { cur = (cur + ' ' + wrd).trim(); } }); if (cur) lines.push(cur); return lines.join('\n'); };

  const ref = r.ref_number || '';
  const testDate = patFd(r.test_date);
  const landlord = (r.landlord_name || '').trim();
  const client = (r.client_name || r.agency_name || '').trim();
  const pc = (r.property_postcode || '').trim();
  const addr = ((r.property_address || '').trim() + (pc ? '\n' + pc : '')).trim();
  const eng = r.engineer || '—';
  const isDraft = r.status !== 'completed';
  const landlordAddr = (r.landlord_address || '').trim();
  const clientAddr = (r.agency_address || r.client_address || '').trim();

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
  const schLogo1 = getSetting('pat_logo2_data', ''), schLogo2 = getSetting('pat_logo3_data', '');
  const sigData = getSetting('pat_sig_data', '');
  const accred = getSetting('pat_accred', '');
  const tdFont = getSetting('pat_td_font', '12') + 'px';
  const coNameSize = getSetting('pat_coname_size', '26') + 'px';
  const coTypeSize = getSetting('pat_cotype_size', '11') + 'px';

  const logoHTML = coLogo ? `<img src="${coLogo}" alt="">` : `<div style="font-size:18px;font-weight:900;color:${hc};font-family:DM Sans,Arial,sans-serif">${esc(coName)}</div>`;
  const pat1 = schLogo1 ? `<div class="a4-flogo"><img src="${schLogo1}"></div>` : '';
  const pat2 = schLogo2 ? `<div class="a4-flogo"><img src="${schLogo2}"></div>` : '';
  const sigHTML = sigData ? `<img src="${sigData}" style="width:100%;max-height:30px;object-fit:contain;object-position:left center;display:block">` : '________________';

  const rp1 = 22, rpn = 34;
  const apps = r.appliances || [];
  const pages = []; let pageItems = [], pNum = 1, rowsUsed = 0;
  apps.forEach(app => {
    const desc = wrapTxt(app.description || '', 44);
    const lines = desc.split('\n').length, cost = Math.max(1, lines);
    const cap = pNum === 1 ? rp1 : rpn;
    if (rowsUsed + cost > cap && pageItems.length) { pages.push({ items: pageItems, cap, n: pNum }); pageItems = []; pNum++; rowsUsed = 0; }
    pageItems.push({ ...app, _d: desc, _c: cost }); rowsUsed += cost;
  });
  pages.push({ items: pageItems, cap: pNum === 1 ? rp1 : rpn, n: pNum });

  let pagesHTML = '';
  pages.forEach((pg, pi) => {
    let hdr = '';
    if (pi === 0) {
      let cb = '';
      const hasPartyAddr = !!(landlordAddr || clientAddr);
      let partiesHtml = '';
      if (landlord) partiesHtml += `<div><div class="a4-key">Landlord</div><div class="a4-val">${esc(landlord)}${landlordAddr ? '<br><span style="font-weight:400;font-size:0.9em">' + esc(landlordAddr).replace(/\n/g, '<br>') + '</span>' : ''}</div></div>`;
      if (client) partiesHtml += `<div style="margin-top:5px"><div class="a4-key">Client</div><div class="a4-val">${esc(client)}${clientAddr ? '<br><span style="font-weight:400;font-size:0.9em">' + esc(clientAddr).replace(/\n/g, '<br>') + '</span>' : ''}</div></div>`;
      let leftColHtml = '';
      if (hasPartyAddr && partiesHtml && addr) {
        leftColHtml = `<div style="display:flex;gap:8px;align-items:stretch"><div class="a4-box" style="flex:1">${partiesHtml}</div><div class="a4-box" style="flex:1"><div class="a4-key">Property Address</div><div class="a4-val" style="font-weight:600">${esc(addr)}</div></div></div>`;
      } else {
        cb += partiesHtml;
        if (addr) cb += (cb ? '<div style="margin-top:5px">' : '<div>') + `<div class="a4-key">Property Address</div><div class="a4-val" style="font-weight:600">${esc(addr)}</div></div>`;
        if (!cb) cb = '<span style="color:#94a3b8">—</span>';
        leftColHtml = `<div class="a4-box">${cb}</div>`;
      }
      hdr = `<div class="a4-topbar"><div><strong>Date:</strong> ${testDate}</div><div><strong>Ref:</strong> ${esc(ref) || '—'}</div></div>`
        + `<div class="a4-hdr" style="border-bottom-color:${hc}"><div class="a4-logo">${logoHTML}</div>`
        + `<div style="flex:1"><div class="a4-coname" style="color:${hc};font-size:${coNameSize};font-family:DM Sans,Arial,sans-serif">${esc(coName)}</div>`
        + `<div class="a4-cotype" style="color:${hc};font-size:${coTypeSize}">${esc(certTitle)}</div></div></div>`
        + `<div class="a4-meta">${leftColHtml}`
        + `<div class="a4-box"><div class="a4-key">Testing Company</div>`
        + `<div class="a4-val" style="font-weight:700;margin-bottom:2px">${esc(coName)}</div>`
        + `<div style="font-size:.78rem;color:#64748b;white-space:pre-line;margin-bottom:${niceic ? '2px' : '5px'}">${esc(coAddr)}</div>`
        + `${niceic ? `<div style="font-size:.72rem;font-weight:700;color:#1e3a5f;margin-bottom:4px;letter-spacing:.3px">NICEIC: ${esc(niceic)}</div>` : ''}`
        + `<div style="display:flex;gap:6px;margin-top:2px">`
        + `<div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;background:rgba(255,255,255,.55);padding:6px 8px">`
        + `<div style="font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:6px">Supervisor</div>`
        + `<div style="font-size:.9rem;font-weight:700;color:#1e293b">${esc(eng)}</div>`
        + `</div>`
        + `<div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;background:rgba(255,255,255,.55);padding:4px 8px;min-height:36px;display:flex;flex-direction:column;justify-content:center">`
        + `<div style="font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:2px">${esc(sigLabel.replace(/:\s*$/, ''))}</div>`
        + `<div>${sigHTML}</div>`
        + `</div></div></div></div>`
        + (certNotes ? `<div style="margin-top:6px;padding:5px 9px;background:#fefce8;border:1px solid #fde68a;border-radius:4px;font-size:.68rem;color:#78350f;line-height:1.4">${esc(certNotes)}</div>` : '')
        + (regText ? `<div style="margin-top:4px;font-size:.62rem;color:#64748b;line-height:1.4">${esc(regText)}${cop ? ` · ${esc(cop)}` : ''}</div>` : '');
    }
    const empty = pg.cap - (pg.items.reduce((s, a) => s + a._c, 0));
    let rows = pg.items.map((app, i) => `<tr style="background:${i % 2 === 0 ? rowBg : ''}"><td style="height:${app._c * 28}px;vertical-align:middle">${esc(app.assetId)}</td><td style="height:${app._c * 28}px;vertical-align:middle;white-space:pre-wrap;word-break:break-word">${esc(app._d)}</td><td>${esc(app.testInstrument)}</td><td>${patFd(app.date)}</td><td>${esc(app.retestPeriod)}</td><td>${patFd(app.nextTest)}</td><td><span class="cbadge ${app.result === 'Pass' ? 'pass' : 'fail'}">${esc(app.result)}</span></td></tr>`).join('');
    for (let i = 0; i < empty; i++) rows += `<tr style="background:${(pg.items.length + i) % 2 === 0 ? rowBg : ''}"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    const wmDiv = isDraft ? `<div style="opacity:.06;pointer-events:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#1e3a5f;white-space:nowrap;user-select:none">DRAFT</div>` : '';
    pagesHTML += `<div class="a4">${wmDiv}${hdr}<div style="flex:1 1 0;min-height:0;overflow:hidden"><table class="a4t" style="height:100%;font-family:DM Sans,Arial,sans-serif"><thead><tr>`
      + `<th style="background:${hc};color:${htc};width:70px;font-family:DM Sans,Arial,sans-serif">Asset ID</th><th style="background:${hc};color:${htc};font-family:DM Sans,Arial,sans-serif">Description</th>`
      + `<th style="background:${hc};color:${htc};width:85px;font-family:DM Sans,Arial,sans-serif">Instrument</th><th style="background:${hc};color:${htc};width:86px;font-family:DM Sans,Arial,sans-serif">Test Date</th>`
      + `<th style="background:${hc};color:${htc};width:70px;font-family:DM Sans,Arial,sans-serif">Period</th><th style="background:${hc};color:${htc};width:86px;font-family:DM Sans,Arial,sans-serif">Next Due</th>`
      + `<th style="background:${hc};color:${htc};width:52px;font-family:DM Sans,Arial,sans-serif">Result</th>`
      + `</tr></thead><tbody>${rows}</tbody></table></div>`
      + `<div class="a4-foot"><div class="a4-flogos">${pat1}${pat2}</div>`
      + `<div class="a4-fcontact">${coPhone ? `<span>📞 ${esc(coPhone)}</span>` : ''}${coEmail ? `<span>✉ ${esc(coEmail)}</span>` : ''}${coWeb ? `<span>🌐 ${esc(coWeb)}</span>` : ''}${coVat ? `<span>VAT: ${esc(coVat)}</span>` : ''}${coReg ? `<span>Reg: ${esc(coReg)}</span>` : ''}</div>`
      + `<div style="text-align:right"><div>Page ${pi + 1} of ${pages.length}</div>${accred ? `<div style="font-size:.6rem;color:#64748b;margin-top:1px">${esc(accred)}</div>` : ''}</div></div></div>`;
  });

  const css = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',Arial,sans-serif;background:#d1d5db;padding:16px;display:flex;flex-direction:column;gap:12px;align-items:center}
    :root{--a4td:${tdFont}}
    .a4{background:#fff;width:794px;height:1123px;overflow:hidden;padding:20px 24px;box-sizing:border-box;color:#000;font-size:.7rem;display:flex;flex-direction:column;position:relative;box-shadow:0 2px 8px rgba(0,0,0,.18)}
    .a4-topbar{display:flex;justify-content:space-between;background:#f1f5f9;border:1px solid #e2e8f0;padding:4px 10px;font-size:.72rem;font-weight:600;margin-bottom:6px;border-radius:3px}
    .a4-hdr{display:flex;gap:14px;align-items:center;border-bottom:3px solid #1e3a5f;padding-bottom:11px;margin-bottom:12px}
    .a4-logo{width:180px;height:60px;display:flex;align-items:center;flex-shrink:0}
    .a4-logo img{max-width:100%;max-height:100%;object-fit:contain}
    .a4-coname{font-weight:900;line-height:1.1;font-family:'DM Sans',Arial,sans-serif}
    .a4-cotype{font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-top:3px}
    .a4-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
    .a4-box{border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px;background:rgba(248,250,252,.8)}
    .a4-key{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px}
    .a4-val{font-size:.85rem;color:#1e293b;white-space:pre-line;font-weight:500}
    .a4t{width:100%;border-collapse:collapse}
    .a4t th{padding:5px 4px;text-align:left;font-size:var(--a4td,.72rem);border:1px solid #cbd5e1;font-weight:600;font-family:'DM Sans',Arial,sans-serif}
    .a4t td{border:1px solid #e2e8f0;padding:4px;font-size:var(--a4td,.72rem);vertical-align:middle;font-family:'DM Sans',Arial,sans-serif}
    .cbadge{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:.68rem}
    .cbadge.pass{background:#d1fae5;color:#065f46}
    .cbadge.fail{background:#fee2e2;color:#991b1b}
    .a4-foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid #e2e8f0;font-size:.7rem;color:#64748b}
    .a4-flogos{display:flex;gap:8px;align-items:center}
    .a4-flogo img{max-height:28px;max-width:70px;object-fit:contain}
    .a4-fcontact{display:flex;gap:10px;flex-wrap:wrap}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${pagesHTML}</body></html>`;
}

// ─── Module-level state ───────────────────────────────
let _patSortApps = 0, _patSortExp = 0;
let _compAll = [];
let _patPage = 1, _patFiltered = [], _patCurrentQ = '';

// ─── History helpers ──────────────────────────────────
function _patExpiryPill(r) {
  if (r.status !== 'completed') return '';
  const dates = (r.appliances || []).map(a => a.nextTest || a.next_test || '').filter(Boolean).sort();
  if (!dates.length) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(dates[0]) - today) / (864e5));
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

export function _patEarliestExp(r) { const d = (r.appliances || []).map(a => a.nextTest || '').filter(Boolean).sort(); return d[0] || ''; }

// ─── Load PAT history ─────────────────────────────────
export async function loadPATHistory() {
  const _pl = document.getElementById('pat-list'); if (_pl) _pl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
  if (!navigator.onLine) {
    try {
      const cached = JSON.parse(localStorage.getItem('_cache_pat_history') || 'null');
      if (cached?.data) {
        state.patReports = cached.data; _patFiltered = state.patReports; _patPage = 1; _patCurrentQ = '';
        renderPATList(state.patReports, 1, '');
        toast('Offline — showing data saved ' + new Date(cached.ts).toLocaleString(), 'info', 4000);
        return;
      }
    } catch {}
    if (_pl) _pl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div><p>Offline — no cached data yet. Load this page once while online first.</p></div>';
    return;
  }
  let { data, error } = await sb.from('pat_reports').select('*').is('deleted_at', null).order('created_at', { ascending: false });
  if (error && (error.message || '').includes('deleted_at')) { ({ data, error } = await sb.from('pat_reports').select('*').order('created_at', { ascending: false })); }
  if (error) { toast('Failed to load PAT reports: ' + error.message, 'error'); return; }
  state.patReports = data || [];
  try { localStorage.setItem('_cache_pat_history', JSON.stringify({ data: state.patReports, ts: Date.now() })); } catch {}
  _patFiltered = state.patReports; _patPage = 1; _patCurrentQ = '';
  renderPATList(state.patReports, 1, '');
}

export function renderPATList(reports, page, q) {
  page = page || 1; q = q || '';
  const el = document.getElementById('pat-list');
  if (!reports.length) {
    el.innerHTML = q.length >= 2
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No PAT tests matching "<strong>${q}</strong>"</p></div>`
      : '<div class="empty-state"><div class="empty-icon">📋</div><p>No PAT tests found</p></div>';
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const all = state.patReports;
  const tot = all.length, comp = all.filter(r => r.status === 'completed').length, dr = all.filter(r => r.status !== 'completed').length;
  const dsCount = all.filter(r => { const e = _patEarliestExp(r); if (!e) return false; const d = Math.ceil((new Date(e) - today) / 864e5); return d >= 0 && d <= 30; }).length;
  const isSearch = q.length >= 2;
  // page slice
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = reports.slice(start, start + PAGE_SIZE);
  const filtIdxMap = new Map(reports.map((r, i) => [r, i]));
  const mkRow = (r, hl = '', q = '') => {
    const filtIdx = filtIdxMap.get(r) ?? 0;
    const isDraft = r.status !== 'completed'; const addr = r.property_address || 'No address';
    const [abg, atx] = _addrColor(addr); const ini = (_addrInitials(addr) || '?').toUpperCase();
    const appCount = (r.appliances || []).length;
    const addrHtml = q ? hlText(addr, q) : addr;
    const refHtml  = q ? hlText(r.ref_number || 'DRAFT', q) : (r.ref_number || 'DRAFT');
    return `<div class="pat-card" data-pat-idx="${filtIdx}" onclick="patShowPreview(${filtIdx})" style="${hl ? 'border-color:' + hl + ';' : ''}${isDraft ? 'opacity:.82' : ''};cursor:pointer">
      <div style="width:36px;height:36px;border-radius:50%;background:${abg};color:${atx};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px">${ini}</div>
      <div class="pat-card-body">
        <div class="pat-card-top">
          <span class="pat-card-addr">${addrHtml}</span>
          ${_patExpiryPill(r)}
        </div>
        <div class="pat-card-bot">
          <code class="pat-ref-chip">${refHtml}</code>
          <span class="pat-card-date">${patFd(r.test_date) || 'No date'}</span>
          <div class="pat-card-btns">
            ${_ibtn('Open', 'fa-eye', `event.stopPropagation();loadPATForm('${r.id}')`)}
            ${!isDraft ? _ibtn('Copy', 'fa-copy', `event.stopPropagation();copyPAT('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('PDF', 'fa-file-pdf', `event.stopPropagation();openPATPDF('${r.id}')`) : ''}
            ${!isDraft ? _ibtn('Email', 'fa-envelope', `event.stopPropagation();emailPATFromList('${r.id}')`) : ''}
            ${_ibtn('Delete', 'fa-trash', `event.stopPropagation();deletePAT('${r.id}')`, true)}
          </div>
        </div>
      </div>
    </div>`;
  };
  const tile = (n, lbl, col) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:90px"><div style="font-size:22px;font-weight:600;color:${col || 'var(--text)'}">${n}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${lbl}</div></div>`;
  const sec = (dot, lbl, cnt) => `<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 0 5px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></span>${lbl}${cnt ? ' (' + cnt + ')' : ''}</div>`;
  let html = `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">${tile(tot, 'Total reports')}${tile(comp, 'Completed', '#16a34a')}${tile(dsCount, 'Due ≤ 30 days', '#d97706')}${tile(dr, 'Drafts')}</div>`;
  if (isSearch) {
    html += `<div style="font-size:12px;color:var(--muted);padding:2px 0 10px">${reports.length} result${reports.length !== 1 ? 's' : ''} matching "<strong style="color:var(--text)">${q}</strong>"</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:6px">' + pageItems.map(r => mkRow(r, '', q)).join('') + '</div>';
  } else {
    const dueSoonRs = pageItems.filter(r => { if (r.status !== 'completed') return false; const e = _patEarliestExp(r); if (!e) return false; const d = Math.ceil((new Date(e) - today) / 864e5); return d >= 0 && d <= 30; });
    const doneRs = pageItems.filter(r => r.status === 'completed' && !dueSoonRs.includes(r));
    const draftRs = pageItems.filter(r => r.status !== 'completed');
    // section totals from full list for header counts
    const allDueSoon = reports.filter(r => { if (r.status !== 'completed') return false; const e = _patEarliestExp(r); if (!e) return false; const d = Math.ceil((new Date(e) - today) / 864e5); return d >= 0 && d <= 30; });
    const allDone = reports.filter(r => r.status === 'completed' && !allDueSoon.includes(r));
    const allDrafts = reports.filter(r => r.status !== 'completed');
    if (dueSoonRs.length) html += sec('#f59e0b', 'Due soon', allDueSoon.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + dueSoonRs.map(r => mkRow(r, '#fde68a')).join('') + `</div>`;
    if (doneRs.length)    html += sec('#10b981', 'Completed', allDone.length) + `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">` + doneRs.map(r => mkRow(r)).join('') + `</div>`;
    if (draftRs.length)   html += sec('#94a3b8', 'Drafts', allDrafts.length) + `<div style="display:flex;flex-direction:column;gap:6px">` + draftRs.map(r => mkRow(r)).join('') + `</div>`;
  }
  html += paginationHtml(page, reports.length, 'patPrevPage()', 'patNextPage()');
  el.innerHTML = html;
}

export function patPrevPage() { if (_patPage > 1) { _patPage--; renderPATList(_patFiltered, _patPage, _patCurrentQ); document.getElementById('pat-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }
export function patNextPage() { if (_patPage < Math.ceil(_patFiltered.length / PAGE_SIZE)) { _patPage++; renderPATList(_patFiltered, _patPage, _patCurrentQ); document.getElementById('pat-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }

export function togglePatAppSort() {
  _patSortApps = _patSortApps === 1 ? -1 : _patSortApps === -1 ? 0 : 1; _patSortExp = 0;
  const btn = document.getElementById('pat-sort-apps-btn');
  if (btn) btn.textContent = _patSortApps === 1 ? '↓ Most Apps' : _patSortApps === -1 ? '↑ Fewest Apps' : '↕ Appliances';
  if (btn) btn.style.color = _patSortApps ? 'var(--accent)' : '';
  document.getElementById('pat-sort-exp-btn').style.color = ''; document.getElementById('pat-sort-exp-btn').textContent = '↕ Expiry';
  filterPATList();
}
export function togglePatExpSort() {
  _patSortExp = _patSortExp === 1 ? -1 : _patSortExp === -1 ? 0 : 1; _patSortApps = 0;
  const btn = document.getElementById('pat-sort-exp-btn');
  if (btn) btn.textContent = _patSortExp === 1 ? '↑ Soonest' : _patSortExp === -1 ? '↓ Latest' : '↕ Expiry';
  if (btn) btn.style.color = _patSortExp ? 'var(--accent)' : '';
  document.getElementById('pat-sort-apps-btn').style.color = ''; document.getElementById('pat-sort-apps-btn').textContent = '↕ Appliances';
  filterPATList();
}
export function filterPATList() {
  const q = (document.getElementById('pat-search')?.value || '');
  _patCurrentQ = q.trim().toLowerCase();
  const s = document.getElementById('pat-filter').value;
  let list = state.patReports.filter(r => {
    const matchS = !s || r.status === s;
    if (_patCurrentQ.length < 2) return matchS;
    const lq = _patCurrentQ;
    const matchQ =
      (r.property_address  || '').toLowerCase().includes(lq) ||
      (r.ref_number        || '').toLowerCase().includes(lq) ||
      (r.landlord_name     || '').toLowerCase().includes(lq) ||
      (r.landlord_address  || '').toLowerCase().includes(lq) ||
      (r.agency_name       || '').toLowerCase().includes(lq);
    return matchS && matchQ;
  });
  if (_patCurrentQ.length >= 2) {
    list = sortByWordStart(list, r => [r.property_address, r.ref_number, r.landlord_name, r.landlord_address, r.agency_name].join(' '), _patCurrentQ);
  }
  if (_patSortApps !== 0) list = [...list].sort((a, b) => _patSortApps * ((b.appliances || []).length - (a.appliances || []).length));
  if (_patSortExp !== 0) list = [...list].sort((a, b) => { const ea = _patEarliestExp(a) || '9999', eb = _patEarliestExp(b) || '9999'; return _patSortExp * (ea < eb ? -1 : ea > eb ? 1 : 0); });
  _patFiltered = list; _patPage = 1;
  renderPATList(list, 1, _patCurrentQ);
}

export function deletePAT(id) {
  _deleteCert('pat_reports', id, loadPATHistory);
}

export async function copyPAT(id) {
  showOverlay('Copying…');
  try {
    const { data: r, error } = await sb.from('pat_reports').select('*').eq('id', id).single();
    if (error || !r) { toast('Could not load certificate', 'error'); return; }
    const copy = { ...r };
    delete copy.id; delete copy.created_at; delete copy.updated_at;
    copy.status = 'draft'; copy.ref_number = null; copy.test_date = new Date().toISOString().slice(0, 10);
    copy.internal_notes = '';
    const { data: newR, error: insErr } = await sb.from('pat_reports').insert(copy).select().single();
    if (insErr) { toast('Copy failed: ' + insErr.message, 'error'); return; }
    toast('Copied as new draft', 'success');
    await loadPATForm(newR.id);
  } catch (e) { toast('Copy error: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

// ─── Renewals / Compliance ────────────────────────────
export async function loadCompliance() {
  const el = document.getElementById('comp-list');
  if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><p>Loading…</p></div>';
  const today = new Date();
  const items = [];
  const [{ data: pats }, { data: gases }, { data: els }] = await Promise.all([
    sb.from('pat_reports').select('id,ref_number,property_address,appliances,engineer').eq('status', 'completed'),
    sb.from('gas_certs').select('id,ref_number,install_address,next_check_date,engineer,cert_date').eq('status', 'completed'),
    sb.from('el_certs').select('id,ref_number,data,created_at').order('created_at', { ascending: false })
  ]);
  (pats || []).forEach(r => {
    const dates = (r.appliances || []).map(a => { const nd = a.nextTest || a.next_test; return nd ? new Date(nd) : null; }).filter(Boolean);
    if (!dates.length) return;
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const count = (r.appliances || []).length;
    items.push({ type: 'pat', id: r.id, ref: r.ref_number || '—', address: r.property_address || '—', engineer: r.engineer || '—', label: count + ' appliance' + (count === 1 ? '' : 's'), assetId: '', due: earliest, overdue: earliest < today, daysLeft: Math.round((earliest - today) / 86400000) });
  });
  (gases || []).forEach(r => {
    if (!r.next_check_date) return;
    const d = parseGasDate(r.next_check_date); if (!d) return;
    items.push({ type: 'gas', id: r.id, ref: r.ref_number || '—', address: r.install_address || '—', engineer: r.engineer || '—', label: 'Annual Gas Safety Check', assetId: '', certDate: r.cert_date || '', due: d, overdue: d < today, daysLeft: Math.round((d - today) / 86400000) });
  });
  (els || []).forEach(r => {
    const d = r.data || {}; const nd = d.nextTestDate || ''; if (!nd) return;
    const parts = nd.split('/'); if (parts.length !== 3) return;
    const due = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); if (isNaN(due)) return;
    const addr = [d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode].filter(Boolean).join(', ') || d.premisesAddress || '—';
    items.push({ type: 'el', id: r.id, ref: r.ref_number || d.ref || '—', address: addr, engineer: d.engineerName || '—', label: (d.certType || 'EL') + ' Certificate', assetId: '', certDate: d.testDate || '', due, overdue: due < today, daysLeft: Math.round((due - today) / 86400000) });
  });
  _compAll = items;
  const compBadge = document.getElementById('compliance-badge');
  if (compBadge) { const tot = items.filter(i => i.daysLeft <= 60).length; compBadge.textContent = tot; compBadge.hidden = tot === 0; }
  filterCompliance();
}

export function filterCompliance() {
  const search = (document.getElementById('comp-search')?.value || '').toLowerCase().trim();
  const type = document.getElementById('comp-type')?.value || '';
  const urgency = document.getElementById('comp-urgency')?.value || '60';
  const sort = document.getElementById('comp-sort')?.value || 'date-asc';
  const today = new Date();
  let items = [..._compAll];
  if (urgency === 'overdue') items = items.filter(i => i.overdue);
  else if (urgency === '7') items = items.filter(i => i.daysLeft <= 7);
  else if (urgency === '30') items = items.filter(i => i.daysLeft <= 30);
  else if (urgency === '60') items = items.filter(i => i.daysLeft <= 60);
  if (type) items = items.filter(i => i.type === type);
  if (search) items = items.filter(i => i.address.toLowerCase().includes(search) || i.ref.toLowerCase().includes(search) || i.label.toLowerCase().includes(search) || i.assetId.toLowerCase().includes(search) || i.engineer.toLowerCase().includes(search));
  if (sort === 'date-asc') items.sort((a, b) => a.due - b.due);
  else if (sort === 'date-desc') items.sort((a, b) => b.due - a.due);
  else if (sort === 'address') items.sort((a, b) => a.address.localeCompare(b.address));
  else if (sort === 'type') items.sort((a, b) => a.type.localeCompare(b.type) || a.due - b.due);
  const overdue = items.filter(i => i.overdue).length;
  const thisWeek = items.filter(i => !i.overdue && i.daysLeft <= 7).length;
  const thisMonth = items.filter(i => !i.overdue && i.daysLeft > 7 && i.daysLeft <= 30).length;
  const sub = document.getElementById('comp-subtitle');
  if (sub) sub.textContent = `${_compAll.length} total items across PAT, Gas & EL · ${_compAll.filter(i => i.overdue).length} overdue`;
  const summary = document.getElementById('comp-summary');
  if (summary && items.length) {
    summary.innerHTML = `<span style="color:var(--error);font-weight:600">⚠ ${overdue} overdue</span><span style="color:#92400e;font-weight:600">⏰ ${thisWeek} this week</span><span style="color:var(--muted)">📅 ${thisMonth} this month</span><span style="color:var(--muted);margin-left:auto">${items.length} shown</span>`;
  } else if (summary) { summary.innerHTML = ''; }
  const elList = document.getElementById('comp-list'); if (!elList) return;
  if (!items.length) { elList.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><p>Nothing due for the selected filters</p></div>'; return; }
  elList.innerHTML = items.map(i => {
    const dStr = i.due.toLocaleDateString('en-GB');
    const urgClass = i.overdue ? 'overdue' : i.daysLeft <= 7 ? 'urgent' : 'due';
    const urgLabel = i.overdue ? `OVERDUE ${Math.abs(i.daysLeft)}d ago` : i.daysLeft === 0 ? 'TODAY' : i.daysLeft === 1 ? 'Tomorrow' : 'Due ' + dStr;
    const typeBadge = i.type === 'pat' ? `<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">📋 PAT</span>` : i.type === 'el' ? `<span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">⚡ EL</span>` : `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">🔥 Gas</span>`;
    const meta = i.type === 'pat' ? `${i.label}${i.assetId ? ' · Asset: ' + i.assetId : ''}` : i.certDate ? `Last cert: ${i.certDate}` : i.label || 'Annual Safety Check';
    const action = i.type === 'pat' ? `<button class="btn btn-primary btn-sm" onclick="loadPATForm('${i.id}')">Open PAT</button>` : i.type === 'el' ? `<button class="btn btn-primary btn-sm" onclick="startNewEL()">New EL</button>` : `<button class="btn btn-primary btn-sm" onclick="startNewGas()">New Gas</button>`;
    return `<div class="cert-row"><div class="cert-row-info"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${typeBadge}<span class="cert-ref">${i.ref}</span><span class="badge badge-${urgClass}">${urgLabel}</span></div><div class="cert-address">${i.address}</div><div class="cert-meta">${meta} · Engineer: ${i.engineer}</div></div>${action}</div>`;
  }).join('');
}

// ── History preview panel ─────────────────────────────────────────────────────
function _buildPATPreviewHTML(r) {
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fd = s => { if (!s) return '—'; const p = String(s).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
  const apps = r.appliances || [];
  const passCount = apps.filter(a => (a.result || '').toLowerCase() === 'pass').length;
  const failCount = apps.filter(a => (a.result || '').toLowerCase() === 'fail').length;
  const appsHtml = apps.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#1e3a5f;color:#fff">
        <th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Asset ID</th>
        <th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Description</th>
        <th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Next Test</th>
        <th style="padding:7px 8px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Result</th>
      </tr></thead>
      <tbody>
        ${apps.map((a, i) => {
          const pass = (a.result || '').toLowerCase() === 'pass';
          const fail = (a.result || '').toLowerCase() === 'fail';
          const desc = a.description || a._d || [a.location, a.type, a.make, a.model].filter(Boolean).join(', ') || '—';
          return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
            <td style="padding:6px 8px;font-weight:700;color:#1e3a5f">${esc(a.assetId||'—')}</td>
            <td style="padding:6px 8px;color:#475569">${esc(desc)}</td>
            <td style="padding:6px 8px;color:#475569">${fd(a.nextTest||a.next_test||'')}</td>
            <td style="padding:6px 8px;text-align:center"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${pass?'#dcfce7':fail?'#fee2e2':'#f1f5f9'};color:${pass?'#15803d':fail?'#dc2626':'#64748b'}">${esc(a.result||'—')}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<p style="color:#94a3b8;font-size:13px;padding:8px 0">No appliances recorded</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f1f5f9;padding:16px;color:#1e293b}.cert{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)}.hdr{background:#1e3a5f;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start}.body{padding:16px 20px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px}.ibox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px}.ilbl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1e3a5f;margin-bottom:8px}.irow{font-size:12px;color:#64748b;margin-bottom:3px}.stitle{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1e3a5f;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #1e3a5f}</style></head><body>
  <div class="cert">
    <div class="hdr">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.8">PORTABLE APPLIANCE TEST REPORT</div>
        <div style="font-size:20px;font-weight:900;margin-top:4px">${esc(r.ref_number||'DRAFT')}</div>
        <div style="font-size:12px;margin-top:6px;opacity:.85">${esc(r.property_address||'No address')}</div>
      </div>
      <div style="text-align:right">
        <div style="background:${r.status==='completed'?'#16a34a':'#f59e0b'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block">${r.status==='completed'?'COMPLETED':'DRAFT'}</div>
        <div style="font-size:11px;margin-top:8px;opacity:.85">Test Date: ${fd(r.test_date)}</div>
        <div style="font-size:11px;opacity:.85">${apps.length} appliance${apps.length!==1?'s':''}</div>
      </div>
    </div>
    <div class="body">
      <div class="row3">
        <div class="ibox"><div class="ilbl">Property</div><div class="irow">${esc(r.property_address||'—')}</div></div>
        <div class="ibox"><div class="ilbl">Engineer</div><div class="irow"><strong>${esc(r.engineer||'—')}</strong></div>${r.landlord_name?`<div class="irow">${esc(r.landlord_name)}</div>`:''}</div>
        <div class="ibox">
          <div class="ilbl">Results</div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <div style="flex:1;text-align:center;background:#dcfce7;border-radius:8px;padding:8px"><div style="font-size:20px;font-weight:800;color:#15803d">${passCount}</div><div style="font-size:10px;color:#15803d;font-weight:700">PASS</div></div>
            <div style="flex:1;text-align:center;background:${failCount?'#fee2e2':'#f8fafc'};border-radius:8px;padding:8px"><div style="font-size:20px;font-weight:800;color:${failCount?'#dc2626':'#94a3b8'}">${failCount}</div><div style="font-size:10px;color:${failCount?'#dc2626':'#94a3b8'};font-weight:700">FAIL</div></div>
          </div>
        </div>
      </div>
      <div class="stitle">Appliances</div>
      ${appsHtml}
    </div>
  </div>
  </body></html>`;
}

function _patApplyIfrScale(scale) {
  var ifr = document.getElementById('pat-hist-iframe');
  if (!ifr) return;
  var s = Math.max(0.2, Math.min(2.5, scale));
  var certW = 794;
  var contentH = 800;
  try { contentH = Math.max(400, ifr.contentDocument.documentElement.scrollHeight); } catch(e) {}
  ifr.style.width = certW + 'px';
  ifr.style.height = contentH + 'px';
  ifr.style.transformOrigin = '0 0';
  ifr.style.transform = 'scale(' + s + ')';
  ifr.style.marginRight = '-' + Math.round(certW * (1 - s)) + 'px';
  ifr.style.marginBottom = '-' + Math.round(contentH * (1 - s)) + 'px';
  window._patHistScale = s;
  var pct = document.getElementById('pat-hist-zoom-pct');
  if (pct) pct.textContent = Math.round(s * 100) + '%';
}

export function patHistZoomIn() { _patApplyIfrScale((window._patHistScale || 0.7) + 0.05); }
export function patHistZoomOut() { _patApplyIfrScale((window._patHistScale || 0.7) - 0.05); }

export function patShowPreview(idx) {
  var r = _patFiltered[idx]; if (!r) return;
  window._patHistRec = r;
  var empty = document.getElementById('pat-hist-empty');
  var active = document.getElementById('pat-hist-active');
  var toolbar = document.getElementById('pat-hist-toolbar');
  var ifr = document.getElementById('pat-hist-iframe');
  if (!ifr) { loadPATForm(r.id); return; }
  if (empty) empty.style.display = 'none';
  if (active) active.style.display = 'block';
  var isAdm = state.currentProfile?.role === 'admin';
  var isDraft = r.status !== 'completed';
  var ref = (r.ref_number || '—').replace(/</g, '&lt;');
  var addr = (r.property_address || '').replace(/</g, '&lt;');
  toolbar.innerHTML = '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    + ref + (addr ? ' &mdash; ' + addr : '') + '</span>'
    + (!isDraft ? _ibtn('Download PDF', 'fa-download', 'openPATPDF("' + r.id + '")') : '')
    + (!isDraft ? _ibtn('Email', 'fa-envelope', 'emailPATFromList("' + r.id + '")') : '')
    + (isAdm ? _ibtn('Edit', 'fa-pen', 'loadPATForm("' + r.id + '")') : '')
    + (isAdm ? _ibtn('Delete', 'fa-trash', 'deletePAT("' + r.id + '")', true) : '');
  var html = _buildPATCertHTML(r);
  var blob = new Blob([html], {type: 'text/html'});
  if (ifr._blobUrl) URL.revokeObjectURL(ifr._blobUrl);
  var blobUrl = URL.createObjectURL(blob);
  ifr._blobUrl = blobUrl;
  ifr.onload = function() {
    try {
      var panel = document.getElementById('pat-hist-panel');
      var panelW = panel ? Math.max(300, panel.clientWidth - 2) : 794;
      var base = Math.min(1, panelW / 794) * 0.9;
      _patApplyIfrScale(base);
    } catch(e) {}
  };
  ifr.src = blobUrl;
  document.querySelectorAll('[data-pat-idx]').forEach(function(c) { c.style.outline = 'none'; c.style.background = ''; });
  var card = document.querySelector('[data-pat-idx="' + idx + '"]');
  if (card) { card.style.outline = '2px solid var(--primary,#0e4d33)'; card.style.background = 'rgba(14,77,51,.06)'; }
}
