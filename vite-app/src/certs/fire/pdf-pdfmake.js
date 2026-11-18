// pdfmake-based PDF builder for fire alarm certificates (Phase 3)
// Direct download, no print dialog, vector text, ~100 KB output.

import { getSetting } from '../../lib/settings.js';

// ── Colours ────────────────────────────────────────────────────────────────
const RED     = '#7f1d1d';
const RED_MID = '#c01818';
const RED_LT  = '#fef2f2';
const GREEN   = '#166534';
const GREEN_BG = '#dcfce7';
const AMBER   = '#92400e';
const AMBER_BG = '#fef3c7';
const BLUE    = '#1e3a5f';
const TXT     = '#1c1917';
const MUTED   = '#6b7280';
const BORDER  = '#e2d4d4';
const BG_ROW  = '#fdfaf8';
const BG_ALT  = '#fdf5ef';

// ── Domestic schedule ──────────────────────────────────────────────────────
const DOM_SCHED = [
  ['A — Control Equipment',[
    ['cie_visual','Control equipment — visual indicators operational'],
    ['cie_fault','Fault indication functional'],
    ['cie_weekly_log','Weekly test log reviewed and up to date'],
  ]],
  ['B — Power Supply',[
    ['ps_mains','Mains supply confirmed operational'],
    ['ps_bat','Standby battery / PSU condition satisfactory'],
    ['ps_bat_volt','Battery voltage measured and confirmed'],
  ]],
  ['C — Detectors & Devices',[
    ['det_smoke_opt','Smoke detectors (optical) tested and responding'],
    ['det_smoke_ion','Smoke detectors (ionisation) tested and responding'],
    ['det_heat','Heat detectors tested and responding'],
    ['det_co','CO detectors tested (or confirmed N/A)'],
    ['det_multi','Multi-sensor detectors tested (if installed)'],
  ]],
  ['D — Warning Devices',[
    ['snd_sounders','Sounders tested — audible throughout property'],
    ['snd_interlink','Interlink confirmed — all devices sound when one activates'],
  ]],
  ['E — Cables & Installation',[
    ['inst_cables','Cable condition satisfactory — no damage or deterioration'],
    ['inst_fixings','Detector mountings and fixings secure'],
    ['inst_positions','Detector positions appropriate — not obstructed or contaminated'],
    ['inst_coverage','Escape route coverage complete per system specification'],
  ]],
  ['F — Documentation',[
    ['doc_logbook','Log book / maintenance record available and entries current'],
    ['doc_user_docs','User instructions and operating documentation present on-site'],
  ]],
];

// ── Commercial schedule ────────────────────────────────────────────────────
const COM_SCHED = [
  ['A — Control & Indicating Equipment',[
    ['cie_visual','CIE — all zone and status indicators operational'],
    ['cie_fault','Fault indicators operational — fault log reviewed'],
    ['cie_ack','Acknowledge / silence / reset controls functional'],
    ['cie_weekly','Weekly test log reviewed and up to date'],
    ['cie_printer','Printer / event log operational (if installed)'],
    ['cie_remote','Remote CIE terminals operational (if installed)'],
    ['cie_cause_effect','Cause and effect programming verified correct'],
  ]],
  ['B — Power Supply',[
    ['ps_mains','Mains supply confirmed operational — voltage measured'],
    ['ps_bat_term','Battery terminals and connections inspected and clean'],
    ['ps_bat_volt','Battery voltage measured and recorded'],
    ['ps_bat_dur','Standby battery duration test satisfactory'],
    ['ps_bat_charge','Battery charging current confirmed correct'],
  ]],
  ['C — Manual Call Points',[
    ['mcp_tested','Manual call points — all tested (or rotation basis confirmed)'],
    ['mcp_glass','Break glass elements — all intact'],
    ['mcp_map','Call point positions match zone map / as-fitted drawings'],
  ]],
  ['D — Automatic Detectors',[
    ['det_smoke','Smoke detectors — functional test satisfactory'],
    ['det_heat','Heat detectors — functional test satisfactory'],
    ['det_multi','Multi-sensor detectors — functional test satisfactory'],
    ['det_beam','Beam detectors — aligned and tested (if installed)'],
    ['det_aspirating','Aspirating detection system tested (if installed)'],
    ['det_linear','Linear heat detection tested (if installed)'],
    ['det_rotation','Rotation testing schedule confirmed and documented'],
  ]],
  ['E — Warning Devices',[
    ['snd_sounders','All sounders tested — audible throughout premises'],
    ['snd_spl','Sounder dB levels measured and confirmed adequate'],
    ['snd_vad','Visual alarm devices (VADs) tested and operational'],
    ['snd_voice','Voice alarm system tested (if installed)'],
  ]],
  ['F — Ancillary & Interface Devices',[
    ['anc_zone_iso','Zone isolation tested and correctly restored'],
    ['anc_fault_sim','Fault simulation tested and panel cleared'],
    ['anc_arc','ARC signal transmission confirmed (if monitored)'],
    ['anc_aov','Smoke control / AOV interface tested (if installed)'],
    ['anc_lift','Lift recall interface tested (if installed)'],
    ['anc_door','Door holders / closers released and held on alarm'],
    ['anc_access','Access control interface tested (if installed)'],
    ['anc_em_light','Emergency lighting interface tested (if installed)'],
    ['anc_refuge','Disabled refuge alarm interface tested (if installed)'],
    ['anc_hvac','HVAC / air handling shutdown tested (if installed)'],
  ]],
  ['G — Documentation',[
    ['doc_drawings','As-installed drawings present and up to date'],
    ['doc_cause_effect','Cause and effect documentation available on-site'],
    ['doc_logbook','Fire alarm log book present — entries current'],
    ['doc_repair','24-hour emergency callout arrangements confirmed in writing'],
    ['doc_om_manuals',"O&M manuals / manufacturer's instructions present on site"],
    ['doc_zone_chart','Zone chart / schedule of devices available on site'],
  ]],
];

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(v) { return String(v == null ? '' : v); }

