import { sb } from '../../lib/supabase.js';
import { state, isAdmin } from '../../lib/state.js';
import { toast, showOverlay, hideOverlay, confirm2, _softDelete, esc, _addrColor, _addrInitials, _ibtn } from '../../lib/utils.js';
import { getSetting } from '../../lib/settings.js';
import { navigate } from '../../nav/navigation.js';
import { buildCertRefSeq, _pcScore, _refAddrPart } from '../_core/refgen.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
import { fireBuildCertHTML } from './pdf.js';
import { PAGE_SIZE, hlText, sortByWordStart, paginationHtml } from '../../lib/search.js';
import { idbEnqueue, refreshSyncBadge } from '../../lib/offline.js';

let _w = {};
let _fireDirty = false;
let _fireAllCerts = [];
let _firePage = 1, _fireFiltered = [], _fireCurrentQ = '';

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
    installDate: '', prevServiceDate: '',
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
    _clientAddrPrefilled: false,
    // engineer
    engineerName: getSetting('fa_engineer', getSetting('default_engineer','')),
    engineerQual: getSetting('fa_engineer_qual', ''),
    enggSigData: getSetting('fire_engg_sig_data','') || getSetting('el_sig_data',''),
    companyName: getSetting('company_name', 'OHM Electrical Engineering Ltd'),
    // tenant acknowledgment
    tenantName: '', tenantAckDate: '',
    // testing extras
    coAlarmsPresent: '', coAlarmNaReason: '',
    departuresNotes: '',
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
    var addrForRef = [addr1, (_w.premAddr2||'').trim()].filter(Boolean).join(' ');
    var score = _pcScore(pc); var aPart = _refAddrPart(addrForRef);
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
      html += `<div class="wiz-restore-bar"><span>Unsaved draft found (${_w._savedDraft.certType||'FA'})</span><button onclick="fireRestoreAutosave()" style="padding:4px 14px;border-radius:20px;border:none;background:var(--primary,#0e4d33);color:#fff;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap">Restore</button><button onclick="fireDiscardAutosave()" style="padding:4px 12px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;cursor:pointer;white-space:nowrap">Discard</button></div>`;
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
    showTypes.forEach(pt => { html += `<button class="chip${_w.premisesType===pt?' on':''}" onclick="firePick('premisesType','${esc(pt)}')">${esc(pt)}</button>`; });
    if (!_w._ptShowMore) html += `<button class="chip" onclick="firePick('_ptShowMore',true);fireRenderStep()">More…</button>`;
    html += `</div></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 2: Client ────────────────────────────────────────────────────────
  } else if (s === 2) {
    // Auto-prefill client address from premises on first visit to this step
    if (!_w.clientAddr1 && !_w.clientAddr2 && !_w.clientAddr3 && !_w.clientPostcode && (_w.premAddr1 || _w.premPostcode)) {
      _w.clientAddr1 = _w.premAddr1; _w.clientAddr2 = _w.premAddr2;
      _w.clientAddr3 = _w.premAddr3; _w.clientPostcode = _w.premPostcode;
      _w._clientAddrPrefilled = true;
    }
    var cTypes = ['Building Owner','Landlord','Tenant','Facilities Manager','Managing Agent','Main Contractor'];
    html += `<h2 class="wiz-title">Client Details</h2>`;
    html += `<div class="wiz-field"><label>Client Name <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.clientName)}" oninput="fireSet('clientName',this.value)" placeholder="Full name or company"></div>`;
    html += `<div class="wiz-field"><label>Responsible Person <span class="lbl-opt">(on-site contact)</span></label><input value="${esc(_w.responsiblePerson)}" oninput="fireSet('responsiblePerson',this.value)" placeholder="Name of person responsible for premises"></div>`;
    html += `<div class="wiz-field"><label>Client Type</label><div class="chip-row">`;
    cTypes.forEach(ct => { html += `<button class="chip${_w.clientType===ct?' on':''}" onclick="firePick('clientType','${esc(ct)}')">${esc(ct)}</button>`; });
    html += `</div></div>`;
    var addrNote = _w._clientAddrPrefilled ? `<span style="font-size:11px;color:#15803d;font-weight:400;margin-left:6px"><i class="fa-solid fa-clone"></i> Copied from premises — click to change</span>` : '';
    html += `<div class="wiz-field"><label>Client Address Line 1 *${addrNote}</label><div class="aac-wrap"><input id="fa-caddr1" value="${esc(_w.clientAddr1)}" oninput="fireSet('clientAddr1',this.value)" onfocus="fireClientAddrFocus()" placeholder="House no. &amp; street"><div class="aac-drop" style="display:none"></div></div></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.clientAddr2)}" oninput="fireSet('clientAddr2',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.clientAddr3)}" oninput="fireSet('clientAddr3',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Postcode *</label><input value="${esc(_w.clientPostcode)}" oninput="fireSet('clientPostcode',this.value)" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Client Email (for auto-send)</label><input type="email" value="${esc(_w.clientEmail)}" oninput="fireSet('clientEmail',this.value)" placeholder="client@example.com"></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 3: System details ────────────────────────────────────────────────
  } else if (s === 3) {
    html += `<h2 class="wiz-title">System Details</h2>`;
    if (!_isComm()) {
      // Domestic Grade D
      html += `<div class="wiz-field"><label>System Grade</label><div class="chip-row">`;
      DOM_GRADES.forEach(g => { html += `<button class="chip${_w.sysGrade===g?' on':''}" onclick="firePick('sysGrade','${esc(g)}');fireRenderStep()">${esc(g)}</button>`; });
      html += `</div></div>`;
      if (_w.sysGrade && _w.sysGrade.startsWith('D1')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade D1</strong> — mains-powered with a sealed, tamper-proof lithium battery. Battery replacement records as <em>N/A</em> on all devices.</span></div>`;
      } else if (_w.sysGrade && _w.sysGrade.startsWith('D2')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade D2</strong> — mains-powered with a user-replaceable standby battery (typically 9V PP3). Record whether battery was replaced during this visit.</span></div>`;
      }
      html += `<div class="wiz-field"><label>System Category</label><div class="chip-row">`;
      DOM_CATS.forEach(c => { html += `<button class="chip${_w.sysCategory===c?' on':''}" onclick="firePick('sysCategory','${esc(c)}')">${esc(c)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Power Supply</label><div class="chip-row">`;
      ['230V AC mains only','230V AC mains + battery backup','Battery only'].forEach(p => {
        html += `<button class="chip${_w.sysPowerSupply===p?' on':''}" onclick="firePick('sysPowerSupply','${esc(p)}')">${esc(p)}</button>`;
      });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Interlinked</label><div class="chip-row">`;
      ['Yes','No'].forEach(v => { html += `<button class="chip${_w.sysInterlinked===v?' on':''}" onclick="firePick('sysInterlinked','${esc(v)}')">${esc(v)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Manufacturer / Make</label><input value="${esc(_w.sysMfr)}" oninput="fireSet('sysMfr',this.value)" placeholder="e.g. Aico, Kidde, FireAngel"></div>`;
      html += `<div class="wiz-field"><label>Model</label><input value="${esc(_w.sysModel)}" oninput="fireSet('sysModel',this.value)" placeholder="e.g. Ei650RF"></div>`;
      if (_w.certType === 'FA.1') {
        html += `<div class="wiz-field"><label>Installation Date <span class="lbl-opt">(date system first fitted)</span></label><input value="${esc(_w.installDate||_w.testDate||todayStr())}" oninput="fireSet('installDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      } else if (_w.certType === 'FA.2') {
        html += `<div class="wiz-field"><label>Previous Service Date <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.prevServiceDate||'')}" oninput="fireSet('prevServiceDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      }
    } else {
      // Commercial Grade A
      html += `<div class="wiz-field"><label>System Category</label><div class="chip-row">`;
      COM_CATS.forEach(c => { html += `<button class="chip${_w.sysCategory===c?' on':''}" onclick="firePick('sysCategory','${esc(c)}')">${esc(c)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>System Type</label><div class="chip-row">`;
      COM_TYPES.forEach(t => { html += `<button class="chip${_w.sysCommType===t?' on':''}" onclick="firePick('sysCommType','${esc(t)}')">${esc(t)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Control Panel Make</label><input value="${esc(_w.sysPanelMake)}" oninput="fireSet('sysPanelMake',this.value)" placeholder="e.g. Advanced, Notifier, Gent"></div>`;
      html += `<div class="wiz-field"><label>Control Panel Model</label><input value="${esc(_w.sysPanelModel)}" oninput="fireSet('sysPanelModel',this.value)" placeholder="e.g. MX-4200"></div>`;
      html += `<div class="wiz-field"><label>Number of Zones</label><input type="number" min="1" value="${esc(_w.sysZones)}" oninput="fireSet('sysZones',this.value)" style="max-width:100px" placeholder="e.g. 4"></div>`;
      html += `<div class="wiz-field"><label>Number of Loops (addressable)</label><input type="number" min="0" value="${esc(_w.sysLoops)}" oninput="fireSet('sysLoops',this.value)" style="max-width:100px" placeholder="0"></div>`;
      html += `<div class="wiz-field"><label>BAFE Scheme No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysBafe)}" oninput="fireSet('sysBafe',this.value)" placeholder="e.g. SP203"></div>`;
      html += `<div class="wiz-field"><label>FIA Member No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysFia)}" oninput="fireSet('sysFia',this.value)" placeholder="e.g. 12345"></div>`;
    }
    html += `<div class="wiz-field" style="margin-top:8px"><label>Departures / variations <span class="lbl-opt">(Annex G — optional)</span></label><textarea rows="2" oninput="fireSet('departuresNotes',this.value)" placeholder="Any agreed departures from BS 5839-6 standard requirements, with justification…" style="width:100%;font-size:13px;resize:vertical">${esc(_w.departuresNotes||'')}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 4: Detectors ─────────────────────────────────────────────────────
  } else if (s === 4) {
    html += `<h2 class="wiz-title">Detectors & Devices</h2>`;
    if (!(_w.detectors||[]).length) {
      html += `<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Add at least one detector or device to continue.</p>`;
    }
    html += `<div id="fire-det-cards">`;
    (_w.detectors||[]).forEach((det, i) => { html += _detCard(det, i); });
    html += `</div>`;
    html += `<button onclick="fireAddDetector()" class="fire-det-add-btn"><i class="fa-solid fa-plus"></i> Add device</button>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 5: Testing results ───────────────────────────────────────────────
  } else if (s === 5) {
    html += `<h2 class="wiz-title">Testing Results</h2>`;
    html += `<div class="wiz-field"><label>Test Date</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px"><button class="chip" onclick="fireAdjTestDate(-1)" title="Previous day"><i class="fa-solid fa-chevron-left"></i> Prev</button><button class="chip${_w.testDate===todayStr()?' on':''}" onclick="fireAdjTestDate(0)">Today</button><button class="chip" onclick="fireAdjTestDate(1)" title="Next day">Next <i class="fa-solid fa-chevron-right"></i></button><input value="${esc(_w.testDate)}" oninput="fireSet('testDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:120px"></div></div>`;
    if (!_isComm()) {
      // Domestic tests
      html += _testRow('Functional test (each device activates alarm)', 'tFunctional', ['PASS','FAIL','N/A']);
      html += _testRow('Interlinked test (all sound when one activates)', 'tInterlinked', ['PASS','FAIL','N/A']);
      html += _testRow('Battery backup / standby test', 'tBattery', ['PASS','FAIL','N/A']);
      html += `<div class="wiz-field"><label>CO alarms fitted?</label><div class="chip-row">`;
      ['Yes','No','N/A'].forEach(function(v) { html += `<button class="chip${_w.coAlarmsPresent===v?' on':''}" onclick="firePick('coAlarmsPresent','${v}');fireRenderStep()">${v}</button>`; });
      html += `</div></div>`;
      if (_w.coAlarmsPresent === 'N/A') {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;margin:-4px 0 8px 0"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:3px;flex-shrink:0"></i><div style="flex:1"><div style="font-size:12px;color:var(--muted);margin-bottom:5px">Why N/A? <span style="font-size:11px">(optional)</span></div><div class="chip-row">`;
        ['No gas appliance present','CO alarm not fitted'].forEach(function(v) { html += `<button class="chip${_w.coAlarmNaReason===v?' on':''}" onclick="firePick('coAlarmNaReason','${esc(v)}')">${esc(v)}</button>`; });
        html += `</div></div></div>`;
      } else if (_w.coAlarmsPresent) { _w.coAlarmNaReason = ''; }
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
    var _defCls = {'No defects found':'chip-sat','Minor defects (no immediate action)':'chip-attn','Defects requiring attention':'chip-unsat'};
    ['No defects found','Minor defects (no immediate action)','Defects requiring attention'].forEach(v => {
      html += `<button class="chip ${_defCls[v]||''}${_w.defectsOverall===v?' on':''}" onclick="firePick('defectsOverall','${esc(v)}')">${esc(v)}</button>`;
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
    html += `<button onclick="fireAddDefect()" class="fire-defect-add-btn"><i class="fa-solid fa-plus"></i> Add defect</button>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Additional notes <span class="lbl-opt">(optional)</span></label><textarea rows="3" oninput="fireSet('defectsNotes',this.value)" placeholder="Any further observations or notes…" style="width:100%">${esc(_w.defectsNotes)}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 7: Outcome ───────────────────────────────────────────────────────
  } else if (s === 7) {
    html += `<h2 class="wiz-title">Outcome</h2>`;
    var _hasFailDev = (_w.detectors||[]).some(function(d){ return d.result === 'FAIL'; });
    var _hasFailTest = ['tFunctional','tInterlinked','tBattery','tMains','tBatResult','tSounder','tVisual'].some(function(k){ return _w[k] === 'FAIL'; });
    var _hasFail = _hasFailDev || _hasFailTest;
    if (_hasFail && !_w.outcome) { _w.outcome = 'UNSATISFACTORY'; }
    if (_hasFail) {
      html += `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;gap:9px;align-items:flex-start"><i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;font-size:14px;margin-top:1px;flex-shrink:0"></i><div><div style="font-weight:700;color:#dc2626;font-size:13px;margin-bottom:2px">Failure detected</div><div style="color:#7f1d1d;font-size:12px;line-height:1.5">A device or test has a FAIL result — outcome auto-set to <strong>UNSATISFACTORY</strong>. You can override if needed.</div></div></div>`;
    }
    html += `<div class="wiz-field"><label>Overall outcome *</label><div class="chip-row">`;
    var _outCls = {'SATISFACTORY':'chip-sat','UNSATISFACTORY':'chip-unsat','REQUIRES ATTENTION':'chip-attn'};
    ['SATISFACTORY','UNSATISFACTORY','REQUIRES ATTENTION'].forEach(v => {
      var warn = (_hasFail && v === 'SATISFACTORY') ? `<i class="fa-solid fa-triangle-exclamation" style="font-size:10px;margin-left:3px;opacity:.7"></i>` : '';
      var attnIco = v==='REQUIRES ATTENTION' ? `<i class="fa-solid fa-triangle-exclamation" style="font-size:10px;margin-left:3px"></i>` : '';
      html += `<button class="chip ${_outCls[v]}${_w.outcome===v?' on':''}" onclick="firePick('outcome','${v}')">${v}${warn}${attnIco}</button>`;
    });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>System operational at time of leaving</label><div class="chip-row">`;
    ['Yes','No'].forEach(v => { html += `<button class="chip${_w.sysOperational===v?' on':''}" onclick="firePick('sysOperational','${v}')">${v}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Works carried out <span class="lbl-opt">(optional)</span></label><textarea rows="3" oninput="fireSet('worksCarried',this.value)" placeholder="Brief description of work carried out during this visit…" style="width:100%">${esc(_w.worksCarried)}</textarea></div>`;
    var nextMonths = _isComm() ? 6 : 12;
    var autoNext = _addMonths(_w.testDate, nextMonths);
    if (!_w.nextInspDate && autoNext) { _w.nextInspDate = autoNext; }
    html += `<div class="wiz-field"><label>Next inspection due</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px"><button class="chip" onclick="fireSetNextInsp(6)">6 months</button><button class="chip" onclick="fireSetNextInsp(12)">1 year</button><input value="${esc(_w.nextInspDate)}" oninput="fireSet('nextInspDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:130px"></div></div>`;
    if (!_w.outcome) html += `<p style="color:#dc2626;font-size:12px;margin-top:8px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-circle-exclamation"></i> Select an outcome above to continue</p>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary" ${!_w.outcome?'disabled':''}>Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 8: Engineer ──────────────────────────────────────────────────────
  } else if (s === 8) {
    html += `<h2 class="wiz-title">Engineer Details</h2>`;
    html += `<div class="wiz-field"><label>Engineer Name</label><input value="${esc(_w.engineerName)}" oninput="fireSet('engineerName',this.value)" placeholder="Full name"></div>`;
    html += `<div class="wiz-field"><label>Qualification / ID No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.engineerQual)}" oninput="fireSet('engineerQual',this.value)" placeholder="e.g. BAFE SP203 / FIA member no."></div>`;
    html += `<div class="wiz-field"><label>Company Name</label><input value="${esc(_w.companyName)}" oninput="fireSet('companyName',this.value)" placeholder="OHM Electrical Engineering Ltd"></div>`;
    var _sigPrev = _w.enggSigData ? `<img src="${esc(_w.enggSigData)}" style="max-height:50px;max-width:180px;border:1px solid var(--border);border-radius:4px;padding:4px;background:#fff;display:block">` : `<span style="color:var(--muted);font-size:13px">No signature uploaded</span>`;
    html += `<div class="wiz-field"><label>Engineer Signature</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">${_sigPrev}<label class="btn-sm" style="cursor:pointer"><i class="fa-solid fa-upload"></i> Upload<input type="file" accept="image/*" style="display:none" onchange="fireLoadSig(event)"></label>${_w.enggSigData?`<button class="btn-sm" onclick="firePick('enggSigData','');fireRenderStep()"><i class="fa-solid fa-xmark"></i> Clear</button>`:''}</div></div>`;
    html += `<h3 style="font-size:14px;font-weight:700;margin:18px 0 8px;color:var(--fg)">Tenant / Occupier Acknowledgment <span style="color:var(--muted);font-size:12px;font-weight:400">(optional)</span></h3>`;
    html += `<div class="wiz-field"><label>Tenant / Occupier Name</label><input value="${esc(_w.tenantName)}" oninput="fireSet('tenantName',this.value)" placeholder="Full name"></div>`;
    html += `<div class="wiz-field"><label>Acknowledgment Date</label><input value="${esc(_w.tenantAckDate)}" oninput="fireSet('tenantAckDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
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
    if (_w._editId) {
      html += `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:8px 11px;margin-bottom:12px;display:flex;gap:7px;align-items:flex-start"><i class="fa-solid fa-pen-to-square" style="color:#ea580c;font-size:13px;margin-top:1px;flex-shrink:0"></i><span style="font-size:12px;color:#9a3412;line-height:1.5"><strong>You are editing an existing certificate.</strong> All details above will replace the original. Use Back to check each step before re-issuing.</span></div>`;
    }
    if ((_w.clientEmail||'').trim()) {
      html += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-bottom:12px;display:flex;gap:7px;align-items:center;flex-wrap:wrap"><i class="fa-solid fa-envelope" style="color:#2563eb;font-size:13px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;flex:1;min-width:0">Auto-email will be sent to <strong>${esc(_w.clientEmail)}</strong> on issue — verify this is correct</span><button onclick="fireJumpStep(2)" style="font-size:11px;color:#1d4ed8;background:none;border:none;cursor:pointer;text-decoration:underline;white-space:nowrap;padding:0">Change</button></div>`;
    }
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
  _previewTimer = setTimeout(_updateLivePreview, 50);
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

// ── Helper: single detector card HTML ────────────────────────────────────────
function _detCard(det, i) {
  var comm = _isComm();
  var isD1 = !comm && _w.sysGrade && _w.sysGrade.startsWith('D1');
  var html = `<div class="fire-det-card" id="fire-det-${i}">`;
  html += `<div class="fire-det-header"><div class="fire-det-num">Device ${i+1}</div><button onclick="fireRemoveDet(${i})" class="fire-det-remove"><i class="fa-solid fa-trash-can"></i> Remove</button></div>`;
  html += `<div class="wiz-field"><label>Location</label><input value="${esc(det.location||'')}" oninput="fireDetSet(${i},'location',this.value)" placeholder="e.g. Hallway, Landing, Kitchen"></div>`;
  html += `<div class="wiz-field"><label>Type</label><select onchange="fireDetSet(${i},'type',this.value)" style="max-width:260px">`;
  DETECTOR_TYPES.forEach(t => { html += `<option${(det.type||'Smoke (optical)')===t?' selected':''}>${esc(t)}</option>`; });
  html += `</select></div>`;
  html += `<div class="wiz-field"><label>Make / Model <span class="lbl-opt">(optional)</span></label><input value="${esc(det.model||'')}" oninput="fireDetSet(${i},'model',this.value)" placeholder="e.g. Aico 3000 series"></div>`;
  html += `<div class="wiz-field"><label>Serial No. <span class="lbl-opt">(optional)</span></label><input value="${esc(det.serialNo||'')}" oninput="fireDetSet(${i},'serialNo',this.value)" placeholder="e.g. 123456789"></div>`;
  if (comm) { html += `<div class="wiz-field"><label>Zone / Circuit</label><input value="${esc(det.zone||'')}" oninput="fireDetSet(${i},'zone',this.value)" placeholder="e.g. Zone 1"></div>`; }
  html += `<div class="wiz-field"><label>Test result</label><div class="chip-row">`;
  ['PASS','FAIL','N/T'].forEach(v => {
    var cls2 = v==='PASS'?'chip-pass':v==='FAIL'?'chip-fail':'chip-na';
    var ico = v==='PASS'?'<i class="fa-solid fa-check" style="font-size:10px;margin-right:2px"></i>':v==='FAIL'?'<i class="fa-solid fa-xmark" style="font-size:10px;margin-right:2px"></i>':'';
    html += `<button class="chip ${cls2}${det.result===v?' on':''}" onclick="fireDetPick(${i},'result','${v}')">${ico}${v}</button>`;
  });
  html += `</div></div>`;
  if (!comm) {
    html += `<div class="wiz-field"><label>Battery replaced?${isD1?' <span style="color:#2563eb;font-size:11px"><i class="fa-solid fa-circle-info" style="font-size:10px"></i> D1: sealed battery</span>':''}</label><div class="chip-row">`;
    ['N/A','Yes','No'].forEach(v => { html += `<button class="chip${(det.batReplaced||'N/A')===v?' on':''}" onclick="fireDetPick(${i},'batReplaced','${v}')">${v}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Battery expiry <span class="lbl-opt">(optional)</span></label><input value="${esc(det.batExpiry||'')}" oninput="fireDetSet(${i},'batExpiry',this.value)" placeholder="MM/YYYY" style="max-width:120px"></div>`;
  }
  html += `</div>`;
  return html;
}

// ── Helper: test row ──────────────────────────────────────────────────────────
function _testRow(label, key, options) {
  var html = `<div class="wiz-field"><label>${esc(label)}</label><div class="chip-row">`;
  options.forEach(v => {
    var cls = v==='PASS'?'chip-pass':v==='FAIL'?'chip-fail':'chip-na';
    var icon = v==='PASS' ? '<i class="fa-solid fa-check" style="font-size:10px;margin-right:2px"></i>' : v==='FAIL' ? '<i class="fa-solid fa-xmark" style="font-size:10px;margin-right:2px"></i>' : '';
    html += `<button class="chip ${cls}${_w[key]===v?' on':''}" onclick="firePick('${key}','${v}')">${icon}${v}</button>`;
  });
  html += `</div></div>`;
  return html;
}

// ── Exported wizard actions (called from HTML onclick) ────────────────────────
export function firePick(key, val) {
  _w[key] = val;
  if (key === 'defectsOverall' && !(_w.defectsNotes||'').trim()) _w.defectsNotes = val;
  fireRenderStep();
}
export function fireSet(key, val)  { _w[key] = val; _schedulePreview(); }
export function fireLoadSig(evt) {
  var f = evt.target.files[0]; if (!f) return;
  var reader = new FileReader();
  reader.onload = function(e) { _w.enggSigData = e.target.result; fireRenderStep(); _schedulePreview(); };
  reader.readAsDataURL(f);
}
export function fireJumpStep(i) {
  if (i >= 0 && i < STEPS.length && i <= _w.step) { _w.step = i; fireRenderStep(); }
}

export function fireAddDetector() {
  if (!_w.detectors) _w.detectors = [];
  _w.detectors.push({ location:'', type:'Smoke (optical)', model:'', serialNo:'', zone:'', result:'', batReplaced:'N/A', batExpiry:'' });
  fireRenderStep();
}
export function fireRemoveDet(i) {
  if (_w.detectors) _w.detectors.splice(i, 1);
  fireRenderStep();
}
export function fireDetSet(i, key, val) {
  if (_w.detectors && _w.detectors[i]) _w.detectors[i][key] = val;
  _schedulePreview();
}
export function fireDetPick(i, key, val) {
  if (_w.detectors && _w.detectors[i]) _w.detectors[i][key] = val;
  fireRenderStep();
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
  _schedulePreview();
}

export async function fireNext() {
  var s = _w.step;
  if (s === 0 && !_w.certType) { toast('Please select a certificate type','error'); return; }
  if (s === 1) {
    if (!(_w.premAddr1||'').trim()) { toast('Address Line 1 is required','error'); return; }
    if (!(_w.premPostcode||'').trim()) { toast('Postcode is required','error'); return; }
  }
  if (s === 2) {
    if (!(_w.clientAddr1||'').trim()) { toast('Client address line 1 is required','error'); return; }
    if (!(_w.clientPostcode||'').trim()) { toast('Client postcode is required','error'); return; }
  }
  if (s === 4 && !(_w.detectors||[]).length) { toast('Add at least one detector','error'); return; }
  if (s === 4 && (_w.detectors||[]).some(function(d){ return !(d.location||'').trim(); })) {
    if (!await confirm2('Some devices have no location recorded — location helps identify where each device is fitted. Continue without locations?')) return;
  }
  if (s === 4 && (_w.detectors||[]).some(function(d){ return !d.result; })) {
    if (!await confirm2('Some devices have no test result selected (showing "— select —"). Continue without recording a result for them?')) return;
  }
  if (s === 5) {
    var _tdParts = (_w.testDate||'').trim().split('/');
    if (_tdParts.length !== 3 || isNaN(new Date(+_tdParts[2], +_tdParts[1]-1, +_tdParts[0]).getTime())) {
      toast('Test date is not valid — please enter DD/MM/YYYY', 'error'); return;
    }
    var _tdDate = new Date(+_tdParts[2], +_tdParts[1]-1, +_tdParts[0]); _tdDate.setHours(0,0,0,0);
    var _tdNow = new Date(); _tdNow.setHours(0,0,0,0);
    var _tdDiff = Math.round((_tdDate - _tdNow) / 86400000);
    if (_tdDiff > 0) {
      if (!await confirm2('Test date ' + (_w.testDate||'') + ' is in the future — is that correct?')) return;
    } else if (_tdDiff < -7) {
      if (!await confirm2('Test date ' + (_w.testDate||'') + ' is more than 7 days ago — is that correct?')) return;
    }
    var _isCommNow = _w.certType === 'FA.3' || _w.certType === 'FA.4';
    var _tkeys = _isCommNow ? ['tMains','tBatResult','tSounder','tVisual'] : ['tFunctional','tInterlinked','tBattery'];
    if (_tkeys.every(function(k){ return !_w[k]; })) {
      if (!await confirm2('No test results have been recorded. Continue without any test results?')) return;
    }
  }
  if (s === 5) {
    // Auto-populate defects from any FAIL results (only if list is currently empty)
    if (!(_w.defects||[]).length) {
      var _autoD = [];
      var _failTestLbls = {tFunctional:'Functional test',tInterlinked:'Interlinked test (alarm interconnection)',tBattery:'Battery backup / standby test',tCO:'CO alarm test',tMains:'Mains supply test',tBatResult:'Battery standby test',tSounder:'Sounder / beacon test',tVisual:'Visual indicators test',tZoneIso:'Zone isolation test',tFaultSim:'Fault simulation test',tKeySwitch:'Engineer key switch test'};
      var _isCommNow3 = _w.certType==='FA.3'||_w.certType==='FA.4';
      (_w.detectors||[]).forEach(function(d){ if(d.result==='FAIL'){ _autoD.push({description:(d.type||'Device')+' at '+(d.location||'unknown location')+' — failed test',severity:'MAJOR',recommendation:'Inspect, repair or replace the device and re-test to confirm rectification.',targetDate:''}); } });
      Object.keys(_failTestLbls).forEach(function(k){ if(_w[k]==='FAIL'){ _autoD.push({description:_failTestLbls[k]+' — failed',severity:'MAJOR',recommendation:'Investigate cause of failure, rectify fault and re-test.',targetDate:''}); } });
      if (_autoD.length) { _w.defects = _autoD; if (!_w.defectsOverall||_w.defectsOverall==='No defects found') _w.defectsOverall='Defects requiring attention'; }
    }
  }
  if (s === 6 && (_w.defects||[]).some(function(d){ return !(d.description||'').trim(); })) {
    toast('Some defect rows have no description — please fill them in or remove the blank rows', 'error'); return;
  }
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
  if (!(_w.engineerName||'').trim()) {
    toast('Engineer name is required — go back to the Engineer step', 'error');
    _w.step = 8; fireRenderStep(); return;
  }
  var _hasFails = (_w.detectors||[]).some(function(d){ return d.result==='FAIL'; }) ||
    ['tFunctional','tInterlinked','tBattery','tMains','tBatResult','tSounder','tVisual'].some(function(k){ return _w[k]==='FAIL'; });
  if (_hasFails && (_w.outcome||'').toUpperCase() === 'SATISFACTORY') {
    if (!await confirm2('This certificate has FAIL results but the outcome is SATISFACTORY — this may be incorrect. Issue anyway?')) return;
  }
  if (!navigator.onLine) {
    var _ofRec = Object.assign({}, _w, { savedAt: new Date().toISOString() });
    delete _ofRec._editId; delete _ofRec.step;
    var _ofAddr = [_w.premAddr1, _w.premAddr2, _w.premAddr3, _w.premPostcode].filter(Boolean).join(', ');
    var _ofRow = { ref_number: null, base_ref: null, cert_type: _ofRec.certType || null, premises_address: _ofAddr || null, test_date: _ofRec.testDate || null, outcome: _ofRec.outcome || null, updated_at: new Date().toISOString(), data: _ofRec };
    await idbEnqueue({ type: 'fire_upsert', form: _ofRow, supabaseId: isEdit ? _w._editId : null, userId: state.currentUser.id, ts: Date.now() });
    refreshSyncBadge();
    _fireDirty = false;
    try { localStorage.removeItem('fire_autosave'); } catch(e) {}
    toast('Saved offline — will sync when back online', 'success');
    navigate('fire-history');
    return;
  }
  if (!isEdit && (_w.premAddr1||'').trim()) {
    try {
      var _dupCutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString();
      var _dupQ = await sb.from('fire_certs')
        .select('ref_number,test_date,outcome')
        .ilike('premises_address', '%' + (_w.premAddr1||'').trim() + '%')
        .is('deleted_at', null)
        .gte('created_at', _dupCutoff)
        .limit(1);
      if (_dupQ.data && _dupQ.data.length) {
        var _dr = _dupQ.data[0];
        if (!await confirm2('A fire certificate for this address was already issued in the last 30 days (' + esc(_dr.ref_number||'unknown') + ', ' + esc(_dr.test_date||'') + ', ' + esc(_dr.outcome||'') + '). Issue another certificate anyway?')) return;
      }
    } catch(e) {}
  }
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
  if (isEdit) {
    rec.updatedBy = (state.currentUser && state.currentUser.id) ? state.currentUser.id : null;
    rec.updatedAt = new Date().toISOString();
  }
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
  if (!navigator.onLine) {
    try {
      const _c = JSON.parse(localStorage.getItem('_cache_fire_history') || 'null');
      if (_c) {
        _fireAllCerts = _c.data; _fireFiltered = _fireAllCerts; _firePage = 1; _fireCurrentQ = '';
        renderFireList(_fireAllCerts, 1, '');
        const _ago = new Date(_c.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        toast('Offline — showing certificates loaded at ' + _ago, 'info');
        return;
      }
    } catch {}
    toast('Offline — no cached fire certificates available', 'warn');
    return;
  }
  var q = sb.from('fire_certs').select('*').is('deleted_at', null).order('created_at', { ascending:false });
  if (!isAdmin()) q = q.eq('created_by', state.currentUser.id);
  var { data, error } = await q;
  if (error) { console.error('loadFireHistory:', error); return; }
  _fireAllCerts = data || [];
  try { localStorage.setItem('_cache_fire_history', JSON.stringify({ data: _fireAllCerts, ts: Date.now() })); } catch {}
  _fireFiltered = _fireAllCerts; _firePage = 1; _fireCurrentQ = '';
  renderFireList(_fireAllCerts, 1, '');
}

export function filterFireList() {
  _fireCurrentQ = (document.getElementById('fire-search')?.value||'').trim().toLowerCase();
  var typeF = document.getElementById('fire-filter-type')?.value||'';
  var outF  = document.getElementById('fire-filter-outcome')?.value||'';
  var filtered = _fireAllCerts.filter(function(r) {
    var d = r.data||{};
    var mT = !typeF || (r.cert_type||'') === typeF;
    var mO = !outF  || (r.outcome||'').toUpperCase() === outF.toUpperCase();
    if (_fireCurrentQ.length < 2) return mT && mO;
    var lq = _fireCurrentQ;
    var mQ =
      (r.ref_number      ||'').toLowerCase().indexOf(lq) !== -1 ||
      (r.premises_address||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr1       ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr2       ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premAddr3       ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premPostcode    ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.premisesName    ||'').toLowerCase().indexOf(lq) !== -1 ||
      (d.clientName      ||'').toLowerCase().indexOf(lq) !== -1 ||
      (r.cert_type       ||'').toLowerCase().indexOf(lq) !== -1;
    return mQ && mT && mO;
  });
  if (_fireCurrentQ.length >= 2) {
    filtered = sortByWordStart(filtered, function(r) {
      var d = r.data||{};
      return [r.premises_address, d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode, d.premisesName, r.ref_number, d.clientName].join(' ');
    }, _fireCurrentQ);
  }
  _fireFiltered = filtered; _firePage = 1;
  renderFireList(filtered, 1, _fireCurrentQ);
}

function _fireExpiryPill(d) {
  var nd = d.nextInspDate; if (!nd) return '';
  var p = nd.split('/'); if (p.length !== 3) return '';
  var due = new Date(+p[2], +p[1]-1, +p[0]);
  var today = new Date(); today.setHours(0,0,0,0);
  var days = Math.ceil((due - today) / 864e5);
  var bg, col, bord, sub;
  if (days < 0)        { bg='#fee2e2'; col='#dc2626'; bord='#fca5a5'; sub='OVERDUE'; }
  else if (days <= 30) { bg='#fff7ed'; col='#ea580c'; bord='#fed7aa'; sub='DAYS'; }
  else if (days <= 90) { bg='#fefce8'; col='#ca8a04'; bord='#fef08a'; sub='DAYS'; }
  else                 { bg='#f0fdf4'; col='#16a34a'; bord='#86efac'; sub='DAYS'; }
  var num = Math.abs(days);
  return '<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:52px;padding:6px 12px;border-radius:10px;background:'+bg+';border:1.5px solid '+bord+';gap:1px;flex-shrink:0">'
    +'<span style="font-size:16px;font-weight:800;color:'+col+';line-height:1;letter-spacing:-.02em">'+num+'</span>'
    +'<span style="font-size:8px;font-weight:700;color:'+col+';opacity:.7;text-transform:uppercase;letter-spacing:.1em;line-height:1;margin-top:2px">'+sub+'</span>'
    +'</span>';
}

function renderFireList(certs, page, q) {
  page = page || 1; q = q || '';
  var container = document.getElementById('fire-history-list');
  if (!container) return;
  if (!certs.length) {
    container.innerHTML = q.length >= 2
      ? '<p class="empty-state">No fire alarm certificates matching "<strong>'+q+'</strong>"</p>'
      : '<p class="empty-state">No fire alarm certificates yet.</p>';
    return;
  }
  var tot   = _fireAllCerts.length;
  var sat   = _fireAllCerts.filter(function(r){ return (r.outcome||'').toUpperCase()==='SATISFACTORY'; }).length;
  var unsat = _fireAllCerts.filter(function(r){ return (r.outcome||'').toUpperCase()==='UNSATISFACTORY'; }).length;
  var tile  = function(n, lbl, col) { return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;flex:1;min-width:90px"><div style="font-size:22px;font-weight:600;color:'+(col||'var(--text)')+';">'+n+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px">'+lbl+'</div></div>'; };
  var isSearch = q.length >= 2;
  var startIdx = (page - 1) * PAGE_SIZE;
  var pageItems = certs.slice(startIdx, startIdx + PAGE_SIZE);
  var mkRow = function(r, q, idx) {
    var d = r.data||{};
    var addrRaw = [d.premAddr1, d.premAddr2, d.premAddr3, d.premPostcode].filter(Boolean).join(', ') || r.premises_address || '—';
    var oc = (r.outcome||'').toUpperCase();
    var ocCol = oc==='SATISFACTORY' ? '#16a34a' : oc==='UNSATISFACTORY' ? '#dc2626' : '#b45309';
    var ocLabel = oc==='SATISFACTORY' ? 'Satisfactory' : oc==='UNSATISFACTORY' ? 'Unsatisfactory' : r.outcome||'—';
    var typeLabel = (CERT_TYPES.find(function(t){ return t.id===r.cert_type; })||{}).label || r.cert_type || '—';
    var ac = _addrColor(addrRaw); var abg = ac[0]; var atx = ac[1];
    var ini = (_addrInitials(addrRaw)||addrRaw.slice(0,2)||'?').toUpperCase();
    var addrHtml = q ? hlText(addrRaw, q) : esc(addrRaw);
    var refHtml  = q ? hlText(r.ref_number||'—', q) : esc(r.ref_number||'—');
    var pill = _fireExpiryPill(d);
    return '<div class="pat-card" onclick="fireOpenCertIdx('+idx+')" style="cursor:pointer">'
      +'<div style="width:36px;height:36px;border-radius:50%;background:'+abg+';color:'+atx+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px">'+ini+'</div>'
      +'<div class="pat-card-body">'
        +'<div class="pat-card-top">'
          +'<span class="pat-card-addr">'+addrHtml+'</span>'
          +(pill || '<span style="font-size:11px;font-weight:600;color:'+ocCol+';white-space:nowrap">'+esc(ocLabel)+'</span>')
        +'</div>'
        +'<div class="pat-card-bot">'
          +'<code class="pat-ref-chip">'+refHtml+'</code>'
          +'<span class="pat-card-date">'+esc(r.test_date||d.testDate||'—')+'</span>'
          +(pill?'<span style="font-size:11px;font-weight:600;color:'+ocCol+'">'+esc(ocLabel)+'</span>':'')
          +'<span class="pat-card-sub">&middot; '+esc(typeLabel)+'</span>'
          +'<div class="pat-card-btns">'
            +_ibtn('View','fa-eye','event.stopPropagation();fireOpenCertIdx('+idx+')')
            +(isAdmin()?_ibtn('Edit','fa-pen','event.stopPropagation();fireEditCertIdx('+idx+')'):'')
            +_ibtn('Download PDF','fa-download','event.stopPropagation();fireDownloadPDFIdx('+idx+')')
            +_ibtn('Email','fa-envelope','event.stopPropagation();fireEmailCertIdx('+idx+')')
            +(isAdmin()?_ibtn('Delete','fa-trash','event.stopPropagation();fireDeleteCert(\''+r.id+'\')',true):'')
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>';
  };
  var html = '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+tile(tot,'Total Fire Certs')+tile(sat,'Satisfactory','#16a34a')+tile(unsat,'Unsatisfactory','#dc2626')+'</div>';
  if (isSearch) {
    html += '<div style="font-size:12px;color:var(--muted);padding:2px 0 10px">'+certs.length+' result'+(certs.length!==1?'s':'')+' matching "<strong style="color:var(--text)">'+q+'</strong>"</div>';
    html += pageItems.map(function(r, i){ return mkRow(r, q, startIdx + i); }).join('');
  } else {
    html += pageItems.map(function(r, i){ return mkRow(r, '', startIdx + i); }).join('');
  }
  html += paginationHtml(page, certs.length, 'firePrevPage()', 'fireNextPage()');
  container.innerHTML = html;
}

export function firePrevPage() { if (_firePage > 1) { _firePage--; renderFireList(_fireFiltered, _firePage, _fireCurrentQ); document.getElementById('fire-history-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }
export function fireNextPage() { if (_firePage < Math.ceil(_fireFiltered.length / PAGE_SIZE)) { _firePage++; renderFireList(_fireFiltered, _firePage, _fireCurrentQ); document.getElementById('fire-history-list')?.scrollIntoView({behavior:'smooth',block:'start'}); } }

export function fireOpenCertIdx(idx) {
  var r = _fireFiltered[idx]; if (!r) return;
  fireOpenCert(r.data || r);
}
export function fireEditCertIdx(idx) {
  var r = _fireFiltered[idx]; if (!r) return;
  fireEditCert(r);
}
export function fireDownloadPDFIdx(idx) {
  var r = _fireFiltered[idx]; if (!r) return;
  fireDownloadPDF(r.data || r);
}
export function fireEmailCertIdx(idx) {
  var r = _fireFiltered[idx]; if (!r) return;
  import('./email.js').then(function(m){ m.fireEmailCert(r.data || r); }).catch(function(){});
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
  var { error } = await sb.from('fire_certs').update({
    deleted_at: new Date().toISOString(),
    deleted_by: (state.currentUser && state.currentUser.id) ? state.currentUser.id : null
  }).eq('id', id);
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

export function fireClientAddrFocus() {
  if (_w._clientAddrPrefilled) {
    _w.clientAddr1 = ''; _w.clientAddr2 = ''; _w.clientAddr3 = ''; _w.clientPostcode = '';
    _w._clientAddrPrefilled = false;
    _fireDirty = true;
    fireRenderStep();
    setTimeout(function() { var el = document.getElementById('fa-caddr1'); if (el) el.focus(); }, 10);
  }
}

export function fireAdjTestDate(delta) {
  var parts = (_w.testDate||'').split('/');
  var d = (parts.length===3) ? new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0])) : new Date();
  if (delta === 0) { d = new Date(); } else { d.setDate(d.getDate()+delta); }
  _w.testDate = d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
  _fireDirty = true;
  fireRenderStep();
}

export function fireSetNextInsp(months) {
  _w.nextInspDate = _addMonths(_w.testDate, months);
  _fireDirty = true;
  fireRenderStep();
}
