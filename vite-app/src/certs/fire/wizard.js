import { sb } from '../../lib/supabase.js';
import { state, isAdmin } from '../../lib/state.js';
import { toast, showOverlay, hideOverlay, confirm2, _softDelete, esc } from '../../lib/utils.js';
import { getSetting } from '../../lib/settings.js';
import { navigate } from '../../nav/navigation.js';
import { buildCertRefSeq, _pcScore, _refAddrPart } from '../_core/refgen.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
import { fireBuildCertHTML } from './pdf.js';

let _w = {};
let _fireDirty = false;
let _fireAllCerts = [];

const STEPS = ['type','premises','client','system','detectors','testing','defects','outcome','engineer','review'];
const STEP_LABELS = ['Type','Premises','Client','System','Detectors','Testing','Defects','Outcome','Engineer','Review'];
let _previewTimer = null;

const CERT_TYPES = [
  { id:'FA.1', label:'FA.1 — Installation Certificate', sub:'New domestic fire alarm installation — BS 5839-6 (Grade D)', domestic:true },
  { id:'FA.2', label:'FA.2 — Inspection & Service Certificate', sub:'Annual domestic inspection and service — BS 5839-6 (Grade D)', domestic:true },
  { id:'FA.3', label:'FA.3 — Installation/Commissioning Certificate', sub:'Commercial fire alarm installation — BS 5839-1 (Grade A)', domestic:false },
  { id:'FA.4', label:'FA.4 — Service/Verification Certificate', sub:'Commercial periodic inspection and service — BS 5839-1 (Grade A)', domestic:false },
];

const PREMISES_TYPES = ['House','Flat / Apartment','HMO','Bedsit','Bungalow','Commercial Office','Retail / Shop','Care Home','School / College','Warehouse','Hotel','Restaurant / Café','Other'];
const DETECTOR_TYPES = ['Smoke (optical)','Smoke (ionisation)','Heat','CO (carbon monoxide)','Multi-sensor','Sounder / base','Call point','Beam detector','Sprinkler flow switch','Other'];
const DOM_GRADES  = ['D1 — mains-powered + battery backup','D2 — battery only'];
const DOM_CATS    = ['LD1 — whole building coverage','LD2 — escape routes + high-risk areas','LD3 — escape routes only'];
const COM_CATS    = ['M — manual alarm only','L1 — whole building','L2 — defined areas','L3 — escape routes','L4 — circulation areas','L5 — specific risk only','P1 — whole building (property)','P2 — specific area (property)'];
const COM_TYPES   = ['Conventional','Addressable','Combined'];

function _isComm() { return _w.certType === 'FA.3' || _w.certType === 'FA.4'; }

function todayStr() {
  var d = new Date();
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}

function _addMonths(dateStr, months) {
  var p = (dateStr||'').split('/');
  if (p.length !== 3) return '';
  var d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate()-1);
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}

function genRef(type) {
  return (type||'FA') + '-' + new Date().getFullYear() + '-' + (Math.floor(Math.random()*90000)+10000);
}

export function startNewFire() {
  _fireDirty = false;
  var _prevSaved = null;
  try {
    var _ps = localStorage.getItem('fire_autosave');
    if (_ps) { _prevSaved = JSON.parse(_ps); if (!_prevSaved || !_prevSaved.certType) _prevSaved = null; }
  } catch(e) {}
  _w = {
    step: 0, _savedDraft: _prevSaved || null,
    certType: '',
    premisesName: '',
    premAddr1: '', premAddr2: '', premAddr3: '', premPostcode: '',
    premisesType: '', _ptShowMore: false,
    clientName: '', clientType: '',
    clientAddr1: '', clientAddr2: '', clientAddr3: '', clientPostcode: '',
    clientEmail: '',
    responsiblePerson: '',
    // system — domestic
    sysGrade: '', sysCategory: '', sysMfr: '', sysModel: '',
    sysInterlinked: '', sysPowerSupply: '',
    // system — commercial extra
    sysPanelMake: '', sysPanelModel: '', sysCommType: '',
    sysZones: '', sysLoops: '', sysBafe: '', sysFia: '',
    // detectors
    detectors: [],
    // testing — domestic
    tFunctional: '', tInterlinked: '', tBattery: '', tCO: '',
    // testing — commercial
    tMains: '', tBatDuration: '', tBatResult: '', tSounder: '', tVisual: '', tZoneIso: '', tFaultSim: '', tKeySwitch: '',
    tMainsVolts: '', tBatVolts: '', tSounderDb: '',
    // defects
    defects: [],
    defectsOverall: '', defectsNotes: '',
    // outcome
    outcome: '', nextInspDate: '', worksCarried: '', sysOperational: '',
    // engineer
    engineerName: getSetting('fa_engineer', getSetting('default_engineer','')),
    engineerQual: getSetting('fa_engineer_qual', ''),
    companyName: getSetting('company_name', 'OHM Electrical Engineering Ltd'),
    testDate: todayStr(),
    ref: '', baseRef: ''
  };
  navigate('fire-new');
}

export function startNewFireWithType(certType) {
  startNewFire(); _w.certType = certType; _w.step = 1; navigate('fire-new');
}