function fmtDate(d) {
  if (!d) return '—';
  try {
    const p = d.split('/');
    if (p.length === 3) {
      return new Date(+p[2], +p[1]-1, +p[0])
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  } catch(_) {}
  return d;
}

// pdfmake inline text for PASS/FAIL/N/A
function resultText(v) {
  if (!v) return { text: '—', color: MUTED, fontSize: 7.5 };
  const u = String(v).toUpperCase();
  if (u === 'PASS') return { text: 'PASS', color: GREEN, bold: true, fontSize: 7.5 };
  if (u === 'FAIL') return { text: 'FAIL', color: RED_MID, bold: true, fontSize: 7.5 };
  if (u === 'N/A')  return { text: 'N/A',  color: MUTED, fontSize: 7.5 };
  if (v === 'Tested OK' || u === 'TESTED OK') return { text: 'Tested OK', color: GREEN, bold: true, fontSize: 7.5 };
  return { text: esc(v), fontSize: 7.5 };
}

// Section header row (single-cell table)
function secHead(title) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: title, fontSize: 8, bold: true, color: '#f8edcc', fillColor: RED, margin: [8, 4, 8, 4] }]]
    },
    layout: 'noBorders',
    margin: [0, 10, 0, 0],
  };
}

// Two-column key-value table (up to 2 pairs per row)
function kvTable(pairs) {
  if (!pairs || !pairs.length) return null;
  const body = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1];
    const row = [
      { text: esc(a[0]), fontSize: 7.5, color: MUTED, bold: true, margin: [0, 2, 4, 2] },
      { text: esc(a[1]) || '—', fontSize: 8, color: TXT, margin: [0, 2, 8, 2] },
    ];
    if (b) {
      row.push({ text: esc(b[0]), fontSize: 7.5, color: MUTED, bold: true, margin: [0, 2, 4, 2] });
      row.push({ text: esc(b[1]) || '—', fontSize: 8, color: TXT, margin: [0, 2, 0, 2] });
    } else {
      row.push({ text: '', colSpan: 2 }, {});
    }
    body.push(row);
  }
  return {
    table: {
      widths: ['auto', '*', 'auto', '*'],
      body,
    },
    layout: {
      hLineWidth: (i, n) => (i === 0 || i === n.table.body.length) ? 0.5 : 0.3,
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      fillColor: (row) => (row % 2 === 0 ? BG_ROW : '#fff'),
    },
    margin: [0, 2, 0, 0],
  };
}

// Full-width key-value row (for long text fields)
function kvFullRow(label, value) {
  return {
    table: {
      widths: ['auto', '*'],
      body: [[
        { text: esc(label), fontSize: 7.5, color: MUTED, bold: true, margin: [0, 2, 8, 2] },
        { text: esc(value) || '—', fontSize: 8, color: TXT, margin: [0, 2, 0, 2] },
      ]],
    },
    layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER, fillColor: () => BG_ROW },
    margin: [0, 2, 0, 0],
  };
}

