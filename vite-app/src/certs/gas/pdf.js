// ============================================================
//  pdf.js — CP12 PDF renderer (vector jsPDF + html2canvas fallback)
// ============================================================
import { getSetting } from '../../lib/settings.js';
import { toast, showOverlay, hideOverlay } from '../../lib/utils.js';
import { state } from '../../lib/state.js';
import { logAppEvent } from '../../audit/audit.js';
import { collectCP12FormData, cp12Field, cp12RequireAppliance } from './cp12.js';

// ── Vector renderer (jsPDF primitives) ───────────────────

export async function buildCP12PdfDoc() {
  if (!window.jspdf) throw new Error('jsPDF not loaded');
  const { jsPDF } = window.jspdf;
  const d = collectCP12FormData();
  const ref = cp12Field('cert_ref') || '';
  const coName = cp12Field('company_name') || getSetting('gas_co_name', getSetting('company_name', ''));

  const NAVY = [30, 58, 95], AMBER = [245, 158, 11], WHITE = [255, 255, 255];
  const LGRAY = [249, 250, 251], DARK = [17, 24, 39], MED = [107, 114, 128];
  const NBORDER = [30, 58, 95], AMBER_LIGHT = [254, 243, 199];

  const PL = 12, PT = 10, CW = 273;
  const HDR_H = 22, TOPBAR_H = 7, GAP = 2;
  const LOGO_W = CW * 0.2, HDR_CW = CW * 0.8, HDR_CX = PL + LOGO_W;
  const INFO_Y = PT + HDR_H + GAP, INFO_H = 28, INFO_GAP = 2.5;
  const INFO_CW = (CW - INFO_GAP * 2) / 3;
  const MAIN_Y = INFO_Y + INFO_H + GAP;
  const FOOTER_Y = 200, FOOTER_H = 8;
  const COL_W = (CW - GAP) / 2, LEFT_X = PL, RIGHT_X = PL + COL_W + GAP;
  const DEF_H = 50, REM_H = 22, PIPE_H = 50;
  const HEADER_LH = 5;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  function box(x, y, w, h, fc, sc, lw = 0.3) {
    if (fc) { doc.setFillColor(...fc); if (sc) { doc.setDrawColor(...sc); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h, 'F'); }
    else if (sc) { doc.setDrawColor(...sc); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S'); }
  }
  function txt(s, x, y, size, color, bold, align) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size); doc.setTextColor(...(color || DARK));
    doc.text(String(s || ''), x, y, { align: align || 'left', baseline: 'middle' });
  }
  function wrapTxt(s, x, y, w, size, color, bold, lineH) {
    if (!s) return 0;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size); doc.setTextColor(...(color || DARK));
    const lh = lineH || (size * 0.3528 + 1.2);
    const lines = String(s).split('\n').flatMap(seg => doc.splitTextToSize(seg || ' ', w));
    lines.forEach((l, i) => doc.text(l, x, y + i * lh));
    return lines.length * lh;
  }
  function sectionHdr(x, y, w, h, label) {
    box(x, y, w, h, NAVY);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...WHITE);
    doc.text(label.toUpperCase(), x + 3, y + h / 2, { baseline: 'middle' });
  }
  function infoBox(x, y, w, h, title) {
    box(x, y, w, h, WHITE, NBORDER, 0.4);
    sectionHdr(x, y, w, HEADER_LH, title);
  }

  // PAGE 1
  box(PL, PT, LOGO_W, HDR_H, NAVY);
  const logoData = getSetting('gas_logo_data', '');
  if (logoData) { try { doc.addImage(logoData, 'PNG', PL + 2, PT + 2, LOGO_W - 4, HDR_H - 4, '', 'FAST'); } catch (e) {} }
  else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...WHITE);
    doc.text('GAS SAFE', PL + LOGO_W / 2, PT + HDR_H / 2 - 2, { align: 'center', baseline: 'middle' });
    doc.setFontSize(6.5); doc.text('REGISTERED', PL + LOGO_W / 2, PT + HDR_H / 2 + 3.5, { align: 'center', baseline: 'middle' });
  }

  const TITLE_H = HDR_H - TOPBAR_H;
  box(HDR_CX, PT, HDR_CW, TITLE_H, NAVY);
  txt(coName || 'Company Name', HDR_CX + 5, PT + TITLE_H * 0.38, 16, WHITE, true);
  txt('LANDLORD GAS SAFETY RECORD (CP12)', HDR_CX + 5, PT + TITLE_H * 0.77, 9.5, WHITE, true);

  const TBAR_Y = PT + TITLE_H;
  box(HDR_CX, TBAR_Y, HDR_CW, TOPBAR_H, AMBER);
  const BAR_FRACS = [0.9, 0.85, 0.9, 1.55], BAR_TOTAL = 4.2;
  const BAR_AVAIL = HDR_CW - 4, BAR_GAP = 1.5, BAR_UNIT = (BAR_AVAIL - BAR_GAP * 3) / BAR_TOTAL;
  const BAR_LABELS = ['Inspection Date', 'Licence No.', 'Gas Safe Reg. No.', 'Certificate Ref.'];
  const BAR_VALS = [d.cert_date || '', d.engineer_licence_no || '', d.gas_safe_no || '', ref];
  let bx = HDR_CX + 2;
  BAR_FRACS.forEach((fr, i) => {
    const bw = fr * BAR_UNIT;
    txt(BAR_LABELS[i], bx + 1, TBAR_Y + 2.2, 5.8, NAVY, true);
    box(bx, TBAR_Y + 3.3, bw, 3, WHITE);
    txt(BAR_VALS[i] || '', bx + 1.5, TBAR_Y + 5, 7, DARK, true);
    bx += bw + BAR_GAP;
  });

  const IBOX_HDR = 5, IPAD = 3;
  const B1X = PL;
  infoBox(B1X, INFO_Y, INFO_CW, INFO_H, 'Landlord / Customer Details');
  (function () {
    const la = (d.landlord_address || '').trim(); const lns = la.split('\n'); const fl = (lns[0] || '').trim();
    let lName = '', lAddr = '';
    if (fl && !(/^\d/.test(fl) || /^flat\s/i.test(fl) || /^apt\s/i.test(fl))) { lName = fl; lAddr = lns.slice(1).join('\n'); } else { lName = ''; lAddr = la; }
    let ly = INFO_Y + IBOX_HDR + 4;
    if (lName) { txt(lName, B1X + IPAD, ly + 3.5, 7.5, DARK, true); ly += 6; }
    if (lAddr) wrapTxt(lAddr, B1X + IPAD, ly, INFO_CW - 6, 7, DARK, false, 3.4);
  })();
  if (d.landlord_postcode) {
    txt('Postcode', B1X + IPAD, INFO_Y + INFO_H - 5.5, 5.8, MED, true);
    txt(d.landlord_postcode, B1X + IPAD + 19, INFO_Y + INFO_H - 4, 7.5, DARK, true);
  }

  const B2X = PL + INFO_CW + INFO_GAP;
  infoBox(B2X, INFO_Y, INFO_CW, INFO_H, 'Installation / Inspection Address');
  wrapTxt(d.install_address, B2X + IPAD, INFO_Y + IBOX_HDR + 4, INFO_CW - 6, 7.5, DARK, false, 3.6);
  if (d.install_postcode) {
    txt('Postcode', B2X + IPAD, INFO_Y + INFO_H - 5.5, 5.8, MED, true);
    txt(d.install_postcode, B2X + IPAD + 19, INFO_Y + INFO_H - 4, 7.5, DARK, true);
  }

  const B3X = PL + 2 * (INFO_CW + INFO_GAP);
  infoBox(B3X, INFO_Y, INFO_CW, INFO_H, 'Engineer / Business Details');
  let b3y = INFO_Y + IBOX_HDR + 4;
  b3y += wrapTxt(d.business_address, B3X + IPAD, b3y, INFO_CW - 6, 7, DARK, false, 3.4);
  b3y += 1;
  if (d.business_phone) { txt('Tel', B3X + IPAD, b3y + 1, 5.8, MED, true); wrapTxt(d.business_phone, B3X + IPAD + 9, b3y, INFO_CW - 6 - 9, 7, DARK, false, 3.4); b3y += 4; }
  if (d.business_email) { txt('Email', B3X + IPAD, b3y + 1, 5.8, MED, true); wrapTxt(d.business_email, B3X + IPAD + 11, b3y, INFO_CW - 6 - 11, 6.5, DARK, false, 3.4); }

  // Defects
  const DEF_Y = MAIN_Y;
  box(LEFT_X, DEF_Y, COL_W, DEF_H, WHITE, NBORDER, 0.4);
  const DEF_HDR_H = 6;
  box(LEFT_X, DEF_Y, COL_W, DEF_HDR_H, NAVY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...WHITE);
  doc.text('DEFECTS / IMMEDIATELY DANGEROUS / AT RISK NOTICES ISSUED', LEFT_X + 3, DEF_Y + DEF_HDR_H / 2, { baseline: 'middle' });
  doc.text('WARNING', LEFT_X + COL_W - 22, DEF_Y + DEF_HDR_H / 2 - 1.8, { align: 'center', baseline: 'middle' });
  doc.text('NOTICE', LEFT_X + COL_W - 22, DEF_Y + DEF_HDR_H / 2 + 1.8, { align: 'center', baseline: 'middle' });
  doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2);
  doc.line(LEFT_X + COL_W - 32, DEF_Y, LEFT_X + COL_W - 32, DEF_Y + DEF_HDR_H);

  const DEF_ROW_H = (DEF_H - DEF_HDR_H) / 5, WARN_W = 32, NUM_W = 9;
  for (let i = 0; i < 5; i++) {
    const ry = DEF_Y + DEF_HDR_H + i * DEF_ROW_H;
    if (i > 0) { doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2); doc.line(LEFT_X, ry, LEFT_X + COL_W, ry); }
    box(LEFT_X, ry, NUM_W, DEF_ROW_H, LGRAY);
    txt(String(i + 1), LEFT_X + NUM_W / 2, ry + DEF_ROW_H / 2, 7.5, DARK, true, 'center');
    doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2);
    doc.line(LEFT_X + NUM_W, ry, LEFT_X + NUM_W, ry + DEF_ROW_H);
    doc.line(LEFT_X + COL_W - WARN_W, ry, LEFT_X + COL_W - WARN_W, ry + DEF_ROW_H);
    const def = (d.defects || [])[i];
    if (def && def.description) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DARK);
      const dl = doc.splitTextToSize(def.description, COL_W - NUM_W - WARN_W - 8);
      doc.text(dl[0] || '', LEFT_X + NUM_W + 3, ry + DEF_ROW_H / 2, { baseline: 'middle' });
    }
    const warn = def ? def.warning_type : '';
    if (warn && warn !== 'N/A') { txt(warn, LEFT_X + COL_W - WARN_W / 2, ry + DEF_ROW_H / 2, 7, DARK, true, 'center'); }
    else { txt('N/A', LEFT_X + COL_W - WARN_W / 2, ry + DEF_ROW_H / 2, 6.5, MED, false, 'center'); }
  }

  const REM_Y = DEF_Y + DEF_H + GAP;
  infoBox(LEFT_X, REM_Y, COL_W, REM_H, 'Remedial Action Required');
  wrapTxt(d.remedial_action, LEFT_X + IPAD, REM_Y + IBOX_HDR + 4, COL_W - 6, 7.5, DARK, false, 3.8);

  const WORK_Y = REM_Y + REM_H + GAP;
  const WORK_H = FOOTER_Y - WORK_Y - GAP;
  infoBox(LEFT_X, WORK_Y, COL_W, WORK_H, 'Work Carried Out');
  wrapTxt(d.work_details, LEFT_X + IPAD, WORK_Y + IBOX_HDR + 4, COL_W - 6, 7.5, DARK, false, 3.8);

  // Pipework
  const PIPE_Y = MAIN_Y;
  box(RIGHT_X, PIPE_Y, COL_W, PIPE_H, WHITE, NBORDER, 0.4);
  const PIPE_HDR_H = 6, PIPE_CHK_W = 25;
  box(RIGHT_X, PIPE_Y, COL_W, PIPE_HDR_H, NAVY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...WHITE);
  doc.text('PIPEWORK / INSTALLATION CHECKS', RIGHT_X + 3, PIPE_Y + PIPE_HDR_H / 2, { baseline: 'middle' });
  doc.text('Satisfactory', RIGHT_X + COL_W - PIPE_CHK_W + PIPE_CHK_W / 2, PIPE_Y + PIPE_HDR_H / 2 - 1.5, { align: 'center', baseline: 'middle' });
  doc.text('/ Pass', RIGHT_X + COL_W - PIPE_CHK_W + PIPE_CHK_W / 2, PIPE_Y + PIPE_HDR_H / 2 + 1.8, { align: 'center', baseline: 'middle' });
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3);
  doc.line(RIGHT_X + COL_W - PIPE_CHK_W, PIPE_Y, RIGHT_X + COL_W - PIPE_CHK_W, PIPE_Y + PIPE_HDR_H);

  const PIPE_ROWS = ['Gas Tightness Test', 'Standing / Working Pressure Test', 'Gas Installation Visual Check', 'Meter / Governor Condition', 'Emergency Control Accessible'];
  const PIPE_ROW_H = (PIPE_H - PIPE_HDR_H) / 5;
  PIPE_ROWS.forEach((label, i) => {
    const ry = PIPE_Y + PIPE_HDR_H + i * PIPE_ROW_H;
    if (i > 0) { doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2); doc.line(RIGHT_X, ry, RIGHT_X + COL_W, ry); }
    doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2);
    doc.line(RIGHT_X + COL_W - PIPE_CHK_W, ry, RIGHT_X + COL_W - PIPE_CHK_W, ry + PIPE_ROW_H);
    txt(label, RIGHT_X + 3, ry + PIPE_ROW_H / 2, 7.5, DARK, false);
    box(RIGHT_X + COL_W - PIPE_CHK_W, ry, PIPE_CHK_W, PIPE_ROW_H, LGRAY);
    const v = (d.pipework || [])[i] || '';
    if (v) txt(v, RIGHT_X + COL_W - PIPE_CHK_W + PIPE_CHK_W / 2, ry + PIPE_ROW_H / 2, 9, DARK, true, 'center');
  });

  // Signatures
  const SIG_Y = PIPE_Y + PIPE_H + GAP;
  const SIG_H = FOOTER_Y - SIG_Y - GAP;
  const ATTN_W = 44;
  box(RIGHT_X, SIG_Y, COL_W, SIG_H, LGRAY, NBORDER, 0.4);
  const SIG_BLK_W = COL_W - ATTN_W - GAP - 4;
  const SIG_BLK_H = (SIG_H - 4 - GAP) / 2;
  const SBLK_HDR = 4.5;
  function sigBlock(x, y, w, h, titleText, sigImg, nameVal) {
    box(x, y, w, h, WHITE, NBORDER, 0.3);
    box(x, y, w, SBLK_HDR, NAVY);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.setTextColor(...WHITE);
    doc.text(titleText.toUpperCase(), x + 2, y + SBLK_HDR / 2, { baseline: 'middle' });
    if (sigImg) { try { doc.addImage(sigImg, 'PNG', x + 2, y + SBLK_HDR + 1, w - 4, h - SBLK_HDR - 8, '', 'FAST'); } catch (e) {} }
    doc.setDrawColor(...[209, 213, 219]); doc.setLineWidth(0.2);
    doc.line(x + 2, y + h - 5, x + w - 2, y + h - 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor(...MED);
    doc.text('NAME', x + 2, y + h - 2.5, { baseline: 'middle' });
    if (nameVal) txt((nameVal || '').toUpperCase(), x + 12, y + h - 2.5, 6.5, DARK, true);
  }
  sigBlock(RIGHT_X + 2, SIG_Y + 2, SIG_BLK_W, SIG_BLK_H, 'Record issued by the engineer:', d.sig_issued_image, d.sig_issued_name);
  sigBlock(RIGHT_X + 2, SIG_Y + SIG_BLK_H + GAP + 2, SIG_BLK_W, SIG_BLK_H, 'Record received by (tenant / landlord / homeowner / agent):', d.sig_received_image, d.sig_received_name);

  // Attention box
  const ATTN_X = RIGHT_X + COL_W - ATTN_W;
  box(ATTN_X, SIG_Y + 2, ATTN_W - 1, SIG_H - 4, WHITE, [17, 17, 17], 0.5);
  box(ATTN_X, SIG_Y + 2, ATTN_W - 1, 5.5, [17, 17, 17]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...WHITE);
  doc.text('ATTENTION', ATTN_X + (ATTN_W - 1) / 2, SIG_Y + 4.5, { align: 'center', baseline: 'middle' });
  doc.setFontSize(5);
  doc.text('NEXT GAS SAFETY CHECK DUE', ATTN_X + (ATTN_W - 1) / 2, SIG_Y + 8, { align: 'center', baseline: 'middle' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(220, 38, 38);
  doc.text(d.next_check_date || '', ATTN_X + (ATTN_W - 1) / 2, SIG_Y + SIG_H / 2 + 2, { align: 'center', baseline: 'middle' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.setTextColor(107, 87, 14);
  const attn = 'This certificate must be kept safe and shown to your gas engineer at the next inspection.';
  const al = doc.splitTextToSize(attn, ATTN_W - 6);
  al.forEach((l, i) => doc.text(l, ATTN_X + 3, SIG_Y + SIG_H - 10 + i * 3));

  // Footer
  box(PL, FOOTER_Y, CW, FOOTER_H, AMBER_LIGHT, NBORDER, 0.4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(...NAVY);
  const footText = 'This Gas Safety Record is issued under the Gas Safety (Installation & Use) Regulations 1998. A copy must be provided to the landlord/owner and, where applicable, to the tenant within 28 days of the check or at the start of a new tenancy.';
  const fl = doc.splitTextToSize(footText, CW - 8);
  fl.slice(0, 2).forEach((l, i) => doc.text(l, PL + 4, FOOTER_Y + 2.5 + i * 3, { baseline: 'top' }));

  // PAGE 2
  doc.addPage('a4', 'landscape');
  box(PL, PT, CW, 9, NAVY);
  txt('APPLIANCE INSPECTION DETAILS', PL + 4, PT + 4.5, 10, WHITE, true);
  txt('CERT REF:', PL + CW - 55, PT + 3, 5.8, [219, 234, 254], true);
  txt(ref, PL + CW - 30, PT + 4.5, 7.5, WHITE, true);

  const APP_FRACS = [3.5, 8, 8, 8.5, 6.5, 7, 5, 5, 7.5, 7, 6, 6, 5.5, 7, 5, 4.5];
  const APP_TOT = APP_FRACS.reduce((a, b) => a + b, 0);
  const APP_UNIT = CW / APP_TOT;
  const APP_HDR_LABELS = ['App\nNo.', 'Location', 'Type', 'Manufacturer', 'Model', 'Owned by\nLandlord?', 'Inspected?', 'Flue\nType', 'Op. Pressure\n(mbar)', 'Safety\nDevices', 'Ventilation\nChecks', 'Visual\nCondition', 'Flue\nFlow', 'Combustion\nReading', 'Serviced?', 'Safe to\nUse?'];
  const IS_IMPORTANT = [false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true];

  const APP_HDR_H = 14, APP_HDR_Y = PT + 11;
  box(PL, APP_HDR_Y, CW, APP_HDR_H, NAVY);
  let ax = PL;
  APP_FRACS.forEach((fr, i) => {
    const cw = fr * APP_UNIT;
    if (IS_IMPORTANT[i]) { box(ax, APP_HDR_Y, cw, APP_HDR_H, [40, 70, 110]); }
    if (i > 0) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.15); doc.line(ax, APP_HDR_Y, ax, APP_HDR_Y + APP_HDR_H); }
    const parts = APP_HDR_LABELS[i].split('\n');
    const lineH = 3.2, totalH = parts.length * lineH;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.3); doc.setTextColor(...WHITE);
    parts.forEach((p, pi) => doc.text(p, ax + cw / 2, APP_HDR_Y + APP_HDR_H / 2 - totalH / 2 + pi * lineH + 1.6, { align: 'center', baseline: 'middle' }));
    ax += cw;
  });

  const APPS = (d.appliances || []).filter(a => a && (a.location || a.type || a.make));
  const CO_H = 7;
  const AVAIL_H = 200 - APP_HDR_Y - APP_HDR_H - 4;
  const APP_ROW_H = Math.min(20, APPS.length > 0 ? Math.floor((AVAIL_H - (APPS.length * (CO_H + 2))) / APPS.length) : 20);
  let ARY = APP_HDR_Y + APP_HDR_H + 1;

  APPS.forEach((app, ai) => {
    const APP_DATA = [String(ai + 1), app.location || '', app.type || '', app.make || '', app.model || '', app.ownership || '', app.inspected || '', app.flue_type || '', app.op_pressure || '', app.safety_devices || '', app.ventilation || '', app.visual_condition || '', app.flue_flow || '', app.combustion || '', app.serviced || '', app.safe_to_use || ''];
    box(PL, ARY, CW, APP_ROW_H, WHITE, NBORDER, 0.4);
    ax = PL;
    APP_FRACS.forEach((fr, i) => {
      const cw = fr * APP_UNIT;
      if (i === 0) { box(ax, ARY, cw, APP_ROW_H, LGRAY); }
      if (i > 0) { doc.setDrawColor(...NBORDER); doc.setLineWidth(0.2); doc.line(ax, ARY, ax, ARY + APP_ROW_H); }
      const val = APP_DATA[i] || '';
      if (val) {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        doc.setFontSize(i === 0 ? 8 : 7);
        doc.setTextColor(...(i === 0 ? NAVY : DARK));
        const vl = doc.splitTextToSize(val, cw - 3);
        const lh = (i === 0 ? 8 : 7) * 0.3528 + 1.1;
        const th = vl.length * lh;
        vl.forEach((s, vi) => doc.text(s, ax + cw / 2, ARY + APP_ROW_H / 2 - th / 2 + vi * lh + lh * 0.5, { align: 'center', baseline: 'middle' }));
      }
      ax += cw;
    });
    ARY += APP_ROW_H;

    const CO_W = CW * 0.55;
    box(PL, ARY, CO_W, CO_H, AMBER_LIGHT, NBORDER, 0.4);
    box(PL, ARY, 8, CO_H, AMBER);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(4.8); doc.setTextColor(...WHITE);
    doc.text('CO', PL + 4, ARY + CO_H / 2, { align: 'center', baseline: 'middle' });
    const CO_ITEMS = [['CO Alarm Fitted?', app.co_alarm_fitted || ''], ['In Date?', app.co_alarm_in_date || ''], ['Tested?', app.co_alarm_test || '']];
    let cox = PL + 10;
    const CO_SEG = (CO_W - 10) / 3;
    CO_ITEMS.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.setTextColor(100, 116, 139);
      doc.text(lbl, cox, ARY + 2.2, { baseline: 'top' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
      doc.text(String(val), cox, ARY + CO_H - 1.8, { baseline: 'bottom' });
      cox += CO_SEG;
    });
    ARY += CO_H + 2;
  });

  if (!APPS.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MED);
    doc.text('No appliances recorded.', PL + CW / 2, APP_HDR_Y + APP_HDR_H + 15, { align: 'center' });
  }

  return doc;
}

// ── html2canvas fallback renderer ────────────────────────

export async function _buildCP12PdfFromHTML(returnB64 = false) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const _pdfWrap = document.getElementById('cp12Wrap');
  const _pdfPrevZoom = _pdfWrap ? _pdfWrap.style.zoom : '';
  const _pdfWasHidden = _pdfWrap && _pdfWrap.style.display === 'none';
  if (_pdfWrap) { _pdfWrap.style.zoom = '1'; if (_pdfWasHidden) { _pdfWrap.style.display = ''; void _pdfWrap.offsetHeight; } }
  const pageIds = ['page1', 'page2'];
  try {
    for (let i = 0; i < pageIds.length; i++) {
      if (i > 0) doc.addPage('a4', 'landscape');
      const livePage = document.getElementById(pageIds[i]);
      if (!livePage) continue;
      const fieldSnap = {};
      livePage.querySelectorAll('[data-field]').forEach(el => {
        if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        const cs = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        fieldSnap[el.dataset.field] = {
          value: el.value || '', isTA: el.tagName === 'TEXTAREA',
          w: r.width, h: r.height,
          fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
          color: cs.color, background: cs.backgroundColor,
          ptop: cs.paddingTop, pright: cs.paddingRight, pbottom: cs.paddingBottom, pleft: cs.paddingLeft,
          lineHeight: cs.lineHeight, textAlign: cs.textAlign,
          btop: cs.borderTop, bright: cs.borderRight, bbottom: cs.borderBottom, bleft: cs.borderLeft,
          display: cs.display, verticalAlign: cs.verticalAlign
        };
      });
      function _snapEl(el) {
        const cs = window.getComputedStyle(el), r = el.getBoundingClientRect();
        return { value: el.value || '', isTA: el.tagName === 'TEXTAREA', w: r.width, h: r.height, fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, background: cs.backgroundColor, ptop: cs.paddingTop, pright: cs.paddingRight, pbottom: cs.paddingBottom, pleft: cs.paddingLeft, lineHeight: cs.lineHeight, textAlign: cs.textAlign, btop: cs.borderTop, bright: cs.borderRight, bbottom: cs.borderBottom, bleft: cs.borderLeft, display: cs.display, verticalAlign: cs.verticalAlign };
      }
      const _llName = livePage.querySelector('#cp12-ll-name'); if (_llName) fieldSnap['__ll_name'] = _snapEl(_llName);
      const _llAddr = livePage.querySelector('.address-main-ll'); if (_llAddr) fieldSnap['__ll_addr'] = _snapEl(_llAddr);
      const sigSnap = {};
      livePage.querySelectorAll('canvas.sig-canvas').forEach(c => {
        const f = c.dataset.sigField;
        const id = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        const hasInk = Array.from(id.data).some((v, j) => j % 4 !== 3 && v !== 0);
        sigSnap[f] = { dataUrl: hasInk ? c.toDataURL('image/png') : null, className: c.className, style: c.style.cssText };
      });
      const ccSnap = {};
      livePage.querySelectorAll('.choice-cycle[data-group]').forEach(btn => {
        const cs = window.getComputedStyle(btn);
        ccSnap[btn.dataset.group] = { text: btn.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, fontFamily: cs.fontFamily };
      });
      const appNumSnaps = [];
      livePage.querySelectorAll('input.appliance-number-input').forEach(inp => { appNumSnaps.push({ value: inp.value, snap: _snapEl(inp) }); });
      const canvas = await window.html2canvas(livePage, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
        logging: false, imageTimeout: 5000,
        onclone: (clonedDoc, clonedEl) => {
          Object.entries(ccSnap).forEach(([grp, snap]) => {
            const btn = clonedEl.querySelector(`.choice-cycle[data-group="${grp}"]`);
            if (!btn) return;
            const span = clonedDoc.createElement('span');
            span.textContent = snap.text;
            span.style.cssText = `font-size:${snap.fontSize};font-weight:${snap.fontWeight};color:${snap.color};font-family:${snap.fontFamily};display:inline-block;text-align:center;white-space:nowrap;`;
            btn.parentNode.replaceChild(span, btn);
          });
          clonedEl.querySelectorAll('.no-print,.copy-address-btn,.sig-clear-btn,.inline-history-section,.fast-date-drum,input[type="file"],button,.co-hanger').forEach(el => el.remove());
          clonedEl.querySelectorAll('.choice-group input[type="hidden"]').forEach(inp => inp.remove());
          clonedEl.querySelectorAll('canvas.sig-canvas').forEach(c => {
            const f = c.dataset.sigField; const s = sigSnap[f];
            if (!s) return;
            let rep;
            if (s.dataUrl) { rep = clonedDoc.createElement('img'); rep.src = s.dataUrl; rep.className = s.className; rep.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;'; }
            else { rep = clonedDoc.createElement('span'); rep.className = s.className; rep.style.cssText = s.style; }
            c.parentNode.replaceChild(rep, c);
          });
          clonedEl.querySelectorAll('input[data-field],textarea[data-field]').forEach(el => {
            const fd = fieldSnap[el.dataset.field];
            if (!fd) { el.style.visibility = 'hidden'; return; }
            const div = clonedDoc.createElement('div');
            div.style.cssText = [`font-family:${fd.fontFamily}`, `font-size:${fd.fontSize}`, `font-weight:${fd.fontWeight}`, `color:${fd.color}`, `background:${fd.background}`, `padding-top:${fd.ptop}`, `padding-right:${fd.pright}`, `padding-bottom:${fd.pbottom}`, `padding-left:${fd.pleft}`, `width:${fd.w}px`, `height:${fd.h}px`, `line-height:${fd.lineHeight}`, `text-align:${fd.textAlign}`, `border-top:${fd.btop}`, `border-right:${fd.bright}`, `border-bottom:${fd.bbottom}`, `border-left:${fd.bleft}`, `box-sizing:border-box`, `white-space:${fd.isTA ? 'pre-wrap' : 'nowrap'}`, `word-wrap:break-word`, `overflow:hidden`, ...(fd.isTA ? [`display:block`, `vertical-align:top`] : [`display:flex`, `align-items:center`, `justify-content:${fd.textAlign === 'center' ? 'center' : fd.textAlign === 'right' ? 'flex-end' : 'flex-start'}`])].join(';');
            div.textContent = fd.value;
            el.parentNode.replaceChild(div, el);
          });
          function _mkDiv(clonedDoc, d) {
            const div = clonedDoc.createElement('div');
            div.style.cssText = [`font-family:${d.fontFamily}`, `font-size:${d.fontSize}`, `font-weight:${d.fontWeight}`, `color:${d.color}`, `background:${d.background}`, `padding-top:${d.ptop}`, `padding-right:${d.pright}`, `padding-bottom:${d.pbottom}`, `padding-left:${d.pleft}`, `width:${d.w}px`, `height:${d.h}px`, `line-height:${d.lineHeight}`, `text-align:${d.textAlign}`, `border-top:${d.btop}`, `border-right:${d.bright}`, `border-bottom:${d.bbottom}`, `border-left:${d.bleft}`, `box-sizing:border-box`, `white-space:${d.isTA ? 'pre-wrap' : 'nowrap'}`, `word-wrap:break-word`, `overflow:hidden`, ...(d.isTA ? [`display:block`, `vertical-align:top`] : [`display:flex`, `align-items:center`, `justify-content:${d.textAlign === 'center' ? 'center' : d.textAlign === 'right' ? 'flex-end' : 'flex-start'}`])].join(';');
            div.textContent = d.value; if (!d.isTA && !(d.value || '').trim()) { div.style.cssText += ';height:0;overflow:hidden;padding:0;border:none'; } return div;
          }
          const _llNC = clonedEl.querySelector('#cp12-ll-name'); if (_llNC && fieldSnap['__ll_name']) _llNC.parentNode.replaceChild(_mkDiv(clonedDoc, fieldSnap['__ll_name']), _llNC);
          const _llAC = clonedEl.querySelector('.address-main-ll'); if (_llAC && fieldSnap['__ll_addr']) _llAC.parentNode.replaceChild(_mkDiv(clonedDoc, fieldSnap['__ll_addr']), _llAC);
          [...clonedEl.querySelectorAll('input.appliance-number-input')].forEach((inp, i) => {
            const s = appNumSnaps[i]; if (!s) return;
            const div = clonedDoc.createElement('div');
            div.textContent = s.value;
            div.style.cssText = `font-family:${s.snap.fontFamily};font-size:${s.snap.fontSize};font-weight:${s.snap.fontWeight};color:${s.snap.color};background:transparent;width:${s.snap.w}px;height:${s.snap.h}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;`;
            inp.parentNode.replaceChild(div, inp);
          });
        }
      });
      const q = returnB64 ? 0.88 : 0.97;
      doc.addImage(canvas.toDataURL('image/jpeg', q), 'JPEG', 0, 0, 297, 210);
    }
  } finally {
    if (_pdfWrap) { if (_pdfWasHidden) _pdfWrap.style.display = 'none'; _pdfWrap.style.zoom = _pdfPrevZoom; }
  }
  return doc;
}

