import { sb } from '../../lib/supabase.js';
import { state, isAdmin } from '../../lib/state.js';
import { toast, showOverlay, hideOverlay, confirm2, _softDelete, esc, _addrColor, _addrInitials } from '../../lib/utils.js';
import { idbEnqueue, refreshSyncBadge } from '../../lib/offline.js';
import { getSetting } from '../../lib/settings.js';
import { navigate } from '../../nav/navigation.js';
import { buildCertRefSeq, _pcScore, _refAddrPart } from '../_core/refgen.js';
import { sendBrevoEmail, buildEmailSubject, getGlobalCC } from '../../lib/brevo.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
import { PAGE_SIZE, hlText, sortByWordStart, paginationHtml } from '../../lib/search.js';

let _w = {};
let _elDirty = false;
let _dir = { properties: null };
let _elAllCerts = [];
let _elPage = 1, _elFiltered = [], _elCurrentQ = '';

const STEPS = ['type','premises','client','system','purpose','duration','test','luminaires','instruments','checklist','outcome','observations','engineer','review'];
const CERT_TYPES = [
  {id:'EL.1', label:'EL.1 — Completion Certificate', sub:'New installation or major modification — BS 5266-1 Annex B'},
  {id:'EL.2', label:'EL.2 — Periodic Inspection & Test', sub:'Annual / monthly service record — BS 5266-1 Annex C'},
  {id:'EL.3', label:'EL.3 — Existing Site Assessment', sub:'Condition report for existing systems — BS 5266-1 Annex D'}
];
const PREMISES_TYPES = ['House','Flat / Apartment','HMO','Commercial Office','Retail / Shop','Care Home','School / College','Warehouse','Hotel','Restaurant / Café','Other'];
const SYSTEM_TYPES = ['Self-contained luminaires','Central battery system','Sub-mains (generator)','Combined system'];
const MODES = ['Non-maintained (X)','Maintained (Y)','Sustained (Z)'];
const DURATIONS = ['1 hour','2 hours','3 hours'];
const INSPECTION_TYPES = ['Annual full test','Monthly functional test','Commissioning test','Quarterly check'];

function _ibtn(label, icon, onclick, danger = false) {
  return `<button onclick="${onclick}" title="${label}" style="width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${danger ? '#fca5a5' : 'var(--border)'};border-radius:6px;background:var(--surface);color:${danger ? '#dc2626' : 'var(--muted)'};cursor:pointer;font-size:12px"><i class="fa-solid ${icon}"></i></button>`;
}

function todayStr() {
  var d = new Date();
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}

function genRef(type) {
  var n = Math.floor(Math.random()*90000)+10000;
  return type+'-'+new Date().getFullYear()+'-'+n;
}

export function startNewEL() {
  _elDirty = false;
  var _prevSaved = null;
  try {
    var _ps = localStorage.getItem('el_autosave');
    if (_ps) { _prevSaved = JSON.parse(_ps); if (!_prevSaved || !_prevSaved.certType) _prevSaved = null; }
  } catch(e) {}
  _w = {
    step: 0, _savedDraft: _prevSaved || null,
    certType: '',
    premisesName: '', premisesAddress: '',
    premAddr1: '', premAddr2: '', premAddr3: '', premPostcode: '',
    premisesType: '', _ptShowMore: false, occupancy: '',
    clientName: '', clientType: '',
    clientAddr1: '', clientAddr2: '', clientAddr3: '', clientPostcode: '',
    clientEmail: getSetting('el_client_email_default','gbelectricalcertificates@hotmail.com'),
    systemType: '', mode: '',
    ratedDuration: '3 hours',
    testDate: todayStr(), nextTestDate: '', retestPeriod: '12months', inspectionType: '',
    purpEscape: '✓', purpStandby: 'N/A', purpEscRoute: '✓',
    purpPartial: 'N/A', purpOpen: 'N/A', purpHighRisk: 'N/A',
    arSelfContained: 'N/A', arGenerator: 'N/A', arCentral: 'N/A', arCombined: 'N/A',
    inst1Brand: getSetting('el_inst1_brand',''), inst1Model: getSetting('el_inst1_model',''),
    inst2Brand: getSetting('el_inst2_brand',''), inst2Model: getSetting('el_inst2_model',''),
    pItems: {p1:'✓',p2:'✓',p3:'✓',p4:'✓',p5:'✓',p6:'N/A',p7:'✓',
             p9:'✓',p10:'N/A',p11:'✓',p12:'✓',p13:'✓',p14:'N/A',
             p15:'✓',p16:'✓',p17:'✓',p18:'✓',p19:'✓',p20:'✓',
             p21:'✓',p22:'N/A',p23:'✓'},
    checklistNotes: '',
    lumTotal: '', lumPass: '', lumFail: '',
    outcome: '', durationAchieved: '3 hours',
    observations: '', observationRows: [],
    engineerName: getSetting('el_engineer', getSetting('default_engineer','')),
    niceicNo: getSetting('el_enrol_no', getSetting('niceic_scheme_no','')),
    ref: ''
  };
  (function() {
    var p = _w.testDate.split('/');
    if (p.length === 3) {
      var d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
      d.setFullYear(d.getFullYear()+1); d.setDate(d.getDate()-1);
      _w.nextTestDate = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
    }
  })();
  navigate('el-new');
}

export function startNewELWithType(certType) {
  startNewEL(); _w.certType = certType; _w.step = 1; navigate('el-new');
}

export function elUpdateSubtitle() {
  var hs = document.getElementById('elwiz-header-sub'); if (!hs) return;
  var addr1 = (_w.premAddr1||'').trim(); var pc = (_w.premPostcode||'').trim();
  var addrStr = [addr1, pc].filter(Boolean).join(', ');
  if (_w.baseRef && addrStr) {
    var yy = String(new Date().getFullYear()).slice(-2);
    var score = _pcScore(pc); var aPart = _refAddrPart(addr1);
    _w.ref = _w.baseRef + yy + score + ' / ' + aPart;
    hs.textContent = _w.baseRef + ' · ' + addrStr;
  } else if (_w.baseRef) {
    hs.textContent = (_w.certType||'EL') + ' · ' + _w.baseRef + ' · Awaiting address…';
  } else if (_w.certType) {
    hs.textContent = _w.certType + ' · Reserving ref…';
  } else { hs.textContent = 'BS 5266-1 Emergency Lighting'; }
}