export function fireUpdateSubtitle() {
  var hs = document.getElementById('firewiz-header-sub'); if (!hs) return;
  var addr1 = (_w.premAddr1||'').trim(); var pc = (_w.premPostcode||'').trim();
  var addrStr = [addr1, pc].filter(Boolean).join(', ');
  if (_w.baseRef && addrStr) {
    var yy = String(new Date().getFullYear()).slice(-2);
    var score = _pcScore(pc); var aPart = _refAddrPart(addr1);
    _w.ref = _w.baseRef + yy + score + ' / ' + aPart;
    hs.textContent = _w.baseRef + ' · ' + addrStr;
  } else if (_w.baseRef) {
    hs.textContent = (_w.certType||'FA') + ' · ' + _w.baseRef + ' · Awaiting address…';
  } else if (_w.certType) {
    hs.textContent = _w.certType + ' · Reserving ref…';
  } else { hs.textContent = _isComm() ? 'BS 5839-1 Fire Alarm' : 'BS 5839-6 Fire Alarm'; }
}

export function fireRenderStep() {
  var el = document.getElementById('fire-wizard-body'); if (!el) return;
  var s = _w.step;
  var tabsEl = document.getElementById('fire-step-tabs');
  var pbarEl = document.getElementById('fire-pbar-fill');
  if (tabsEl) {
    tabsEl.innerHTML = STEP_LABELS.map((lbl,i) => {
      var cls = i === s ? 'active' : i < s ? 'done' : '';
      return `<button class="wiz-step-tab ${cls}" onclick="fireJumpStep(${i})" title="${lbl}"><span class="tab-num">${i < s ? '&#10003;' : i+1}</span><span class="tab-lbl">&nbsp;${lbl}</span></button>`;
    }).join('');
  }
  if (pbarEl) pbarEl.style.width = Math.round(s / (STEPS.length - 1) * 100) + '%';
  var html = '';

  // ── Step 0: Certificate type ──────────────────────────────────────────────
  if (s === 0) {
    html += `<h2 class="wiz-title">Select Certificate Type</h2>`;
    if (_w._savedDraft) {
      html += `<div class="wiz-restore-bar"><span>Unsaved draft found (${_w._savedDraft.certType||'FA'})</span><button onclick="fireRestoreAutosave()" class="btn-sm btn-accent">Restore</button><button onclick="fireDiscardAutosave()" class="btn-sm">Discard</button></div>`;
    }
    html += `<div class="wiz-cat-label"><i class="fa-solid fa-house"></i> Domestic &nbsp;·&nbsp; BS 5839-6</div>`;
    html += `<div class="wiz-cards">`;
    CERT_TYPES.filter(ct => ct.domestic).forEach(ct => {
      html += `<div class="wiz-card${_w.certType===ct.id?' sel':''}" onclick="firePick('certType','${ct.id}')"><strong>${esc(ct.label)}</strong><span>${esc(ct.sub)}</span></div>`;
    });
    html += `</div>`;
    html += `<div class="wiz-cat-label" style="margin-top:10px"><i class="fa-solid fa-building"></i> Commercial &nbsp;·&nbsp; BS 5839-1</div>`;
    html += `<div class="wiz-cards">`;
    CERT_TYPES.filter(ct => !ct.domestic).forEach(ct => {
      html += `<div class="wiz-card${_w.certType===ct.id?' sel':''}" onclick="firePick('certType','${ct.id}')"><strong>${esc(ct.label)}</strong><span>${esc(ct.sub)}</span></div>`;
    });
    html += `</div>`;
    html += `<div class="wiz-nav"><button onclick="fireNext()" class="btn-primary" ${!_w.certType?'disabled':''}>Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 1: Premises ──────────────────────────────────────────────────────
  } else if (s === 1) {
    html += `<h2 class="wiz-title">Premises Details</h2>`;
    html += `<div class="wiz-field"><label>Premises Name <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.premisesName)}" oninput="fireSet('premisesName',this.value)" placeholder="e.g. Flat 3, Crown House"></div>`;
    html += `<div class="wiz-field"><label>Address Line 1 *</label><input id="fa-addr1" value="${esc(_w.premAddr1)}" oninput="fireSet('premAddr1',this.value);fireUpdateSubtitle()" placeholder="House no. & street"></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.premAddr2)}" oninput="fireSet('premAddr2',this.value)" placeholder="District / area (optional)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.premAddr3)}" oninput="fireSet('premAddr3',this.value)" placeholder="Town or city"></div>`;
    html += `<div class="wiz-field"><label>Postcode *</label><input value="${esc(_w.premPostcode)}" oninput="fireSet('premPostcode',this.value);fireUpdateSubtitle()" placeholder="e.g. SW1A 1AA" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Property Type</label><div class="chip-row">`;
    var showTypes = _w._ptShowMore ? PREMISES_TYPES : PREMISES_TYPES.slice(0,6);
    showTypes.forEach(pt => { html += `<button class="chip${_w.premisesType===pt?' on':''}" onclick="fireSet('premisesType','${esc(pt)}')">${esc(pt)}</button>`; });
    if (!_w._ptShowMore) html += `<button class="chip" onclick="fireSet('_ptShowMore',true);fireRenderStep()">More…</button>`;
    html += `</div></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 2: Client ────────────────────────────────────────────────────────
  } else if (s === 2) {
    var cTypes = ['Building Owner','Landlord','Tenant','Facilities Manager','Managing Agent','Main Contractor'];
    html += `<h2 class="wiz-title">Client Details</h2>`;
    html += `<div class="wiz-field"><label>Client Name *</label><input value="${esc(_w.clientName)}" oninput="fireSet('clientName',this.value)" placeholder="Full name or company"></div>`;
    html += `<div class="wiz-field"><label>Responsible Person <span class="lbl-opt">(on-site contact)</span></label><input value="${esc(_w.responsiblePerson)}" oninput="fireSet('responsiblePerson',this.value)" placeholder="Name of person responsible for premises"></div>`;
    html += `<div class="wiz-field"><label>Client Type</label><div class="chip-row">`;
    cTypes.forEach(ct => { html += `<button class="chip${_w.clientType===ct?' on':''}" onclick="fireSet('clientType','${esc(ct)}')">${esc(ct)}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Client Address Line 1</label><input id="fa-caddr1" value="${esc(_w.clientAddr1)}" oninput="fireSet('clientAddr1',this.value)" placeholder="(if different from premises)"></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.clientAddr2)}" oninput="fireSet('clientAddr2',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.clientAddr3)}" oninput="fireSet('clientAddr3',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Postcode</label><input value="${esc(_w.clientPostcode)}" oninput="fireSet('clientPostcode',this.value)" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Client Email (for auto-send)</label><input type="email" value="${esc(_w.clientEmail)}" oninput="fireSet('clientEmail',this.value)" placeholder="client@example.com"></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 3: System details ────────────────────────────────────────────────
  } else if (s === 3) {
    html += `<h2 class="wiz-title">System Details</h2>`;
    if (!_isComm()) {
      // Domestic Grade D
      html += `<div class="wiz-field"><label>System Grade</label><div class="chip-row">`;
      DOM_GRADES.forEach(g => { html += `<button class="chip${_w.sysGrade===g?' on':''}" onclick="fireSet('sysGrade','${esc(g)}')">${esc(g)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>System Category</label><div class="chip-row">`;
      DOM_CATS.forEach(c => { html += `<button class="chip${_w.sysCategory===c?' on':''}" onclick="fireSet('sysCategory','${esc(c)}')">${esc(c)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Power Supply</label><div class="chip-row">`;
      ['230V AC mains only','230V AC mains + battery backup','Battery only'].forEach(p => {
        html += `<button class="chip${_w.sysPowerSupply===p?' on':''}" onclick="fireSet('sysPowerSupply','${esc(p)}')">${esc(p)}</button>`;
      });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Interlinked</label><div class="chip-row">`;
      ['Yes','No'].forEach(v => { html += `<button class="chip${_w.sysInterlinked===v?' on':''}" onclick="fireSet('sysInterlinked','${esc(v)}')">${esc(v)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Manufacturer / Make</label><input value="${esc(_w.sysMfr)}" oninput="fireSet('sysMfr',this.value)" placeholder="e.g. Aico, Kidde, FireAngel"></div>`;
      html += `<div class="wiz-field"><label>Model</label><input value="${esc(_w.sysModel)}" oninput="fireSet('sysModel',this.value)" placeholder="e.g. Ei650RF"></div>`;
    } else {
      // Commercial Grade A
      html += `<div class="wiz-field"><label>System Category</label><div class="chip-row">`;
      COM_CATS.forEach(c => { html += `<button class="chip${_w.sysCategory===c?' on':''}" onclick="fireSet('sysCategory','${esc(c)}')">${esc(c)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>System Type</label><div class="chip-row">`;
      COM_TYPES.forEach(t => { html += `<button class="chip${_w.sysCommType===t?' on':''}" onclick="fireSet('sysCommType','${esc(t)}')">${esc(t)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Control Panel Make</label><input value="${esc(_w.sysPanelMake)}" oninput="fireSet('sysPanelMake',this.value)" placeholder="e.g. Advanced, Notifier, Gent"></div>`;
      html += `<div class="wiz-field"><label>Control Panel Model</label><input value="${esc(_w.sysPanelModel)}" oninput="fireSet('sysPanelModel',this.value)" placeholder="e.g. MX-4200"></div>`;
      html += `<div class="wiz-field"><label>Number of Zones</label><input type="number" min="1" value="${esc(_w.sysZones)}" oninput="fireSet('sysZones',this.value)" style="max-width:100px" placeholder="e.g. 4"></div>`;
      html += `<div class="wiz-field"><label>Number of Loops (addressable)</label><input type="number" min="0" value="${esc(_w.sysLoops)}" oninput="fireSet('sysLoops',this.value)" style="max-width:100px" placeholder="0"></div>`;
      html += `<div class="wiz-field"><label>BAFE Scheme No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysBafe)}" oninput="fireSet('sysBafe',this.value)" placeholder="e.g. SP203"></div>`;
      html += `<div class="wiz-field"><label>FIA Member No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysFia)}" oninput="fireSet('sysFia',this.value)" placeholder="e.g. 12345"></div>`;
    }
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 4: Detectors ─────────────────────────────────────────────────────
  } else if (s === 4) {
    html += `<h2 class="wiz-title">Detectors & Devices</h2>`;
    html += `<div style="overflow-x:auto">`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:13px">`;
    html += `<thead><tr style="background:var(--surface2,#f9fafb)">`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Location</th>`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Type</th>`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Make / Model</th>`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Result</th>`;
    if (!_isComm()) html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Batt. replaced</th>`;
    html += `<th style="padding:6px 4px;border-bottom:1px solid var(--border)"></th>`;
    html += `</tr></thead><tbody id="fire-det-tbody">`;
    (_w.detectors||[]).forEach((det, i) => {
      html += _detRow(det, i);
    });
    html += `</tbody></table></div>`;
    html += `<button onclick="fireAddDetector()" class="btn-sm" style="margin-top:10px"><i class="fa-solid fa-plus"></i> Add device</button>`;
    if (!(_w.detectors||[]).length) {
      html += `<p style="color:var(--muted);font-size:13px;margin-top:8px">Add at least one detector or device to continue.</p>`;
    }
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 5: Testing results ───────────────────────────────────────────────
  } else if (s === 5) {
    html += `<h2 class="wiz-title">Testing Results</h2>`;
    html += `<div class="wiz-field"><label>Test Date</label><input value="${esc(_w.testDate)}" oninput="fireSet('testDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:160px"></div>`;
    if (!_isComm()) {
      // Domestic tests
      html += _testRow('Functional test (each device activates alarm)', 'tFunctional', ['PASS','FAIL','N/A']);
      html += _testRow('Interlinked test (all sound when one activates)', 'tInterlinked', ['PASS','FAIL','N/A']);
      html += _testRow('Battery backup / standby test', 'tBattery', ['PASS','FAIL','N/A']);
      html += _testRow('CO alarm test (if applicable)', 'tCO', ['PASS','FAIL','N/A']);
    } else {
      // Commercial tests
      html += _testRow('Mains supply test', 'tMains', ['PASS','FAIL']);
      html += `<div class="wiz-field"><label>Battery standby duration (hours)</label><input value="${esc(_w.tBatDuration)}" oninput="fireSet('tBatDuration',this.value)" placeholder="e.g. 24h rated / 25h achieved" style="max-width:240px"></div>`;
      html += _testRow('Battery standby test result', 'tBatResult', ['PASS','FAIL']);
      html += _testRow('Sounder / beacon test (dB level adequate)', 'tSounder', ['PASS','FAIL']);
      html += `<div class="wiz-field"><label>Mains supply voltage (V) <span class="lbl-opt">(optional)</span></label><input type="number" value="${esc(_w.tMainsVolts)}" oninput="fireSet('tMainsVolts',this.value)" placeholder="e.g. 230" style="max-width:120px"></div>`;
      html += `<div class="wiz-field"><label>Battery voltage (V) <span class="lbl-opt">(optional)</span></label><input type="number" value="${esc(_w.tBatVolts)}" oninput="fireSet('tBatVolts',this.value)" placeholder="e.g. 27.4" style="max-width:120px"></div>`;
      html += `<div class="wiz-field"><label>Sounder level (dB) <span class="lbl-opt">(optional)</span></label><input type="number" value="${esc(_w.tSounderDb)}" oninput="fireSet('tSounderDb',this.value)" placeholder="e.g. 75" style="max-width:120px"></div>`;
      html += _testRow('Visual indicators test', 'tVisual', ['PASS','FAIL']);
      html += _testRow('Zone isolation test', 'tZoneIso', ['PASS','FAIL','N/A']);
      html += _testRow('Fault simulation test', 'tFaultSim', ['PASS','FAIL','N/A']);
      html += _testRow('Engineer key switch / access control', 'tKeySwitch', ['PASS','FAIL','N/A']);
    }
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 6: Defects ───────────────────────────────────────────────────────
  } else if (s === 6) {
    html += `<h2 class="wiz-title">Defects & Recommendations</h2>`;
    html += `<div class="wiz-field"><label>Overall system condition</label><div class="chip-row">`;
    ['No defects found','Minor defects (no immediate action)','Defects requiring attention'].forEach(v => {
      html += `<button class="chip${_w.defectsOverall===v?' on':''}" onclick="fireSet('defectsOverall','${esc(v)}')">${esc(v)}</button>`;
    });
    html += `</div></div>`;
    if ((_w.defects||[]).length) {
      html += `<div style="overflow-x:auto;margin-top:8px">`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:13px">`;
      html += `<thead><tr style="background:var(--surface2,#f9fafb)">`;
      html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Description</th>`;
      html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">Severity</th>`;
      html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Recommendation</th>`;
      html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">Target date</th>`;
      html += `<th style="padding:6px 4px;border-bottom:1px solid var(--border)"></th>`;
      html += `</tr></thead><tbody>`;
      var SEV_COLORS = {ADVISORY:'',MINOR:'color:#d97706',MAJOR:'color:#dc2626',CRITICAL:'color:#9b1c1c;font-weight:700'};
      (_w.defects||[]).forEach((d, i) => {
        html += `<tr>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(d.description||'')}" oninput="fireDefectSet(${i},'description',this.value)" placeholder="Describe the defect" style="width:100%;min-width:120px"></td>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><select onchange="fireDefectSet(${i},'severity',this.value)" style="min-width:90px">`;
        ['ADVISORY','MINOR','MAJOR','CRITICAL'].forEach(sv => { html += `<option${(d.severity||'ADVISORY')===sv?' selected':''} style="${SEV_COLORS[sv]||''}">${sv}</option>`; });
        html += `</select></td>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(d.recommendation||'')}" oninput="fireDefectSet(${i},'recommendation',this.value)" placeholder="Recommended action" style="width:100%;min-width:120px"></td>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(d.targetDate||'')}" oninput="fireDefectSet(${i},'targetDate',this.value)" placeholder="DD/MM/YYYY" style="min-width:90px"></td>`;
        html += `<td style="padding:4px;border-bottom:1px solid var(--border)"><button onclick="fireRemoveDefect(${i})" style="border:none;background:none;color:#dc2626;cursor:pointer;padding:4px"><i class="fa-solid fa-trash-can"></i></button></td>`;
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
    }
    html += `<button onclick="fireAddDefect()" class="btn-sm" style="margin-top:10px"><i class="fa-solid fa-plus"></i> Add defect</button>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Additional notes <span class="lbl-opt">(optional)</span></label><textarea rows="3" oninput="fireSet('defectsNotes',this.value)" placeholder="Any further observations or notes…" style="width:100%">${esc(_w.defectsNotes)}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 7: Outcome ───────────────────────────────────────────────────────
  } else if (s === 7) {
    html += `<h2 class="wiz-title">Outcome</h2>`;
    html += `<div class="wiz-field"><label>Overall outcome *</label><div class="chip-row">`;
    ['SATISFACTORY','UNSATISFACTORY','REQUIRES ATTENTION'].forEach(v => {
      html += `<button class="chip${_w.outcome===v?' on':''}" onclick="fireSet('outcome','${v}')">${v}</button>`;
    });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>System operational at time of leaving</label><div class="chip-row">`;
    ['Yes','No'].forEach(v => { html += `<button class="chip${_w.sysOperational===v?' on':''}" onclick="fireSet('sysOperational','${v}')">${v}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Works carried out <span class="lbl-opt">(optional)</span></label><textarea rows="3" oninput="fireSet('worksCarried',this.value)" placeholder="Brief description of work carried out during this visit…" style="width:100%">${esc(_w.worksCarried)}</textarea></div>`;
    var nextMonths = _isComm() ? 6 : 12;
    var autoNext = _addMonths(_w.testDate, nextMonths);
    if (!_w.nextInspDate && autoNext) { _w.nextInspDate = autoNext; }
    html += `<div class="wiz-field"><label>Next inspection due (${_isComm()?'6 months':'12 months'})</label><input value="${esc(_w.nextInspDate)}" oninput="fireSet('nextInspDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:160px"></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary" ${!_w.outcome?'disabled':''}>Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 8: Engineer ──────────────────────────────────────────────────────
  } else if (s === 8) {
    html += `<h2 class="wiz-title">Engineer Details</h2>`;
    html += `<div class="wiz-field"><label>Engineer Name</label><input value="${esc(_w.engineerName)}" oninput="fireSet('engineerName',this.value)" placeholder="Full name"></div>`;
    html += `<div class="wiz-field"><label>Qualification / ID No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.engineerQual)}" oninput="fireSet('engineerQual',this.value)" placeholder="e.g. BAFE SP203 / FIA member no."></div>`;
    html += `<div class="wiz-field"><label>Company Name</label><input value="${esc(_w.companyName)}" oninput="fireSet('companyName',this.value)" placeholder="OHM Electrical Engineering Ltd"></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 9: Review ────────────────────────────────────────────────────────
  } else if (s === 9) {
    var addr = [_w.premAddr1, _w.premAddr2, _w.premAddr3, _w.premPostcode].filter(Boolean).join(', ');
    var typeLabel = (CERT_TYPES.find(t => t.id === _w.certType)||{}).label || _w.certType;
    html += `<h2 class="wiz-title">Review & Issue</h2>`;
    html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;font-size:14px">`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">`;
    html += `<div><span style="color:var(--muted);font-size:12px">Type</span><br>${esc(typeLabel)}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Date</span><br>${esc(_w.testDate)}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Premises</span><br>${esc(addr||'—')}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Client</span><br>${esc(_w.clientName||'—')}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Devices</span><br>${(_w.detectors||[]).length} device(s)</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Outcome</span><br>${esc(_w.outcome||'—')}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Engineer</span><br>${esc(_w.engineerName||'—')}</div>`;
    html += `<div><span style="color:var(--muted);font-size:12px">Next inspection</span><br>${esc(_w.nextInspDate||'—')}</div>`;
    html += `</div></div>`;
    html += `<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">`;
    html += `<button onclick="firePreviewCurrent()" class="btn-sm"><i class="fa-solid fa-eye"></i> Preview certificate</button>`;
    html += `</div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireSave()" class="btn-primary"><i class="fa-solid fa-certificate"></i> Issue Certificate</button></div>`;
  }

  el.innerHTML = html;
  _fireDirty = true;
  try { localStorage.setItem('fire_autosave', JSON.stringify(_w)); } catch(e) {}
  _schedulePreview();

  // Address autocomplete on step 1
  if (s === 1) {
    var _a1 = document.getElementById('fa-addr1');
    if (_a1) attachAddressAutocomplete(_a1, {
      onSelect(a) {
        _w.premAddr1   = a.line1;
        _w.premAddr2   = [a.line2, a.line3].filter(Boolean).join(', ');
        _w.premAddr3   = a.town;
        _w.premPostcode = a.postcode;
        _fireDirty = true; fireRenderStep();
      }
    });
    // Trigger ref reservation on step 1 when address is filled
    if (!_w.baseRef && _w.premAddr1 && _w.premPostcode) {
      buildCertRefSeq([_w.premAddr1, _w.premAddr2, _w.premAddr3].filter(Boolean).join(', '), _w.premPostcode, 'fire').then(r => {
        _w.baseRef = r.baseRef; _w.ref = r.ref; fireUpdateSubtitle(); fireRenderStep();
      }).catch(() => {});
    }
  }
  if (s === 2) {
    var _ca = document.getElementById('fa-caddr1');
    if (_ca) attachAddressAutocomplete(_ca, {
      onSelect(a) {
        _w.clientAddr1   = a.line1;
        _w.clientAddr2   = [a.line2, a.line3].filter(Boolean).join(', ');
        _w.clientAddr3   = a.town;
        _w.clientPostcode = a.postcode;
        _fireDirty = true; fireRenderStep();
      }
    });
  }
}

// ── Live preview ─────────────────────────────────────────────────────────────
function _schedulePreview() {
  if (_previewTimer) clearTimeout(_previewTimer);
  _previewTimer = setTimeout(_updateLivePreview, 500);
}

function _updateLivePreview() {
  var iframe = document.getElementById('fire-live-preview');
  if (!iframe) return;
  try {
    var html = fireBuildCertHTML(Object.assign({}, _w));
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
  } catch(e) {}
}

// ── Helper: single detector row HTML ─────────────────────────────────────────
function _detRow(det, i) {
  var comm = _isComm();
  var html = `<tr>`;
  html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(det.location||'')}" oninput="fireDetSet(${i},'location',this.value)" placeholder="e.g. Hallway" style="width:100%"></td>`;
  html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><select onchange="fireDetSet(${i},'type',this.value)" style="width:100%">`;
  DETECTOR_TYPES.forEach(t => { html += `<option${(det.type||'Smoke (optical)')===t?' selected':''}>${esc(t)}</option>`; });
  html += `</select></td>`;
  html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(det.model||'')}" oninput="fireDetSet(${i},'model',this.value)" placeholder="Make/model" style="width:100%"></td>`;
  html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><select onchange="fireDetSet(${i},'result',this.value)">`;
  ['PASS','FAIL','N/T'].forEach(r => { html += `<option${(det.result||'PASS')===r?' selected':''}>${r}</option>`; });
  html += `</select></td>`;
  if (!comm) {
    html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><select onchange="fireDetSet(${i},'batReplaced',this.value)">`;
    ['N/A','Yes','No'].forEach(v => { html += `<option${(det.batReplaced||'N/A')===v?' selected':''}>${v}</option>`; });
    html += `</select></td>`;
  }
  html += `<td style="padding:4px;border-bottom:1px solid var(--border)"><button onclick="fireRemoveDet(${i})" style="border:none;background:none;color:#dc2626;cursor:pointer;padding:4px"><i class="fa-solid fa-trash-can"></i></button></td>`;
  html += `</tr>`;
  return html;
}

// ── Helper: test row ──────────────────────────────────────────────────────────
function _testRow(label, key, options) {
  var html = `<div class="wiz-field"><label>${esc(label)}</label><div class="chip-row">`;
  options.forEach(v => {
    var color = v==='PASS' ? 'color:#15803d' : v==='FAIL' ? 'color:#dc2626' : '';
    html += `<button class="chip${_w[key]===v?' on':''}" onclick="fireSet('${key}','${v}')" style="${color}">${v}</button>`;
  });
  html += `</div></div>`;
  return html;
}

// ── Exported wizard actions (called from HTML onclick) ────────────────────────
export function firePick(key, val) { _w[key] = val; fireRenderStep(); }
export function fireSet(key, val)  { _w[key] = val; _schedulePreview(); }
export function fireJumpStep(i) {
  if (i >= 0 && i < STEPS.length && i <= _w.step) { _w.step = i; fireRenderStep(); }
}

export function fireAddDetector() {
  if (!_w.detectors) _w.detectors = [];
  _w.detectors.push({ location:'', type:'Smoke (optical)', model:'', result:'PASS', batReplaced:'N/A' });
  fireRenderStep();
}
export function fireRemoveDet(i) {
  if (_w.detectors) _w.detectors.splice(i, 1);
  fireRenderStep();
}
export function fireDetSet(i, key, val) {
  if (_w.detectors && _w.detectors[i]) _w.detectors[i][key] = val;
}

export function fireAddDefect() {
  if (!_w.defects) _w.defects = [];
  _w.defects.push({ description:'', recommendation:'', severity:'ADVISORY', targetDate:'' });
  fireRenderStep();
}
export function fireRemoveDefect(i) {
  if (_w.defects) _w.defects.splice(i, 1);
  fireRenderStep();
}
export function fireDefectSet(i, key, val) {
  if (_w.defects && _w.defects[i]) _w.defects[i][key] = val;
}

export function fireNext() {
  var s = _w.step;
  if (s === 0 && !_w.certType) { toast('Please select a certificate type','error'); return; }
  if (s === 1) {
    if (!(_w.premAddr1||'').trim()) { toast('Address Line 1 is required','error'); return; }
    if (!(_w.premPostcode||'').trim()) { toast('Postcode is required','error'); return; }
  }
  if (s === 2 && !(_w.clientName||'').trim()) { toast('Client name is required','error'); return; }
  if (s === 4 && !(_w.detectors||[]).length) { toast('Add at least one detector','error'); return; }
  if (s === 7 && !_w.outcome) { toast('Please select an outcome','error'); return; }
  _w.step = s + 1;
  if (_w.step >= STEPS.length) { fireSave(); return; }
  fireRenderStep();
}

export function fireBack() {
  if (_w.step <= 0) { navigate('fire-history'); return; }
  _w.step -= 1;
  fireRenderStep();
}

export function fireRestoreAutosave() {
  if (_w._savedDraft) { var d = _w._savedDraft; Object.assign(_w, d); _w._savedDraft = null; }
  _fireDirty = false; fireRenderStep();
}
export function fireDiscardAutosave() {
  _w._savedDraft = null;
  try { localStorage.removeItem('fire_autosave'); } catch(e) {}
  fireRenderStep();
}

export async function fireSave() {
  var isEdit = !!_w._editId; var editId = _w._editId || null;
  if (!isEdit && (!_w.ref || _w.ref === 'Generating…' || !_w.baseRef)) {
    showOverlay('Generating reference…');
    try {
      var _sa = [_w.premAddr1, _w.premAddr2, _w.premAddr3].filter(Boolean).join(', ');
      var _sr = await buildCertRefSeq(_sa, _w.premPostcode, 'fire');
      _w.ref = _sr.ref; _w.baseRef = _sr.baseRef;
    } catch(e) { if (!_w.ref || _w.ref === 'Generating…') _w.ref = genRef(_w.certType||'FA'); }
    hideOverlay();
  }
  var rec = Object.assign({}, _w, { savedAt: new Date().toISOString() });
  delete rec._editId; delete rec.step;
  var fullAddr = [_w.premAddr1, _w.premAddr2, _w.premAddr3, _w.premPostcode].filter(Boolean).join(', ');
  var row = {
    ref_number:       rec.ref || null,
    base_ref:         rec.baseRef || null,
    cert_type:        rec.certType || null,
    premises_address: fullAddr || null,
    test_date:        rec.testDate || null,
    outcome:          rec.outcome || null,
    updated_at:       new Date().toISOString(),
    data:             rec,
  };
  showOverlay(isEdit ? 'Updating…' : 'Issuing certificate…');
  var savedId, err;
  if (isEdit && editId) {
    var upd = await sb.from('fire_certs').update(row).eq('id', editId);
    err = upd.error; savedId = editId;
  } else {
    row.created_by = state.currentUser.id;
    var ins = await sb.from('fire_certs').insert(row).select('id').single();
    err = ins.error; if (ins.data) savedId = ins.data.id;
  }
  hideOverlay();
  if (err) { toast('Save failed: ' + err.message, 'error'); return; }
  _fireDirty = false; try { localStorage.removeItem('fire_autosave'); } catch(e) {}
  rec.id = savedId;
  toast((isEdit ? 'Certificate updated — ' : 'Fire Alarm Certificate issued — ') + rec.ref, 'success', 3000);
  if (isAdmin()) { fireOpenCert(rec); } else { navigate('fire-history'); }
  if (!isEdit && (rec.clientEmail||'').trim()) {
    import('./email.js').then(m => m.fireAutoEmail(rec, true)).catch(() => {});
  }
}

export function firePreviewCurrent() {
  var previewRec = Object.assign({}, _w);
  if (!previewRec.ref) previewRec.ref = 'PREVIEW';
  fireOpenCert(previewRec);
}

export function fireOpenCert(rec) {
  var certHtml = fireBuildCertHTML(rec);
  var blob = new Blob([certHtml], { type:'text/html' });
  var url = URL.createObjectURL(blob);
  window._fireCertRec = rec;
  var modal = `<div id="fire-cert-modal" style="position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 14px;background:#1c1917;flex-shrink:0;gap:8px">
    <span style="color:#fff;font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" id="fire-cert-modal-title">Fire Alarm Certificate — ${esc(rec.ref||'PREVIEW')}</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0">
      <button onclick="firePrintCert()" style="background:#b91c1c;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px"><i class="fa-solid fa-print"></i> Print</button>
      <button onclick="fireDownloadPDF(window._fireCertRec)" style="background:#1d4ed8;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px"><i class="fa-solid fa-download"></i> PDF</button>
      <button onclick="fireCertEmailBtn()" style="background:#15803d;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px"><i class="fa-solid fa-envelope"></i> Email</button>
      <button onclick="fireCloseCert()" style="background:#44403c;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
  <iframe id="fire-cert-iframe" style="flex:1;border:none;width:100%;background:#e8e4dc;-webkit-overflow-scrolling:touch" src="${url}"></iframe>
</div>`;
  document.getElementById('fire-cert-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', modal);
}

export function firePrintCert() {
  var iframe = document.getElementById('fire-cert-iframe');
  if (iframe) iframe.contentWindow.print();
}

export function fireCertEmailBtn() {
  if (window._fireCertRec) {
    import('./email.js').then(m => m.fireEmailCert(window._fireCertRec)).catch(() => {});
  }
}

export function fireCloseCert() {
  document.getElementById('fire-cert-modal')?.remove();
  window._fireCertRec = null;
}

export async function fireDownloadPDF(rec) {
  if (!rec) return;
  var { default: html2pdf } = await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js').catch(() => ({}));
  var certHtml = fireBuildCertHTML(rec);
  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(certHtml);
  iframe.contentDocument.close();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  }, 600);
}

// ── History ───────────────────────────────────────────────────────────────────
export async function loadFireHistory() {
  if (!state.currentUser) return;
  var q = sb.from('fire_certs').select('*').is('deleted_at', null).order('created_at', { ascending:false });
  if (!isAdmin()) q = q.eq('created_by', state.currentUser.id);
  var { data, error } = await q;
  if (error) { console.error('loadFireHistory:', error); return; }
  _fireAllCerts = data || [];
  renderFireList(_fireAllCerts);
}

export function filterFireList() {
  var q = (document.getElementById('fire-search')?.value||'').toLowerCase();
  var typeF = document.getElementById('fire-filter-type')?.value||'';
  var outF  = document.getElementById('fire-filter-outcome')?.value||'';
  var filtered = _fireAllCerts.filter(r => {
    var d = r.data||{};
    var matchQ = !q ||
      (r.ref_number||'').toLowerCase().includes(q) ||
      (r.premises_address||'').toLowerCase().includes(q) ||
      (d.clientName||'').toLowerCase().includes(q) ||
      (r.cert_type||'').toLowerCase().includes(q);
    var matchType = !typeF || (r.cert_type||'') === typeF;
    var matchOut  = !outF  || (r.outcome||'').toUpperCase() === outF.toUpperCase();
    return matchQ && matchType && matchOut;
  });
  renderFireList(filtered);
}

function renderFireList(certs) {
  var container = document.getElementById('fire-history-list');
  if (!container) return;
  if (!certs.length) {
    container.innerHTML = '<p class="empty-state">No fire alarm certificates yet.</p>';
    return;
  }
  container.innerHTML = certs.map(r => {
    var d = r.data||{};
    var addr = [d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode].filter(Boolean).join(', ') || r.premises_address || '—';
    var outcomeColor = r.outcome==='SATISFACTORY' ? '#15803d' : r.outcome==='UNSATISFACTORY' ? '#dc2626' : '#b45309';
    var typeLabel = (CERT_TYPES.find(t => t.id === r.cert_type)||{}).label || r.cert_type || '—';
    return `<div class="cert-card" onclick="fireOpenCert(${JSON.stringify(JSON.stringify(d))})" style="cursor:pointer">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
    <div>
      <div style="font-weight:600;font-size:14px">${esc(r.ref_number||'—')}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(typeLabel)}</div>
      <div style="font-size:13px;margin-top:4px">${esc(addr)}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(d.clientName||'')}${d.testDate?' · '+d.testDate:''}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <span style="font-size:11px;font-weight:600;color:${outcomeColor};background:${outcomeColor}18;padding:3px 8px;border-radius:100px">${esc(r.outcome||'—')}</span>
      <div style="display:flex;gap:4px">
        <button onclick="event.stopPropagation();fireEditCert(${JSON.stringify(JSON.stringify(r))})" class="btn-sm" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
        <button onclick="event.stopPropagation();fireDeleteCert('${r.id}')" class="btn-sm" title="Delete" style="color:#dc2626"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>
  </div>
</div>`;
  }).join('');
}

export function fireEditCert(recStr) {
  var r;
  try { r = typeof recStr === 'string' ? JSON.parse(recStr) : recStr; } catch(e) { return; }
  var d = r.data || r;
  Object.assign(_w, d);
  _w._editId = r.id || d.id || null;
  _w.step = STEPS.length - 1;
  _fireDirty = false;
  navigate('fire-new');
}

export async function fireDeleteCert(id) {
  if (!await confirm2('Delete this fire alarm certificate? This cannot be undone.')) return;
  var { error } = await sb.from('fire_certs').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
  toast('Certificate deleted','success');
  loadFireHistory();
}

export async function exportFireCSV() {
  if (!_fireAllCerts.length) { toast('No records to export','error'); return; }
  var rows = [['Ref','Type','Premises','Client','Date','Outcome','Next Inspection']];
  _fireAllCerts.forEach(r => {
    var d = r.data||{};
    rows.push([r.ref_number||'', r.cert_type||'', r.premises_address||'', d.clientName||'', d.testDate||'', r.outcome||'', d.nextInspDate||'']);
  });
  var csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'fire-certs-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
