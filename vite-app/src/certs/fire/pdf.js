import { getSetting } from '../../lib/settings.js';

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _cell(label, val) { return `<tr><td class="lbl">${_esc(label)}</td><td class="val">${_esc(val||'—')}</td></tr>`; }
function _ch(title) { return `<div class="card-head"><div class="card-bar"></div><span class="card-title">${title}</span><div class="card-rule"></div></div>`; }
function _pill(lbl, val, small) { return `<div class="spec-pill"><span class="pill-lbl">${lbl}</span><span class="pill-val${small?' pill-sm':''}">${_esc(val)}</span></div>`; }
function _pillSplit(lbl, val) {
  var parts = (val||'').split(' — ');
  var code = parts[0] || val; var desc = parts.length > 1 ? parts.slice(1).join(' — ') : '';
  return `<div class="spec-pill"><span class="pill-lbl">${lbl}</span><span class="pill-val pill-bold">${_esc(code)}</span>${desc?`<span class="pill-desc">${_esc(desc)}</span>`:''}</div>`;
}

export function fireBuildCertHTML(r) {
  var isComm = r.certType === 'FA.3' || r.certType === 'FA.4';

  var typeLabels = {
    'FA.1': 'FA.1 — Fire Alarm Installation Certificate',
    'FA.2': 'FA.2 — Fire Alarm Inspection & Service Certificate',
    'FA.3': 'FA.3 — Fire Alarm Installation / Commissioning Certificate',
    'FA.4': 'FA.4 — Fire Alarm Service / Verification Certificate',
  };
  var stdLabel = isComm
    ? 'BS 5839-1:2025 — Fire Detection and Alarm Systems for Buildings'
    : 'BS 5839-6:2019 — Fire Detection and Alarm Systems for Dwellings — Issued in accordance with Annex G';
  var typeTitle = typeLabels[r.certType] || 'Fire Alarm Certificate';

  var company      = getSetting('company_name','OHM Electrical Engineering Ltd');
  var companyAddr  = getSetting('company_address','');
  var companyTel   = getSetting('company_tel','');
  var companyEmail = getSetting('company_email','');
  var niceicNo       = getSetting('el_enrol_no', getSetting('niceic_scheme_no',''));
  var logoData       = getSetting('fire_logo_data', getSetting('pat_logo_data',''));
  var niceicLogoData = getSetting('fire_niceic_logo', getSetting('pat_logo2_data',''));

  var premAddr   = [r.premAddr1, r.premAddr2, r.premAddr3, r.premPostcode].filter(Boolean).join(', ');
  var clientAddr = [r.clientAddr1, r.clientAddr2, r.clientAddr3, r.clientPostcode].filter(Boolean).join(', ');
  var hasClient  = !!(r.clientName || r.clientAddr1 || r.clientEmail || r.responsiblePerson);
  var metaCols   = hasClient ? '1fr 1fr 1fr' : '1fr 1fr';

  // ── Detector table ──────────────────────────────────────────────────────────
  var hasDetModel = (r.detectors||[]).some(function(d){ return d.model; });
  var detHeaders = isComm
    ? `<th>#</th><th>Location</th><th>Device type</th>${hasDetModel?'<th>Make / Model</th>':''}<th>Result</th>`
    : `<th>#</th><th>Location</th><th>Device type</th>${hasDetModel?'<th>Make / Model</th>':''}<th>Result</th><th>Battery replaced</th>`;
  var detRows = (r.detectors||[]).map(function(d,i) {
    var rCls = d.result==='PASS' ? 'pass' : d.result==='FAIL' ? 'fail' : '';
    return isComm
      ? `<tr><td>${i+1}</td><td>${_esc(d.location)}</td><td>${_esc(d.type)}</td>${hasDetModel?`<td>${_esc(d.model)}</td>`:''}<td class="${rCls}">${_esc(d.result)}</td></tr>`
      : `<tr><td>${i+1}</td><td>${_esc(d.location)}</td><td>${_esc(d.type)}</td>${hasDetModel?`<td>${_esc(d.model)}</td>`:''}<td class="${rCls}">${_esc(d.result)}</td><td>${_esc(d.batReplaced||'N/A')}</td></tr>`;
  }).join('');

  // ── Test results ────────────────────────────────────────────────────────────
  function _tl(label, val) {
    if (!val) return '';
    var cls = val==='PASS' ? 'pass' : val==='FAIL' ? 'fail' : '';
    return `<tr><td class="lbl">${_esc(label)}</td><td class="val ${cls}">${_esc(val)}</td></tr>`;
  }
  var testCols = ['',''];
  if (!isComm) {
    testCols[0] = _tl('Functional test', r.tFunctional) + _tl('Interlinked test', r.tInterlinked);
    testCols[1] = _tl('Battery backup / standby', r.tBattery) + _tl('CO alarm test', r.tCO);
  } else {
    testCols[0] = _tl('Mains supply test', r.tMains)
                + (r.tMainsVolts ? `<tr><td class="lbl">Mains voltage</td><td class="val">${_esc(r.tMainsVolts)} V</td></tr>` : '')
                + _tl('Battery standby test', r.tBatResult)
                + (r.tBatDuration ? `<tr><td class="lbl">Battery standby duration</td><td class="val">${_esc(r.tBatDuration)}</td></tr>` : '')
                + (r.tBatVolts ? `<tr><td class="lbl">Battery voltage</td><td class="val">${_esc(r.tBatVolts)} V</td></tr>` : '')
                + _tl('Sounder / beacon test', r.tSounder)
                + (r.tSounderDb ? `<tr><td class="lbl">Sounder level</td><td class="val">${_esc(r.tSounderDb)} dB</td></tr>` : '');
    testCols[1] = _tl('Visual indicators test', r.tVisual) + _tl('Zone isolation test', r.tZoneIso)
                + _tl('Fault simulation test', r.tFaultSim) + _tl('Engineer key switch', r.tKeySwitch);
  }

  // ── Spec pills ──────────────────────────────────────────────────────────────
  var specPills = '';
  if (!isComm) {
    if (r.sysCategory)    specPills += _pillSplit('Category', r.sysCategory);
    if (r.sysGrade)       specPills += _pillSplit('Grade',    r.sysGrade);
    if (r.sysInterlinked) specPills += _pill('Interlinked', r.sysInterlinked);
  } else {
    if (r.sysCategory)   specPills += _pillSplit('Category',  r.sysCategory);
    if (r.sysCommType)   specPills += _pill('Type',      r.sysCommType);
    if (r.sysZones)      specPills += _pill('Zones',     r.sysZones);
    if (r.sysLoops)      specPills += _pill('Loops',     r.sysLoops);
  }
  specPills += _pill('Test date',  r.testDate||'—', true);
  specPills += _pill('Next due',   r.nextInspDate||'—', true);

  // ── System detail rows ──────────────────────────────────────────────────────
  var sysCol1 = '', sysCol2 = '', sysCol3 = '';
  if (!isComm) {
    sysCol1 = _cell('Category', r.sysCategory) + _cell('System grade', r.sysGrade) + _cell('Coverage', r.sysCoverage||'—');
    sysCol2 = _cell('Power supply', r.sysPowerSupply) + _cell('Interlinked', r.sysInterlinked)
            + ((r.sysMfr||r.sysModel) ? _cell('Make / model', [r.sysMfr,r.sysModel].filter(Boolean).join(' ')) : '');
    var detCount = (r.detectors||[]).length;
    sysCol3 = _cell('No. of devices', detCount ? String(detCount) : '—')
            + _cell('Test date', r.testDate) + _cell('Next inspection due', r.nextInspDate);
  } else {
    sysCol1 = _cell('System category', r.sysCategory) + _cell('System type', r.sysCommType);
    sysCol2 = ((r.sysPanelMake||r.sysPanelModel) ? _cell('Control panel', [r.sysPanelMake,r.sysPanelModel].filter(Boolean).join(' ')) : '')
            + (r.sysZones ? _cell('Zones', r.sysZones) : '') + (r.sysLoops ? _cell('Loops', r.sysLoops) : '');
    sysCol3 = (r.sysBafe ? _cell('BAFE scheme no.', r.sysBafe) : '') + (r.sysFia ? _cell('FIA member no.', r.sysFia) : '')
            + _cell('Test date', r.testDate) + _cell('Next inspection due', r.nextInspDate);
  }

  // ── Defects ─────────────────────────────────────────────────────────────────
  var defectSection = '';
  if ((r.defects||[]).length || r.defectsNotes) {
    var SEV_STYLES = {ADVISORY:'',MINOR:'color:#a16207',MAJOR:'color:#b91c1c;font-weight:600',CRITICAL:'color:#7f1d1d;font-weight:700'};
    var defRows = (r.defects||[]).map((d,i) => {
      var sev = d.severity || 'ADVISORY';
      var sevStyle = SEV_STYLES[sev] || '';
      return `<tr><td>${i+1}</td><td>${_esc(d.description)}</td><td style="${sevStyle}">${_esc(sev)}</td><td>${_esc(d.recommendation)}</td><td>${_esc(d.targetDate||'')}</td></tr>`;
    }).join('');
    defectSection = `
    <div class="glass-card">
      ${_ch('Defects &amp; Recommendations')}
      ${r.defectsOverall ? `<p style="font-size:10px;margin-bottom:8px;color:#5a5a5a"><strong style="color:#111">Overall condition:</strong> ${_esc(r.defectsOverall)}</p>` : ''}
      ${defRows ? `<table class="data-table"><thead><tr><th>#</th><th>Description</th><th>Severity</th><th>Recommendation</th><th>Target date</th></tr></thead><tbody>${defRows}</tbody></table>` : ''}
      ${r.defectsNotes ? `<p style="margin-top:7px;font-size:10px;color:#5a5a5a">${_esc(r.defectsNotes)}</p>` : ''}
    </div>`;
  }

  // ── Logo / company name in band ─────────────────────────────────────────────
  // Company logo always shows on the left; name text always shows next to it
  var bandLogoHtml = logoData
    ? `<img src="${logoData}" alt="" style="max-height:48px;max-width:120px;object-fit:contain;display:block;flex-shrink:0">`
    : '';

  var outClass = r.outcome==='SATISFACTORY' ? 'outcome-sat' : 'outcome-unsat';
  var issued   = new Date().toLocaleDateString('en-GB');

  // ── Company details card content ────────────────────────────────────────────
  var coAddrLines = companyAddr.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
  var niceicLogoHtml = niceicLogoData
    ? `<img src="${niceicLogoData}" alt="NICEIC" style="max-height:32px;max-width:90px;object-fit:contain;display:block;margin-top:6px">`
    : (niceicNo ? `<div class="co-niceic">NICEIC ${_esc(niceicNo)}</div>` : '');
  var coCardBody = `
    <div style="font-size:13px;font-weight:800;color:#111;margin-bottom:5px;letter-spacing:-.01em">${_esc(company)}</div>
    ${coAddrLines.length ? `<div style="font-size:9.5px;color:#5a5a5a;line-height:1.7;margin-bottom:4px">${coAddrLines.map(_esc).join('<br>')}</div>` : ''}
    ${companyTel   ? `<div style="font-size:9.5px;color:#5a5a5a;margin-bottom:2px"><strong style="color:#333">Tel:</strong> ${_esc(companyTel)}</div>` : ''}
    ${companyEmail ? `<div style="font-size:9.5px;color:#5a5a5a"><strong style="color:#333">Email:</strong> ${_esc(companyEmail)}</div>` : ''}
  `;

  // ── CSS ─────────────────────────────────────────────────────────────────────
  var css = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#2a2a2a;background:#fff}
    @page{size:A4;margin:0}
    @media print{
      .page{width:210mm;min-height:297mm;max-height:297mm;page-break-after:always;break-after:page;overflow:hidden}
      .page:last-of-type{page-break-after:auto;break-after:auto}
      body{background:#fff}
    }
    .page{width:210mm;min-height:297mm;background:#fff;border-top:5px solid #c8001c;display:flex;flex-direction:column;position:relative}

    .cert-topbar{display:flex;justify-content:space-between;align-items:center;padding:5px 20px;background:rgba(200,0,28,.04);border-bottom:1px solid rgba(200,0,28,.09);flex-shrink:0}
    .cert-topbar-left{display:flex;flex-direction:column;gap:1px}
    .cert-topbar-eyebrow{font-size:7.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c8001c}
    .cert-topbar-title{font-size:12px;font-weight:600;color:#111}
    .cert-topbar-std{font-size:10px;color:#909090;font-style:italic;margin-top:1px}
    .cert-ref-badge{background:#c8001c;color:#fff;border-radius:5px;padding:6px 14px;text-align:center;min-width:100px}
    .cert-ref-badge .ref-lbl{display:block;font-size:7px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;opacity:.8;margin-bottom:2px}
    .cert-ref-badge .ref-val{font-size:20px;font-weight:700;letter-spacing:.02em}

    .cert-co-band{display:flex;align-items:center;gap:14px;padding:10px 20px;border-bottom:2px solid rgba(200,0,28,.12);background:linear-gradient(180deg,rgba(200,0,28,.025) 0%,transparent 100%);flex-shrink:0}
    .co-name-lg{font-size:22px;font-weight:900;color:#111;letter-spacing:-.02em;line-height:1.1}
    .co-band-details{display:flex;gap:14px;flex-wrap:wrap;align-items:center;flex:1}
    .co-band-item{font-size:9px;color:#5a5a5a}
    .co-band-item strong{color:#333;font-weight:600}
    .co-niceic{display:inline-flex;align-items:center;gap:4px;background:rgba(200,0,28,.07);border:1px solid rgba(200,0,28,.18);border-radius:3px;padding:2px 7px;font-size:8px;font-weight:700;color:#c8001c;letter-spacing:.06em}

    .cert-body{padding:10px 20px;display:flex;flex-direction:column;gap:8px;flex:1}
    .meta-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
    .card-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;break-inside:avoid;page-break-inside:avoid}
    .sys-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
    .half-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .glass-card{background:linear-gradient(135deg,rgba(200,0,28,.052) 0%,rgba(200,0,28,.020) 50%,rgba(200,0,28,.006) 100%);border:1px solid rgba(200,0,28,.15);border-top:2px solid rgba(200,0,28,.28);border-radius:5px;padding:9px 11px;break-inside:avoid;page-break-inside:avoid;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
    .card-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
    .card-bar{width:3px;height:11px;background:#c8001c;border-radius:2px;flex-shrink:0}
    .card-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#111}
    .card-rule{flex:1;height:1px;background:rgba(200,0,28,.12)}

    .spec-pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}
    .spec-pill{display:flex;flex-direction:column;align-items:center;background:rgba(200,0,28,.07);border:1px solid rgba(200,0,28,.17);border-radius:4px;padding:4px 10px;min-width:72px}
    .pill-lbl{font-size:7px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c8001c;margin-bottom:2px}
    .pill-val{font-size:14px;font-weight:700;color:#111;letter-spacing:-.01em}
    .pill-sm{font-size:11.5px}
    .pill-bold{font-size:14px;font-weight:800;color:#111}
    .pill-desc{font-size:8px;color:#5a5a5a;margin-top:1px;font-weight:400;text-align:center}

    table.info-table{width:100%;border-collapse:collapse}
    table.info-table tr+tr td{border-top:1px solid rgba(200,0,28,.07)}
    table.info-table td{padding:3.5px 3px;vertical-align:top;font-size:11px}
    table.info-table .lbl{width:43%;color:#5a5a5a;font-size:10.5px;padding-right:5px}
    table.info-table .val{font-weight:500;color:#111}
    table.data-table{width:100%;border-collapse:collapse;font-size:11px;border:1px solid rgba(200,0,28,.15);border-radius:4px;overflow:hidden}
    table.data-table thead tr{background:rgba(200,0,28,.78)}
    table.data-table th{padding:5px 7px;text-align:left;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.95);border-right:1px solid rgba(255,255,255,.10)}
    table.data-table th:last-child{border-right:none}
    table.data-table tbody tr:nth-child(even){background:rgba(200,0,28,.04)}
    table.data-table td{padding:4.5px 7px;border-bottom:1px solid rgba(200,0,28,.07);border-right:1px solid rgba(200,0,28,.05);vertical-align:top}
    table.data-table td:last-child{border-right:none}
    table.data-table tbody tr:last-child td{border-bottom:none}
    .pass{color:#15803d;font-weight:600}
    .fail{color:#c8001c;font-weight:600}

    .outcome-sat{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.03em;background:rgba(21,128,61,.09);color:#15803d;border:1.5px solid rgba(21,128,61,.24);margin-bottom:8px}
    .outcome-unsat{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.03em;background:rgba(200,0,28,.08);color:#c8001c;border:1.5px solid rgba(200,0,28,.24);margin-bottom:8px}
    .outcome-dot{width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.75}
    .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .sig-box{background:rgba(200,0,28,.025);border:1px dashed rgba(200,0,28,.22);border-radius:4px;min-height:42px;padding:5px 9px}
    .sig-lbl{font-size:7.5px;text-transform:uppercase;letter-spacing:.1em;color:#909090;margin-bottom:3px}
    .decl{font-size:11px;color:#5a5a5a;line-height:1.6}

    .cert-footer{border-top:1px solid rgba(200,0,28,.10);background:linear-gradient(180deg,rgba(200,0,28,.04) 0%,rgba(200,0,28,.02) 100%);padding:6px 20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;font-size:10px;color:#909090;flex-shrink:0}
    .cert-footer strong{color:#5a5a5a}
    .cont-header{background:linear-gradient(180deg,rgba(200,0,28,.03) 0%,transparent 100%);padding:8px 20px;border-bottom:1px solid rgba(200,0,28,.10);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
    .cont-lbl{font-size:8.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#c8001c}
    .cont-addr{font-size:10px;color:#5a5a5a;margin-top:1px}
  `;

  // ── Page 1 ──────────────────────────────────────────────────────────────────
  var page1 = `
  <div class="page">
    <div class="cert-topbar">
      <div class="cert-topbar-left">
        <div class="cert-topbar-eyebrow">Fire Alarm Certificate</div>
        <div class="cert-topbar-title">${_esc(typeTitle)}</div>
        <div class="cert-topbar-std">${_esc(stdLabel)}</div>
      </div>
      <div class="cert-ref-badge">
        <span class="ref-lbl">Certificate Ref</span>
        <span class="ref-val">${_esc(r.ref||'—')}</span>
      </div>
    </div>

    <div class="cert-co-band">
      ${bandLogoHtml}
      <div class="co-band-details">
        <div class="co-name-lg">${_esc(company)}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:3px">
          ${companyAddr ? `<span class="co-band-item">${_esc(companyAddr.split(/[,\n]/)[0].trim())}</span>` : ''}
          ${companyTel  ? `<span class="co-band-item"><strong>T:</strong> ${_esc(companyTel)}</span>` : ''}
          ${companyEmail? `<span class="co-band-item"><strong>E:</strong> ${_esc(companyEmail)}</span>` : ''}
          ${(!niceicLogoData && niceicNo) ? `<span class="co-niceic">NICEIC ${_esc(niceicNo)}</span>` : ''}
        </div>
      </div>
      ${niceicLogoData ? `<img src="${niceicLogoData}" alt="NICEIC" style="max-height:40px;max-width:90px;object-fit:contain;display:block;flex-shrink:0;margin-left:auto">` : ''}
    </div>

    <div class="cert-body">

      <div class="meta-row" style="grid-template-columns:${metaCols}">
        <div class="glass-card">
          ${_ch('Premises')}
          <table class="info-table">${r.premisesName?_cell('Name', r.premisesName):''}${premAddr?_cell('Address', premAddr):''}</table>
        </div>
        ${hasClient ? `<div class="glass-card">
          ${_ch('Client / Landlord')}
          <table class="info-table">${r.clientName?`<tr><td class="lbl">Name</td><td class="val" style="font-weight:700;font-size:12px">${_esc(r.clientName)}</td></tr>`:''}${r.responsiblePerson?_cell('Responsible person', r.responsiblePerson):''}${clientAddr?_cell('Address', clientAddr):''}${r.clientEmail?_cell('Email', r.clientEmail):''}</table>
        </div>` : ''}
        <div class="glass-card">
          ${_ch('Contractor Details')}
          ${coCardBody}
        </div>
      </div>

      <div class="glass-card">
        ${_ch('System Details')}
        ${specPills ? `<div class="spec-pills">${specPills}</div>` : ''}
        <div class="sys-grid">
          <table class="info-table">${sysCol1}</table>
          <table class="info-table">${sysCol2}</table>
          <table class="info-table">${sysCol3}</table>
        </div>
      </div>

      ${(r.detectors||[]).length ? `<div class="glass-card">
        ${_ch('Detectors &amp; Devices')}
        <table class="data-table"><thead><tr>${detHeaders}</tr></thead><tbody>${detRows}</tbody></table>
      </div>` : ''}

      <div class="glass-card">
        ${_ch('Testing Results')}
        <div class="half-row">
          <table class="info-table">${testCols[0]||'<tr><td class="val" colspan="2" style="color:#909090">—</td></tr>'}</table>
          <table class="info-table">${testCols[1]||''}</table>
        </div>
      </div>

    </div>
  </div>`;

  // ── Page 2 ──────────────────────────────────────────────────────────────────
  var page2 = `
  <div class="page">
    <div class="cont-header">
      <div>
        <div class="cont-lbl">Fire Alarm Certificate — continued</div>
        <div class="cont-addr">${_esc(premAddr)} · Ref: ${_esc(r.ref||'—')}</div>
      </div>
      <div style="font-size:8.5px;color:#909090">${_esc(r.testDate||issued)}</div>
    </div>

    <div class="cert-body">

      ${defectSection}

      <div class="glass-card">
        ${_ch('Outcome')}
        <div class="${outClass}"><span class="outcome-dot"></span>${_esc(r.outcome||'—')}</div>
        ${r.sysOperational?`<table class="info-table" style="max-width:400px">${_cell('System operational at leaving', r.sysOperational)}</table>`:''}
        ${r.worksCarried?`<table class="info-table" style="max-width:400px;margin-top:4px">${_cell('Works carried out', r.worksCarried)}</table>`:''}
      </div>

      <div class="glass-card">
        ${_ch('Engineer Sign-off')}
        <div class="half-row" style="margin-bottom:8px">
          <table class="info-table">
            ${_cell('Engineer name', r.engineerName)}
            ${r.engineerQual?_cell('Qualification / ID', r.engineerQual):''}
          </table>
          <table class="info-table">
            ${_cell('Company', r.companyName)}
            ${_cell('Date of inspection', r.testDate)}
          </table>
        </div>
        <div class="sig-row">
          <div class="sig-box"><div class="sig-lbl">Engineer signature</div></div>
          <div class="sig-box"><div class="sig-lbl">Client signature (if on-site)</div></div>
        </div>
      </div>

      <div class="glass-card">
        ${_ch('Declaration')}
        <p class="decl">I/We confirm that the fire alarm system described in this certificate has been inspected and tested in accordance with ${_esc(stdLabel)} and that the results stated are a true record of the condition of the installation at the time of inspection. This certificate does not guarantee that the installation will remain free from defects in the future.</p>
      </div>

    </div>

    <div class="cert-footer">
      <span><strong>${_esc(company)}</strong> — Fire Alarm Certificate</span>
      <span>Ref: <strong>${_esc(r.ref||'—')}</strong> · Issued ${issued}</span>
      <span>Keep in a safe place. Present on request.</span>
    </div>
  </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fire Alarm Certificate — ${_esc(r.ref||'')}</title><style>${css}</style></head><body>${page1}${page2}</body></html>`;
}