export function elRenderStep() {
  var el = document.getElementById('el-wizard-body'); if (!el) return;
  var s = _w.step;
  var prog = STEPS.map((nm,i) => `<div class="wiz-dot${i===s?' on':i<s?' done':''}" title="${nm}"></div>`).join('');
  var html = `<div class="wiz-progress">${prog}</div>`;

  if (s === 0) {
    html += `<h2 class="wiz-title">Certificate Type</h2>`;
    if (_w._savedDraft) {
      html += `<div class="wiz-restore-bar"><span>Unsaved draft found (${_w._savedDraft.certType||'EL'})</span><button onclick="elRestoreAutosave()" class="btn btn-sm btn-accent">Restore</button><button onclick="elDiscardAutosave()" class="btn btn-sm btn-secondary">Discard</button></div>`;
    }
    html += `<div class="wiz-cards">`;
    CERT_TYPES.forEach(ct => {
      html += `<div class="wiz-card${_w.certType===ct.id?' sel':''}" onclick="elPick('certType','${ct.id}')"><strong>${esc(ct.label)}</strong><span>${esc(ct.sub)}</span></div>`;
    });
    html += `</div>`;
    html += `<div class="wiz-nav"><button onclick="elNext()" class="btn-primary" ${!_w.certType?'disabled':''}>Next →</button></div>`;

  } else if (s === 1) {
    html += `<h2 class="wiz-title">Premises Details</h2>`;
    html += `<div class="wiz-field"><label>Premises Name</label><input value="${esc(_w.premisesName)}" oninput="elSet('premisesName',this.value)" placeholder="e.g. The Crown Hotel"></div>`;
    html += `<div class="wiz-field"><label>Address Line 1</label><input value="${esc(_w.premAddr1)}" oninput="elSet('premAddr1',this.value);elUpdateSubtitle()" placeholder="House no. & street"></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.premAddr2)}" oninput="elSet('premAddr2',this.value)" placeholder="District / area (optional)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.premAddr3)}" oninput="elSet('premAddr3',this.value)" placeholder="Town or city"></div>`;
    html += `<div class="wiz-field"><label>Postcode</label><input value="${esc(_w.premPostcode)}" oninput="elSet('premPostcode',this.value);elUpdateSubtitle()" placeholder="e.g. SW1A 1AA" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Property Type</label><div class="chip-row">`;
    var showTypes = _w._ptShowMore ? PREMISES_TYPES : PREMISES_TYPES.slice(0,6);
    showTypes.forEach(pt => { html += `<button class="chip${_w.premisesType===pt?' on':''}" onclick="elPickPremType('${esc(pt)}')">${esc(pt)}</button>`; });
    if (!_w._ptShowMore) html += `<button class="chip" onclick="elToggleMorePremTypes()">More…</button>`;
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Occupancy / Use</label><input value="${esc(_w.occupancy)}" oninput="elSet('occupancy',this.value)" placeholder="e.g. 50 persons, offices"></div>`;
    html += `<div style="margin-bottom:8px"><button onclick="elPickFromDirectory()" class="btn-sm"><i class="fa-solid fa-address-book"></i> Pick from directory</button></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 2) {
    var customTypes = [];
    try { customTypes = JSON.parse(localStorage.getItem('el_client_types_custom')||'[]'); } catch(e) {}
    var allClientTypes = ['Building Owner','Tenant','Facilities Manager','Landlord','Main Contractor'].concat(customTypes);
    html += `<h2 class="wiz-title">Client Details</h2>`;
    html += `<div class="wiz-field"><label>Client Name</label><input value="${esc(_w.clientName)}" oninput="elSet('clientName',this.value)" placeholder="Full name or company"></div>`;
    html += `<div class="wiz-field"><label>Client Type</label><div class="chip-row">`;
    allClientTypes.forEach(ct => { html += `<button class="chip${_w.clientType===ct?' on':''}" onclick="elSet('clientType','${esc(ct)}')">${esc(ct)}</button>`; });
    html += `<button class="chip" onclick="elSaveClientType()">+ Custom</button></div></div>`;
    html += `<div class="wiz-field"><label>Client Address Line 1</label><input value="${esc(_w.clientAddr1)}" oninput="elSet('clientAddr1',this.value)" placeholder="(if different from premises)"></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.clientAddr2)}" oninput="elSet('clientAddr2',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.clientAddr3)}" oninput="elSet('clientAddr3',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Postcode</label><input value="${esc(_w.clientPostcode)}" oninput="elSet('clientPostcode',this.value)" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Client Email (for auto-send)</label><input type="email" value="${esc(_w.clientEmail)}" oninput="elSet('clientEmail',this.value)" placeholder="client@example.com"></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 3) {
    var sysDescriptions = {
      'Self-contained luminaires': 'Individual fittings with integral battery — BS EN 60598-2-22',
      'Central battery system': 'Central battery supplies multiple luminaires via dedicated wiring',
      'Sub-mains (generator)': 'Generator or UPS provides power to emergency circuits',
      'Combined system': 'Mix of self-contained and central battery/generator'
    };
    html += `<h2 class="wiz-title">System Type</h2>`;
    html += `<div class="wiz-cards">`;
    SYSTEM_TYPES.forEach(st => {
      html += `<div class="wiz-card${_w.systemType===st?' sel':''}" onclick="elPick('systemType','${esc(st)}')"><strong>${esc(st)}</strong><span>${esc(sysDescriptions[st]||'')}</span></div>`;
    });
    html += `</div>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Operating Mode</label><div class="chip-row">`;
    MODES.forEach(m => { html += `<button class="chip${_w.mode===m?' on':''}" onclick="elSet('mode','${esc(m)}')">${esc(m)}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary" ${!_w.systemType?'disabled':''}>Next →</button></div>`;

  } else if (s === 4) {
    var purps = [
      {k:'purpEscape', label:'Escape lighting'},
      {k:'purpStandby', label:'Standby lighting'},
      {k:'purpEscRoute', label:'Escape route signage'},
      {k:'purpPartial', label:'Partial standby'},
      {k:'purpOpen', label:'Open area (anti-panic)'},
      {k:'purpHighRisk', label:'High risk task area'}
    ];
    var arrs = [
      {k:'arSelfContained', label:'Self-contained'},
      {k:'arGenerator', label:'Generator'},
      {k:'arCentral', label:'Central battery'},
      {k:'arCombined', label:'Combined'}
    ];
    html += `<h2 class="wiz-title">Purpose & Arrangement</h2>`;
    html += `<p style="color:var(--muted);font-size:13px;margin-bottom:8px">Mark each category as applicable (✓) or not applicable (N/A).</p>`;
    html += `<table class="wiz-toggle-table"><thead><tr><th>Purpose</th><th>✓</th><th>N/A</th></tr></thead><tbody>`;
    purps.forEach(p => {
      html += `<tr><td>${esc(p.label)}</td>`;
      html += `<td><button class="tog-btn${_w[p.k]==='✓'?' on':''}" onclick="elSet('${p.k}','✓')">✓</button></td>`;
      html += `<td><button class="tog-btn${_w[p.k]==='N/A'?' on':''}" onclick="elSet('${p.k}','N/A')">N/A</button></td></tr>`;
    });
    html += `</tbody></table>`;
    html += `<h3 style="margin:16px 0 8px;font-size:14px">Arrangement</h3>`;
    html += `<table class="wiz-toggle-table"><thead><tr><th>Type</th><th>✓</th><th>N/A</th></tr></thead><tbody>`;
    arrs.forEach(a => {
      html += `<tr><td>${esc(a.label)}</td>`;
      html += `<td><button class="tog-btn${_w[a.k]==='✓'?' on':''}" onclick="elSet('${a.k}','✓')">✓</button></td>`;
      html += `<td><button class="tog-btn${_w[a.k]==='N/A'?' on':''}" onclick="elSet('${a.k}','N/A')">N/A</button></td></tr>`;
    });
    html += `</tbody></table>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 5) {
    html += `<h2 class="wiz-title">Rated Duration</h2>`;
    html += `<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Minimum duration the system must operate in emergency mode (BS 5266-1).</p>`;
    html += `<div class="chip-row">`;
    DURATIONS.forEach(d => { html += `<button class="chip large${_w.ratedDuration===d?' on':''}" onclick="elSet('ratedDuration','${d}')">${esc(d)}</button>`; });
    html += `</div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 6) {
    html += `<h2 class="wiz-title">Test Details</h2>`;
    html += `<div class="wiz-field"><label>Test Date</label><input type="text" value="${esc(_w.testDate)}" oninput="elSetElDate('testDate',this.value)" placeholder="DD/MM/YYYY"></div>`;
    html += `<div class="wiz-field"><label>Next Test Due</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="text" value="${esc(_w.nextTestDate)}" oninput="elSet('nextTestDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:160px">`;
    html += `<button class="btn-sm" onclick="elSetPeriod('6months')">6 months</button><button class="btn-sm" onclick="elSetPeriod('12months')">12 months</button></div></div>`;
    if (_w.certType === 'EL.2') {
      html += `<div class="wiz-field"><label>Inspection Type</label><div class="chip-row">`;
      INSPECTION_TYPES.forEach(it => { html += `<button class="chip${_w.inspectionType===it?' on':''}" onclick="elSet('inspectionType','${esc(it)}')">${esc(it)}</button>`; });
      html += `</div></div>`;
    }
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 7) {
    html += `<h2 class="wiz-title">Luminaires</h2>`;
    html += `<div class="lum-grid"><div class="wiz-field"><label>Total Luminaires</label><input type="number" min="0" value="${esc(_w.lumTotal)}" oninput="elSet('lumTotal',this.value);elLumCalc()"></div>`;
    html += `<div class="wiz-field"><label>Pass</label><input type="number" min="0" value="${esc(_w.lumPass)}" oninput="elSet('lumPass',this.value);elLumCalc()"></div>`;
    html += `<div class="wiz-field"><label>Fail</label><input type="number" min="0" value="${esc(_w.lumFail)}" oninput="elSet('lumFail',this.value);elLumCalc()"></div></div>`;
    html += `<h3 style="font-size:13px;margin:12px 0 6px">Location Results</h3>`;
    var lumRows = Array.isArray(_w.lumRows) ? _w.lumRows : [];
    if (lumRows.length) {
      html += `<table class="wiz-table"><thead><tr><th>Location</th><th>Duration</th><th>Result</th><th></th></tr></thead><tbody>`;
      lumRows.forEach((r,i) => {
        html += `<tr><td><input value="${esc(r.location||'')}" oninput="elSetLumRow(${i},'location',this.value)" placeholder="Location"></td>`;
        html += `<td><input value="${esc(r.duration||'')}" oninput="elSetLumRow(${i},'duration',this.value)" placeholder="${esc(_w.ratedDuration)}" style="max-width:80px"></td>`;
        html += `<td><button class="tog-btn${r.result==='PASS'?' pass':''}" onclick="elToggleLumResult(${i},'PASS')">PASS</button> <button class="tog-btn${r.result==='FAIL'?' fail':''}" onclick="elToggleLumResult(${i},'FAIL')">FAIL</button></td>`;
        html += `<td>${_ibtn('Remove','fa-trash',`elRemoveLumRow(${i})`,true)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
    html += `<button class="btn-sm" onclick="elAddLumRow()" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Add location row</button>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 8) {
    html += `<h2 class="wiz-title">Test Instruments</h2>`;
    html += `<div class="wiz-field"><label>Instrument 1 — Brand / Make</label><input value="${esc(_w.inst1Brand)}" oninput="elSet('inst1Brand',this.value)" placeholder="e.g. Megger"></div>`;
    html += `<div class="wiz-field"><label>Instrument 1 — Model</label><input value="${esc(_w.inst1Model)}" oninput="elSet('inst1Model',this.value)" placeholder="e.g. MFT1720"></div>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Instrument 2 — Brand / Make</label><input value="${esc(_w.inst2Brand)}" oninput="elSet('inst2Brand',this.value)" placeholder="e.g. Fluke"></div>`;
    html += `<div class="wiz-field"><label>Instrument 2 — Model</label><input value="${esc(_w.inst2Model)}" oninput="elSet('inst2Model',this.value)" placeholder="e.g. 1507"></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 9) {
    var P_ITEMS = [
      {k:'p1',  label:'1. Emergency luminaires correctly positioned and adequate coverage'},
      {k:'p2',  label:'2. Luminaires correctly mounted and accessible'},
      {k:'p3',  label:'3. Self-contained luminaires — battery charge indicators visible'},
      {k:'p4',  label:'4. Central battery — charger functioning and correct output'},
      {k:'p5',  label:'5. All necessary exit signs correctly positioned'},
      {k:'p6',  label:'6. Exit signs — legend meets BS 5499 or ISO 7010'},
      {k:'p7',  label:'7. Manual testing devices working and accessible'},
      {k:'p9',  label:'9. Central monitoring/control panel functional'},
      {k:'p10', label:'10. Inhibit mode available and documented'},
      {k:'p11', label:'11. Wiring protected against damage'},
      {k:'p12', label:'12. System earthed and connections secure'},
      {k:'p13', label:'13. Log book available and completed'},
      {k:'p14', label:'14. Maintenance contractor details displayed'},
      {k:'p15', label:'15. Previous test records available'},
      {k:'p16', label:'16. Duration test completed satisfactorily'},
      {k:'p17', label:'17. Functional test satisfactory'},
      {k:'p18', label:'18. Charging current restored after test'},
      {k:'p19', label:'19. All luminaires energised after test'},
      {k:'p20', label:'20. Defects identified and noted'},
      {k:'p21', label:'21. Certificate / log updated'},
      {k:'p22', label:'22. System handed over to responsible person'},
      {k:'p23', label:'23. No defects outstanding at time of certificate'}
    ];
    html += `<h2 class="wiz-title">Compliance Checklist</h2>`;
    html += `<table class="wiz-table checklist-table"><thead><tr><th>Item</th><th>✓</th><th>✗</th><th>N/A</th></tr></thead><tbody>`;
    P_ITEMS.forEach(pi => {
      var v = (_w.pItems||{})[pi.k] || 'N/A';
      html += `<tr><td style="font-size:12px">${esc(pi.label)}</td>`;
      html += `<td><button class="tog-btn${v==='✓'?' on':''}" onclick="elSetPItem('${pi.k}','✓')">✓</button></td>`;
      html += `<td><button class="tog-btn${v==='✗'?' fail':''}" onclick="elSetPItem('${pi.k}','✗')">✗</button></td>`;
      html += `<td><button class="tog-btn${v==='N/A'?' on':''}" onclick="elSetPItem('${pi.k}','N/A')">N/A</button></td></tr>`;
    });
    html += `</tbody></table>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Checklist Notes</label><textarea oninput="elSet('checklistNotes',this.value)" rows="3" placeholder="Any additional notes…">${esc(_w.checklistNotes)}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 10) {
    html += `<h2 class="wiz-title">Outcome</h2>`;
    html += `<div class="wiz-cards">`;
    ['SATISFACTORY','UNSATISFACTORY'].forEach(o => {
      var col = o === 'SATISFACTORY' ? '#16a34a' : '#dc2626';
      html += `<div class="wiz-card${_w.outcome===o?' sel':''}" onclick="elPick('outcome','${o}')" style="${_w.outcome===o?`border-color:${col};background:${col}11`:``}"><strong style="color:${col}">${o}</strong></div>`;
    });
    html += `</div>`;
    var showDur = _w.outcome === 'SATISFACTORY';
    html += `<div id="el-dur-field" style="display:${showDur?'block':'none'};margin-top:12px">`;
    html += `<div class="wiz-field"><label>Duration Achieved</label><div class="chip-row">`;
    DURATIONS.forEach(d => { html += `<button class="chip${_w.durationAchieved===d?' on':''}" onclick="elSet('durationAchieved','${d}')">${esc(d)}</button>`; });
    html += `</div></div></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary" ${!_w.outcome?'disabled':''}>Next →</button></div>`;

  } else if (s === 11) {
    var quickObs = [
      {code:'C1', text:'Danger present — immediate remedial action required'},
      {code:'C2', text:'Potentially dangerous — urgent remedial action required'},
      {code:'C3', text:'Improvement recommended'},
      {code:'FI', text:'Further investigation required'}
    ];
    html += `<h2 class="wiz-title">Observations</h2>`;
    html += `<div class="wiz-field"><label>General Observations</label><textarea oninput="elSet('observations',this.value)" rows="3" placeholder="Overall condition, scope, any limitations…">${esc(_w.observations)}</textarea></div>`;
    html += `<p style="font-size:12px;color:var(--muted);margin-bottom:6px">Quick-add:</p><div class="chip-row" style="margin-bottom:12px">`;
    quickObs.forEach(q => { html += `<button class="chip" onclick="elAddObsRow('${q.code}','${esc(q.text)}')">${q.code}</button>`; });
    html += `</div>`;
    var obsRows = Array.isArray(_w.observationRows) ? _w.observationRows : [];
    if (obsRows.length) {
      html += `<table class="wiz-table"><thead><tr><th style="width:70px">Code</th><th>Observation</th><th></th></tr></thead><tbody>`;
      obsRows.forEach((r,i) => {
        html += `<tr><td><select onchange="elObsCode(${i},this.value)">`;
        ['C1','C2','C3','FI','—'].forEach(c => { html += `<option${r.code===c?' selected':''}>${c}</option>`; });
        html += `</select></td><td><input value="${esc(r.text||'')}" oninput="elObsText(${i},this.value)"></td><td>${_ibtn('Remove','fa-trash',`elRemoveObsRow(${i})`,true)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
    html += `<button class="btn-sm" onclick="elAddObsRow('C3','')" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Add row</button>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 12) {
    html += `<h2 class="wiz-title">Engineer</h2>`;
    html += `<div class="wiz-field"><label>Engineer Name</label><input value="${esc(_w.engineerName)}" oninput="elSet('engineerName',this.value)" placeholder="Full name"></div>`;
    html += `<div class="wiz-field"><label>NICEIC Enrolment / Scheme No.</label><input value="${esc(_w.niceicNo)}" oninput="elSet('niceicNo',this.value)" placeholder="e.g. 12345678"></div>`;
    html += `<div style="margin-bottom:8px"><button onclick="(function(){var n=prompt('Select engineer:');if(n)elSet('engineerName',n);})()" class="btn-sm"><i class="fa-solid fa-user"></i> Pick engineer</button></div>`;
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elNext()" class="btn-primary">Next →</button></div>`;

  } else if (s === 13) {
    var addr = [_w.premAddr1, _w.premAddr2, _w.premAddr3, _w.premPostcode].filter(Boolean).join(', ');
    html += `<h2 class="wiz-title">Review & Issue</h2>`;
    html += `<div class="review-grid">`;
    var rows = [
      ['Certificate Type', _w.certType],
      ['Premises', _w.premisesName || addr],
      ['Address', addr],
      ['Client', _w.clientName],
      ['System Type', _w.systemType],
      ['Operating Mode', _w.mode],
      ['Rated Duration', _w.ratedDuration],
      ['Test Date', _w.testDate],
      ['Next Test Due', _w.nextTestDate],
      ['Luminaires', `${_w.lumTotal||0} total · ${_w.lumPass||0} pass · ${_w.lumFail||0} fail`],
      ['Outcome', _w.outcome],
      ['Engineer', _w.engineerName],
      ['NICEIC No.', _w.niceicNo]
    ];
    rows.forEach(([k,v]) => { if (v) html += `<div class="rv-row"><span class="rv-key">${esc(k)}</span><span class="rv-val">${esc(v)}</span></div>`; });
    html += `</div>`;
    if (!_w.ref || _w.ref === 'Generating…') {
      html += `<p style="font-size:12px;color:var(--muted)">Reference will be generated on issue.</p>`;
    } else {
      html += `<p style="font-size:13px;color:var(--accent);font-weight:600">Ref: ${esc(_w.ref)}</p>`;
    }
    html += `<div class="wiz-nav"><button onclick="elBack()" class="btn-sm">← Back</button><button onclick="elPreviewCurrent()" class="btn-sm"><i class="fa-solid fa-eye"></i> Preview</button><button onclick="elSave()" class="btn-primary btn-issue"><i class="fa-solid fa-certificate"></i> ${_w._editId ? 'Update' : 'Issue Certificate'}</button></div>`;
  }

  el.innerHTML = html;
  try { localStorage.setItem('el_autosave', JSON.stringify(_w)); } catch(e) {}

  // Address autocomplete on premises step (step 1)
  if (s === 1) {
    const _a1 = el.querySelector('input[placeholder="House no. & street"]');
    if (_a1) attachAddressAutocomplete(_a1, {
      onSelect(a) {
        _w.premAddr1  = a.line1;
        _w.premAddr2  = [a.line2, a.line3].filter(Boolean).join(', ');
        _w.premAddr3  = a.town;
        _w.premPostcode = a.postcode;
        _elDirty = true;
        elRenderStep();
      }
    });
  }
}

export function elSet(key, val) {
  _w[key] = val;
  _elDirty = true;
}

export function elPickFromDirectory() {
  var props = _dir.properties;
  if (!props || !props.length) {
    toast('Property directory is empty. Add properties in Settings → Directory.', 'info'); return;
  }
  var items = props.map((p,i) => `<div class="dir-item" onclick="window._elDirPick(${i})" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border)">${esc(p.address||p.name||'')}</div>`).join('');
  var modal = `<div id="el-dir-modal" style="position:fixed;inset:0;background:#0009;z-index:9999;display:flex;align-items:center;justify-content:center"><div style="background:var(--surface);border-radius:12px;max-width:440px;width:90%;max-height:70vh;display:flex;flex-direction:column"><div style="padding:16px;border-bottom:1px solid var(--border);font-weight:600">Pick Property</div><div style="overflow-y:auto;flex:1">${items}</div><div style="padding:12px;border-top:1px solid var(--border)"><button onclick="document.getElementById('el-dir-modal').remove()" class="btn-sm">Cancel</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', modal);
  window._elDirPick = function(i) {
    var p = props[i];
    if (p) {
      _w.premisesName = p.name || '';
      _w.premAddr1 = p.addr1 || p.address || '';
      _w.premAddr2 = p.addr2 || '';
      _w.premAddr3 = p.addr3 || p.town || '';
      _w.premPostcode = p.postcode || '';
      _w.premisesType = p.type || '';
    }
    document.getElementById('el-dir-modal').remove();
    elRenderStep();
    elUpdateSubtitle();
  };
}

export function elPickPremType(pt) {
  _w.premisesType = pt; _elDirty = true; elRenderStep();
}

export function elToggleMorePremTypes() {
  _w._ptShowMore = !_w._ptShowMore; elRenderStep();
}

export function elSaveClientType() {
  var ct = prompt('New client type:');
  if (!ct || !ct.trim()) return;
  ct = ct.trim();
  try {
    var arr = JSON.parse(localStorage.getItem('el_client_types_custom')||'[]');
    if (!arr.includes(ct)) arr.push(ct);
    localStorage.setItem('el_client_types_custom', JSON.stringify(arr));
  } catch(e) {}
  elRenderStep();
}

export function elSetElDate(key, val) {
  _w[key] = val; _elDirty = true;
  if (key === 'testDate') elAutoExpiry();
}

export function elAutoExpiry() {
  var p = (_w.testDate||'').split('/');
  if (p.length !== 3) return;
  var d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  if (isNaN(d.getTime())) return;
  if (_w.retestPeriod === '6months') { d.setMonth(d.getMonth()+6); d.setDate(d.getDate()-1); }
  else { d.setFullYear(d.getFullYear()+1); d.setDate(d.getDate()-1); }
  _w.nextTestDate = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  elRenderStep();
}

export function elAddObsRow(code, text) {
  if (!Array.isArray(_w.observationRows)) _w.observationRows = [];
  _w.observationRows.push({code: code||'C3', text: text||''}); _elDirty = true; elRenderStep();
}

export function elRemoveObsRow(i) {
  _w.observationRows.splice(i,1); _elDirty = true; elRenderStep();
}

export function elObsCode(i, val) {
  if (_w.observationRows[i]) _w.observationRows[i].code = val; _elDirty = true; elAutoOutcomeFromObs();
}

export function elObsText(i, val) {
  if (_w.observationRows[i]) _w.observationRows[i].text = val; _elDirty = true;
}

function elAutoOutcomeFromObs() {
  var rows = _w.observationRows || [];
  var hasC1C2 = rows.some(r => r.code === 'C1' || r.code === 'C2');
  if (hasC1C2 && _w.outcome !== 'UNSATISFACTORY') {
    _w.outcome = 'UNSATISFACTORY'; elRenderStep();
  }
}

function elSyncObs() {
  var rows = _w.observationRows || [];
  _w.observations = rows.map(r => `[${r.code}] ${r.text}`).join('\n');
}

export function elLumCalc() {
  var t = parseInt(_w.lumTotal)||0, p = parseInt(_w.lumPass)||0, f = parseInt(_w.lumFail)||0;
  if (t && !p && !f) { _w.lumPass = t; _w.lumFail = 0; }
  else if (t && p && !f) { _w.lumFail = Math.max(0, t-p); }
  else if (t && !p && f) { _w.lumPass = Math.max(0, t-f); }
  _elDirty = true;
}

export function elAddLumRow() {
  if (!Array.isArray(_w.lumRows)) _w.lumRows = [];
  _w.lumRows.push({location:'', duration:_w.ratedDuration||'3 hours', result:'PASS'}); _elDirty = true; elRenderStep();
}

export function elRemoveLumRow(i) {
  if (!Array.isArray(_w.lumRows)) return;
  _w.lumRows.splice(i,1); _elDirty = true; elRenderStep();
}

export function elSetLumRow(i, key, val) {
  if (!Array.isArray(_w.lumRows)) return;
  if (_w.lumRows[i]) { _w.lumRows[i][key] = val; _elDirty = true; }
}

export function elToggleLumResult(i, result) {
  if (!Array.isArray(_w.lumRows)) return;
  if (_w.lumRows[i]) { _w.lumRows[i].result = result; _elDirty = true; elRenderStep(); }
}

export function elSetPItem(key, val) {
  if (!_w.pItems) _w.pItems = {};
  _w.pItems[key] = val; _elDirty = true; elRenderStep();
}

export function elSetPeriod(period) {
  _w.retestPeriod = period; _elDirty = true; elAutoExpiry();
}

export function elPick(key, val) {
  _w[key] = val; _elDirty = true;
  if (key === 'certType') {
    if (!_w.baseRef) {
      var addr = [_w.premAddr1,_w.premAddr2,_w.premAddr3].filter(Boolean).join(', ');
      buildCertRefSeq(addr, _w.premPostcode, 'el').then(r => {
        _w.baseRef = r.baseRef; _w.ref = r.ref; elUpdateSubtitle(); elRenderStep();
      }).catch(() => {});
    }
  }
  if (key === 'outcome') {
    var f = document.getElementById('el-dur-field');
    if (f) f.style.display = (val === 'SATISFACTORY') ? 'block' : 'none';
  }
  elRenderStep();
}

export function elNext() {
  var s = _w.step;
  if (s === 0 && !_w.certType) { toast('Please select a certificate type','error'); return; }
  if (s === 1) {
    if (!(_w.premAddr1||'').trim()) { toast('Address Line 1 is required','error'); return; }
    if (!(_w.premPostcode||'').trim()) { toast('Postcode is required','error'); return; }
  }
  if (s === 2 && !(_w.clientName||'').trim()) { toast('Client name is required','error'); return; }
  if (s === 3 && !_w.systemType) { toast('Please select a system type','error'); return; }
  if (s === 7) {
    var lumRows = Array.isArray(_w.lumRows) ? _w.lumRows : [];
    var failCount = lumRows.filter(r => r.result === 'FAIL').length;
    if (failCount >= 2 && !_w.observationRows.some(r => r.code === 'C2')) {
      _w.observationRows = _w.observationRows || [];
      _w.observationRows.push({code:'C2', text:`${failCount} luminaires failed duration test`});
    }
  }
  if (s === 10 && !_w.outcome) { toast('Please select an outcome','error'); return; }
  var nextStep = s + 1;
  if (nextStep === 12 && _w.engineerName && _w.niceicNo) { nextStep = 13; }
  if (nextStep >= STEPS.length) { elSave(); return; }
  _w.step = nextStep; elRenderStep();
}

export function elBack() {
  var s = _w.step;
  if (s <= 0) { navigate('el-history'); return; }
  var prevStep = s - 1;
  if (prevStep === 12 && _w.engineerName && _w.niceicNo) prevStep = 11;
  _w.step = prevStep; elRenderStep();
}

async function buildCertRefSeqSafe(addr, pc) {
  try { return await buildCertRefSeq(addr, pc, 'el'); }
  catch(e) { return { ref: genRef(_w.certType||'EL'), baseRef: '' }; }
}

export async function elSave() {
  var isEdit = !!_w._editId; var editId = _w._editId || null;
  if (!isEdit && (!_w.ref || _w.ref === 'Generating…' || !_w.baseRef)) {
    showOverlay('Generating reference…');
    try {
      var _sa = [_w.premAddr1,_w.premAddr2,_w.premAddr3].filter(Boolean).join(', ');
      var _sr = await buildCertRefSeq(_sa, _w.premPostcode, 'el');
      _w.ref = _sr.ref; _w.baseRef = _sr.baseRef;
    } catch(e) { if (!_w.ref || _w.ref === 'Generating…') _w.ref = genRef(_w.certType||'EL'); }
    hideOverlay();
  }
  elSyncObs();
  var rec = Object.assign({}, _w, { savedAt: new Date().toISOString() });
  delete rec._editId; delete rec.step;
  var row = {
    ref_number: rec.ref||null, cert_type: rec.certType||null, premises_name: rec.premisesName||null,
    test_date: rec.testDate||null, outcome: rec.outcome||null, updated_at: new Date().toISOString(), data: rec
  };
  if (!navigator.onLine) {
    row.created_by = state.currentUser.id;
    await idbEnqueue({type:'el_upsert', form: row, supabaseId: editId||null, userId: state.currentUser.id, ts: Date.now()});
    refreshSyncBadge();
    _elDirty = false; try { localStorage.removeItem('el_autosave'); } catch(e) {}
    toast('Saved offline — will sync when online','success'); navigate('el-history'); return;
  }
  showOverlay(isEdit ? 'Updating…' : 'Issuing certificate…');
  var savedId, err;
  if (isEdit && editId) {
    var upd = await sb.from('el_certs').update(row).eq('id', editId);
    err = upd.error; savedId = editId;
  } else {
    row.created_by = state.currentUser.id;
    var ins = await sb.from('el_certs').insert(row).select('id').single();
    err = ins.error; if (ins.data) savedId = ins.data.id;
  }
  hideOverlay();
  if (err) { toast('Save failed: '+err.message,'error'); return; }
  _elDirty = false; try { localStorage.removeItem('el_autosave'); } catch(e) {}
  rec.id = savedId;
  toast((isEdit ? 'Certificate updated — ' : 'EL Certificate issued — ')+rec.ref,'success',3000);
  if (isAdmin()) { elOpenCert(rec); } else { navigate('el-history'); }
  if (!isEdit && (rec.clientEmail||'').trim()) { elAutoEmail(rec, true); }
}

export function elPreviewCurrent() {
  elSyncObs();
  var previewRec = Object.assign({}, _w);
  if (!previewRec.ref) previewRec.ref = 'PREVIEW';
  elOpenCert(previewRec);
}

export function elRestoreAutosave() {
  if (!_w._savedDraft) return;
  var d = _w._savedDraft; d.step = 1; _w = d; elRenderStep(); elUpdateSubtitle();
}

export function elDiscardAutosave() {
  _w._savedDraft = null; try { localStorage.removeItem('el_autosave'); } catch(e) {} elRenderStep();
}

export function elEditCert(id) {
  var rec = _elAllCerts.find(r => r.id === id);
  if (!rec) {
    sb.from('el_certs').select('*').eq('id', id).single().then(({data}) => {
      if (data) { var d = data.data||{}; d._editId = id; _w = d; _w.step = 1; navigate('el-new'); elRenderStep(); }
    }); return;
  }
  var d = rec.data || {}; d._editId = rec.id; _w = d; _w.step = 1; navigate('el-new'); elRenderStep();
}

export function elEmailCert(rec) {
  var r2 = (rec && rec.ref) ? rec : Object.assign({}, _w);
  if (!r2.ref) { toast('Certificate has no reference yet','error'); return; }
  var subject = buildEmailSubject('EL', r2.certType||'EL', r2.ref, r2.testDate||'', r2.premAddr1||r2.premisesAddress||'');
  var certHtml = elBuildCertHTML(r2);
  var modal = `<div id="el-email-modal" style="position:fixed;inset:0;background:#0009;z-index:9999;display:flex;align-items:center;justify-content:center"><div style="background:var(--surface);border-radius:12px;max-width:560px;width:95%;max-height:85vh;display:flex;flex-direction:column"><div style="padding:16px;border-bottom:1px solid var(--border);font-weight:600;display:flex;justify-content:space-between"><span>Email Certificate</span><button onclick="document.getElementById('el-email-modal').remove()" class="btn-sm">✕</button></div><div style="padding:16px;overflow-y:auto;flex:1"><div class="wiz-field"><label>To</label><input id="el-em-to" value="${esc(r2.clientEmail||'')}" type="email"></div><div class="wiz-field"><label>Subject</label><input id="el-em-sub" value="${esc(subject)}"></div><div class="wiz-field"><label>Message</label><textarea id="el-em-msg" rows="4">Please find attached the emergency lighting certificate for the above property.</textarea></div><div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;height:200px"><iframe srcdoc="${certHtml.replace(/"/g,'&quot;')}" style="width:100%;height:100%;border:none"></iframe></div></div><div style="padding:12px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end"><button onclick="document.getElementById('el-email-modal').remove()" class="btn-sm">Cancel</button><button onclick="elSendEmail(${JSON.stringify(r2).replace(/"/g,'&quot;')})" class="btn-primary"><i class='fa-solid fa-paper-plane'></i> Send</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', modal);
}

export async function elSendEmail(rec) {
  var to = document.getElementById('el-em-to')?.value?.trim();
  var subject = document.getElementById('el-em-sub')?.value?.trim();
  var msg = document.getElementById('el-em-msg')?.value?.trim();
  if (!to) { toast('Email address required','error'); return; }
  showOverlay('Generating PDF…');
  var pdfBlob;
  try { pdfBlob = await elGeneratePDF(rec, true); } catch(e) { hideOverlay(); toast('PDF generation failed: '+e.message,'error'); return; }
  hideOverlay();
  var reader = new FileReader();
  reader.onloadend = async function() {
    var b64 = reader.result.split(',')[1];
    var emailHtml = _buildELEmailHTML(rec);
    var cc = getGlobalCC();
    showOverlay('Sending…');
    try {
      var result = await sendBrevoEmail(to, subject, emailHtml, b64, `EL_${rec.ref||'cert'}.pdf`, cc);
      hideOverlay();
      if (result && result.error) { toast('Email failed: '+result.error,'error'); return; }
      toast('Email sent to '+to,'success');
      document.getElementById('el-email-modal')?.remove();
    } catch(e) { hideOverlay(); toast('Email error: '+e.message,'error'); }
  };
  reader.readAsDataURL(pdfBlob);
}

function _escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _buildELEmailHTML(rec) {
  var co = getSetting('company_name','OHM Electrical Engineering Ltd');
  var phone = getSetting('company_phone','');
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#14532d;padding:24px;text-align:center"><h1 style="color:#f59e0b;margin:0;font-size:22px">${_escHtml(co)}</h1><p style="color:#86efac;margin:4px 0 0;font-size:13px">Emergency Lighting Certificate</p></div><div style="padding:24px;border:1px solid #e5e7eb;border-top:none"><p style="color:#374151">Dear ${_escHtml(rec.clientName||'Client')},</p><p style="color:#374151">Please find attached your emergency lighting certificate.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:40%">Certificate Ref</td><td style="padding:8px;border:1px solid #e5e7eb">${_escHtml(rec.ref||'')}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Type</td><td style="padding:8px;border:1px solid #e5e7eb">${_escHtml(rec.certType||'')}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Premises</td><td style="padding:8px;border:1px solid #e5e7eb">${_escHtml(rec.premisesName||rec.premAddr1||'')}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Test Date</td><td style="padding:8px;border:1px solid #e5e7eb">${_escHtml(rec.testDate||'')}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Outcome</td><td style="padding:8px;border:1px solid #e5e7eb;color:${rec.outcome==='SATISFACTORY'?'#16a34a':'#dc2626'};font-weight:700">${_escHtml(rec.outcome||'')}</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Next Test Due</td><td style="padding:8px;border:1px solid #e5e7eb">${_escHtml(rec.nextTestDate||'')}</td></tr></table><p style="color:#6b7280;font-size:13px">If you have any queries please contact us.</p><p style="color:#374151;font-weight:600">${_escHtml(co)}${phone?' — '+_escHtml(phone):''}</p></div></div>`;
}

export async function elAutoEmail(rec, silent) {
  var to = (rec.clientEmail||'').trim();
  if (!to) return;
  var co = getSetting('company_name','OHM Electrical Engineering Ltd');
  var subject = buildEmailSubject('EL', rec.certType||'EL', rec.ref, rec.testDate||'', rec.premAddr1||'');
  var pdfBlob;
  try { pdfBlob = await elGeneratePDF(rec, true); } catch(e) { if (!silent) toast('PDF error: '+e.message,'error'); return; }
  var reader = new FileReader();
  reader.onloadend = async function() {
    var b64 = reader.result.split(',')[1];
    var emailHtml = _buildELEmailHTML(rec);
    var cc = getGlobalCC();
    try {
      var result = await sendBrevoEmail(to, subject, emailHtml, b64, `EL_${rec.ref||'cert'}.pdf`, cc);
      if (result && !result.error) {
        try {
          await sb.from('email_sends').insert({
            cert_ref: rec.ref, cert_type: rec.certType||'EL',
            to_email: to, subject, sent_by: state.currentUser?.id,
            sent_by_email: state.currentUser?.email, sent_at: new Date().toISOString()
          });
        } catch(e) {}
        if (!silent) toast('Auto-email sent to '+to,'success');
      }
    } catch(e) { if (!silent) toast('Auto-email failed: '+e.message,'error'); }
  };
  reader.readAsDataURL(pdfBlob);
}

export function elOpenCert(rec) {
  var certHtml = elBuildCertHTML(rec);
  var blob = new Blob([certHtml], {type:'text/html'});
  var url = URL.createObjectURL(blob);
  var modal = `<div id="el-cert-modal" style="position:fixed;inset:0;background:#0009;z-index:9999;display:flex;flex-direction:column"><div style="background:var(--surface);padding:10px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border)"><span style="font-weight:600;flex:1">EL Certificate — ${_escHtml(rec.ref||'')}</span>${_ibtn('Email','fa-envelope',`elCertEmailBtn()`)}${_ibtn('Print','fa-print',`elPrintCert()`)}<button class="btn-sm btn-accent" onclick="elDownloadPDF(window._elCertRec)"><i class='fa-solid fa-file-pdf'></i> PDF</button><button onclick="elCloseCert()" class="btn-sm">✕ Close</button></div><iframe id="el-cert-iframe" src="${url}" style="flex:1;border:none;background:#fff"></iframe></div>`;
  window._elCertRec = rec;
  document.body.insertAdjacentHTML('beforeend', modal);
}

export function elCertEmailBtn() {
  if (window._elCertRec) elEmailCert(window._elCertRec);
}

export function elCloseCert() {
  document.getElementById('el-cert-modal')?.remove();
  window._elCertRec = null;
  navigate('el-history');
  loadELHistory();
}

export function elShowPreview(id) {
  var rec = window._elAllCerts && window._elAllCerts.find(function(x){ return x.id === id; });
  if (!rec) return;
  var full = Object.assign({}, rec.data || {}, {id: rec.id, ref: rec.ref_number});
  window._elCertRec = full;
  var panel = document.getElementById('el-preview-panel');
  if (!panel) { elOpenCert(full); return; }
  var empty = document.getElementById('el-preview-empty');
  var active = document.getElementById('el-preview-active');
  var toolbar = document.getElementById('el-preview-toolbar');
  var ifr = document.getElementById('el-preview-iframe');
  if (empty) empty.style.display = 'none';
  if (active) active.style.display = 'block';
  var d = rec.data || {};
  var addr = d.premAddr1 || d.premisesName || rec.premises_name || '';
  toolbar.innerHTML = '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    +esc(rec.ref_number||'—')+(addr?' &mdash; '+esc(addr):'')+'</span>'
    +_ibtn('Download PDF','fa-download','elDownloadPDF(window._elCertRec)')
    +_ibtn('Email','fa-envelope','elEmailCert(window._elCertRec)')
    +(isAdmin()?_ibtn('Edit','fa-pen',"elEditCert('"+id+"')"):'')
    +(isAdmin()?_ibtn('Copy','fa-copy',"copyELCert('"+id+"')"):'')
    +(isAdmin()?_ibtn('Delete','fa-trash',"deleteELCert('"+id+"')",true):'');
  var html = elBuildCertHTML(full);
  var blob = new Blob([html], {type:'text/html'});
  if (ifr._blobUrl) URL.revokeObjectURL(ifr._blobUrl);
  var blobUrl = URL.createObjectURL(blob);
  ifr._blobUrl = blobUrl;
  ifr.src = blobUrl;
  document.querySelectorAll('.pat-card[data-el-id]').forEach(function(c){ c.style.outline='none'; c.style.background=''; });
  var card = document.querySelector('.pat-card[data-el-id="'+id+'"]');
  if (card) { card.style.outline='2px solid var(--primary,#0e4d33)'; card.style.background='rgba(14,77,51,.06)'; }
}

export function elPrintCert() {
  var iframe = document.getElementById('el-cert-iframe');
  if (iframe && iframe.contentWindow) { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
}

export function elBuildCertHTML(rec) {
  var r = rec || _w;
  var sat = r.outcome==='SATISFACTORY';
  var obBg = sat ? 'linear-gradient(90deg,#093423,#1e7a4c,#093423)' : '#b3452e';
  var obText = sat ? '✓ SATISFACTORY — System satisfies requirements of BS 5266-1:2025' : '⚠ UNSATISFACTORY — Remedial action required';
  var certTitle = r.certType==='EL.1' ? 'Emergency Lighting &middot; Certificate of Completion'
                : r.certType==='EL.2' ? 'Emergency Lighting &middot; Periodic Inspection and Test Certificate'
                : r.certType==='EL.3' ? 'Emergency Lighting &middot; Existing Site Assessment Certificate'
                : 'Emergency Lighting &middot; Existing Site Assessment';
  var niceic = r.niceicNo || getSetting('el_enrol_no',getSetting('niceic_scheme_no',''));

  var elBody = getSetting('el_body','NICEIC');
  var company = getSetting('el_co_name',getSetting('company_name','OHM Electricals Ltd'));
  var addr1 = getSetting('el_co_addr1','');
  var addr2 = getSetting('el_co_addr2','');
  var addr3 = getSetting('el_co_addr3','');
  var postcode = getSetting('el_co_postcode','');
  var companyAddr = [addr1,addr2,addr3,postcode].filter(Boolean).join(', ') || getSetting('company_address','');
  var companyTel = getSetting('el_co_phone',getSetting('company_tel',''));
  var companyEmail = getSetting('el_co_email','');
  var companyWeb = getSetting('el_co_website','');
  var engineerPosition = getSetting('el_position','');
  var elLogoData = getSetting('el_logo_data','');
  var elBodyLogoData = getSetting('el_body_logo_data','');
  var elSigData = getSetting('el_sig_data','');
  var lumTotal = r.lumTotal||'—';
  var lumPass  = r.lumPass||'—';
  var lumFail  = r.lumFail||'0';
  var _lrAll  = (r.lumRows||[]).filter(function(row){return row.loc;});
  var _obsAll = (r.observationRows&&r.observationRows.length) ? r.observationRows
                : (r.observations ? [{code:'—',text:r.observations}] : []);
  var _defCnt = _obsAll.length;
  var _c1cnt  = _obsAll.filter(function(o){return o.code==='C1';}).length;
  var _c2cnt  = _obsAll.filter(function(o){return o.code==='C2';}).length;
  var _ficnt  = _obsAll.filter(function(o){return o.code==='FI';}).length;
  var _defRowH = [];
  (function(){
    if(!_defCnt) return;
    try {
      var _tmp = document.createElement('div');
      _tmp.style.cssText = 'position:fixed;left:-9999px;top:0;width:738px;visibility:hidden;pointer-events:none;background:#fff;font-size:12px;line-height:1.5;font-family:Inter,sans-serif';
      document.body.appendChild(_tmp);
      _tmp.innerHTML = '<table style="width:100%;border-collapse:collapse;table-layout:auto"><colgroup><col style="width:60px"><col></colgroup><tbody>'
        +_obsAll.map(function(o){return '<tr><td style="padding:8px 10px;border-bottom:1px solid #e8e4dc;vertical-align:middle"><span style="display:inline-block;font-size:10px;padding:2px 7px">'+esc(o.code||'—')+'</span></td><td style="padding:8px 10px;border-bottom:1px solid #e8e4dc;vertical-align:middle">'+esc(o.text||'')+'</td></tr>';}).join('')
        +'</tbody></table>';
      _tmp.querySelectorAll('tbody tr').forEach(function(tr){_defRowH.push(tr.offsetHeight||35);});
      document.body.removeChild(_tmp);
    } catch(e){}
  })();
  var _DEF_ROW_BUDGET = 850;
  var _defPageBreaks = [];
  (function(){
    var _used = 0;
    for(var _ri=0;_ri<_defCnt;_ri++){
      var _rh = _defRowH[_ri]||35;
      if(_used+_rh>_DEF_ROW_BUDGET && _ri>0){ _defPageBreaks.push(_ri); _used=0; }
      _used += _rh;
    }
  })();
  var _DEF_P4 = _defPageBreaks.length>0 ? _defPageBreaks[0] : _defCnt;
  var _extraDef = _defPageBreaks.length;
  var _LUM_CONT = 22;
  var _lumOnP4 = _defCnt===0?18:_defCnt<=5?13:_defCnt<=10?8:0;
  var _lrOnP4  = _lrAll.slice(0,_lumOnP4);
  var _lrRest  = _lrAll.slice(_lumOnP4);
  var _extraLum = _lrRest.length>0 ? Math.ceil(_lrRest.length/_LUM_CONT) : 0;
  var totalPages = 4 + _extraDef + _extraLum;
  var _pParts = [r.premAddr1,r.premAddr2,r.premAddr3,r.premPostcode].filter(Boolean);
  var addr = _pParts.length ? _pParts.join('<br>') : (r.premisesAddress||'').replace(/\n/g,'<br>');
  var modeLabel = r.mode ? r.mode.replace(/ \([XYZ]\)/,'') : '—';
  var modeCode  = r.mode ? (r.mode.match(/\(([XYZ])\)/)||['',''])[1] : '';
  var durCode   = r.ratedDuration==='1 hour' ? 'A' : r.ratedDuration==='2 hours' ? 'B' : r.ratedDuration==='3 hours' ? 'C' : '';
  var nextInsp = '';
  if(r.nextTestDate){
    try {
      var ntp = r.nextTestDate.split('/');
      if(ntp.length===3) nextInsp = new Date(parseInt(ntp[2]),parseInt(ntp[1])-1,parseInt(ntp[0])).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    } catch(e){}
  }
  if(!nextInsp) try {
    var pts = (r.testDate||'').split('/');
    if(pts.length===3){
      var nd = new Date(parseInt(pts[2])+1, parseInt(pts[1])-1, parseInt(pts[0]));
      nextInsp = nd.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    }
  } catch(e){}

  var css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#e7e4dc;font-family:'Inter',system-ui,sans-serif;padding:32px 24px 48px;color:#182420;}
.cert-page{background:#fffdf8;width:794px;min-height:1123px;position:relative;margin:0 auto 40px;box-shadow:0 6px 28px rgba(10,25,17,.22);font-size:13px;color:#182420;line-height:1.5;display:flex;flex-direction:column;}
.cert-page::after{content:'— A4 print boundary —';position:absolute;top:1123px;left:0;right:0;border-top:2px dashed #ef4444;color:#ef4444;font-size:8px;font-weight:700;letter-spacing:.08em;text-align:center;padding-top:3px;pointer-events:none;z-index:10;}
.cert-top-strip{background:linear-gradient(90deg,#093423,#0e4d33 55%,#b08d2e);height:7px;flex-shrink:0;}
.ch{background:#fffdf8;padding:8px 28px 0;flex-shrink:0;}
.ch-top-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:8px;border-bottom:1.5px solid #d5e5db;}
.ch-logo-row{display:flex;align-items:center;gap:14px;flex:1;min-width:0;}
.ch-logo{width:40px;height:40px;background:linear-gradient(135deg,#0e4d33,#093423);border:1px solid #b08d2e;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#f4ecd8;flex-shrink:0;letter-spacing:.05em;}
.ch-company{font-size:${getSetting('el_coname_size','22')}px;font-weight:900;color:#182420;letter-spacing:-.02em;line-height:1.1;}
.ch-company-sub{font-size:10px;color:#5a6660;margin-top:2px;}
.ch-company-sub a{color:#5a6660;text-decoration:none;}
.niceic-badge{border:1.5px solid #b08d2e;border-radius:4px;padding:7px 14px;text-align:center;background:#f4ecd8;}
.niceic-badge .nb-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#093423;}
.niceic-badge .nb-sub{font-size:8px;color:#5a6660;margin-top:1px;}
.ch-title-row{padding:6px 0 6px;}
.ch-cert-eyebrow{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b08d2e;margin-bottom:4px;}
.ch-cert-title{font-family:'Cormorant Garamond','Crimson Pro',Georgia,serif;font-size:30px;font-weight:700;color:#0e4d33;line-height:1.15;}
.ch-cert-std{font-size:10px;color:#5a6660;margin-top:6px;line-height:1.6;}
.ch-ref-bar{background:linear-gradient(90deg,#093423,#0e4d33);border-top:1px solid #b08d2e;padding:8px 28px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}
.ch-ref{font-family:monospace;font-size:13px;font-weight:700;color:#f4ecd8;letter-spacing:.04em;}
.ch-date{font-size:12px;color:rgba(255,255,255,.85);}
.addr-panel{display:grid;grid-template-columns:1fr 1fr;border-top:3px solid #b08d2e;flex-shrink:0;}
.addr-col{padding:10px 28px 10px;}
.addr-col-left{border-right:1px solid #e2e6e0;}
.addr-col-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b08d2e;padding-bottom:7px;border-bottom:1px solid #d5e5db;margin-bottom:10px;}
.addr-name{font-size:16px;font-weight:700;color:#182420;margin-bottom:3px;}
.addr-line{font-size:12.5px;color:#5a6660;line-height:1.75;}
.addr-sub{font-size:11px;color:#8b968f;margin-top:6px;}
.addr-detail-row{display:flex;gap:8px;align-items:baseline;margin-top:7px;}
.addr-detail-lbl{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8b968f;flex-shrink:0;}
.addr-detail-val{font-size:12.5px;color:#182420;font-weight:500;}
.addr-engineer-name{font-size:15px;font-weight:600;color:#182420;margin-bottom:3px;}
.purp-panel{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #e2e6e0;flex-shrink:0;}
.purp-col{padding:10px 28px 12px;}
.purp-col-left{border-right:1px solid #e2e6e0;}
.purp-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b08d2e;padding-bottom:9px;border-bottom:1px solid #d5e5db;margin-bottom:10px;}
.purp-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #eef5f0;}
.purp-row:last-child{border-bottom:none;}
.purp-check{width:20px;height:20px;min-width:20px;border:2px solid #d5e5db;border-radius:2px;display:flex;align-items:center;justify-content:center;margin-top:1px;}
.purp-check-on{border-color:#0e4d33;background:#0e4d33;}
.purp-check-on::after{content:'✓';color:#f4ecd8;font-size:12px;font-weight:700;line-height:1;}
.purp-text{font-size:12px;color:#5a6660;line-height:1.55;}
.purp-text-on{color:#182420;font-weight:600;}
.purp-extent{font-size:12.5px;color:#5a6660;line-height:1.75;margin-top:6px;}
.outcome-band{padding:11px 28px;text-align:center;font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#fff;flex-shrink:0;}
.ch-cont{background:#093423;border-bottom:2px solid #b08d2e;padding:16px 28px 14px;flex-shrink:0;}
.ch-cont-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;}
.ch-cont-eyebrow{font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#b08d2e;margin-bottom:4px;}
.ch-cont-title{font-family:'Cormorant Garamond','Crimson Pro',Georgia,serif;font-size:22px;font-weight:700;color:#fff;line-height:1.2;}
.ch-cont-right{text-align:right;flex-shrink:0;}
.ch-cont-company{font-size:11.5px;font-weight:600;color:#fff;}
.ch-cont-ref{font-family:monospace;font-size:12.5px;font-weight:700;color:#b08d2e;display:block;margin-top:3px;}
.ch-cont-niceic{font-size:10px;color:rgba(255,255,255,.55);margin-top:2px;}
.cb{padding:20px 28px;flex:1;display:flex;flex-direction:column;}
.sec-head{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#0e4d33;padding-bottom:6px;border-bottom:2px solid #b08d2e;margin-bottom:14px;margin-top:22px;flex-shrink:0;}
.sec-head:first-child{margin-top:0;}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:0 22px;}
.fg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 18px;}
.field{padding-bottom:11px;border-bottom:1px solid #e2e6e0;margin-bottom:11px;}
.fl{font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#8b968f;margin-bottom:3px;}
.fv{font-size:13px;font-weight:600;color:#182420;}
.stats-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #b08d2e;border-radius:5px;overflow:hidden;margin:10px 0 12px;flex-shrink:0;background:#fffdf8;}
.stat-cell{padding:18px 10px;text-align:center;border-right:1px solid #e2e6e0;}
.stat-cell:last-child{border-right:none;}
.stat-num{font-family:'Cormorant Garamond','Crimson Pro',Georgia,serif;font-size:42px;font-weight:700;line-height:1;display:block;}
.stat-lbl{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8b968f;display:block;margin-top:6px;}
.stat-pass .stat-num{color:#1e7a4c;}
.stat-fail .stat-num{color:#b3452e;}
.stat-tested .stat-num{color:#0e4d33;}
.obs-box{background:#fbeeea;border:1px solid #f0d2c8;border-left:4px solid #b3452e;border-radius:3px;padding:9px 14px;margin-bottom:10px;}
.obs-box .ob-lbl{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b3452e;margin-bottom:5px;}
.obs-box .ob-item{font-size:11.5px;color:#b3452e;padding-left:14px;position:relative;margin-bottom:4px;line-height:1.5;}
.obs-box .ob-item::before{content:'▸';position:absolute;left:0;color:#b3452e;}
.note-box{background:#e9f5ee;border:1px solid #bfe0cc;border-left:4px solid #1e7a4c;border-radius:3px;padding:9px 14px;margin-bottom:10px;}
.note-box .nb-lbl{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1e7a4c;margin-bottom:5px;}
.note-box p{font-size:11.5px;color:#093423;margin:0;line-height:1.55;}
.ltbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;}
.ltbl th{background:#093423;color:#fff;padding:9px 10px;text-align:left;font-size:9.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;}
.ltbl td{padding:8px 10px;border-bottom:1px solid #e2e6e0;vertical-align:middle;}
.ltbl tr:nth-child(even) td{background:#eef5f0;}
.ltbl .total-row td{background:#093423;color:#fff;font-weight:700;font-size:10.5px;padding:9px 10px;}
.chip-pass{display:inline-block;background:#1e7a4c;color:#fff;font-size:9.5px;font-weight:700;padding:3px 10px;border-radius:99px;}
.chip-fail{display:inline-block;background:#b3452e;color:#fff;font-size:9.5px;font-weight:700;padding:3px 10px;border-radius:99px;}
.chip-na{display:inline-block;background:#f4ecd8;color:#093423;border:1px solid #b08d2e;font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:99px;}
.cert-footer{background:#093423;border-top:2px solid #b08d2e;padding:11px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:auto;flex-shrink:0;}
.cf-left{font-size:10.5px;color:rgba(255,255,255,.55);}
.cf-right{font-size:10.5px;color:rgba(255,255,255,.55);text-align:right;}
.cf-ref{font-family:monospace;font-size:10.5px;font-weight:700;color:#b08d2e;}
@media print{body{background:#fff;padding:0;margin:0} .cert-page{width:210mm;min-height:297mm;box-shadow:none;margin:0;page-break-after:always;break-after:page;} .cert-page::after{display:none;}}
@media(max-width:480px){.fg,.fg-3,.addr-panel{grid-template-columns:1fr;} .stats-bar{grid-template-columns:1fr 1fr;}}
`;

  function field(label, val, cls){
    return '<div class="field"><div class="fl">'+label+'</div><div class="'+(cls||'fv')+'">'+val+'</div></div>';
  }

  function contHead(certType, pageNum, pageTotal, pageTitle, ref, niceic, company){
    return '<div class="ch-cont"><div class="ch-cont-inner"><div><div class="ch-cont-eyebrow">'+certType+' · Page '+pageNum+' of '+pageTotal+'</div><div class="ch-cont-title">'+pageTitle+'</div></div><div class="ch-cont-right"><div class="ch-cont-company">'+company+'</div><span class="ch-cont-ref">'+ref+'</span><div class="ch-cont-niceic">'+bodyLabel+' No. '+niceic+'</div></div></div></div>';
  }

  function footer(left, ref, page, total){
    return '<div class="cert-footer"><div class="cf-left">'+left+'</div><div class="cf-right"><span class="cf-ref">'+ref+'</span> · Page '+page+' of '+total+'</div></div>';
  }

  var ref = esc(r.ref);
  var coName = esc(company);
  var coAddr = esc(companyAddr);
  var coTel  = esc(companyTel);
  var coEmail= esc(companyEmail||'');
  var coWeb  = esc(companyWeb||'');
  var nic    = esc(niceic||'—');
  var eng    = esc(r.engineerName||'—');
  var engPos = esc(engineerPosition||'Qualified Electrician');
  var bodyLabel = esc(elBody||'NICEIC');
  var elLogo = elLogoData
    ? '<img src="'+elLogoData+'" style="max-height:52px;max-width:130px;object-fit:contain">'
    : '<div class="ch-logo">'+esc((company||'EL').substring(0,3).toUpperCase())+'</div>';
  var bodyBadge = elBodyLogoData
    ? '<div class="niceic-badge" style="padding:4px 8px"><img src="'+elBodyLogoData+'" style="max-height:68px;max-width:110px;object-fit:contain"></div>'
    : '<div class="niceic-badge"><div class="nb-title">'+bodyLabel+'</div><div class="nb-sub">Approved Contractor</div></div>';
  var sigImg = elSigData
    ? '<img src="'+elSigData+'" style="max-height:44px;max-width:140px;object-fit:contain;display:block;margin-top:4px">'
    : '';
  var pName  = esc(r.premisesName||'—');
  var pType  = esc(r.premisesType||'');
  var cName  = esc(r.clientName||'—');
  var cAddrParts = [r.clientAddr1,r.clientAddr2,r.clientAddr3,r.clientPostcode].filter(Boolean);
  var cAddr  = cAddrParts.map(function(l){return esc(l);}).join('<br>');
  var sys    = esc(r.systemType||'—');
  var mode   = esc(modeLabel);
  var rated  = esc(r.ratedDuration||'—');
  var tDate  = esc(r.testDate||'—');
  var obsText= esc(r.observations||'');

  /* PAGE 1 — Cover */
  var p1 = '<div class="cert-page">'
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
          +(companyTel?'<a href="tel:'+companyTel.replace(/\s/g,'')+'">'+coTel+'</a>':'')
          +((companyTel&&(companyWeb||companyEmail))?' &nbsp;&bull;&nbsp; ':'')
          +(companyWeb?'<a href="'+(companyWeb.startsWith('http')?companyWeb:'https://'+companyWeb)+'" target="_blank">'+coWeb+'</a>':(companyEmail?'<a href="mailto:'+companyEmail+'">'+coEmail+'</a>':''))
          +'</div>'
          +'</div>'
        +'</div>'
        +bodyBadge
      +'</div>'
      +'<div class="ch-title-row">'
        +'<div class="ch-cert-title">'+certTitle+'</div>'
        +'<div class="ch-cert-std">BS 5266-1:2025 &nbsp;&middot;&nbsp; BS EN 50172:2024 &nbsp;&middot;&nbsp; BS EN 1838:2024</div>'
      +'</div>'
    +'</div>'
    +'<div class="addr-panel">'
      +'<div class="addr-col addr-col-left" style="padding:0">'
        +'<div style="display:flex;height:100%">'
          +'<div style="flex:1;padding:16px 18px 20px 28px;border-right:1px solid #d5e5db">'
            +'<div class="addr-col-label">Client</div>'
            +(cName!=='—'?'<div class="addr-name">'+cName+'</div>':'')
            +(cAddr?'<div class="addr-line">'+cAddr+'</div>':'')
            +(cName==='—'&&!cAddr?'<div style="color:#9a948e;font-size:12px;margin-top:4px">—</div>':'')
          +'</div>'
          +'<div style="flex:1;padding:16px 28px 20px 18px">'
            +'<div class="addr-col-label">Property</div>'
            +(pName!=='—'?'<div class="addr-name">'+pName+'</div>':'')
            +(addr?'<div class="addr-line">'+addr+'</div>':'')
            +(pType?'<div class="addr-sub" style="margin-top:6px">'+pType+'</div>':'')
            +(pName==='—'&&!addr?'<div style="color:#9a948e;font-size:12px;margin-top:4px">—</div>':'')
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div class="addr-col">'
        +'<div class="addr-col-label">Issued By</div>'
        +'<div style="margin-bottom:6px">'
          +'<div class="addr-engineer-name">'+eng+'</div>'
          +'<div class="addr-line">'+engPos+'<br>'+coName+'</div>'
        +'</div>'
        +(coTel?'<div class="addr-detail-row"><span class="addr-detail-lbl">Tel:</span><span class="addr-detail-val">'+coTel+'</span></div>':'')
        +(coEmail?'<div class="addr-detail-row"><span class="addr-detail-lbl">Email:</span><span class="addr-detail-val">'+coEmail+'</span></div>':'')
      +'</div>'
    +'</div>'
    +'<div class="purp-panel">'
      +'<div class="purp-col purp-col-left">'
        +'<div class="purp-label">Purpose of Certificate</div>'
        +(function(){
          var map={
            'EL.1':'To certify the design, installation and commissioning of a new emergency lighting system',
            'EL.2':'To certify continued compliance of an existing installation — periodic inspection and test',
            'EL.3':'To report on the condition of an existing emergency lighting installation'
          };
          var txt=map[r.certType]||map['EL.2'];
          return '<div class="purp-row"><div class="purp-check purp-check-on"></div><div class="purp-text purp-text-on">'+txt+'</div></div>';
        })()
      +'</div>'
      +'<div class="purp-col">'
        +'<div class="purp-label">Extent of Installation Covered by this Certificate</div>'
        +'<div class="purp-extent">'+(r.certType==='EL.1'
          ?'Design, installation and commissioning — 100% of the new emergency lighting installation at the premises identified on this certificate.'
          :'Periodic inspection and testing — 100% of the existing emergency lighting installations for compliance with BS 5266-1:2025 and current regulations.'
        )+'</div>'
      +'</div>'
    +'</div>'
    +'<div class="outcome-band" style="background:'+obBg+';border-top:1px solid #b08d2e;border-bottom:1px solid #b08d2e">'+obText+'</div>'
    +'<div class="cb">'
      +'<div class="sec-head">System Summary</div>'
      +'<div class="stats-bar">'
        +'<div class="stat-cell stat-tested"><span class="stat-num">'+lumTotal+'</span><span class="stat-lbl">Luminaires Tested</span></div>'
        +'<div class="stat-cell stat-pass"><span class="stat-num">'+lumPass+'</span><span class="stat-lbl">Passed</span></div>'
        +'<div class="stat-cell stat-fail"><span class="stat-num">'+lumFail+'</span><span class="stat-lbl">Failed</span></div>'
        +'<div class="stat-cell"><span class="stat-num" style="font-size:22px;margin-top:8px">'+rated+'</span><span class="stat-lbl">Rated Duration</span></div>'
      +'</div>'
      +(nextInsp
        ?'<div style="display:flex;align-items:center;justify-content:space-between;background:#f4ecd8;border:1.5px solid #b08d2e;border-radius:4px;padding:11px 18px;margin-bottom:16px">'
          +'<div>'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#093423;margin-bottom:2px">Next Inspection Due</div>'
            +'<div style="font-size:11px;color:#5a6660">Periodic inspection must be completed by this date to maintain BS 5266-1 compliance.</div>'
          +'</div>'
          +'<div style="font-size:18px;font-weight:800;color:#093423;white-space:nowrap;margin-left:20px">'+nextInsp+'</div>'
        +'</div>'
        :'')
      +'<div class="fg">'
        +field('System Type',sys)
        +field('Mode of Operation',mode)
      +'</div>'
      +(sat
        ?'<div class="note-box"><div class="nb-lbl">✓ System Satisfactory</div><p>This emergency lighting system has been inspected and tested in accordance with BS 5266-1:2025. The system satisfies the requirements of the standard. All '+lumTotal+' luminaires were tested and '+lumPass+' achieved the full rated duration of '+rated+'.</p></div>'
        :'<div class="obs-box">'
          +'<div class="ob-lbl">⚠ Action Required — Unsatisfactory</div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px">'
            +(_c1cnt?'<span style="background:#b3452e;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px">'+_c1cnt+' × C1 — Critical</span>':'')
            +(_c2cnt?'<span style="background:#c46328;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px">'+_c2cnt+' × C2 — Code Required</span>':'')
            +(_ficnt?'<span style="background:#6b7280;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px">'+_ficnt+' × FI — Further Investigation</span>':'')
            +(!_defCnt?'<span style="background:#6b7280;color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:99px">Defects recorded</span>':'')
          +'</div>'
          +'<div style="font-size:11.5px;color:#5a3a36;line-height:1.55">'+_defCnt+' observation'+(_defCnt===1?'':'s')+' recorded — full defect schedule with recommended remedial actions is detailed on the following pages of this certificate.</div>'
          +'</div>'
      )
    +'</div>'
    +footer(pName+(pType?' · '+pType:''), ref, 1, totalPages)
  +'</div>';

  /* PAGE 2 — System Purpose, Arrangement & Test Instruments */
  var declText = r.certType==='EL.1'
    ? 'I, the undersigned, being the competent person responsible for the installation described in this certificate, declare that the emergency lighting system has been installed and commissioned in accordance with BS 5266-1:2025 and BS EN 50172:2024, and was found to be SATISFACTORY on the date of issue.'
    : 'I, the undersigned, being the competent person who carried out the periodic inspection and testing described in this certificate, declare that the system has been inspected and tested in accordance with BS 5266-1:2025 and BS EN 50172:2024, and was found to be '+(r.outcome||'—')+' on the date of issue.';
  var _pv=function(v){return v==='✓'?'<span style="font-weight:800;color:#1e7a4c;font-size:14px">✓</span>':'<span style="font-size:10px;color:#8b968f;font-weight:600">N/A</span>';};
  var _pr=function(label,val){return '<div style="display:flex;align-items:center;border-bottom:1px solid #d5e5db"><div style="flex:1;padding:6px 10px;font-size:11px;color:#5a6660">'+label+'</div><div style="width:70px;padding:6px 10px;text-align:center;border-left:1px solid #d5e5db">'+_pv(val||'N/A')+'</div></div>';};
  var p2b = '<div class="cert-page">'
    +contHead(r.certType, 2, totalPages, 'System Purpose &amp; Test Instruments', ref, nic, coName)
    +'<div class="cb">'
      +'<div class="sec-head">Purpose of Installed Emergency Lighting System</div>'
      +'<div style="border:1px solid #d5e5db;border-radius:4px;overflow:hidden;margin-bottom:14px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr">'
          +_pr('Emergency escape lighting',r.purpEscape||'✓')
          +_pr('Standby lighting',r.purpStandby||'N/A')
          +_pr('Escape route lighting',r.purpEscRoute||'✓')
          +_pr('Partial standby lighting',r.purpPartial||'N/A')
          +_pr('Open area lighting',r.purpOpen||'N/A')
          +_pr('High risk task area lighting',r.purpHighRisk||'N/A')
        +'</div>'
      +'</div>'
      +'<div class="sec-head">Emergency Lighting Installation Arrangement</div>'
      +'<div style="border:1px solid #d5e5db;border-radius:4px;overflow:hidden;margin-bottom:14px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr">'
          +_pr('Self-contained emergency luminaire',r.arSelfContained||'N/A')
          +_pr('Standby generator system',r.arGenerator||'N/A')
          +_pr('Central battery system',r.arCentral||'N/A')
          +_pr('Combined emergency luminaire',r.arCombined||'N/A')
        +'</div>'
      +'</div>'
      +'<div class="sec-head">Test Instruments Used</div>'
      +'<table class="ltbl">'
        +'<tr><th>Instrument</th><th>Brand</th><th style="width:160px">Model</th></tr>'
        +'<tr><td style="padding:7px 10px">Instrument 1 (light meter)</td>'
          +'<td>'+(r.inst1Brand?esc(r.inst1Brand):'<span style="color:#9a948e;font-style:italic">Not recorded</span>')+'</td>'
          +'<td>'+(r.inst1Model?esc(r.inst1Model):'—')+'</td></tr>'
        +(r.inst2Brand||r.inst2Model
          ?'<tr><td style="padding:7px 10px">Instrument 2</td>'
            +'<td>'+(r.inst2Brand?esc(r.inst2Brand):'—')+'</td>'
            +'<td>'+(r.inst2Model?esc(r.inst2Model):'—')+'</td></tr>'
          :'')
        +'<tr><td colspan="3" style="font-size:10px;color:#6b6560;font-style:italic;padding:5px 10px;background:#fafaf9">Where periodic requirement P2 is carried out by measurement, details of instruments MUST be recorded</td></tr>'
      +'</table>'
      +'<div class="sec-head">Competent Person Declaration</div>'
      +'<div style="border:1px solid #d5e5db;border-radius:4px;overflow:hidden;font-size:11.5px">'
        +'<div style="display:flex;border-bottom:1px solid #d5e5db">'
          +'<div style="padding:7px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #d5e5db;flex-shrink:0">Trading Title</div>'
          +'<div style="padding:7px 10px;font-weight:600;color:#182420;flex:1">'+coName+'</div>'
        +'</div>'
        +(companyAddr
          ?'<div style="display:flex;border-bottom:1px solid #d5e5db">'
            +'<div style="padding:7px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #d5e5db;flex-shrink:0">Contractor Address</div>'
            +'<div style="padding:7px 10px;color:#182420;flex:1">'+coAddr+'</div>'
          +'</div>'
        :'')
        +'<div style="padding:9px 10px;border-bottom:1px solid #d5e5db;color:#5a6660;line-height:1.6;font-size:11px">'+declText+'</div>'
        +'<div style="display:flex">'
          +'<div style="flex:1;border-right:1px solid #d5e5db">'
            +'<div style="display:flex;border-bottom:1px solid #d5e5db">'
              +'<div style="padding:10px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #d5e5db;flex-shrink:0">Name (capitals)</div>'
              +'<div style="padding:10px 10px;flex:1;font-size:14px;font-weight:700;color:#182420">'+eng+'</div>'
            +'</div>'
            +'<div style="display:flex;border-bottom:1px solid #d5e5db">'
              +'<div style="padding:7px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #d5e5db;flex-shrink:0">Post</div>'
              +'<div style="padding:7px 10px;flex:1">'+engPos+'</div>'
            +'</div>'
            +'<div style="display:flex">'
              +'<div style="padding:7px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:38%;border-right:1px solid #d5e5db;flex-shrink:0">Date</div>'
              +'<div style="padding:7px 10px;flex:1">'+tDate+'</div>'
            +'</div>'
          +'</div>'
          +'<div style="padding:8px 12px;flex-shrink:0;width:190px">'
            +'<div style="font-weight:700;font-size:10px;margin-bottom:6px">Inspector\'s Signature</div>'
            +(sigImg
              ?'<div style="border:1px solid #d5e5db;border-radius:3px;background:#eef5f0;padding:4px 6px;display:inline-block"><img src="'+elSigData+'" style="max-height:50px;max-width:160px;object-fit:contain;display:block"></div>'
              :'<div style="height:50px;border:1.5px dashed #d5e5db;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#8b968f;font-size:9px;font-style:italic">Signature</div>'
            )
          +'</div>'
        +'</div>'
        +'<div style="display:flex;border-top:1px solid #d5e5db">'
          +'<div style="padding:7px 10px;background:#eef5f0;font-weight:700;font-size:11.5px;width:28%;border-right:1px solid #d5e5db;flex-shrink:0">NICEIC Enrolment No.</div>'
          +'<div style="padding:7px 10px;flex:1;color:#b08d2e;font-weight:700;letter-spacing:0.04em">'+nic+'</div>'
        +'</div>'
      +'</div>'
      +'<div style="margin-top:16px;padding:10px 14px;background:#eef5f0;border:1px solid #d5e5db;border-left:3px solid #b08d2e;border-radius:3px">'
        +'<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8b968f;margin-bottom:5px">About This Certificate</div>'
        +'<div style="font-size:10.5px;color:#5a6660;line-height:1.55">This certificate is issued under the '+bodyLabel+' Approved Contractor scheme in accordance with BS 5266-1:2025. It covers the '+(r.certType==='EL.1'?'new installation and commissioning':'periodic inspection and testing')+' of the emergency lighting system at the premises identified above. This document should be retained by the responsible person and made available to the enforcing authority on request. The original must be kept safe; copies may be issued to the client. For queries contact '+coName+' on '+coTel+'.</div>'
      +'</div>'
    +'</div>'
    +footer(pName, ref, 2, totalPages)
  +'</div>';

  /* PAGE 3 — Compliance Checklist */
  var P_CERT_ITEMS = [
    ['p1','P1','Emergency luminaires installed on all required escape routes'],
    ['p2','P2','Minimum illuminance levels achieved on escape routes (measured or checked)'],
    ['p3','P3','Emergency luminaires positioned correctly at all required points'],
    ['p4','P4','Emergency luminaires comply with BS EN 60598-2-22'],
    ['p5','P5','Rated duration achievable from battery under full load'],
    ['p6','P6','Central power supply system or generator provided (where applicable)'],
    ['p7','P7','Change-over device operates correctly within 5 s (or 0.5 s for high risk)'],
    ['p9','P9','Emergency escape route signage lit to BS 5499'],
    ['p10','P10','Open area (anti-panic) lighting provided (where applicable)'],
    ['p11','P11','High risk task area lighting provided (where applicable)'],
    ['p12','P12','Mode of operation correct for occupancy type (sustained / non-sustained / combined)'],
    ['p13','P13','All luminaires free from defects, damage and obstruction'],
    ['p14','P14','Inhibiting switch / key-switch present and labelled (where fitted)'],
    ['p15','P15','Log book / inspection record available on site'],
    ['p16','P16','Monthly functional test records complete and up to date'],
    ['p17','P17','Annual full-rated-duration test records available'],
    ['p18','P18','System found satisfactory at conclusion of rated duration test'],
    ['p19','P19','Battery charge restored after testing'],
    ['p20','P20','Wiring / cable circuits comply with BS 7671 and are adequately protected'],
    ['p21','P21','System commissioning records available on site'],
    ['p22','P22','Addressable or monitored system performing correctly (where applicable)'],
    ['p23','P23','Certificate and documentation retained by responsible person']
  ];
  var _pi = r.pItems || {p1:'✓',p2:'✓',p3:'✓',p4:'✓',p5:'✓',p6:'N/A',p7:'✓',p9:'✓',p10:'N/A',p11:'✓',p12:'✓',p13:'✓',p14:'N/A',p15:'✓',p16:'✓',p17:'✓',p18:'✓',p19:'✓',p20:'✓',p21:'✓',p22:'N/A',p23:'✓'};
  var _pChip=function(v){return v==='✓'?'<span class="chip-pass" style="min-width:28px">&#10003;</span>':v==='✗'?'<span class="chip-fail" style="min-width:28px">&#10007;</span>':'<span class="chip-na" style="min-width:28px">N/A</span>';};

  var p3 = '<div class="cert-page">'
    +contHead(r.certType, 3, totalPages, 'Compliance Checklist', ref, nic, coName)
    +'<div class="cb">'
      +'<div class="sec-head">BS 5266-1:2025 Compliance Checklist (Annex M)</div>'
      +'<table class="ltbl">'
        +'<tr><th style="width:55px;padding:5px 8px">Ref</th><th style="padding:5px 8px">Compliance Item</th><th style="text-align:center;padding:5px 8px;width:70px">Result</th></tr>'
        +(function(){
          var rows='';
          for(var i=0;i<P_CERT_ITEMS.length;i++){
            var itm=P_CERT_ITEMS[i];
            rows+='<tr><td style="padding:4px 8px;font-weight:700;font-size:10px;color:#8b968f">'+itm[1]+'</td>'
              +'<td style="padding:4px 8px;font-size:10.5px">'+itm[2]+'</td>'
              +'<td style="text-align:center;padding:4px 8px">'+_pChip(_pi[itm[0]]||'✓')+'</td></tr>';
          }
          return rows;
        })()
      +'</table>'
      +'<div class="sec-head" style="margin-top:10px">Notes</div>'
      +'<div style="border:1px solid #e2e6e0;border-radius:4px;padding:12px 14px;font-size:10.5px;color:#182420;min-height:120px;background:#eef5f0;line-height:1.6">'
        +(r.checklistNotes?esc(r.checklistNotes):'<span style="color:#a8a29e;font-style:italic">None</span>')
      +'</div>'
    +'</div>'
    +footer(coName+' · '+bodyLabel+' No. '+nic, ref, 3, totalPages)
  +'</div>';

  /* PAGE 4+ — Defects & Luminaire Schedule (fully paginated) */
  var _lumSatNote  = '<div class="note-box"><div class="nb-lbl">Schedule Result — Satisfactory</div><p>All luminaires recorded as satisfactory. The system is in full compliance with BS 5266-1:2025 and BS EN 1838:2024. No further action required.</p></div>';
  var _lumFailNote = '<div class="obs-box"><div class="ob-lbl">Failures Noted — Remedial Action Required</div><div class="ob-item">'+lumFail+' luminaire(s) failed to achieve the rated '+rated+' duration. Refer to defects above for full details and recommended remedial action.</div></div>';
  var _lumTotalRow = '<tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td colspan="2">'+lumTotal+' tested &middot; '+lumPass+' pass &middot; '+lumFail+' fail</td></tr>';
  var _lumContRow  = '<tr class="total-row"><td colspan="6" style="color:#78716c;font-style:italic;font-weight:400">Continued on next page&hellip;</td></tr>';
  var _lumTblHd    = '<tr><th>#</th><th>Location / Zone</th><th>Type</th><th>Mode</th><th>Rated</th><th>Result</th></tr>';
  var _codeColor   = function(c){return c==='C1'?'#dc2626':c==='C2'?'#ea580c':c==='FI'?'#7c3aed':'#1d4ed8';};

  function _buildLumRows(chunk,startNum){
    return chunk.map(function(row,i){
      return '<tr><td>EL-'+String(startNum+i).padStart(2,'0')+'</td>'
        +'<td>'+esc(row.loc)+'</td><td>LED Emergency Fitting</td>'
        +'<td>'+mode+'</td><td>'+rated+'</td>'
        +'<td>'+(row.result==='FAIL'?'<span class="chip-fail">FAIL</span>':'<span class="chip-pass">PASS</span>')+'</td></tr>';
    }).join('');
  }
  function _buildDefRows(chunk){
    if(!chunk||!chunk.length)
      return '<table class="ltbl"><tr><th style="width:60px">Code</th><th>Description</th></tr>'
        +'<tr><td style="color:#9a948e">—</td><td style="color:#9a948e;font-style:italic">No defects identified. System fully satisfactory at date of inspection.</td></tr></table>';
    return '<table class="ltbl"><tr><th style="width:60px">Code</th><th>Description</th></tr>'
      +chunk.map(function(row){
        var col=_codeColor(row.code);
        return '<tr><td><span style="display:inline-block;background:'+col+';color:#fff;font-weight:700;font-size:10px;padding:2px 7px;border-radius:3px;letter-spacing:.05em">'+esc(row.code||'—')+'</span></td>'
          +'<td>'+esc(row.text||'')+'</td></tr>';
      }).join('')+'</table>';
  }

  var _defChunk1   = _obsAll.slice(0,_DEF_P4);
  var _defIsLastP4 = _extraDef===0;
  var _lumIsLastP4 = _extraDef===0&&_extraLum===0;

  var p4 = '<div class="cert-page">'
    +contHead(r.certType,4,totalPages,'Defects, Recommendations &amp; Luminaire Schedule',ref,nic,coName)
    +'<div class="cb">'
      +'<div class="sec-head">Defects &amp; Recommendations</div>'
      +_buildDefRows(_defChunk1)
      +(!_defIsLastP4?'<div style="padding:5px 0;font-size:10px;color:#78716c;font-style:italic">Continued on next page&hellip;</div>':'')
      +(_defIsLastP4&&nextInsp?'<div class="note-box" style="margin-top:12px"><div class="nb-lbl">Next Inspection</div><p>Next periodic inspection recommended by: <strong>'+nextInsp+'</strong></p></div>':'')
      +(_lrOnP4.length&&_defIsLastP4
        ?'<div class="sec-head">Schedule of Emergency Luminaires</div>'
          +'<table class="ltbl">'+_lumTblHd+_buildLumRows(_lrOnP4,1)+(_lumIsLastP4?_lumTotalRow:_lumContRow)+'</table>'
          +(_lumIsLastP4?(sat?_lumSatNote:_lumFailNote):'')
        :'')
    +'</div>'
    +footer(pName,ref,4,totalPages)
  +'</div>';

  var p4extra='';

  for(var _dpi=0;_dpi<_extraDef;_dpi++){
    var _dStart=_defPageBreaks[_dpi];
    var _dEnd=_dpi+1<_defPageBreaks.length?_defPageBreaks[_dpi+1]:_defCnt;
    var _dChunk=_obsAll.slice(_dStart,_dEnd);
    var _dpNum=5+_dpi;
    var _dLast=_dpi===_extraDef-1;
    p4extra+='<div class="cert-page">'
      +contHead(r.certType,_dpNum,totalPages,'Defects &amp; Recommendations (continued)',ref,nic,coName)
      +'<div class="cb">'
        +'<div class="sec-head">Defects &amp; Recommendations (continued)</div>'
        +_buildDefRows(_dChunk)
        +(!_dLast?'<div style="padding:5px 0;font-size:10px;color:#78716c;font-style:italic">Continued on next page&hellip;</div>':'')
        +(_dLast&&nextInsp?'<div class="note-box" style="margin-top:12px"><div class="nb-lbl">Next Inspection</div><p>Next periodic inspection recommended by: <strong>'+nextInsp+'</strong></p></div>':'')
      +'</div>'
      +footer(pName,ref,_dpNum,totalPages)
    +'</div>';
  }

  for(var _lpi=0;_lpi<_extraLum;_lpi++){
    var _lStart=_lpi*_LUM_CONT;
    var _lChunk=_lrRest.slice(_lStart,_lStart+_LUM_CONT);
    var _lpNum=4+_extraDef+1+_lpi;
    var _lLast=_lpi===_extraLum-1;
    var _lStartNum=_lumOnP4+_lStart+1;
    p4extra+='<div class="cert-page">'
      +contHead(r.certType,_lpNum,totalPages,'Luminaire Schedule (continued)',ref,nic,coName)
      +'<div class="cb">'
        +'<div class="sec-head">Schedule of Emergency Luminaires (continued)</div>'
        +'<table class="ltbl">'+_lumTblHd+_buildLumRows(_lChunk,_lStartNum)+(_lLast?_lumTotalRow:_lumContRow)+'</table>'
        +(_lLast?(sat?_lumSatNote:_lumFailNote):'')
      +'</div>'
      +footer(pName,ref,_lpNum,totalPages)
    +'</div>';
  }

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=794,initial-scale=1,maximum-scale=5,user-scalable=yes">'
    +'<title>'+r.certType+' Certificate — '+r.ref+'</title>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Crimson+Pro:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap">'
    +'<style>'+css+'</style></head><body>'
    +p1+p2b+p3+p4+p4extra
    +'</body></html>';
}

export async function loadELHistory() {
  if (!state.currentUser) return;
  var q = sb.from('el_certs').select('*').order('created_at', {ascending:false});
  if (!isAdmin()) q = q.eq('created_by', state.currentUser.id);
  var {data, error} = await q;
  if (error) { console.error('loadELHistory:', error); return; }
  _elAllCerts = data || [];
  window._elAllCerts = _elAllCerts;
  _elFiltered = _elAllCerts; _elPage = 1; _elCurrentQ = '';
  renderELList(_elAllCerts, 1, '');
}

export function filterELList(q) {
  _elCurrentQ = (q||'').trim().toLowerCase();
  var typeFilter = (document.getElementById('el-filter-type')||{}).value || '';
  var outcomeFilter = (document.getElementById('el-filter-outcome')||{}).value || '';
  var filtered = _elAllCerts.filter(function(r) {
    var d = r.data||{};
    var mT = !typeFilter || r.cert_type === typeFilter;
    var mO = !outcomeFilter || (r.outcome||'').toUpperCase() === outcomeFilter;
    if (_elCurrentQ.length < 2) return mT && mO;
    var lq = _elCurrentQ;
    var mQ =
      (r.ref_number     ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premisesName   ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr1      ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr2      ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr3      ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premPostcode   ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.clientName     ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.clientAddr1    ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.clientPostcode ||'').toLowerCase().indexOf(lq) !== -1 ||
      (r.cert_type      ||'').toLowerCase().indexOf(lq) !== -1;
    return mQ && mT && mO;
  });
  if (_elCurrentQ.length >= 2) {
    filtered = sortByWordStart(filtered, function(r) {
      var d = r.data||{};
      return [d.premisesName, d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode, r.ref_number, d.clientName].join(' ');
    }, _elCurrentQ);
  }
  _elFiltered = filtered; _elPage = 1;
  renderELList(filtered, 1, _elCurrentQ);
}

export async function deleteELCert(id) {
  if (!await confirm2('Delete this EL certificate? This cannot be undone.')) return;
  var {error} = await sb.from('el_certs').delete().eq('id', id);
  if (error) { toast('Delete failed: '+error.message,'error'); return; }
  toast('Certificate deleted','success');
  loadELHistory();
}

export async function copyELCert(id) {
  var rec = _elAllCerts.find(r => r.id === id);
  if (!rec) return;
  var d = Object.assign({}, rec.data||{});
  d._editId = undefined; d.ref = ''; d.baseRef = ''; d.testDate = todayStr(); d.step = 1;
  _w = d; navigate('el-new'); elRenderStep();
}

export function renderELList(certs, page, q) {
  page = page || 1; q = q || '';
  var el = document.getElementById('el-list'); if (!el) return;
  if (!certs || !certs.length) {
    el.innerHTML = q.length >= 2
      ? '<div class="empty-state"><div class="empty-icon">🔍</div><p>No EL certificates matching "<strong>'+q+'</strong>"</p></div>'
      : '<div class="empty-state"><div class="empty-icon">💡</div><p>No EL certificates found.</p></div>';
    return;
  }
  var all = _elAllCerts;
  var tot = all.length;
  var sat = all.filter(function(r){ return (r.outcome||'').toUpperCase() === 'SATISFACTORY'; }).length;
  var unsat = all.filter(function(r){ return (r.outcome||'').toUpperCase() === 'UNSATISFACTORY'; }).length;
  var isSearch = q.length >= 2;
  var startIdx = (page - 1) * PAGE_SIZE;
  var pageItems = certs.slice(startIdx, startIdx + PAGE_SIZE);
  var tile = function(n, lbl, col) { return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:90px"><div style="font-size:22px;font-weight:600;color:'+(col||'var(--text)')+';">'+n+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px">'+lbl+'</div></div>'; };
  var sec = function(dot, lbl, cnt) { return '<div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 0 5px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:'+dot+';flex-shrink:0"></span>'+lbl+(cnt?' ('+cnt+')':'')+'</div>'; };
  var mkRow = function(r, q) {
    var d = r.data||{};
    var addrRaw = d.premAddr1 || d.premisesName || r.premises_name || 'No address';
    if (d.premPostcode && addrRaw.indexOf(d.premPostcode) === -1) addrRaw += ', ' + d.premPostcode;
    var ac = _addrColor(addrRaw); var abg = ac[0]; var atx = ac[1];
    var ini = (_addrInitials(addrRaw)||addrRaw.slice(0,2)||'?').toUpperCase();
    var oc = (r.outcome||d.outcome||'').toUpperCase();
    var ocCol = oc === 'SATISFACTORY' ? '#16a34a' : oc === 'UNSATISFACTORY' ? '#dc2626' : 'var(--muted)';
    var ocLabel = oc === 'SATISFACTORY' ? 'Satisfactory' : oc === 'UNSATISFACTORY' ? 'Unsatisfactory' : oc || '—';
    var addrHtml = q ? hlText(addrRaw, q) : _escHtml(addrRaw);
    var refHtml  = q ? hlText(r.ref_number||'—', q) : _escHtml(r.ref_number||'—');
    return '<div class="pat-card" data-el-id="'+r.id+'" onclick="elShowPreview(\''+r.id+'\')" style="cursor:pointer">'
      +'<div style="width:36px;height:36px;border-radius:50%;background:'+abg+';color:'+atx+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px">'+ini+'</div>'
      +'<div class="pat-card-body">'
        +'<div class="pat-card-top">'
          +'<span class="pat-card-addr">'+addrHtml+'</span>'
          +'<span style="font-size:11px;font-weight:600;color:'+ocCol+';white-space:nowrap">'+_escHtml(ocLabel)+'</span>'
        +'</div>'
        +'<div class="pat-card-bot">'
          +'<code class="pat-ref-chip">'+refHtml+'</code>'
          +'<span class="pat-card-date">'+_escHtml(r.test_date||d.testDate||'—')+'</span>'
          +'<span class="pat-card-sub">&middot; '+_escHtml(r.cert_type||'EL')+'</span>'
          +'<div class="pat-card-btns">'
            +(isAdmin()?_ibtn('Edit','fa-pen','event.stopPropagation();elEditCert(\''+r.id+'\')'):'')
            +(isAdmin()?_ibtn('Copy','fa-copy','event.stopPropagation();copyELCert(\''+r.id+'\')'):'')
            +_ibtn('Email','fa-envelope','event.stopPropagation();elEmailCert(Object.assign({},window._elAllCerts.find(x=>x.id===\''+r.id+'\').data,{id:\''+r.id+'\',ref:window._elAllCerts.find(x=>x.id===\''+r.id+'\').ref_number}))')
            +(isAdmin()?_ibtn('Delete','fa-trash','event.stopPropagation();deleteELCert(\''+r.id+'\')',true):'')
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>';
  };
  var html = '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+tile(tot,'Total EL Certs')+tile(sat,'Satisfactory','#16a34a')+tile(unsat,'Unsatisfactory','#dc2626')+'</div>';
  if (isSearch) {
    html += '<div style="font-size:12px;color:var(--muted);padding:2px 0 10px">'+certs.length+' result'+(certs.length!==1?'s':'')+' matching "<strong style="color:var(--text)">'+q+'</strong>"</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px">'+pageItems.map(function(r){ return mkRow(r,q); }).join('')+'</div>';
  } else {
    var unsatRs = pageItems.filter(function(r){ return (r.outcome||'').toUpperCase() === 'UNSATISFACTORY'; });
    var satRs   = pageItems.filter(function(r){ return (r.outcome||'').toUpperCase() === 'SATISFACTORY'; });
    var otherRs = pageItems.filter(function(r){ return ['SATISFACTORY','UNSATISFACTORY'].indexOf((r.outcome||'').toUpperCase()) === -1; });
    var allUnsat = certs.filter(function(r){ return (r.outcome||'').toUpperCase() === 'UNSATISFACTORY'; });
    var allSat   = certs.filter(function(r){ return (r.outcome||'').toUpperCase() === 'SATISFACTORY'; });
    var allOther = certs.filter(function(r){ return ['SATISFACTORY','UNSATISFACTORY'].indexOf((r.outcome||'').toUpperCase()) === -1; });
    if (unsatRs.length) html += sec('#dc2626','Unsatisfactory',allUnsat.length)+'<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">'+unsatRs.map(function(r){ return mkRow(r,''); }).join('')+'</div>';
    if (satRs.length)   html += sec('#10b981','Satisfactory',allSat.length)+'<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">'+satRs.map(function(r){ return mkRow(r,''); }).join('')+'</div>';
    if (otherRs.length) html += sec('#94a3b8','Other/Draft',allOther.length)+'<div style="display:flex;flex-direction:column;gap:6px">'+otherRs.map(function(r){ return mkRow(r,''); }).join('')+'</div>';
  }
  html += paginationHtml(page, certs.length, 'elPrevPage()', 'elNextPage()');
  el.innerHTML = html;
}

export function elPrevPage() { if (_elPage > 1) { _elPage--; renderELList(_elFiltered, _elPage, _elCurrentQ); document.getElementById('el-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }
export function elNextPage() { if (_elPage < Math.ceil(_elFiltered.length / PAGE_SIZE)) { _elPage++; renderELList(_elFiltered, _elPage, _elCurrentQ); document.getElementById('el-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }

async function elGeneratePDF(rec, returnBlob) {
  var certHtml = elBuildCertHTML(rec);
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    throw new Error('jsPDF not loaded');
  }
  var container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;';
  container.innerHTML = certHtml;
  document.body.appendChild(container);
  try {
    var JsPDF = window.jspdf ? window.jspdf.jsPDF : jsPDF;
    var pdf = new JsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    var pages = container.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      var canvas = await html2canvas(pages[i], {scale:2, useCORS:true, allowTaint:true, backgroundColor:'#fff'});
      var imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData,'JPEG',0,0,210,297);
    }
    document.body.removeChild(container);
    if (returnBlob) return pdf.output('blob');
    pdf.save(`EL_${rec.ref||'certificate'}.pdf`);
  } catch(e) {
    try { document.body.removeChild(container); } catch(ee) {}
    throw e;
  }
}

export async function elDownloadPDF(rec) {
  var r = rec || window._elCertRec || _w;
  showOverlay('Generating PDF…');
  try { await elGeneratePDF(r, false); } catch(e) { toast('PDF error: '+e.message,'error'); }
  hideOverlay();
}

// ── Alias stubs for compatibility with stub imports ─────────────────────────
export function initELWizard() {}
export function elRender() { elRenderStep(); }
export function elPrev() { elBack(); }
export async function saveEL() { return elSave(); }
export async function completeEL() { return elSave(); }
export function elwSetWizard(data) { if (data) _w = data; }
export function elSetStep(n) { _w.step = n; elRenderStep(); }
export function elReset() { startNewEL(); }
export function renderELHistory(records) { renderELList(records); }
export function editELCert(id) { elEditCert(id); }

// ── Expose all to window for HTML onclick handlers ──────────────────────────
Object.assign(window, {
  startNewEL, startNewELWithType, elUpdateSubtitle, elRenderStep, elSet,
  elPickFromDirectory, elPickPremType, elToggleMorePremTypes, elSaveClientType,
  elSetElDate, elAutoExpiry, elAddObsRow, elRemoveObsRow, elObsCode, elObsText,
  elLumCalc, elAddLumRow, elRemoveLumRow, elSetLumRow, elToggleLumResult,
  elSetPItem, elSetPeriod, elPick, elNext, elBack, elSave,
  elPreviewCurrent, elRestoreAutosave, elDiscardAutosave, elEditCert,
  elEmailCert, elSendEmail, elAutoEmail, elOpenCert, elCertEmailBtn,
  elCloseCert, elPrintCert, elBuildCertHTML, elShowPreview,
  loadELHistory, filterELList, deleteELCert, copyELCert, renderELList, elDownloadPDF,
  initELWizard, elRender, elPrev, saveEL, completeEL,
  elwSetWizard, elSetStep, elReset, renderELHistory, editELCert
});