export async function buildCP12PdfBase64() {
  const doc = await _buildCP12PdfFromHTML(true);
  return doc.output('datauristring').split(',')[1];
}

export async function downloadCP12PDF(btn) {
  if (!cp12RequireAppliance()) return;
  if (!window.jspdf) { toast('PDF library not loaded', 'error'); return; }
  if (btn) btn.disabled = true;
  showOverlay('Generating PDF…');
  try {
    const doc = await _buildCP12PdfFromHTML(false);
    const ref = cp12Field('cert_ref') || 'DRAFT';
    const filename = `Gas_${ref.replace(/[^\w-]/g, '_')}.pdf`;
    const _gasPdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [new File([_gasPdfBlob], filename, { type: 'application/pdf' })] })) {
      try { await navigator.share({ files: [new File([_gasPdfBlob], filename, { type: 'application/pdf' })], title: filename }); }
      catch (e) { if (e.name !== 'AbortError') { doc.save(filename); toast('PDF downloaded ✓', 'success'); } }
    } else { doc.save(filename); toast('PDF downloaded ✓', 'success'); }
    if (state.editingGasId) await logAppEvent('PDF_DOWNLOADED', 'gas', state.editingGasId, ref);
  } catch (e) { toast('PDF error: ' + e.message, 'error'); }
  finally { hideOverlay(); if (btn) btn.disabled = false; }
}
