import { getSetting } from '../../lib/settings.js';

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export function fireBuildCertHTML(r) {
  var isComm = r.certType === 'FA.3' || r.certType === 'FA.4';

  var typeKicker = { 'FA.1':'Form FA.1 · Annex G', 'FA.2':'Form FA.2 · Annex G', 'FA.3':'Form FA.3', 'FA.4':'Form FA.4' }[r.certType] || 'Fire Alarm Certificate';
  var typeTitle  = { 'FA.1':'Fire Alarm Installation Certificate', 'FA.2':'Fire Alarm Inspection & Service Certificate', 'FA.3':'Fire Alarm Installation / Commissioning Certificate', 'FA.4':'Fire Alarm Service / Verification Certificate' }[r.certType] || 'Fire Alarm Certificate';
  var stdLabel   = isComm ? 'BS 5839-1:2025 — Fire Detection and Alarm Systems for Buildings' : 'BS 5839-6:2019+A1:2020 — Fire detection and alarm systems for dwellings';

  var company        = getSetting('fire_co_name') || getSetting('company_name') || 'OHM Electrical Engineering Ltd';
  var _coAddrRaw     = getSetting('fire_co_address') || getSetting('company_address') || '';
  var _coPostcode    = getSetting('fire_co_postcode') || '';
  var companyAddr    = (_coAddrRaw && _coPostcode && !_coAddrRaw.includes(_coPostcode)) ? _coAddrRaw + ', ' + _coPostcode : _coAddrRaw;
  var companyTel     = getSetting('fire_co_phone') || getSetting('company_tel') || '';
  var companyEmail   = getSetting('fire_co_email') || getSetting('company_email') || '';
  var companyRegNo   = getSetting('fire_co_reg') || getSetting('company_reg_no') || '';
  var companyPiNo    = getSetting('fire_co_pi') || getSetting('company_pi_no') || '';
  var niceicNo       = getSetting('fire_niceic_scheme_no') || getSetting('el_enrol_no') || getSetting('niceic_scheme_no') || '';
  var logoData       = getSetting('fire_logo_data', getSetting('pat_logo_data',''));
  var niceicLogoData = getSetting('fire_niceic_logo', getSetting('pat_logo2_data',''));
  var enggSigData    = r.enggSigData || getSetting('fire_engg_sig_data','') || getSetting('el_sig_data','');

  var premAddr  = [r.premAddr1, r.premAddr2, r.premAddr3, r.premPostcode].filter(Boolean).join(', ');
  var clientAddr= [r.clientAddr1, r.clientAddr2, r.clientAddr3, r.clientPostcode].filter(Boolean).join(', ');
  var hasClient = !!(r.clientName || r.clientAddr1 || r.clientEmail || r.responsiblePerson);
  var issued    = new Date().toLocaleDateString('en-GB');

  // ── Crest ───────────────────────────────────────────────────────────────────
  var crestHtml = logoData
    ? `<img src="${logoData}" style="max-height:52px;max-width:130px;object-fit:contain;flex-shrink:0;display:block">`
    : `<div class="crest">${_esc((company.match(/\b\w/g)||[]).slice(0,3).join(''))}</div>`;

  var coAddrLine   = companyAddr ? _esc(companyAddr.split(/[,\n]/)[0].trim()) : '';
  var coContactLine = [coAddrLine, companyTel ? 'T '+_esc(companyTel) : ''].filter(Boolean).join(' · ');

  var niceicRightHtml = niceicLogoData
    ? `<img src="${niceicLogoData}" alt="NICEIC" style="max-height:44px;max-width:110px;object-fit:contain;display:block">`
    : (niceicNo ? `<div style="text-align:right;font-size:9px;color:#55617a;line-height:1.7">NICEIC Approved Contractor<br>Enrolment No. <strong style="color:var(--ink)">${_esc(niceicNo)}</strong></div>` : '');

  // ── Chips ───────────────────────────────────────────────────────────────────
  function _chipCode(val) { return ((val||'').split(' — ')[0]) || (val||'—'); }
  var chipsArr = [];
  if (!isComm) {
    if (r.sysCategory)   chipsArr.push({k:'Category',   v:_chipCode(r.sysCategory)});
    if (r.sysGrade)      chipsArr.push({k:'Grade',      v:_chipCode(r.sysGrade)});
    if (r.sysPowerSupply)chipsArr.push({k:'Power',      v:_esc(r.sysPowerSupply)});
    if (r.sysInterlinked)chipsArr.push({k:'Interlinked',v:_esc(r.sysInterlinked)});
  } else {
    if (r.sysCategory)   chipsArr.push({k:'Category',   v:_chipCode(r.sysCategory)});
    if (r.sysCommType)   chipsArr.push({k:'Type',       v:_esc(r.sysCommType)});
    if (r.sysZones)      chipsArr.push({k:'Zones',      v:_esc(r.sysZones)});
    if (r.sysLoops)      chipsArr.push({k:'Loops',      v:_esc(r.sysLoops)});
  }
  chipsArr.push({k:'Devices', v:String((r.detectors||[]).length||'0')});
  var chipsHtml = chipsArr.map(c=>`<div class="chip"><div class="ck">${c.k}</div><div class="cv">${c.v}</div></div>`).join('');

  // ── Grid cells page 1 ───────────────────────────────────────────────────────
  var gridCells = '';
  var premDisplay = [r.premisesName, premAddr].filter(Boolean).join(', ');
  gridCells += `<div class="cell"><div class="ck">Premises</div><div class="cv">${_esc(premDisplay||'—')}</div></div>`;
  if (hasClient) {
    var clientDisplay = r.clientName || clientAddr || '—';
    if (r.responsiblePerson && r.responsiblePerson !== r.clientName) clientDisplay += ' (resp: ' + r.responsiblePerson + ')';
    gridCells += `<div class="cell"><div class="ck">Client / Landlord</div><div class="cv">${_esc(clientDisplay)}</div></div>`;
  }
  gridCells += `<div class="cell"><div class="ck">Date of inspection</div><div class="cv">${_esc(r.testDate||'—')}</div></div>`;
  gridCells += `<div class="cell"><div class="ck">Certificate issued</div><div class="cv">${issued}</div></div>`;
  if (r.nextInspDate) gridCells += `<div class="cell"><div class="ck">Next service due</div><div class="cv">${_esc(r.nextInspDate)}</div></div>`;

  // ── Outcome ─────────────────────────────────────────────────────────────────
  var outSat    = (r.outcome||'').toUpperCase() === 'SATISFACTORY';
  var outClass  = outSat ? '' : ' unsat';
  var outcomeDetail = [];
  if (r.sysOperational) outcomeDetail.push(_esc(r.sysOperational));
  if (r.worksCarried)   outcomeDetail.push('Works: ' + _esc(r.worksCarried));
  var outcomeDetailHtml = outcomeDetail.length ? `<div class="on">${outcomeDetail.join('<br>')}</div>` : '';

  // ── Detector table ──────────────────────────────────────────────────────────
  var hasDetModel  = (r.detectors||[]).some(d=>d.model);
  var hasSerialNo  = (r.detectors||[]).some(d=>d.serialNo);
  var hasZone      = isComm && (r.detectors||[]).some(d=>d.zone);
  var hasBatExpiry = !isComm && (r.detectors||[]).some(d=>d.batExpiry);

  var detHeaders = isComm
    ? `<th>#</th><th>Location</th><th>Device type</th>${hasDetModel?'<th>Make / Model</th>':''}${hasSerialNo?'<th>Serial No.</th>':''}${hasZone?'<th>Zone / Circuit</th>':''}<th>Result</th>`
    : `<th>#</th><th>Location</th><th>Device type</th>${hasDetModel?'<th>Make / Model</th>':''}${hasSerialNo?'<th>Serial No.</th>':''}<th>Result</th><th>Battery</th>${hasBatExpiry?'<th>Battery expiry</th>':''}`;

  var detRows = (r.detectors||[]).map(function(d,i){
    var rHtml = d.result==='PASS' ? `<span class="ppill">Pass</span>` : d.result==='FAIL' ? `<span class="fpill">Fail</span>` : _esc(d.result||'—');
    return isComm
      ? `<tr><td>${i+1}</td><td>${_esc(d.location)}</td><td>${_esc(d.type)}</td>${hasDetModel?`<td>${_esc(d.model||'—')}</td>`:''}${hasSerialNo?`<td class="num">${_esc(d.serialNo||'—')}</td>`:''}${hasZone?`<td>${_esc(d.zone||'—')}</td>`:''}<td>${rHtml}</td></tr>`
      : `<tr><td>${i+1}</td><td>${_esc(d.location)}</td><td>${_esc(d.type)}</td>${hasDetModel?`<td>${_esc(d.model||'—')}</td>`:''}${hasSerialNo?`<td class="num">${_esc(d.serialNo||'—')}</td>`:''}<td>${rHtml}</td><td>${_esc(d.batReplaced||'—')}</td>${hasBatExpiry?`<td>${_esc(d.batExpiry||'—')}</td>`:''}</tr>`;
  }).join('');

  // ── Test results ────────────────────────────────────────────────────────────
  function _tRow(label, val) {
    if (!val) return '';
    var rHtml = val==='PASS' ? `<span class="ppill">Pass</span>` : val==='FAIL' ? `<span class="fpill">Fail</span>` : _esc(val);
    return `<tr><td>${_esc(label)}</td><td>${rHtml}</td></tr>`;
  }
  var testRows = '';
  if (!isComm) {
    testRows += _tRow('Functional test', r.tFunctional);
    testRows += _tRow('Interlinked test', r.tInterlinked);
    testRows += _tRow('Battery backup / standby', r.tBattery);
    testRows += _tRow('CO alarms fitted', r.coAlarmsPresent);
    if (r.coAlarmsPresent === 'N/A' && r.coAlarmNaReason) testRows += `<tr><td>CO alarm N/A reason</td><td>${_esc(r.coAlarmNaReason)}</td></tr>`;
    testRows += _tRow('CO alarm test', r.tCO);
  } else {
    testRows += _tRow('Mains supply test', r.tMains);
    if (r.tMainsVolts) testRows += `<tr><td>Mains voltage</td><td>${_esc(r.tMainsVolts)} V</td></tr>`;
    testRows += _tRow('Battery standby test', r.tBatResult);
    if (r.tBatDuration) testRows += `<tr><td>Battery standby duration</td><td>${_esc(r.tBatDuration)}</td></tr>`;
    if (r.tBatVolts)   testRows += `<tr><td>Battery voltage</td><td>${_esc(r.tBatVolts)} V</td></tr>`;
    testRows += _tRow('Sounder / beacon test', r.tSounder);
    if (r.tSounderDb)  testRows += `<tr><td>Sounder level</td><td>${_esc(r.tSounderDb)} dB</td></tr>`;
    testRows += _tRow('Visual indicators test', r.tVisual);
    testRows += _tRow('Zone isolation test', r.tZoneIso);
    testRows += _tRow('Fault simulation test', r.tFaultSim);
    testRows += _tRow('Engineer key switch', r.tKeySwitch);
  }

  // ── System details grid ─────────────────────────────────────────────────────
  var sysDetailCells = '';
  if (!isComm) {
    if (r.sysCategory)   sysDetailCells += `<div class="cell"><div class="ck">Category</div><div class="cv">${_esc(r.sysCategory)}</div></div>`;
    if (r.sysGrade)      sysDetailCells += `<div class="cell"><div class="ck">Grade</div><div class="cv">${_esc(r.sysGrade)}</div></div>`;
    if (r.sysCoverage)   sysDetailCells += `<div class="cell"><div class="ck">Coverage</div><div class="cv">${_esc(r.sysCoverage)}</div></div>`;
    if (r.sysPowerSupply)sysDetailCells += `<div class="cell"><div class="ck">Power supply</div><div class="cv">${_esc(r.sysPowerSupply)}</div></div>`;
    if (r.sysInterlinked)sysDetailCells += `<div class="cell"><div class="ck">Interlinked</div><div class="cv">${_esc(r.sysInterlinked)}</div></div>`;
    if (r.sysMfr||r.sysModel) sysDetailCells += `<div class="cell"><div class="ck">Make / model</div><div class="cv">${_esc([r.sysMfr,r.sysModel].filter(Boolean).join(' '))}</div></div>`;
    if (r.installDate)   sysDetailCells += `<div class="cell"><div class="ck">Installation date</div><div class="cv">${_esc(r.installDate)}</div></div>`;
    if (r.departuresNotes) sysDetailCells += `<div class="cell" style="grid-column:1/-1"><div class="ck">Departures / variations</div><div class="cv">${_esc(r.departuresNotes)}</div></div>`;
  } else {
    if (r.sysCategory)  sysDetailCells += `<div class="cell"><div class="ck">System category</div><div class="cv">${_esc(r.sysCategory)}</div></div>`;
    if (r.sysCommType)  sysDetailCells += `<div class="cell"><div class="ck">System type</div><div class="cv">${_esc(r.sysCommType)}</div></div>`;
    if (r.sysPanelMake||r.sysPanelModel) sysDetailCells += `<div class="cell"><div class="ck">Control panel</div><div class="cv">${_esc([r.sysPanelMake,r.sysPanelModel].filter(Boolean).join(' '))}</div></div>`;
    if (r.sysZones)     sysDetailCells += `<div class="cell"><div class="ck">Zones</div><div class="cv">${_esc(r.sysZones)}</div></div>`;
    if (r.sysLoops)     sysDetailCells += `<div class="cell"><div class="ck">Loops</div><div class="cv">${_esc(r.sysLoops)}</div></div>`;
    if (r.sysBafe)      sysDetailCells += `<div class="cell"><div class="ck">BAFE scheme no.</div><div class="cv">${_esc(r.sysBafe)}</div></div>`;
    if (r.sysFia)       sysDetailCells += `<div class="cell"><div class="ck">FIA member no.</div><div class="cv">${_esc(r.sysFia)}</div></div>`;
  }

  // ── Defects ─────────────────────────────────────────────────────────────────
  var SEV_STYLES = {ADVISORY:'',MINOR:'color:#a16207;font-weight:600',MAJOR:'color:#b91c1c;font-weight:700',CRITICAL:'color:#7f1d1d;font-weight:700'};
  var hasDefects = (r.defects||[]).length > 0 || r.defectsNotes;
  var defectsHtml = '';
  if (hasDefects) {
    var defRows = (r.defects||[]).map((d,i)=>{
      var sev = d.severity||'ADVISORY';
      return `<tr><td>${i+1}</td><td>${_esc(d.description)}</td><td style="${SEV_STYLES[sev]||''}">${_esc(sev)}</td><td>${_esc(d.recommendation)}</td></tr>`;
    }).join('');
    defectsHtml = `
    <div class="sec"><h3>Defects &amp; Recommendations</h3></div>
    ${r.defectsOverall?`<div class="rec" style="margin-bottom:10px"><b>Overall condition:</b> ${_esc(r.defectsOverall)}</div>`:''}
    ${defRows?`<table><thead><tr><th>#</th><th>Description</th><th>Severity</th><th>Recommendation</th></tr></thead><tbody>${defRows}</tbody></table>`:''}
    ${r.defectsNotes?`<div class="rec" style="margin-top:8px">${_esc(r.defectsNotes)}</div>`:''}`;
  }

  // ── Tenant sign-off (conditional) ───────────────────────────────────────────
  var tenantHtml = '';
  if (r.tenantName) {
    tenantHtml = `
    <div class="sec"><h3>Tenant / Occupier Acknowledgment</h3></div>
    <div class="rec" style="margin-bottom:10px">I confirm the alarm system was tested in my presence and found to be in working order at the time of inspection.</div>
    <div class="sig" style="grid-template-columns:1fr 1fr">
      <div><div class="sl"></div><div class="sc">Tenant / Occupier — ${_esc(r.tenantName)}${r.tenantAckDate?' · '+_esc(r.tenantAckDate):''}</div></div>
      <div></div>
    </div>`;
  }

  // ── Mini-masthead for continuation pages ────────────────────────────────────
  var miniMast = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-family:Georgia,serif;font-size:12px;letter-spacing:.08em">${_esc(company)}</div>
      <div style="font-size:8px;color:#55617a;margin-top:2px">${_esc(r.certType||'FA')} — ${_esc(r.ref||'—')} · ${_esc(premAddr)}</div>
    </div>
    <div style="text-align:right;font-size:8px;color:#55617a;line-height:1.6">${_esc(stdLabel.split(' — ')[0])}<br>${_esc(typeKicker)}</div>
  </div>`;

  // ── CSS ─────────────────────────────────────────────────────────────────────
  var css = `
:root{--ink:#1b2a4a;--gold:#a8842c;--gold2:#c9b37a;--paper:#fdfcf8;--line:#ddd6c6;--pass:#1e7a46;--fail:#991b1b}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;color:var(--ink);background:var(--paper)}
@page{size:A4;margin:0}
@media print{body{background:var(--paper)}.page{page-break-after:always;break-after:page}.page:last-of-type{page-break-after:auto;break-after:auto}}
.page{width:210mm;height:297mm;background:var(--paper);padding:10mm;position:relative;overflow:hidden;display:block}
.frame{border:1px solid var(--gold);padding:4px;height:100%}
.inner{border:2px solid var(--ink);padding:11mm 11mm 8mm;height:100%;position:relative;display:flex;flex-direction:column;overflow:hidden}
.inner::before{content:"";position:absolute;inset:4px;border:1px solid var(--gold2);pointer-events:none}
.grow{flex:1;overflow:hidden}
.mast{display:flex;justify-content:space-between;align-items:flex-start}
.brand{display:flex;gap:10px;align-items:center}
.crest{width:48px;height:48px;border:2px solid var(--ink);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-size:12px;background:#fff;flex-shrink:0;letter-spacing:.03em;overflow:hidden}
.brand h1{font-family:Georgia,serif;font-size:14px;letter-spacing:.09em;line-height:1.3}
.brand p{font-size:8.5px;color:#55617a;letter-spacing:.05em;margin-top:3px}
hr.rule{border:none;border-top:1px solid var(--line);margin:11px 0}
.title{text-align:center;margin:10px 0 3px}
.kicker{font-size:8px;letter-spacing:.28em;color:var(--gold);text-transform:uppercase;margin-bottom:5px}
.title h2{font-family:Georgia,serif;font-size:18px;font-weight:600}
.title .std{font-size:9px;color:#55617a;margin-top:4px}
.strip{margin:10px auto 0;max-width:440px;border-top:1px solid var(--gold);border-bottom:1px solid var(--gold);padding:6px 0;text-align:center}
.strip .sk{font-size:7.5px;letter-spacing:.24em;text-transform:uppercase;color:#55617a}
.strip .sv{font-family:Georgia,serif;font-size:15px;letter-spacing:.08em;margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin-top:12px}
.cell{padding:6px 0;border-bottom:1px solid var(--line)}
.ck{font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:2px}
.cv{font-size:10.5px;line-height:1.5}
.chips{display:flex;gap:5px;margin-top:10px}
.chip{flex:1;border:1px solid var(--ink);text-align:center;padding:6px 4px;background:#fff;min-width:0}
.chip .ck{font-size:7px;letter-spacing:.12em}
.chip .cv{font-family:Georgia,serif;font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.outcome{margin-top:10px;border:2px solid var(--pass);background:#eef7f0;padding:10px 13px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.outcome.unsat{border-color:var(--fail);background:#fdf0f0}
.ow{font-family:Georgia,serif;font-size:16px;letter-spacing:.12em;color:var(--pass)}
.outcome.unsat .ow{color:var(--fail)}
.on{font-size:8.5px;color:#55617a;text-align:right;line-height:1.7;flex-shrink:0}
.sec{display:flex;align-items:center;gap:9px;margin:13px 0 7px}
.sec h3{font-size:8.5px;letter-spacing:.20em;text-transform:uppercase;white-space:nowrap;font-weight:700}
.sec::before,.sec::after{content:"";flex:1;border-top:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:9.5px;background:#fff}
th{background:var(--ink);color:#fff;font-size:7.5px;letter-spacing:.11em;text-transform:uppercase;padding:6px 7px;text-align:left}
td{padding:5.5px 7px;border-bottom:1px solid var(--line);vertical-align:top}
tr:nth-child(even) td{background:#f5f2ea}
.ppill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid var(--pass);color:var(--pass);font-weight:600}
.fpill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid var(--fail);color:var(--fail);font-weight:600}
.num{font-variant-numeric:tabular-nums}
.rec{border:1px solid var(--line);background:#fff;padding:9px 11px;font-size:9.5px;line-height:1.9}
.rec b{color:var(--gold)}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}
.sl{border-bottom:1px solid var(--ink);min-height:32px;display:flex;align-items:flex-end;padding-bottom:2px}
.sc{font-size:7.5px;letter-spacing:.10em;text-transform:uppercase;color:#55617a;margin-top:4px}
.foot{text-align:center;margin-top:10px;font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:#9a9484}`;

  // ── Page 1 ──────────────────────────────────────────────────────────────────
  var page1 = `
<div class="page"><div class="frame"><div class="inner"><div class="grow">
  <div class="mast">
    <div class="brand">
      ${crestHtml}
      <div><h1>${_esc(company.toUpperCase())}</h1><p>${coContactLine}</p></div>
    </div>
    ${niceicRightHtml}
  </div>
  <hr class="rule">
  <div class="title">
    <div class="kicker">${_esc(typeKicker)}</div>
    <h2>${_esc(typeTitle)}</h2>
    <div class="std">${_esc(stdLabel)}</div>
  </div>
  <div class="strip">
    <div class="sk">Certificate Reference</div>
    <div class="sv num">${_esc(r.ref||'—')}</div>
  </div>
  <div class="grid">${gridCells}</div>
  <div class="chips">${chipsHtml}</div>
  <div class="outcome${outClass}">
    <div>
      <div style="font-size:7.5px;letter-spacing:.22em;text-transform:uppercase;color:#55617a">Outcome</div>
      <div class="ow">${_esc(r.outcome||'—')}</div>
    </div>
    ${outcomeDetailHtml}
  </div>
</div>
  <div class="foot">${_esc(company)} · Page 1 of 3</div>
</div></div></div>`;

  // ── Page 2 ──────────────────────────────────────────────────────────────────
  var page2 = `
<div class="page"><div class="frame"><div class="inner"><div class="grow">
  ${miniMast}
  <hr class="rule">
  ${(r.detectors||[]).length ? `
  <div class="sec"><h3>Schedule of Detectors &amp; Devices</h3></div>
  <table><thead><tr>${detHeaders}</tr></thead><tbody>${detRows}</tbody></table>` : ''}
  <div class="sec"><h3>Test Results</h3></div>
  <table><thead><tr><th>Test</th><th>Result</th></tr></thead><tbody>${testRows||'<tr><td colspan="2" style="color:#9a9484">—</td></tr>'}</tbody></table>
  ${sysDetailCells ? `
  <div class="sec"><h3>System Details</h3></div>
  <div class="grid">${sysDetailCells}</div>` : ''}
</div>
  <div class="foot">${_esc(company)} · Page 2 of 3</div>
</div></div></div>`;

  // ── Page 3 ──────────────────────────────────────────────────────────────────
  var page3 = `
<div class="page"><div class="frame"><div class="inner"><div class="grow">
  ${miniMast}
  <hr class="rule">
  ${defectsHtml}
  <div class="sec"><h3>Declaration</h3></div>
  <div class="rec">I confirm the fire alarm system described in this certificate has been inspected and tested in accordance with ${_esc(stdLabel)} and that the results stated are a true record of the condition of the installation at the time of inspection. This certificate does not guarantee that the installation will remain free from defects in the future.</div>
  <div class="sec"><h3>Sign-off</h3></div>
  <div class="sig">
    <div>
      <div class="sl">${enggSigData?`<img src="${enggSigData}" style="max-height:28px;max-width:100px;object-fit:contain">`:''}</div>
      <div class="sc">Engineer — ${_esc(r.engineerName||'—')}${r.engineerQual?' · '+_esc(r.engineerQual):''} · ${_esc(r.testDate||issued)}</div>
    </div>
    <div>
      <div class="sl"></div>
      <div class="sc">For ${_esc(r.companyName||company)}${niceicNo?' · NICEIC '+_esc(niceicNo):''}</div>
    </div>
  </div>
  ${tenantHtml}
</div>
  <div class="foot">${_esc(company)} · Page 3 of 3 · Ref: ${_esc(r.ref||'—')} · Issued ${issued}</div>
</div></div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${_esc(r.certType||'FA')} Certificate — ${_esc(r.ref||'')}</title><style>${css}</style></head><body>${page1}${page2}${page3}</body></html>`;
}