// Is a data URI a raster image (PNG or JPEG)?
function isRasterDataUri(s) {
  if (!s || typeof s !== 'string') return false;
  return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s);
}

// ── Main document builder ──────────────────────────────────────────────────
function buildFirePdfDef(r, siteHistory) {
  const isComm = r.certType === 'FA.3' || r.certType === 'FA.4';

  // ── Settings ──
  const coName  = getSetting('fire_co_name')  || '';
  const coAddr  = getSetting('fire_co_address') || '';
  const coPost  = getSetting('fire_co_postcode') || '';
  const coPhone = getSetting('fire_co_phone') || '';
  const coEmail = getSetting('fire_co_email') || '';
  const logoRaw  = getSetting('fire_logo_data', getSetting('pat_logo_data', ''));
  const logo2Raw = getSetting('fire_niceic_logo', getSetting('pat_logo2_data', ''));
  const sigRaw   = r.enggSigData || getSetting('fire_engg_sig_data', '');
  const bafe     = getSetting('fa_bafe_reg_no') || '';
  const liab     = getSetting('fa_liability_statement') || '';
  const engrReg  = r.engineerRegNo || getSetting('fa_engineer_reg_no', '');

  // ── Cert core ──
  const ref       = esc(r.ref || r.refNumber || r.ref_number || '');
  const tDate     = fmtDate(r.testDate);
  const certLabel = { 'FA.1':'Fire Alarm Certificate','FA.2':'Fire Alarm Inspection Certificate',
                      'FA.3':'Fire Detection & Alarm Certificate','FA.4':'Fire Alarm Service Certificate' }[r.certType] || 'Fire Alarm Certificate';
  const standard  = (r.certType === 'FA.3' || r.certType === 'FA.4') ? 'BS 5839-1:2025' : 'BS 5839-6:2019';

  // ── Addresses ──
  const premAddr = [r.premAddr1, r.premAddr2, r.premAddr3, r.premPostcode].filter(Boolean);
  const clientAddr = [r.clientAddr1, r.clientAddr2, r.clientAddr3, r.clientPostcode].filter(Boolean);

  // ── Outcome ──
  const sat     = (r.outcome || '').toLowerCase() === 'satisfactory' || (r.outcome || '').toLowerCase() === 'pass';
  const devFail = parseInt(r.detFail || 0, 10);

  // ── Content array ──────────────────────────────────────────────────────────
  const content = [];

  // ── HEADER ──────────────────────────────────────────────────────────────
  // Top red strip
  content.push({
    canvas: [{ type: 'rect', x: 0, y: 0, w: 523, h: 6, color: RED }],
    margin: [0, 0, 0, 6],
  });

  // Logo row + company info + cert title
  const logoCol = isRasterDataUri(logoRaw)
    ? { image: logoRaw, width: 60, maxHeight: 40, margin: [0, 0, 10, 0] }
    : { text: '', width: 60, margin: [0, 0, 10, 0] };

  const logo2Col = isRasterDataUri(logo2Raw)
    ? { image: logo2Raw, width: 50, maxHeight: 36, alignment: 'right', margin: [4, 0, 0, 0] }
    : { text: bafe ? `BAFE\n${bafe}` : '', fontSize: 7, color: MUTED, alignment: 'right', margin: [4, 0, 0, 0] };

  content.push({
    columns: [
      logoCol,
      {
        stack: [
          { text: coName || 'Fire Alarm Certificate', fontSize: coName ? 12 : 10, bold: true, color: RED },
          ...(coAddr ? [{ text: coAddr + (coPost ? ', ' + coPost : ''), fontSize: 8, color: MUTED, margin: [0, 1, 0, 0] }] : []),
          ...((coPhone || coEmail) ? [{ text: [coPhone, coEmail].filter(Boolean).join('  ·  '), fontSize: 7.5, color: MUTED, margin: [0, 1, 0, 0] }] : []),
        ],
        margin: [0, 0, 0, 0],
      },
      {
        stack: [
          logo2Col,
        ],
        width: 60,
        alignment: 'right',
      },
    ],
    columnGap: 0,
    margin: [0, 0, 0, 8],
  });

  // Cert type banner
  content.push({
    table: {
      widths: ['*', 'auto', 'auto'],
      body: [[
        { text: certLabel, fontSize: 13, bold: true, color: '#fff', fillColor: RED, margin: [10, 6, 0, 6] },
        { text: 'Ref: ' + ref, fontSize: 9, color: '#fde0d0', fillColor: RED, margin: [0, 8, 8, 6], alignment: 'right' },
        { text: standard, fontSize: 7.5, color: '#fde0d0', fillColor: RED, margin: [0, 8, 10, 6], alignment: 'right' },
      ]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10],
  });

  // Date bar
  content.push({
    table: {
      widths: ['auto', '*', 'auto', 'auto'],
      body: [[
        { text: 'Date of Visit', fontSize: 7.5, bold: true, color: MUTED, margin: [0, 3, 8, 3] },
        { text: tDate, fontSize: 8.5, bold: true, color: TXT, margin: [0, 3, 0, 3] },
        { text: 'Engineer', fontSize: 7.5, bold: true, color: MUTED, margin: [8, 3, 8, 3] },
        { text: esc(r.engineerName) || '—', fontSize: 8.5, color: TXT, margin: [0, 3, 0, 3] },
      ]],
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => BORDER, fillColor: () => BG_ROW },
    margin: [0, 0, 0, 8],
  });

  // ── PREMISES & CLIENT ──────────────────────────────────────────────────
  content.push({
    columns: [
      {
        stack: [
          { text: 'Premises', fontSize: 8, bold: true, color: RED, margin: [0, 0, 0, 3] },
          ...(r.premisesName ? [{ text: r.premisesName, fontSize: 8.5, bold: true, color: TXT }] : []),
          { text: premAddr.join('\n') || '—', fontSize: 8, color: TXT, lineHeight: 1.4 },
          ...(r.premisesType ? [{ text: r.premisesType, fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 0] }] : []),
        ],
        margin: [0, 0, 8, 0],
      },
      {
        stack: [
          { text: 'Client / Contact', fontSize: 8, bold: true, color: RED, margin: [0, 0, 0, 3] },
          ...(r.clientName ? [{ text: r.clientName, fontSize: 8.5, bold: true, color: TXT }] : []),
          ...(clientAddr.length ? [{ text: clientAddr.join('\n'), fontSize: 8, color: TXT, lineHeight: 1.4 }] : []),
          ...(r.clientPhone ? [{ text: r.clientPhone, fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 0] }] : []),
          ...(r.clientEmail ? [{ text: r.clientEmail, fontSize: 7.5, color: MUTED }] : []),
        ],
        margin: [8, 0, 0, 0],
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 10],
  });

  // ── OUTCOME PANEL ────────────────────────────────────────────────────────
  const outcomeColor = sat ? GREEN : RED_MID;
  const outcomeBg    = sat ? GREEN_BG : RED_LT;
  const outcomeText  = sat
    ? '✓  System Satisfactory'
    : `✗  Unsatisfactory — ${devFail} device${devFail === 1 ? '' : 's'} recorded as failed`;
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        text: outcomeText,
        fontSize: 11,
        bold: true,
        color: outcomeColor,
        fillColor: outcomeBg,
        margin: [12, 8, 12, 8],
      }]],
    },
    layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => outcomeColor, vLineColor: () => outcomeColor },
    margin: [0, 0, 0, 10],
  });

  // ── SYSTEM DETAILS ───────────────────────────────────────────────────────
  const sysPairs = [];
  if (!isComm) {
    if (r.visitType)       sysPairs.push(['Visit type', r.visitType]);
    if (r.sysCategory)     sysPairs.push(['Category', r.sysCategory]);
    if (r.sysGrade)        sysPairs.push(['Grade', r.sysGrade]);
    if (r.sysPowerSupply)  sysPairs.push(['Power supply', r.sysPowerSupply]);
    if (r.sysInterlinkMethod) sysPairs.push(['Interlink method', r.sysInterlinkMethod]);
    else if (r.sysInterlinked) sysPairs.push(['Interlinked', r.sysInterlinked]);
    if (r.sysDomPanelMake || r.sysDomPanelModel) sysPairs.push(['Control panel', [r.sysDomPanelMake, r.sysDomPanelModel].filter(Boolean).join(' ')]);
    if (r.sysDomZones)     sysPairs.push(['Zones', r.sysDomZones]);
    if (r.sysMfr || r.sysModel) sysPairs.push(['Make / model', [r.sysMfr, r.sysModel].filter(Boolean).join(' ')]);
    if (r.batType)         sysPairs.push(['Battery type', r.batType]);
    if (r.batInstallDate)  sysPairs.push(['Battery installed', r.batInstallDate]);
    if (r.batNextReplacement) sysPairs.push(['Battery replace by', r.batNextReplacement]);
    if (r.installDate)     sysPairs.push(['Installation date', r.installDate]);
    if (r.prevServiceDate) sysPairs.push(['Previous service date', r.prevServiceDate]);
    if (r.prevReportRef)   sysPairs.push(['Previous report ref', r.prevReportRef]);
    if (r.designRef)       sysPairs.push(['Design / scheme ref', r.designRef]);
    if (r.testMethod)      sysPairs.push(['Test method', r.testMethod]);
    if (r.sysOperational)  sysPairs.push(['System operational at leaving', r.sysOperational]);
    if (r.nextInspDate)    sysPairs.push(['Next inspection due', fmtDate(r.nextInspDate)]);
  } else {
    if (r.visitType)       sysPairs.push(['Visit type', r.visitType]);
    if (r.sysCategory)     sysPairs.push(['System category', r.sysCategory]);
    if (r.sysCommType)     sysPairs.push(['System type', r.sysCommType]);
    if (r.sysPanelMake || r.sysPanelModel) sysPairs.push(['Control panel', [r.sysPanelMake, r.sysPanelModel].filter(Boolean).join(' ')]);
    if (r.sysZones)        sysPairs.push(['Zones', r.sysZones]);
    if (r.sysLoops)        sysPairs.push(['Loops', r.sysLoops]);
    if (r.sysBafe)         sysPairs.push(['BAFE scheme no.', r.sysBafe]);
    if (r.batType)         sysPairs.push(['Battery type', r.batType]);
    if (r.batInstallDate)  sysPairs.push(['Battery installed', r.batInstallDate]);
    if (r.batNextReplacement) sysPairs.push(['Battery replace by', r.batNextReplacement]);
    if (r.sysCommissionDate) sysPairs.push(['Commissioning date', r.sysCommissionDate]);
    if (r.prevInspDate)    sysPairs.push(['Last full inspection', r.prevInspDate]);
    if (r.cableType)       sysPairs.push(['Cable type', r.cableType]);
    if (r.alarmSignalType) sysPairs.push(['Alarm signal type', r.alarmSignalType]);
    if (r.testMethod)      sysPairs.push(['Test method', r.testMethod]);
    if (r.sysOperational)  sysPairs.push(['System operational at leaving', r.sysOperational]);
    if (r.nextInspDate)    sysPairs.push(['Next inspection due', fmtDate(r.nextInspDate)]);
    if (r.fraRef)          sysPairs.push(['Fire risk assessment ref', r.fraRef]);
    if (r.fraDate)         sysPairs.push(['Fire risk assessment date', r.fraDate]);
  }

  if (sysPairs.length) {
    content.push(secHead('System Details'));
    content.push(kvTable(sysPairs));
  }

  // Long text system fields
  for (const [lbl, fld] of [
    ['Departures / variations', r.departuresNotes],
    ['Parts replaced this visit', r.partsReplaced],
    ['Parts ordered / not yet fitted', r.partsOrdered],
    ['Works carried out', r.worksCarried],
    ['Works recommended', r.worksRecommended],
  ]) {
    if (fld) content.push(kvFullRow(lbl, fld));
  }

  // ── TESTING RESULTS ─────────────────────────────────────────────────────
  const testPairs = [];
  if (!isComm) {
    if (r.tMains)        testPairs.push(['Mains supply test', r.tMains]);
    if (r.tBattery)      testPairs.push(['Battery / PSU standby', r.tBattery]);
    if (r.tFaultSim)     testPairs.push(['Fault simulation test', r.tFaultSim]);
    if (r.tFunctional)   testPairs.push(['Functional test', r.tFunctional]);
    if (r.tInterlinked)  testPairs.push(['Interlinked test', r.tInterlinked]);
    if (r.coAlarmsPresent) testPairs.push(['CO alarms fitted', r.coAlarmsPresent]);
    if (r.tCO)           testPairs.push(['CO alarm test', r.tCO]);
  } else {
    if (r.tMains)        testPairs.push(['Mains supply test', r.tMains]);
    if (r.tMainsVolts)   testPairs.push(['Mains voltage', r.tMainsVolts + ' V']);
    if (r.tBatResult)    testPairs.push(['Battery standby test', r.tBatResult]);
    if (r.tBatDuration)  testPairs.push(['Battery standby duration', r.tBatDuration]);
    if (r.tBatStandbyV)  testPairs.push(['Battery standby voltage', r.tBatStandbyV + ' V']);
    if (r.tBatLoadV)     testPairs.push(['Battery load voltage', r.tBatLoadV + ' V']);
    if (r.tSounder)      testPairs.push(['Sounder / beacon test', r.tSounder]);
    if (r.tSounderDb)    testPairs.push(['Sounder level', r.tSounderDb + ' dB']);
    if (r.tVisual)       testPairs.push(['Visual indicators test', r.tVisual]);
    if (r.tZoneIso)      testPairs.push(['Zone isolation test', r.tZoneIso]);
    if (r.tFaultSim)     testPairs.push(['Fault simulation test', r.tFaultSim]);
    if (r.tKeySwitch)    testPairs.push(['Engineer key switch', r.tKeySwitch]);
  }

  if (testPairs.length) {
    content.push(secHead('Testing Results'));
    // Build testing table with coloured result cells
    const testBody = testPairs.map(([lbl, val]) => [
      { text: esc(lbl), fontSize: 8, color: TXT, margin: [0, 2, 8, 2] },
      {
        table: { widths: [40], body: [[resultText(val)]] },
        layout: 'noBorders',
        alignment: 'center',
        margin: [0, 1, 0, 1],
      },
    ]);
    content.push({
      table: { widths: ['*', 60], body: testBody },
      layout: {
        hLineWidth: () => 0.3,
        vLineWidth: (i) => (i === 1 ? 0.3 : 0),
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
        fillColor: (row) => (row % 2 === 0 ? BG_ROW : '#fff'),
      },
      margin: [0, 2, 0, 0],
    });
  }

  // ── SCHEDULE CHECKLIST ───────────────────────────────────────────────────
  const schedDefs = isComm ? COM_SCHED : DOM_SCHED;
  const schedItems = r.scheduleItems || {};
  const hasSchedData = schedDefs.some(([, items]) => items.some(([id]) => schedItems[id]));

  if (hasSchedData) {
    content.push(secHead('Inspection & Testing Schedule'));
    for (const [secName, items] of schedDefs) {
      const rows = items.map(([id, lbl]) => ({
        item: lbl,
        result: schedItems[id] || '',
      })).filter(row => row.result);
      if (!rows.length) continue;

      content.push({
        table: {
          widths: ['*'],
          body: [[{ text: secName, fontSize: 7.5, bold: true, color: AMBER, margin: [4, 2, 4, 2] }]],
        },
        layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER, fillColor: () => '#fff8ed' },
        margin: [0, 4, 0, 0],
      });

      // Two-up layout: 2 items per row
      const twoUpBody = [];
      for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        const bg = (Math.floor(i / 2) % 2 === 0) ? BG_ROW : '#fff';
        const row = [
          { text: esc(a.item), fontSize: 7.5, color: TXT, margin: [0, 2, 4, 2], fillColor: bg },
          { ...resultText(a.result), fillColor: bg, alignment: 'center', margin: [2, 2, 2, 2] },
        ];
        if (b) {
          row.push({ text: esc(b.item), fontSize: 7.5, color: TXT, margin: [4, 2, 4, 2], fillColor: bg });
          row.push({ ...resultText(b.result), fillColor: bg, alignment: 'center', margin: [2, 2, 2, 2] });
        } else {
          row.push({ text: '', colSpan: 2, fillColor: bg }, {});
        }
        twoUpBody.push(row);
      }
      content.push({
        table: { widths: ['*', 36, '*', 36], body: twoUpBody },
        layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER },
        margin: [0, 0, 0, 2],
      });
    }
  }

  // ── DEVICE TABLE ─────────────────────────────────────────────────────────
  const dets = r.detectors || [];
  if (dets.length) {
    content.push(secHead(`Devices Tested (${r.detTested || dets.length} tested · ${r.detPass || 0} pass · ${r.detFail || 0} fail)`));
    const detHeader = [
      { text: 'Location', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3] },
      { text: 'Type', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3] },
      { text: 'Model', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3] },
      { text: 'Serial', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3] },
      { text: 'Zone', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3] },
      { text: 'Result', fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3], alignment: 'center' },
    ];
    const detRows = dets.map((d, i) => {
      const bg = i % 2 === 0 ? BG_ROW : '#fff';
      return [
        { text: esc(d.location), fontSize: 7.5, color: TXT, margin: [0, 2, 0, 2], fillColor: bg },
        { text: esc(d.type), fontSize: 7.5, color: TXT, margin: [0, 2, 0, 2], fillColor: bg },
        { text: esc(d.model), fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 2], fillColor: bg },
        { text: esc(d.serialNo), fontSize: 7.5, color: MUTED, margin: [0, 2, 0, 2], fillColor: bg },
        { text: esc(d.zone), fontSize: 7.5, color: TXT, margin: [0, 2, 0, 2], fillColor: bg },
        { ...resultText(d.result), fillColor: bg, alignment: 'center', margin: [0, 2, 0, 2] },
      ];
    });
    content.push({
      table: { widths: ['*', 70, 70, 60, 30, 36], body: [detHeader, ...detRows] },
      layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER },
      margin: [0, 2, 0, 0],
    });
  }

  // ── DEFECTS ───────────────────────────────────────────────────────────────
  const defects = r.defects || [];
  if (defects.length || r.defectsNotes) {
    const defTitle = isComm ? 'Details of Deviations from the Standards' : 'Defects & Recommendations';
    content.push(secHead(defTitle));

    if (r.defectsOverall) {
      content.push({ text: `Overall condition: ${r.defectsOverall}`, fontSize: 8, color: TXT, margin: [0, 4, 0, 4], italics: true });
    }

    if (defects.length) {
      const sevColor = { C1: '#7a1010', C2: RED_MID, C3: '#a16207', FI: '#1d4ed8',
                         'Immediate Action': '#7a1010', 'Action Required': '#a16207', Advisory: TXT };
      const defHeader = ['#', 'Description', 'Severity', 'Recommendation', 'Target'].map((h, i) => ({
        text: h, fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3],
        alignment: i === 0 ? 'center' : 'left',
      }));
      const defRows = defects.map((d, i) => {
        const sev = d.severity || 'Advisory';
        const bg = i % 2 === 0 ? BG_ROW : '#fff';
        return [
          { text: String(i + 1), fontSize: 7.5, color: TXT, alignment: 'center', fillColor: bg, margin: [0, 2, 0, 2] },
          { text: esc(d.description), fontSize: 7.5, color: TXT, fillColor: bg, margin: [0, 2, 0, 2] },
          { text: sev, fontSize: 7.5, bold: true, color: sevColor[sev] || TXT, fillColor: bg, margin: [0, 2, 0, 2] },
          { text: esc(d.recommendation), fontSize: 7.5, color: TXT, fillColor: bg, margin: [0, 2, 0, 2] },
          { text: esc(d.targetDate), fontSize: 7.5, color: MUTED, fillColor: bg, margin: [0, 2, 0, 2] },
        ];
      });
      content.push({
        table: { widths: [14, '*', 60, '*', 50], body: [defHeader, ...defRows] },
        layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER },
        margin: [0, 2, 0, 0],
      });
    }

    if (r.defectsNotes) {
      content.push({ text: r.defectsNotes, fontSize: 7.5, color: TXT, margin: [0, 4, 0, 0], italics: true });
    }
  }

  // ── CARRY-FORWARD DEFECTS (FA.4) ─────────────────────────────────────────
  if (r.certType === 'FA.4' && (r.carriedDefects || []).length) {
    const prevLabel = [r._prevCertRef, r._prevCertDate].filter(Boolean).join(' — ');
    content.push(secHead(`Previous Defects — Carry-forward Review${prevLabel ? ' (' + prevLabel + ')' : ''}`));
    const cfHeader = ['Previous defect', 'Prev. severity', 'Resolution this visit'].map(h => ({
      text: h, fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3],
    }));
    const resColor = { Resolved: GREEN, Escalated: RED_MID };
    const cfRows = (r.carriedDefects).map((cd, i) => {
      const bg = i % 2 === 0 ? BG_ROW : '#fff';
      return [
        { text: esc(cd.description), fontSize: 7.5, color: TXT, fillColor: bg, margin: [0, 2, 0, 2] },
        { text: esc(cd.severity || 'C3'), fontSize: 7.5, bold: true, color: '#a16207', fillColor: bg, margin: [0, 2, 0, 2] },
        { text: esc(cd.resolution || 'Not reviewed'), fontSize: 7.5, color: resColor[cd.resolution] || TXT, fillColor: bg, margin: [0, 2, 0, 2] },
      ];
    });
    content.push({
      table: { widths: ['*', 70, 80], body: [cfHeader, ...cfRows] },
      layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER },
      margin: [0, 2, 0, 0],
    });
  }

  // ── SERVICE HISTORY ──────────────────────────────────────────────────────
  if (siteHistory && siteHistory.length) {
    content.push(secHead('Service History for this Property'));
    const histHeader = ['Date', 'Type', 'Outcome', 'Reference'].map(h => ({
      text: h, fontSize: 7.5, bold: true, color: '#fff', fillColor: '#44403c', margin: [0, 3, 0, 3],
    }));
    const outColors = { SATISFACTORY: GREEN, 'REQUIRES ATTENTION': '#d97706', UNSATISFACTORY: RED_MID };
    const histRows = siteHistory.map((h, i) => {
      const out = (h.outcome || '').toUpperCase();
      const bg = i % 2 === 0 ? BG_ROW : '#fff';
      return [
        { text: esc(h.test_date || '—'), fontSize: 7.5, fillColor: bg, margin: [0, 2, 0, 2] },
        { text: esc(h.cert_type || '—'), fontSize: 7.5, fillColor: bg, margin: [0, 2, 0, 2] },
        { text: esc(h.outcome || '—'), fontSize: 7.5, bold: true, color: outColors[out] || TXT, fillColor: bg, margin: [0, 2, 0, 2] },
        { text: esc(h.ref_number || '—'), fontSize: 7.5, color: MUTED, fillColor: bg, margin: [0, 2, 0, 2] },
      ];
    });
    content.push({
      table: { widths: [70, 80, '*', 80], body: [histHeader, ...histRows] },
      layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => BORDER },
      margin: [0, 2, 0, 0],
    });
  }

  // ── DECLARATION ─────────────────────────────────────────────────────────
  content.push(secHead('Declaration'));

  const liabText = liab || 'The inspection described on this certificate has been carried out in accordance with the relevant standard and applicable guidance. This certificate relates only to the system/installation identified and to the work carried out at the time of the inspection.';
  content.push({ text: liabText, fontSize: 7.5, color: TXT, margin: [0, 6, 0, 10], lineHeight: 1.4 });

  // Engineer info
  const engrPairs = [
    ['Engineer', r.engineerName || '—'],
    ['Qualification', r.engineerQual || '—'],
    ...(engrReg ? [['Reg no.', engrReg]] : []),
    ...(bafe ? [['BAFE ref', bafe]] : []),
  ];
  content.push(kvTable(engrPairs));

  // Signatures
  content.push({ text: ' ', margin: [0, 8, 0, 0] });
  const sigCols = [];

  // Engineer signature
  const engrSigBlock = isRasterDataUri(sigRaw)
    ? {
        stack: [
          { image: sigRaw, width: 100, maxHeight: 40 },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5, lineColor: BORDER }] },
          { text: `Engineer: ${esc(r.engineerName) || '—'}`, fontSize: 7, color: MUTED, margin: [0, 2, 0, 0] },
        ],
        margin: [0, 0, 20, 0],
      }
    : {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 40, x2: 180, y2: 40, lineWidth: 0.5, lineColor: BORDER }] },
          { text: `Engineer: ${esc(r.engineerName) || '—'}`, fontSize: 7, color: MUTED, margin: [0, 2, 0, 0] },
        ],
        margin: [0, 0, 20, 0],
      };

  sigCols.push(engrSigBlock);

  // Tenant signature box
  if (r.tenantName) {
    sigCols.push({
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 40, x2: 180, y2: 40, lineWidth: 0.5, lineColor: BORDER }] },
        { text: `Tenant / Occupier: ${esc(r.tenantName)}`, fontSize: 7, color: MUTED, margin: [0, 2, 0, 0] },
      ],
    });
  }

  if (sigCols.length === 1) {
    content.push({ columns: [sigCols[0], {}], columnGap: 10 });
  } else {
    content.push({ columns: sigCols, columnGap: 10 });
  }

  // ── DOCUMENT DEFINITION ──────────────────────────────────────────────────
  return {
    pageSize: 'A4',
    pageMargins: [36, 48, 36, 36],
    content,
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: TXT },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `${coName || 'Fire Alarm Certificate'}  ·  Ref: ${ref}`, fontSize: 6.5, color: MUTED, margin: [36, 8, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 6.5, color: MUTED, alignment: 'right', margin: [0, 8, 36, 0] },
      ],
    }),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function downloadFirePdf(rec, siteHistory) {
  const pdfMakeModule  = await import('pdfmake/build/pdfmake');
  const vfsFontsModule = await import('pdfmake/build/vfs_fonts');
  const pdfMake  = pdfMakeModule.default  || pdfMakeModule;
  const vfsFonts = vfsFontsModule.default || vfsFontsModule;
  pdfMake.vfs = vfsFonts;

  const def = buildFirePdfDef(rec, siteHistory);
  const rawRef = rec.refNumber || rec.ref_number || rec.ref || 'FA';
  const filename = `Fire_Alarm_${String(rawRef).replace(/[\\/:"*?<>|]/g, '-')}.pdf`;
  pdfMake.createPdf(def).download(filename);
}
