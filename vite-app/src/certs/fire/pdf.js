import { getSetting } from '../../lib/settings.js';

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _field(label, val) {
  return '<div class="f"><div class="fl">'+_esc(label)+'</div><div class="fv">'+_esc(val)+'</div></div>';
}

export function fireBuildCertHTML(r, siteHistory) {
  var isComm = r.certType === 'FA.3' || r.certType === 'FA.4';

  var typeKicker = { 'FA.1':'Form FA.1 · Installation Certificate', 'FA.2':'Form FA.2 · Inspection &amp; Service Certificate', 'FA.3':'Form FA.3 · Installation / Commissioning Certificate', 'FA.4':'Form FA.4 · Inspection &amp; Servicing Report' }[r.certType] || 'Fire Alarm Certificate';
  var typeTitle  = { 'FA.1':'Fire Alarm Installation Certificate', 'FA.2':'Fire Alarm Inspection & Service Certificate', 'FA.3':'Fire Alarm Installation / Commissioning Certificate', 'FA.4':'Fire Detection & Alarm System Inspection and Servicing Report' }[r.certType] || 'Fire Alarm Certificate';
  var stdLabel   = isComm ? 'BS 5839-1:2017+A2:2024 · Fire Detection and Alarm Systems for Buildings' : 'BS 5839-6:2019+A1:2020 · Fire detection and alarm systems for dwellings';

  var company     = getSetting('fire_co_name') || getSetting('company_name') || 'OHM Electrical Engineering Ltd';
  var _coAddrRaw  = getSetting('fire_co_address') || getSetting('company_address') || '';
  var _coPostcode = getSetting('fire_co_postcode') || '';
  var companyAddr = (_coAddrRaw && _coPostcode && !_coAddrRaw.includes(_coPostcode)) ? _coAddrRaw + ', ' + _coPostcode : _coAddrRaw;
  var companyTel  = getSetting('fire_co_phone') || getSetting('company_tel') || '';
  var companyEmail= getSetting('fire_co_email') || getSetting('company_email') || '';
  var niceicNo    = getSetting('fire_niceic_scheme_no') || getSetting('el_enrol_no') || getSetting('niceic_scheme_no') || '';
  var logoData    = getSetting('fire_logo_data', getSetting('pat_logo_data',''));
  var niceicLogoData = getSetting('fire_niceic_logo', getSetting('pat_logo2_data',''));
  var enggSigData = r.enggSigData || getSetting('fire_engg_sig_data','') || getSetting('el_sig_data','');
  var engineerRegNo = r.engineerRegNo || getSetting('fa_engineer_reg_no','');

  var premAddr  = [r.premAddr1, r.premAddr2, r.premAddr3, r.premPostcode].filter(Boolean);
  var clientAddr= [r.clientAddr1, r.clientAddr2, r.clientAddr3, r.clientPostcode].filter(Boolean);
  var issued    = new Date().toLocaleDateString('en-GB');
  var ref       = _esc(r.ref||'—');
  var tDate     = _esc(r.testDate||issued);
  var eng       = _esc(r.engineerName||'—');
  var engPos    = _esc(r.engineerQual||'Fire Alarm Engineer');
  var coName    = _esc(company);
  var coAddr    = _esc(companyAddr.split(/[,\n]/)[0].trim());
  var coTel     = companyTel ? _esc(companyTel) : '';
  var coEmail   = companyEmail ? _esc(companyEmail) : '';

  // ── Logo / NICEIC badge HTML ──────────────────────────────────────────────
  var elLogo = logoData
    ? '<img src="'+logoData+'" style="max-height:64px;max-width:64px;object-fit:contain;border-radius:4px;border:1px solid var(--a);flex-shrink:0">'
    : '<div class="ch-logo">'+_esc((company.match(/\b\w/g)||[]).slice(0,3).join('').toUpperCase())+'</div>';

  var bodyBadge = niceicLogoData
    ? '<div class="niceic-badge" style="padding:6px 10px"><img src="'+niceicLogoData+'" style="max-height:68px;max-width:140px;object-fit:contain;image-rendering:crisp-edges"></div>'
    : (niceicNo
        ? '<div class="niceic-badge"><div class="nb-title">NICEIC Approved Contractor</div><div class="nb-sub">Enrolment No. '+_esc(niceicNo)+'</div></div>'
        : '');

  var sigImg = enggSigData
    ? '<img src="'+enggSigData+'" style="max-height:36px;max-width:120px;object-fit:contain;display:block;margin-top:4px">'
    : '';

  // ── Device counts for stats bar ───────────────────────────────────────────
  var _hasDetList = (r.detectors||[]).length > 0;
  var devTotal = _hasDetList ? (r.detectors||[]).length                                              : (parseInt(r.detTotal)||0);
  var devPass  = _hasDetList ? (r.detectors||[]).filter(function(d){return d.result==='PASS';}).length : (parseInt(r.detPass)||0);
  var devFail  = _hasDetList ? (r.detectors||[]).filter(function(d){return d.result==='FAIL';}).length : (parseInt(r.detFail)||0);
  var devTested= _hasDetList ? (devPass + devFail)                                                   : (parseInt(r.detTested)||(devPass+devFail));

  // ── Outcome ───────────────────────────────────────────────────────────────
  var sat    = (r.outcome||'').toUpperCase() === 'SATISFACTORY';
  var attn   = (r.outcome||'').toUpperCase() === 'REQUIRES ATTENTION';
  var satText = {'FA.1':'Installation &amp; commissioning complete','FA.2':'Annual service and inspection complete','FA.3':'Installation, commissioning &amp; testing complete','FA.4':'Inspection and servicing complete'}[r.certType] || 'Annual service complete';
  var obBg   = sat ? '#1a6b40' : (attn ? '#a16207' : '#7a1010');
  var obText = sat
    ? '&#10003; &nbsp; SATISFACTORY &mdash; ' + satText
    : (attn ? (isComm ? '&#9651; &nbsp; REQUIRES ATTENTION &mdash; Remedial work needed' : '&#9651; &nbsp; UNSATISFACTORY &mdash; Remedial works required') : '&#9888; &nbsp; UNSATISFACTORY &mdash; Action required');

  // ── Detector table ────────────────────────────────────────────────────────
  var hasDetModel  = (r.detectors||[]).some(function(d){return d.model;});
  var hasSerialNo  = (r.detectors||[]).some(function(d){return d.serialNo;});
  var hasZone      = isComm && (r.detectors||[]).some(function(d){return d.zone;});
  var hasBatExpiry = !isComm && (r.detectors||[]).some(function(d){return d.batExpiry;});

  var detHeaders = isComm
    ? '<th>#</th><th>Location</th><th>Device type</th>'+(hasDetModel?'<th>Make / Model</th>':'')+(hasSerialNo?'<th>Serial No.</th>':'')+(hasZone?'<th>Zone / Circuit</th>':'')+'<th>Result</th>'
    : '<th>#</th><th>Location</th><th>Device type</th>'+(hasDetModel?'<th>Make / Model</th>':'')+(hasSerialNo?'<th>Serial No.</th>':'')+'<th>Result</th><th>Battery</th>'+(hasBatExpiry?'<th>Battery expiry</th>':'');

  var detRows = (r.detectors||[]).map(function(d,i){
    var rHtml = d.result==='PASS' ? '<span class="ppill">Pass</span>' : d.result==='FAIL' ? '<span class="fpill">Fail</span>' : d.result==='N/A' ? '<span class="napill">N/A</span>' : _esc(d.result||'—');
    return isComm
      ? '<tr><td>'+(i+1)+'</td><td>'+_esc(d.location)+'</td><td>'+_esc(d.type)+'</td>'+(hasDetModel?'<td>'+_esc(d.model||'—')+'</td>':'')+(hasSerialNo?'<td class="num">'+_esc(d.serialNo||'—')+'</td>':'')+(hasZone?'<td>'+_esc(d.zone||'—')+'</td>':'')+'<td>'+rHtml+'</td></tr>'
      : '<tr><td>'+(i+1)+'</td><td>'+_esc(d.location)+'</td><td>'+_esc(d.type)+'</td>'+(hasDetModel?'<td>'+_esc(d.model||'—')+'</td>':'')+(hasSerialNo?'<td class="num">'+_esc(d.serialNo||'—')+'</td>':'')+'<td>'+rHtml+'</td><td>'+_esc(d.batReplaced||'—')+'</td>'+(hasBatExpiry?'<td>'+_esc(d.batExpiry||'—')+'</td>':'')+'</tr>';
  }).join('');

  // ── Test results ──────────────────────────────────────────────────────────
  function _tRow(label, val) {
    if (!val) return '';
    var rHtml = val==='PASS' ? '<span class="ppill">Pass</span>' : val==='FAIL' ? '<span class="fpill">Fail</span>' : val==='N/A' ? '<span class="napill">N/A</span>' : _esc(val);
    return '<tr><td>'+_esc(label)+'</td><td>'+rHtml+'</td></tr>';
  }
  var testRows = '';
  if (!isComm) {
    var _isDomPnl = /^[ABC]/.test(r.sysGrade||'');
    if (_isDomPnl) {
      testRows += _tRow('Mains supply test', r.tMains);
      testRows += _tRow('Battery / PSU standby test', r.tBattery);
      testRows += _tRow('Fault simulation test', r.tFaultSim);
    }
    testRows += _tRow('Functional test', r.tFunctional);
    testRows += _tRow('Interlinked test', r.tInterlinked);
    if (!_isDomPnl) testRows += _tRow('Battery backup / standby', r.tBattery);
    testRows += _tRow('CO alarms fitted', r.coAlarmsPresent);
    if (r.coAlarmsPresent === 'N/A' && r.coAlarmNaReason) testRows += '<tr><td>CO alarm N/A reason</td><td>'+_esc(r.coAlarmNaReason)+'</td></tr>';
    testRows += _tRow('CO alarm test', r.tCO);
  } else {
    testRows += _tRow('Mains supply test', r.tMains);
    if (r.tMainsVolts) testRows += '<tr><td>Mains voltage</td><td>'+_esc(r.tMainsVolts)+' V</td></tr>';
    testRows += _tRow('Battery standby test', r.tBatResult);
    if (r.tBatDuration) testRows += '<tr><td>Battery standby duration</td><td>'+_esc(r.tBatDuration)+'</td></tr>';
    if (r.tBatVolts)   testRows += '<tr><td>Battery voltage</td><td>'+_esc(r.tBatVolts)+' V</td></tr>';
    testRows += _tRow('Sounder / beacon test', r.tSounder);
    if (r.tSounderDb)  testRows += '<tr><td>Sounder level</td><td>'+_esc(r.tSounderDb)+' dB</td></tr>';
    testRows += _tRow('Visual indicators test', r.tVisual);
    testRows += _tRow('Zone isolation test', r.tZoneIso);
    testRows += _tRow('Fault simulation test', r.tFaultSim);
    testRows += _tRow('Engineer key switch', r.tKeySwitch);
  }

  // ── Inspection / commissioning checklist ──────────────────────────────────
  var faChecksHtml = '';
  if (!isComm && r.annexFa2Checks && Object.keys(r.annexFa2Checks).some(function(k){return r.annexFa2Checks[k];})) {
    var _checksMap = r.certType === 'FA.2' ? [
      {id:'s01', label:'Each detector tested and alarm activated'},
      {id:'s02', label:'All sounders audible throughout the property'},
      {id:'s03', label:'Interlink confirmed (all devices sound when one triggers)'},
      {id:'s04', label:'Battery / power supply checked and serviceable'},
      {id:'s05', label:'No building alterations requiring additional coverage'},
      {id:'s06', label:'Detectors correctly positioned and not obstructed'},
      {id:'s07', label:'Detector heads free from contamination'},
      {id:'s08', label:'Cables and wiring secure and undamaged'},
      {id:'s09', label:'Previous inspection recommendations actioned'},
      {id:'s10', label:'Maintenance documentation updated'},
    ] : [
      {id:'c01', label:'All detectors installed and confirmed operational'},
      {id:'c02', label:'Sounders audible in all sleeping areas and escape routes'},
      {id:'c03', label:'Installation in accordance with agreed specification'},
      {id:'c04', label:'Cable routes and fixings neat, secure and undamaged'},
      {id:'c05', label:'Client / occupant briefing carried out'},
      {id:'c06', label:'User documentation and operating instructions supplied'},
    ];
    var _checkRows = _checksMap.filter(function(c){return r.annexFa2Checks[c.id];}).map(function(c){
      var v = r.annexFa2Checks[c.id];
      var rHtml = v==='PASS'?'<span class="ppill">Pass</span>':v==='FAIL'?'<span class="fpill">Fail</span>':v==='N/A'?'<span class="napill">N/A</span>':_esc(v);
      return '<tr><td>'+_esc(c.label)+'</td><td>'+rHtml+'</td></tr>';
    }).join('');
    if (_checkRows) {
      var _checkTitle = r.certType==='FA.2' ? 'Routine Inspection Checks (BS 5839-6 Clause 15)' : 'Commissioning Checks (BS 5839-6 Clause 14)';
      faChecksHtml = '<div class="sec-head" style="margin-top:14px">'+_esc(_checkTitle)+'</div>'
        +'<table class="ltbl"><thead><tr><th>Check item</th><th>Result</th></tr></thead><tbody>'+_checkRows+'</tbody></table>';
    }
  }

  // ── System details grid ───────────────────────────────────────────────────
  var sysDetailCells = '';
  if (!isComm) {
    if (r.sysCategory)   sysDetailCells += _field('Category', r.sysCategory);
    if (r.sysGrade)      sysDetailCells += _field('Grade', r.sysGrade);
    if (r.sysCoverage)   sysDetailCells += _field('Coverage', r.sysCoverage);
    if (r.sysPowerSupply)sysDetailCells += _field('Power supply', r.sysPowerSupply);
    if (r.sysInterlinkMethod) sysDetailCells += _field('Interlink method', r.sysInterlinkMethod);
    else if (r.sysInterlinked)sysDetailCells += _field('Interlinked', r.sysInterlinked);
    if (r.sysDomPanelMake||r.sysDomPanelModel) sysDetailCells += _field('Control panel', [r.sysDomPanelMake,r.sysDomPanelModel].filter(Boolean).join(' '));
    if (r.sysDomZones)   sysDetailCells += _field('Zones', r.sysDomZones);
    if (r.sysMfr||r.sysModel) sysDetailCells += _field('Make / model', [r.sysMfr,r.sysModel].filter(Boolean).join(' '));
    if (r.installDate)   sysDetailCells += _field('Installation date', r.installDate);
    if (r.prevServiceDate) sysDetailCells += _field('Previous service date', r.prevServiceDate);
    if (r.designRef)       sysDetailCells += _field('Design / scheme ref', r.designRef);
    if (r.departuresNotes) sysDetailCells += '<div class="f" style="grid-column:1/-1"><div class="fl">'+_esc('Departures / variations')+'</div><div class="fv">'+_esc(r.departuresNotes)+'</div></div>';
    if (r.sysOperational) sysDetailCells += _field('System operational at leaving', r.sysOperational);
    if (r.worksCarried)  sysDetailCells += '<div class="f" style="grid-column:1/-1"><div class="fl">'+_esc('Works carried out')+'</div><div class="fv">'+_esc(r.worksCarried)+'</div></div>';
  } else {
    if (r.sysCategory)  sysDetailCells += _field('System category', r.sysCategory);
    if (r.sysCommType)  sysDetailCells += _field('System type', r.sysCommType);
    if (r.sysPanelMake||r.sysPanelModel) sysDetailCells += _field('Control panel', [r.sysPanelMake,r.sysPanelModel].filter(Boolean).join(' '));
    if (r.sysZones)     sysDetailCells += _field('Zones', r.sysZones);
    if (r.sysLoops)     sysDetailCells += _field('Loops', r.sysLoops);
    if (r.sysBafe)      sysDetailCells += _field('BAFE scheme no.', r.sysBafe);
    if (r.sysFia)       sysDetailCells += _field('FIA member no.', r.sysFia);
    if (r.sysOperational) sysDetailCells += _field('System operational at leaving', r.sysOperational);
    if (r.worksCarried) sysDetailCells += '<div class="f" style="grid-column:1/-1"><div class="fl">'+_esc('Works carried out')+'</div><div class="fv">'+_esc(r.worksCarried)+'</div></div>';
  }

  // ── Defects ───────────────────────────────────────────────────────────────
  var SEV_STYLES = isComm
    ? {C1:'color:#7a1010;font-weight:700',C2:'color:#c01818;font-weight:700',C3:'color:#a16207;font-weight:600',FI:'color:#1d4ed8;font-weight:600'}
    : {'Immediate Action':'color:#7a1010;font-weight:700','Action Required':'color:#a16207;font-weight:600','Advisory':''};
  var hasDefects = (r.defects||[]).length > 0 || r.defectsNotes;
  var defectsHtml = '';
  if (hasDefects) {
    var defRows = (r.defects||[]).map(function(d,i){
      var sev = d.severity||'Advisory';
      return '<tr><td>'+(i+1)+'</td><td>'+_esc(d.description)+'</td><td style="'+(SEV_STYLES[sev]||'')+'">'+_esc(sev)+'</td><td>'+_esc(d.recommendation)+'</td></tr>';
    }).join('');
    var _defSectionTitle = isComm ? 'Details of Deviations from the Standards' : 'Defects &amp; Recommendations';
    defectsHtml = '<div class="sec-head" style="margin-top:14px">'+_defSectionTitle+'</div>'
      +(r.defectsOverall?'<div class="obs-box" style="margin-bottom:10px"><b>Overall condition:</b> '+_esc(r.defectsOverall)+'</div>':'')
      +(defRows?'<table class="ltbl"><thead><tr><th>#</th><th>Description</th><th>Severity</th><th>Recommendation</th></tr></thead><tbody>'+defRows+'</tbody></table>':'')
      +(r.defectsNotes?'<div class="obs-box" style="margin-top:8px">'+_esc(r.defectsNotes)+'</div>':'');
  }

  // ── Service history ───────────────────────────────────────────────────────
  var serviceHistoryHtml = '';
  if (siteHistory && siteHistory.length) {
    var histRows = siteHistory.map(function(h) {
      var out = (h.outcome||'').toUpperCase();
      var pill = out === 'SATISFACTORY' ? '<span class="ppill">'+_esc(h.outcome)+'</span>'
                : out === 'REQUIRES ATTENTION' ? '<span class="apill">'+_esc(h.outcome)+'</span>'
                : out === 'UNSATISFACTORY' ? '<span class="fpill">'+_esc(h.outcome)+'</span>'
                : _esc(h.outcome||'—');
      return '<tr><td>'+_esc(h.test_date||'—')+'</td><td>'+_esc(h.cert_type||'—')+'</td><td>'+pill+'</td><td>'+_esc(h.ref_number||'—')+'</td></tr>';
    }).join('');
    serviceHistoryHtml = '<div class="sec-head" style="margin-top:14px">Service History for this Property</div>'
      +'<table class="ltbl"><thead><tr><th>Date</th><th>Type</th><th>Outcome</th><th>Reference</th></tr></thead><tbody>'+histRows+'</tbody></table>';
  }

  // ── Tenant sign-off ───────────────────────────────────────────────────────
  var tenantHtml = '';
  if (r.tenantName) {
    tenantHtml = '<div class="sec-head" style="margin-top:14px">Tenant / Occupier Acknowledgment</div>'
      +'<div class="note-box" style="margin-bottom:10px">I confirm the alarm system was tested in my presence and found to be in working order at the time of inspection.</div>'
      +'<div class="sig-row">'
      +'<div><div class="sig-line"></div><div class="sig-cap">Tenant / Occupier — '+_esc(r.tenantName)+(r.tenantAckDate?' · '+_esc(r.tenantAckDate):'')+'</div></div>'
      +'<div></div>'
      +'</div>';
  }

  // ── Footer helper ─────────────────────────────────────────────────────────
  function footer(loc, pageNum, total) {
    return '<div class="cert-footer">'
      +'<div class="cf-ref">'+ref+' &nbsp;&middot;&nbsp; Page '+pageNum+' of '+total+'</div>'
      +'</div>';
  }

  // ── Continuation header (pages 2+) ────────────────────────────────────────
  function contHead(subtitle, pageNum, total) {
    return '<div class="ch-cont">'
      +'<div class="ch-cont-title">'+_esc(subtitle)+'</div>'
      +'</div>';
  }

  // ── Purpose panel content ─────────────────────────────────────────────────
  var purposeMap = {
    'FA.1':'To certify the design, installation and commissioning of a new fire alarm system in accordance with BS 5839-6:2019',
    'FA.2':'To certify continued compliance — annual inspection and testing of an existing fire alarm system',
    'FA.3':'To certify the installation, commissioning and testing of a new fire detection and alarm system in accordance with BS 5839-1:2017+A2:2024',
    'FA.4':'To certify the periodic service, inspection and verification of an existing fire detection and alarm system'
  };
  var extentMap = {
    'FA.1':'Design, installation and commissioning — 100% of the new fire alarm system at the premises identified on this certificate.',
    'FA.2':'Annual inspection and testing — 100% of the fire detection and alarm system including all detectors, sounders, control panel, and interconnections at the premises.',
    'FA.3':'Complete installation, commissioning and testing — 100% of the new fire detection and alarm system in accordance with BS 5839-1:2017+A2:2024.',
    'FA.4':'Periodic service, inspection and verification — 100% of the existing fire detection and alarm system at the premises identified on this certificate.'
  };
  var purposeTxt = purposeMap[r.certType] || purposeMap['FA.2'];
  var extentTxt  = extentMap[r.certType]  || extentMap['FA.2'];

  // ── Page 1 ────────────────────────────────────────────────────────────────
  var totalPages = isComm ? (r.changeOfOrg === 'yes' ? 5 : 4) : 3;

  var premName = _esc(r.premisesName||'');
  var premAddrLines = premAddr.map(function(l){return _esc(l);}).join('<br>');
  var premType = _esc(r.premisesType||'');
  var clientName = _esc(r.clientName||'—');
  var clientAddrLines = clientAddr.map(function(l){return _esc(l);}).join('<br>');

  // Page 1 body summary fields
  var p1Fields = '';
  if (!isComm) {
    if (r.sysCategory)   p1Fields += _field('Category', r.sysCategory.split(' — ')[0]);
    if (r.sysGrade)      p1Fields += _field('Grade', r.sysGrade.split(' — ')[0]);
    if (r.sysPowerSupply)p1Fields += _field('Power Supply', r.sysPowerSupply);
    if (r.sysInterlinkMethod) p1Fields += _field('Interlink Method', r.sysInterlinkMethod);
    else if (r.sysInterlinked) p1Fields += _field('Interlinked', r.sysInterlinked);
    if (r.prevServiceDate) p1Fields += _field('Previous Service Date', r.prevServiceDate);
    if (r.certType === 'FA.2' && r.prevReportRef) p1Fields += _field('Previous Report Reference', r.prevReportRef);
    if (r.nextInspDate)  p1Fields += _field('Next Inspection Due', r.nextInspDate);
  } else {
    if (r.sysCategory)   p1Fields += _field('System Category', r.sysCategory);
    if (r.sysCommType)   p1Fields += _field('System Type', r.sysCommType);
    if (r.sysZones)      p1Fields += _field('Zones', r.sysZones);
    if (r.nextInspDate)  p1Fields += _field('Next Inspection Due', r.nextInspDate + (r.nextInspInterval ? ' — ' + r.nextInspInterval : ''));
    if (r.falseAlarmAction) p1Fields += _field('False alarm action', r.falseAlarmAction);
  }

  p1Fields += sat
    ? '<div class="f" style="grid-column:1/-1"><div class="fl">Outcome</div><div class="fv" style="color:#16a34a">&#10003; System Satisfactory</div></div>'
    : '<div class="f" style="grid-column:1/-1"><div class="fl">Outcome</div><div class="fv" style="color:#c01818">&#9888; Unsatisfactory &mdash; '+devFail+' device'+(devFail===1?'':'s')+' recorded as failed</div></div>';
  var noteBox = '';

  var page1 = '<div class="cert-page">'
    +'<div class="cert-top-strip"></div>'
    +'<div class="ch-ref-bar"><div class="ch-date">Date of Issue: '+tDate+'</div><div class="ch-ref">Cert Ref No. '+ref+'</div></div>'
    +'<div class="ch">'
      +'<div class="ch-top-row">'
        +'<div class="ch-logo-row">'
          +elLogo
          +'<div style="flex:1;min-width:0">'
          +'<div class="ch-company">'+coName+'</div>'
          +(companyAddr?'<div class="ch-company-sub">'+coAddr+'</div>':'')
          +'<div class="ch-company-sub">'
          +(coTel?'<a href="tel:'+coTel.replace(/\s/g,'')+'">'+coTel+'</a>':'')
          +(coTel&&(companyEmail)?'&nbsp;&bull;&nbsp;':'')
          +(companyEmail?'<a href="mailto:'+coEmail+'">'+coEmail+'</a>':'')
          +'</div>'
          +'</div>'
        +'</div>'
        +bodyBadge
      +'</div>'
      +'<div class="ch-title-row">'
        +'<div class="ch-cert-eyebrow">'+_esc(typeKicker)+'</div>'
        +'<div class="ch-cert-title">'+_esc(typeTitle)+'</div>'
        +'<div class="ch-cert-std">'+_esc(stdLabel)+'</div>'
      +'</div>'
    +'</div>'
    // Address panel: LEFT = Client/Landlord + Property (split); RIGHT = Engineer
    +'<div class="addr-panel">'
      +'<div class="addr-col addr-col-left" style="padding:0">'
        +'<div style="display:flex;height:100%">'
          +'<div style="flex:1;padding:12px 14px 16px 28px;border-right:1px solid #e2d4d4">'
            +'<div class="addr-col-label">Landlord / Client</div>'
            +(clientName!=='—'?'<div class="addr-name">'+clientName+'</div>':'')
            +(clientAddrLines?'<div class="addr-line">'+clientAddrLines+'</div>':'')
            +(r.responsiblePerson&&r.responsiblePerson!==r.clientName?'<div class="addr-sub" style="margin-top:5px">Resp: '+_esc(r.responsiblePerson)+'</div>':'')
            +(clientName==='—'&&!clientAddrLines?'<div style="color:#9a948e;font-size:12px;margin-top:4px">—</div>':'')
          +'</div>'
          +'<div style="flex:1;padding:12px 24px 16px 14px">'
            +'<div class="addr-col-label">Property</div>'
            +(premName?'<div class="addr-name">'+premName+'</div>':'')
            +(premAddrLines?'<div class="addr-line">'+premAddrLines+'</div>':'')
            +(premType?'<div class="addr-sub" style="margin-top:5px">'+premType+'</div>':'')
            +(!premName&&!premAddrLines?'<div style="color:#9a948e;font-size:12px;margin-top:4px">—</div>':'')
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div class="addr-col">'
        +'<div class="addr-col-label">Issued By</div>'
        +'<div style="margin-bottom:6px">'
          +'<div class="addr-engineer-name">'+eng+'</div>'
          +'<div class="addr-line">'+(engPos?engPos+'<br>':'')+coName+'</div>'
        +'</div>'
        +(coTel?'<div class="addr-detail-row"><span class="addr-detail-lbl">Tel:</span><span class="addr-detail-val">'+coTel+'</span></div>':'')
        +(companyEmail?'<div class="addr-detail-row"><span class="addr-detail-lbl">Email:</span><span class="addr-detail-val">'+coEmail+'</span></div>':'')
      +'</div>'
    +'</div>'
    // Purpose panel
    +'<div class="purp-panel">'
      +'<div class="purp-col purp-col-left">'
        +'<div class="purp-label">Purpose of Certificate</div>'
        +'<div class="purp-row"><div class="purp-check purp-check-on"><span class="purp-tick">&#10003;</span></div><div class="purp-text purp-text-on">'+_esc(purposeTxt)+'</div></div>'
      +'</div>'
      +'<div class="purp-col">'
        +(isComm
          ? '<div class="purp-label">Extent of Installation Covered</div><div class="purp-extent">'+_esc(extentTxt)+'</div>'
            +(r.agreedLimitations ? '<div class="purp-label" style="margin-top:10px">Agreed Limitations &amp; With Whom</div><div class="purp-extent">'+_esc(r.agreedLimitations)+'</div>' : '')
          : '<div class="purp-label">Extent of System Covered by this Certificate</div><div class="purp-extent">'+_esc(extentTxt)+'</div>'
        )
      +'</div>'
    +'</div>'
    // Commercial-only: Variations + Reference docs
    +(isComm && r.departuresNotes ? '<div style="border-top:1px solid #e2d4d4;padding:9px 28px 10px"><div class="purp-label">Variations from BS 5839-1:2017+A2:2024 Clause 43</div><div class="purp-extent">'+_esc(r.departuresNotes)+'</div></div>' : '')
    +(isComm && (r.prevReportRef||r.otherRefDocs) ? '<div style="border-top:1px solid #e2d4d4;padding:9px 28px 10px;display:grid;grid-template-columns:1fr 1fr;gap:0 20px"><div>'+(r.prevReportRef ? '<div class="purp-label">Previous Report Reference</div><div class="purp-extent">'+_esc(r.prevReportRef)+'</div>' : '')+'</div><div>'+(r.otherRefDocs ? '<div class="purp-label">Other Reference Documents</div><div class="purp-extent">'+_esc(r.otherRefDocs)+'</div>' : '')+'</div></div>' : '')
    // Outcome band
    +'<div class="outcome-band" style="background:'+obBg+';border-top:1px solid #e08830;border-bottom:1px solid #e08830">'+obText+'</div>'
    // Body
    +'<div class="cb">'
      +'<div class="sec-head">System Summary</div>'
      +(_hasDetList || devTotal > 0 || devTested > 0
        ? '<div class="stats-bar">'
          +'<div class="stat-cell"><span class="stat-num">'+devTotal+'</span><span class="stat-lbl">Devices</span></div>'
          +'<div class="stat-cell"><span class="stat-num">'+devTested+'</span><span class="stat-lbl">Tested</span></div>'
          +'<div class="stat-cell stat-pass"><span class="stat-num">'+devPass+'</span><span class="stat-lbl">Passed</span></div>'
          +'<div class="stat-cell stat-fail"><span class="stat-num">'+devFail+'</span><span class="stat-lbl">Failed</span></div>'
          +(isComm && r.falseAlarms12m !== '' && r.falseAlarms12m !== null && r.falseAlarms12m !== undefined
            ? '<div class="stat-cell stat-warn"><span class="stat-num">'+_esc(String(r.falseAlarms12m))+'</span><span class="stat-lbl">False Alarms (12m)</span></div>'
            : '')
          +'</div>'
        : '')
      +(p1Fields?'<div class="fg">'+p1Fields+'</div>':'')
      +noteBox
    +'</div>'
    +footer(r.premisesName||premAddr[0]||company, 1, totalPages)
  +'</div>';

  // ── Page 2 ────────────────────────────────────────────────────────────────
  var page2 = '<div class="cert-page">'
    +contHead('Schedule of Devices &amp; Test Results', 2, totalPages)
    +'<div class="cb">'
      +((r.detectors||[]).length?'<div class="sec-head">Schedule of Detectors &amp; Devices</div><table class="ltbl"><thead><tr>'+detHeaders+'</tr></thead><tbody>'+detRows+'</tbody></table>':'')
      +'<div class="sec-head" style="margin-top:14px">Test Results</div>'
      +'<table class="ltbl"><thead><tr><th>Test</th><th>Result</th></tr></thead><tbody>'+(testRows||'<tr><td colspan="2" style="color:#9a948e;font-style:italic">No test results recorded</td></tr>')+'</tbody></table>'
      +(r.inspLimitations?'<div style="margin-top:10px;padding:8px 10px;background:#f8f5ef;border-left:3px solid #c9b87a;border-radius:0 4px 4px 0"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7a6a3a;margin-bottom:3px">Limitations of inspection</div><div style="font-size:11px;line-height:1.5;color:#3d3d3d">'+_esc(r.inspLimitations)+'</div></div>':'')
      +faChecksHtml
      +(sysDetailCells?'<div class="sec-head" style="margin-top:14px">System Details</div><div class="fg">'+sysDetailCells+'</div>':'')
    +'</div>'
    +footer(r.premisesName||premAddr[0]||company, 2, totalPages)
  +'</div>';

  // ── Page 3 ────────────────────────────────────────────────────────────────
  var declText = r.certType==='FA.1'||r.certType==='FA.3'
    ? 'I, the undersigned, being the competent person responsible for the installation described in this certificate, declare that the fire alarm system has been installed, commissioned and tested in accordance with '+stdLabel.split(' ·')[0]+', and was found to be '+(r.outcome||'—')+' on the date of issue.'
    : 'I, the undersigned, being the competent person who carried out the inspection and testing described in this certificate, declare that the fire alarm system has been inspected and tested in accordance with '+stdLabel.split(' ·')[0]+', and was found to be '+(r.outcome||'—')+' on the date of issue.';

  var page3 = '<div class="cert-page">'
    +contHead('Declaration &amp; Sign-off', 3, totalPages)
    +'<div class="cb">'
      +serviceHistoryHtml
      +defectsHtml
      +'<div class="sec-head" style="margin-top:14px">Competent Person Declaration</div>'
      +'<div style="border:1px solid #e2d4d4;border-radius:4px;overflow:hidden;font-size:11.5px;margin-bottom:14px">'
        +'<div style="display:flex;border-bottom:1px solid #e2d4d4">'
          +'<div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Trading Title</div>'
          +'<div style="padding:7px 10px;font-weight:600;color:#1c1010;flex:1">'+coName+'</div>'
        +'</div>'
        +(companyAddr?'<div style="display:flex;border-bottom:1px solid #e2d4d4">'
          +'<div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Contractor Address</div>'
          +'<div style="padding:7px 10px;color:#1c1010;flex:1">'+_esc(companyAddr)+'</div>'
          +'</div>':'')
        +'<div style="padding:9px 10px;border-bottom:1px solid #e2d4d4;color:#3a2a2a;line-height:1.6;font-size:11px">'+_esc(declText)+'</div>'
        +'<div style="display:flex">'
          +'<div style="flex:1;border-right:1px solid #e2d4d4">'
            +'<div style="display:flex;border-bottom:1px solid #e2d4d4">'
              +'<div style="padding:10px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Name</div>'
              +'<div style="padding:10px 10px;flex:1;font-size:14px;font-weight:700;color:#1c1010">'+eng+'</div>'
            +'</div>'
            +'<div style="display:flex;border-bottom:1px solid #e2d4d4">'
              +'<div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Post</div>'
              +'<div style="padding:7px 10px;flex:1">'+engPos+'</div>'
            +'</div>'
            +(niceicNo?'<div style="display:flex;border-bottom:1px solid #e2d4d4"><div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">NICEIC No.</div><div style="padding:7px 10px;flex:1">'+_esc(niceicNo)+'</div></div>':'')
            +(engineerRegNo?'<div style="display:flex;border-bottom:1px solid #e2d4d4"><div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Reg. / Ref. No.</div><div style="padding:7px 10px;flex:1">'+_esc(engineerRegNo)+'</div></div>':'')
            +'<div style="display:flex">'
              +'<div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Date</div>'
              +'<div style="padding:7px 10px;flex:1">'+tDate+'</div>'
            +'</div>'
          +'</div>'
          +'<div style="flex:1;padding:10px;display:flex;flex-direction:column;justify-content:flex-end">'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a7858;margin-bottom:4px">Signature</div>'
            +sigImg
            +'<div style="border-bottom:1px solid #1c1010;margin-top:4px;min-height:30px"></div>'
            +'<div style="font-size:9px;color:#9a7858;margin-top:3px">For '+coName+(niceicNo?' · NICEIC '+_esc(niceicNo):'')+'</div>'
          +'</div>'
        +'</div>'
      +'</div>'
      +(r.satJustification?'<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:4px;padding:9px 11px;margin-bottom:10px;font-size:11px;line-height:1.6"><strong style="color:#7a1010">Override justification (Satisfactory with recorded failures):</strong> '+_esc(r.satJustification)+'</div>':'')
      +(r.certType==='FA.1'?'<div style="border:1px solid #e2d4d4;border-radius:4px;overflow:hidden;margin-bottom:14px;display:flex;font-size:11px"><div style="padding:7px 10px;background:#f8f0ee;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #e2d4d4;flex-shrink:0">Operating instructions<br>provided to occupier</div><div style="padding:7px 10px;flex:1;font-weight:600;color:'+(r.annexFa2Checks&&r.annexFa2Checks['c06']==='PASS'?'#1a6b40':r.annexFa2Checks&&r.annexFa2Checks['c06']==='FAIL'?'#7a1010':'#555')+'">'+(r.annexFa2Checks&&r.annexFa2Checks['c06']==='PASS'?'&#10003; Yes':(r.annexFa2Checks&&r.annexFa2Checks['c06']==='FAIL'?'&#10007; No':'Not recorded'))+'</div></div>':'')
      +tenantHtml
    +'</div>'
    +footer(r.premisesName||premAddr[0]||company, 3, totalPages)
  +'</div>';

  // ── Page 4: Annex G Checklist (commercial only) ───────────────────────────
  var _annexGDefs = [
    ['Control Equipment (BS 5839-1 Cl.44.2)',[
      ['ctrl_panel','Control panel inspected — all indicators operational'],
      ['fault_log','Fault log reviewed and all entries noted'],
      ['weekly_log','Weekly test log reviewed and up to date'],
    ]],
    ['Power Supply (Cl.44.3)',[
      ['mains_supply','Mains supply confirmed operational'],
      ['bat_inspect','Battery terminals and connections inspected'],
      ['bat_voltage','Battery voltage measured and recorded'],
      ['standby_dur','Standby battery duration test satisfactory'],
    ]],
    ['Detection (Cl.44.4)',[
      ['call_pts','Manual call points tested (all or on rotation)'],
      ['det_rotation','Detectors tested on rotation basis per schedule'],
      ['beam_det','Beam detectors aligned and tested (if installed)'],
      ['aspirating','Aspirating detection system tested (if installed)'],
    ]],
    ['Warning Devices (Cl.44.5)',[
      ['sounders','All sounders tested — dB levels confirmed adequate'],
      ['visual_alarms','Visual alarm devices tested and confirmed operational'],
    ]],
    ['Ancillary Functions (Cl.44.6)',[
      ['zone_iso','Zone isolation tested and restored correctly'],
      ['fault_sim','Fault simulation tested and panel cleared'],
      ['remote_mon','Remote monitoring / alarm receiving centre checked'],
    ]],
    ['Documentation &amp; Arrangements (Cl.44.7)',[
      ['drawings','As-installed drawings present and up to date'],
      ['cause_effect','Cause and effect documentation available'],
      ['log_book','Log book available with entries up to date'],
      ['repair_arr','24-hour emergency callout arrangements confirmed'],
    ]],
  ];

  var page4 = '';
  if (isComm) {
    var _chks4 = r.annexGChecks || {};
    var _rn4 = 0;
    var _chklBody = '';
    _annexGDefs.forEach(function(g) {
      _chklBody += '<tr><td colspan="5" class="ag-grp">'+g[0]+'</td></tr>';
      g[1].forEach(function(item) {
        _rn4++;
        var id4=item[0], lbl4=item[1], v4=_chks4[id4]||'';
        var pCell4 = v4==='PASS'
          ? '<span style="color:#1a6b40;font-size:14px;font-weight:700">&#10003;</span>'
          : '<span style="color:#d4c0a8;font-size:11px">&#9675;</span>';
        var fCell4 = v4==='FAIL'
          ? '<span style="color:#7a1010;font-size:13px;font-weight:700">&#10007;</span>'
          : '<span style="color:#d4c0a8;font-size:11px">&#9675;</span>';
        var naCell4 = v4==='N/A'
          ? '<span style="color:#666;font-size:11px">&#8212;</span>'
          : '<span style="color:#d4c0a8;font-size:11px">&#9675;</span>';
        var rowBg4 = _rn4 % 2 === 0 ? '#fdfaf8' : '#fdf5f0';
        _chklBody += '<tr style="background:'+rowBg4+';border-bottom:1px solid #ede0e0">'
          +'<td style="padding:5px 8px;color:#999;font-size:10px;text-align:center;width:28px;border-right:1px solid #ede0e0">'+_rn4+'</td>'
          +'<td style="padding:5px 10px;font-size:11.5px;color:#1c1010">'+_esc(lbl4)+'</td>'
          +'<td style="padding:5px 8px;text-align:center;width:32px;border-left:1px solid #ede0e0">'+pCell4+'</td>'
          +'<td style="padding:5px 8px;text-align:center;width:32px;border-left:1px solid #ede0e0">'+fCell4+'</td>'
          +'<td style="padding:5px 8px;text-align:center;width:36px;border-left:1px solid #ede0e0">'+naCell4+'</td>'
          +'</tr>';
      });
    });
    page4 = '<div class="cert-page">'
      +contHead('Annex G — Systematic Inspection Checklist', 4, totalPages)
      +'<div class="cb">'
        +'<table style="width:100%;border-collapse:collapse;border:1px solid #e08830;border-radius:4px;overflow:hidden;margin-bottom:14px;font-size:12px">'
          +'<thead><tr style="background:#7a1010">'
            +'<th style="padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f8edcc;width:28px;text-align:center">#</th>'
            +'<th style="padding:7px 10px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f8edcc;text-align:left">Inspection Item</th>'
            +'<th style="padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f8edcc;width:32px;text-align:center">Pass</th>'
            +'<th style="padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f8edcc;width:32px;text-align:center">Fail</th>'
            +'<th style="padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f8edcc;width:36px;text-align:center">N/A</th>'
          +'</tr></thead>'
          +'<tbody>'+_chklBody+'</tbody>'
        +'</table>'
        +'<div style="font-size:9.5px;color:#9a7858;border-top:1px solid #e2d4d4;padding-top:8px;line-height:1.6">P = Pass &nbsp; F = Fail &nbsp; N/A = Not applicable or not installed. Items marked Fail should be recorded as deviations. This checklist forms part of the BS 5839-1:2017+A2:2024 Annex G service certificate.</div>'
      +'</div>'
      +footer(r.premisesName||premAddr[0]||company, 4, totalPages)
    +'</div>';
  }

  // ── Page 5: Change of Servicing Organisation (commercial + changeOfOrg) ───
  var page5 = '';
  if (isComm && r.changeOfOrg === 'yes') {
    var _transDate = r.prevOrgDate
      ? (function(d) { var p=d.split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d; })(r.prevOrgDate)
      : '—';
    var _condCol = r.handoverCondition === 'Satisfactory' ? '#1a6b40'
      : r.handoverCondition === 'Unsatisfactory' ? '#7a1010'
      : '#9a7858';
    page5 = '<div class="cert-page">'
      +contHead('Change of Servicing Organisation', 5, totalPages)
      +'<div class="cb">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">'
          +'<div class="ob-box">'
            +'<div class="ob-lbl">Outgoing Organisation</div>'
            +_field('Organisation', r.prevOrgName || '—')
            +(r.prevOrgContact ? _field('Contact', r.prevOrgContact) : '')
            +_field('Date of Transfer', _transDate)
          +'</div>'
          +'<div class="ob-box">'
            +'<div class="ob-lbl">Incoming Organisation</div>'
            +_field('Organisation', coName)
            +_field('Engineer', eng)
            +_field('Certificate Ref', ref)
          +'</div>'
        +'</div>'
        +(r.handoverCondition
          ? '<div class="ob-box" style="margin-bottom:14px">'
              +'<div class="ob-lbl">System Condition at Handover</div>'
              +'<div style="display:flex;align-items:center;gap:8px">'
                +'<div style="width:10px;height:10px;border-radius:50%;background:'+_condCol+'"></div>'
                +'<span style="font-size:14px;font-weight:700;color:'+_condCol+'">'+_esc(r.handoverCondition)+'</span>'
              +'</div>'
            +'</div>'
          : '')
        +(r.handoverNotes
          ? '<div class="ob-box" style="margin-bottom:14px">'
              +'<div class="ob-lbl">Outstanding Defects / Notes at Handover</div>'
              +'<div style="font-size:12.5px;color:#1c1010;line-height:1.6;white-space:pre-wrap">'+_esc(r.handoverNotes)+'</div>'
            +'</div>'
          : '')
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">'
          +'<div class="ob-box">'
            +'<div class="ob-lbl">Outgoing Organisation Signature</div>'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a7858;margin-bottom:4px">Signature</div>'
            +'<div style="border-bottom:1px solid #1c1010;min-height:40px;margin-bottom:4px"></div>'
            +'<div style="font-size:9px;color:#9a7858">For '+_esc(r.prevOrgName||'Outgoing Organisation')+'</div>'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a7858;margin-top:10px;margin-bottom:4px">Date</div>'
            +'<div style="border-bottom:1px solid #1c1010;min-height:20px"></div>'
          +'</div>'
          +'<div class="ob-box">'
            +'<div class="ob-lbl">Incoming Organisation Signature</div>'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a7858;margin-bottom:4px">Signature</div>'
            +sigImg
            +'<div style="font-size:9px;color:#9a7858">For '+coName+(niceicNo?' · NICEIC '+_esc(niceicNo):'')+'</div>'
          +'</div>'
        +'</div>'
      +'</div>'
      +footer(r.premisesName||premAddr[0]||company, 5, totalPages)
    +'</div>';
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  var css = `
/* Ember & Flame — Fire Alarm Certificate
   dark:#7a1010  mid:#c01818  accent:#e08830  paper:#fdfaf8  pa:#f8edcc */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-size:13px;color:#1c1010;background:#fdfaf8}
@page{size:A4;margin:0}
@media print{body{background:#fdfaf8}.cert-page{page-break-after:always;break-after:page}.cert-page:last-of-type{page-break-after:auto;break-after:auto}}
a{color:inherit;text-decoration:none}

/* ── Page wrapper ── */
.cert-page{background:#fdfaf8;width:794px;min-height:1123px;font-size:13px;color:#1c1010;line-height:1.5;display:flex;flex-direction:column;font-family:Inter,"Helvetica Neue",Arial,sans-serif}

/* ── Top strip ── */
.cert-top-strip{background:linear-gradient(90deg,#7a1010,#c01818 55%,#e08830);height:7px;flex-shrink:0}

/* ── Ref bar ── */
.ch-ref-bar{background:linear-gradient(90deg,#891f1f,#cf2727);border-top:1px solid #e08830;padding:8px 28px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.ch-date{font-size:11.5px;color:rgba(255,255,255,.75)}
.ch-ref{font-family:monospace;font-size:13px;font-weight:700;color:#f8edcc;letter-spacing:.05em}

/* ── Header ── */
.ch{background:#fdfaf8;padding:9px 28px 0;flex-shrink:0}
.ch-top-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:9px;border-bottom:1.5px solid #e2d4d4}
.ch-logo-row{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
.ch-logo{background:linear-gradient(135deg,#c01818,#7a1010);border:1px solid #e08830;border-radius:4px;width:64px;height:64px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:rgba(255,255,255,.88);letter-spacing:.05em;flex-shrink:0}
.ch-company{font-size:24px;font-weight:900;color:#1c1010;letter-spacing:-.02em;line-height:1.1}
.ch-company-sub{font-size:9.5px;color:#666;margin-top:2px}
.niceic-badge{border:1.5px solid #e08830;border-radius:4px;padding:7px 14px;background:#f8edcc;text-align:center;flex-shrink:0}
.nb-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a1010}
.nb-sub{font-size:7.5px;color:#666;margin-top:1px}
.ch-title-row{padding:7px 0 7px}
.ch-cert-eyebrow{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e08830;margin-bottom:4px}
.ch-cert-title{font-family:'Cormorant Garamond','Crimson Pro',Georgia,serif;font-size:29px;font-weight:700;color:#c01818;line-height:1.15}
.ch-cert-std{font-size:9.5px;color:#666;margin-top:5px;line-height:1.6}

/* ── Address panel ── */
.addr-panel{display:grid;grid-template-columns:1fr 1fr;border-top:3px solid #e08830;flex-shrink:0}
.addr-col{padding:12px 28px 14px}
.addr-col-left{border-right:1px solid #e2d4d4}
.addr-col-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#e08830;padding-bottom:7px;border-bottom:1px solid rgba(0,0,0,.07);margin-bottom:9px}
.addr-name{font-size:15px;font-weight:700;color:#1c1010;margin-bottom:3px;line-height:1.2}
.addr-line{font-size:12px;color:#666;line-height:1.75}
.addr-sub{font-size:10.5px;color:#999}
.addr-engineer-name{font-size:15px;font-weight:700;color:#1c1010;margin-bottom:3px}
.addr-detail-row{display:flex;gap:6px;font-size:11px;color:#666;margin-top:3px}
.addr-detail-lbl{font-weight:700;color:#444}
.addr-detail-val{color:#666}

/* ── Purpose panel ── */
.purp-panel{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #e2d4d4;flex-shrink:0}
.purp-col{padding:10px 28px 12px}
.purp-col-left{border-right:1px solid #e2d4d4}
.purp-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#e08830;margin-bottom:8px}
.purp-row{display:flex;align-items:flex-start;gap:8px}
.purp-check{width:13px;height:13px;border:2px solid #e08830;border-radius:2px;flex-shrink:0;margin-top:1px;position:relative;overflow:visible}
.purp-check-on{background:#c01818;border-color:#c01818}
.purp-check-on>.purp-tick{position:absolute;color:white;font-size:17px;font-weight:900;line-height:1;top:-3px;left:-1px;pointer-events:none}
.purp-text{font-size:11.5px;color:#3a2a2a;line-height:1.55}
.purp-text-on{font-weight:600;color:#1c1010}
.purp-extent{font-size:11.5px;color:#3a2a2a;line-height:1.6}

/* ── Outcome band ── */
.outcome-band{padding:11px 28px;text-align:center;font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#fff;flex-shrink:0}

/* ── Body ── */
.cb{padding:16px 28px;flex:1;display:flex;flex-direction:column}
.sec-head{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c01818;padding-bottom:6px;border-bottom:2px solid #e08830;margin-bottom:12px}
.stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));border:1px solid #e08830;border-radius:5px;overflow:hidden;margin-bottom:14px}
.stat-pass .stat-num{color:#1a6b40}
.stat-fail .stat-num{color:#7a1010}
.stat-warn .stat-num{color:#a16207}
.stat-cell{padding:14px 10px;text-align:center;border-right:1px solid rgba(0,0,0,.07);display:flex;flex-direction:column;align-items:center}
.stat-cell:last-child{border-right:none}
.stat-num{font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;font-weight:700;line-height:1;color:#c01818}
.stat-lbl{font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-top:4px}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:0 22px;margin-bottom:12px}
.f{padding-bottom:9px;border-bottom:1px solid #ede0e0;margin-bottom:9px}
.fl{font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#999;margin-bottom:2px}
.fv{font-size:13px;font-weight:600;color:#1c1010}
.note-box{border:1px solid #d4c0a8;border-radius:4px;padding:11px 14px;background:#fdf5ec}
.nb-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c01818;margin-bottom:7px}
.obs-box{border-left:4px solid #c01818;border-radius:4px;padding:11px 14px;background:#fdf0ee}
.ob-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a1010;margin-bottom:7px}

/* ── Continuation header ── */
.ch-cont{background:#fdfaf8;border-left:5px solid #c01818;border-bottom:2px solid #e08830;padding:16px 28px 14px;flex-shrink:0}
.ch-cont-eyebrow{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#999;margin-bottom:4px}
.ch-cont-title{font-family:'Cormorant Garamond','Crimson Pro',Georgia,serif;font-size:22px;font-weight:700;color:#1c1010}

/* ── Tables ── */
.ltbl{width:100%;border-collapse:collapse;font-size:9.5px;background:#fdfaf8;margin-bottom:12px}
.ltbl th{background:#f8edcc;color:#7a1010;font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;padding:6px 8px;text-align:left}
.ltbl td{padding:5.5px 8px;border-bottom:1px solid #ede0e0;vertical-align:top}
.ltbl tr:nth-child(even) td{background:#fdf5ec}
.ppill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid #166534;color:#166534;font-weight:600}
.fpill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid #7a1010;color:#7a1010;font-weight:600}
.apill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid #a16207;color:#a16207;font-weight:600}
.napill{display:inline-block;font-size:8px;letter-spacing:.05em;padding:1px 7px;border-radius:20px;border:1px solid #9ca3af;color:#6b7280;font-weight:600}
.num{font-variant-numeric:tabular-nums}

/* ── Signature ── */
.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}
.sig-line{border-bottom:1px solid #1c1010;min-height:32px;display:flex;align-items:flex-end;padding-bottom:2px}
.sig-cap{font-size:7.5px;letter-spacing:.10em;text-transform:uppercase;color:#7a6060;margin-top:4px}

/* ── Footer ── */
.cert-footer{background:#fdfaf8;border-top:2px solid #e08830;padding:11px 28px;display:flex;justify-content:flex-end;align-items:center;flex-shrink:0}
.cf-left{font-size:10px;color:#9a7858}
.cf-ref{font-family:monospace;font-size:10px;font-weight:700;color:#e08830}
.ag-grp{background:#f8edcc;padding:6px 10px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a1010;border-top:1px solid #e08830}`;

  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+_esc(r.certType||'FA')+' Certificate — '+ref+'</title><style>'+css+'</style></head><body>'+page1+page2+page3+page4+page5+'</body></html>';
}
