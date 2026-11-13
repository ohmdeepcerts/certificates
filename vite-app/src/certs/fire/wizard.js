import { sb } from '../../lib/supabase.js';
import { state, isAdmin } from '../../lib/state.js';
import { toast, showOverlay, hideOverlay, confirm2, _softDelete, _deleteCert, esc, _addrColor, _addrInitials, _ibtn } from '../../lib/utils.js';
import { getSetting } from '../../lib/settings.js';
import { navigate } from '../../nav/navigation.js';
import { buildCertRefSeq, _pcScore, _refAddrPart } from '../_core/refgen.js';
import { attachAddressAutocomplete } from '../../lib/address-autocomplete.js';
import { fireBuildCertHTML } from './pdf.js';
import { PAGE_SIZE, hlText, sortByWordStart, paginationHtml } from '../../lib/search.js';
import { idbEnqueue, refreshSyncBadge } from '../../lib/offline.js';

let _w = {};
let _dir = { properties: null };
let _fireDirty = false;
let _fireAllCerts = [];
let _firePage = 1, _fireFiltered = [], _fireCurrentQ = '';

const STEPS = ['type','premises','client','system','schedule','detectors','testing','interfaces','defects','outcome','review'];
const STEP_LABELS = ['Type','Premises','Client','System','Schedule','Detectors','Testing','Interfaces','Defects','Outcome','Review'];
let _previewTimer = null;

const CERT_TYPES = [
  { id:'FA.1', label:'FA.1 — Installation Certificate', sub:'New domestic fire alarm installation — BS 5839-6 (Grade D)', domestic:true },
  { id:'FA.2', label:'FA.2 — Inspection & Service Certificate', sub:'Annual domestic inspection and service — BS 5839-6 (Grade D)', domestic:true },
  { id:'FA.3', label:'FA.3 — Installation/Commissioning Certificate', sub:'Commercial fire alarm installation — BS 5839-1 (Grade A)', domestic:false },
  { id:'FA.4', label:'FA.4 — Inspection & Servicing Report', sub:'Commercial fire detection & alarm system — BS 5839-1 (Grade A)', domestic:false },
];

const PREMISES_TYPES = ['House','Flat / Apartment','HMO','Bedsit','Bungalow','Commercial Office','Retail / Shop','Care Home','School / College','Warehouse','Hotel','Restaurant / Café','Other'];
const DETECTOR_TYPES = ['Smoke (optical)','Smoke (ionisation)','Heat','CO (carbon monoxide)','Multi-sensor','Sounder / base','Call point','Beam detector','Sprinkler flow switch','Other'];
const DOM_GRADES  = ['A — full CIE panel','B — domestic panel','C — alarm controller','D1 — mains-powered + battery backup','D2 — battery only','E — mains-powered, no backup','F1 — primary cell battery','F2 — rechargeable battery'];
const DOM_CATS    = ['LD1 — whole building coverage','LD2 — escape routes + high-risk areas','LD3 — escape routes only','PD1 — whole property (property protection)','PD2 — specific area (property protection)'];
const COM_CATS    = ['M — manual alarm only','L1 — whole building','L2 — defined areas','L3 — escape routes','L4 — circulation areas','L5 — specific risk only','P1 — whole building (property)','P2 — specific area (property)'];
const COM_TYPES   = ['Conventional','Addressable','Combined'];

const COM_INTERFACES = [
  { key:'iface_door',       label:'Door release holders / automatic door closers' },
  { key:'iface_aov',        label:'Smoke ventilation / AOV (automatic opening vent)' },
  { key:'iface_hvac',       label:'HVAC / air handling shutdown' },
  { key:'iface_lift',       label:'Lift recall interface' },
  { key:'iface_access',     label:'Access control system' },
  { key:'iface_em_light',   label:'Emergency lighting interface' },
  { key:'iface_suppression',label:'Suppression / extinguishing system' },
  { key:'iface_pa',         label:'PA / voice alarm link' },
  { key:'iface_refuge',     label:'Disabled refuge alarm interface' },
  { key:'iface_arc',        label:'Remote monitoring / ARC' },
];

const DOM_SCHEDULE_ITEMS = [
  ['A — Control Equipment',[
    ['cie_visual','Control equipment / alarm controller — visual indicators operational'],
    ['cie_fault','Fault indication functional'],
    ['cie_weekly_log','Weekly test log reviewed and up to date'],
  ]],
  ['B — Power Supply',[
    ['ps_mains','Mains supply confirmed operational'],
    ['ps_bat','Standby battery / PSU condition satisfactory'],
    ['ps_bat_volt','Battery voltage measured and confirmed'],
  ]],
  ['C — Detectors &amp; Devices',[
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
  ['E — Cables &amp; Installation',[
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

const COM_SCHEDULE_ITEMS = [
  ['A — Control &amp; Indicating Equipment',[
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
  ['F — Ancillary &amp; Interface Devices',[
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
  ]],
];

const FA1_CHECKS = [
  {id:'c01', label:'All detectors installed and confirmed operational'},
  {id:'c02', label:'Sounders audible in all sleeping areas and escape routes'},
  {id:'c03', label:'Installation in accordance with agreed specification'},
  {id:'c04', label:'Cable routes and fixings neat, secure and undamaged'},
  {id:'c05', label:'Client / occupant briefing carried out'},
  {id:'c06', label:'User documentation and operating instructions supplied'},
];
const FA2_CHECKS = [
  {id:'s01', label:'Each detector tested and alarm activated'},
  {id:'s02', label:'All sounders audible throughout the property'},
  {id:'s03', label:'Interlink confirmed (all devices sound when one triggers)'},
  {id:'s04', label:'Battery / power supply checked and serviceable'},
  {id:'s05', label:'No building alterations requiring additional coverage'},
  {id:'s06', label:'Detectors correctly positioned and not obstructed'},
  {id:'s07', label:'Detector heads free from contamination (dust, insects, paint)'},
  {id:'s08', label:'Cables and wiring secure and undamaged'},
  {id:'s09', label:'Previous inspection recommendations actioned'},
  {id:'s10', label:'Maintenance documentation updated'},
];

function _isComm() { return _w.certType === 'FA.3' || _w.certType === 'FA.4'; }

function todayStr() {
  var d = new Date();
  return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
}

function _toIso(ddmmyyyy) {
  var p = (ddmmyyyy||'').split('/');
  return p.length === 3 && p[2].length === 4 ? p[2]+'-'+p[1]+'-'+p[0] : '';
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
    sysDomPanelMake: '', sysDomPanelModel: '', sysDomZones: '',
    sysDomPanelSerial: '', sysDomPanelFirmware: '',
    sysInterlinkMethod: '', sysInterlinked: '', sysPowerSupply: '',
    // system — commercial extra
    sysPanelMake: '', sysPanelModel: '', sysCommType: '',
    sysPanelSerial: '', sysPanelFirmware: '',
    sysZones: '', sysLoops: '', sysBafe: '', sysFia: '',
    batType: '', batInstallDate: '', batNextReplacement: '',
    installDate: '', prevServiceDate: '',
    // detectors
    detectors: [],
    detTotal: '', detPass: '', detFail: '', detTested: '',
    // testing — domestic
    tFunctional: 'PASS', tInterlinked: 'PASS', tBattery: 'PASS', tCO: 'PASS',
    // testing — commercial
    tMains: '', tBatDuration: '', tBatResult: '', tSounder: '', tVisual: '', tZoneIso: '', tFaultSim: '', tKeySwitch: '',
    tMainsVolts: '', tBatVolts: '', tSounderDb: '',
    // defects
    defects: [],
    defectsOverall: '', defectsNotes: '',
    // outcome
    outcome: '', nextInspDate: '', worksCarried: '', sysOperational: '', satJustification: '',
    _clientAddrPrefilled: false,
    // engineer
    engineerName: getSetting('fire_default_engineer', getSetting('fa_engineer', getSetting('default_engineer',''))),
    engineerQual: getSetting('fa_engineer_qual', ''),
    engineerRegNo: getSetting('fa_engineer_reg_no', ''),
    enggSigData: getSetting('fire_engg_sig_data','') || getSetting('el_sig_data',''),
    companyName: getSetting('fire_co_name', getSetting('company_name', 'OHM Electrical Engineering Ltd')),
    // tenant acknowledgment
    tenantName: '', tenantAckDate: '',
    // system — commercial extra (new fields)
    sysCommissionDate: '', sysDrawingRef: '',
    sysCategoryRiskAssessment: '',
    monitoringContractRef: '', keyholdersConfirmed: '', logBookLocation: '',
    // testing extras
    coAlarmsPresent: '', coAlarmNaReason: '',
    departuresNotes: '',
    agreedLimitations: '',
    inspLimitations: '',
    prevReportRef: '',
    otherRefDocs: '',
    nextInspInterval: '',
    falseAlarms12m: '',
    falseAlarmAction: '',
    designRef: '',
    scheduleItems: {}, scheduleNotes: {},
    // interfaces step (commercial)
    interfaces: {}, interfacesNotes: '',
    // carry-forward defects (commercial FA.4)
    carriedDefects: [], _prevCertRef: '', _prevCertDate: '', _prevCertLoaded: false,
    worksRecommended: '', prevDefectsResolved: '',
    responsiblePersonTitle: '', responsiblePersonTel: '',
    annexGChecks: {}, annexFa2Checks: {s01:'PASS',s02:'PASS',s03:'PASS',s04:'PASS',s05:'PASS',s06:'PASS',s07:'PASS',s08:'N/A',s09:'PASS',s10:'PASS'},
    changeOfOrg: '',
    prevOrgName: '',
    prevOrgContact: '',
    prevOrgDate: '',
    handoverCondition: '',
    handoverNotes: '',
    testDate: todayStr(),
    ref: '', baseRef: '',
    _visited: {}
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
  if (!_w._visited) _w._visited = {};
  _w._visited[s] = true;
  var tabsEl = document.getElementById('fire-step-tabs');
  var pbarEl = document.getElementById('fire-pbar-fill');
  if (tabsEl) {
    tabsEl.innerHTML = STEP_LABELS.map((lbl,i) => {
      var visited = !!_w._visited[i];
      var cls = i === s ? 'active' : visited ? 'done' : '';
      return `<button class="wiz-step-tab ${cls}" onclick="fireJumpStep(${i})" title="${lbl}"><span class="tab-num">${visited && i !== s ? '&#10003;' : i+1}</span><span class="tab-lbl">&nbsp;${lbl}</span></button>`;
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
    if (_w.certType) {
      html += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">`;
      html += `<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px"><i class="fa-solid fa-calendar-days" style="margin-right:5px"></i>Certificate Dates</div>`;
      var _calBtn = (key) => `<label style="position:relative;cursor:pointer;display:inline-flex;flex-shrink:0"><span class="chip" style="pointer-events:none"><i class="fa-solid fa-calendar-days"></i></span><input type="date" value="${esc(_toIso(_w[key]))}" onchange="fireFromDateInput('${key}',this.value)" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%"></label>`;
      html += `<div class="wiz-field"><label>Test / Visit Date</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px"><button class="chip" onclick="fireAdjTestDate(-1)"><i class="fa-solid fa-chevron-left"></i> Prev</button><button class="chip${_w.testDate===todayStr()?' on':''}" onclick="fireAdjTestDate(0)">Today</button><button class="chip" onclick="fireAdjTestDate(1)">Next <i class="fa-solid fa-chevron-right"></i></button>${_calBtn('testDate')}<input value="${esc(_w.testDate)}" oninput="fireSet('testDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:120px"></div></div>`;
      var _nextLbl0 = _w.certType === 'FA.1' ? 'Next service due <span class="lbl-opt">(optional)</span>' : 'Next inspection due';
      html += `<div class="wiz-field"><label>${_nextLbl0}</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px"><button class="chip${_w.nextInspDate===_addMonths(_w.testDate,6)?' on':''}" onclick="fireSetNextInsp(6)">6 months</button><button class="chip${_w.nextInspDate===_addMonths(_w.testDate,12)?' on':''}" onclick="fireSetNextInsp(12)">12 months</button>${_calBtn('nextInspDate')}<input value="${esc(_w.nextInspDate)}" oninput="fireSet('nextInspDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:130px"></div></div>`;
      html += `</div>`;
    }
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
    html += `<div style="margin-bottom:8px"><button onclick="firePickFromDirectory()" class="btn-sm"><i class="fa-solid fa-address-book"></i> Pick from directory</button></div>`;
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
    html += `<div class="wiz-field"><label>Client Name <span class="lbl-opt">(optional)</span></label><input id="fa-client-name" value="${esc(_w.clientName)}" oninput="fireSet('clientName',this.value)" placeholder="Full name or company"></div>`;
    html += `<div class="wiz-field"><label>Client Type</label><div class="chip-row">`;
    cTypes.forEach(ct => { html += `<button class="chip${_w.clientType===ct?' on':''}" onclick="firePick('clientType','${esc(ct)}')">${esc(ct)}</button>`; });
    html += `</div></div>`;
    var addrNote = _w._clientAddrPrefilled ? `<span style="font-size:11px;color:#15803d;font-weight:400;margin-left:6px"><i class="fa-solid fa-clone"></i> Copied from premises — click to change</span>` : '';
    html += `<div class="wiz-field"><label>Client Address Line 1 *${addrNote}</label><div class="aac-wrap"><input id="fa-caddr1" value="${esc(_w.clientAddr1)}" oninput="fireSet('clientAddr1',this.value)" onfocus="fireClientAddrFocus()" placeholder="House no. &amp; street"><div class="aac-drop" style="display:none"></div></div></div>`;
    html += `<div class="wiz-field"><label>Address Line 2</label><input value="${esc(_w.clientAddr2)}" oninput="fireSet('clientAddr2',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Town / City</label><input value="${esc(_w.clientAddr3)}" oninput="fireSet('clientAddr3',this.value)"></div>`;
    html += `<div class="wiz-field"><label>Postcode *</label><input value="${esc(_w.clientPostcode)}" oninput="fireSet('clientPostcode',this.value)" style="max-width:140px"></div>`;
    html += `<div class="wiz-field"><label>Client Email (for auto-send)</label><input type="email" value="${esc(_w.clientEmail)}" oninput="fireSet('clientEmail',this.value)" placeholder="client@example.com"></div>`;
    html += `<div class="wiz-field"><label>Responsible Person <span class="lbl-opt">(on-site contact)</span></label><input value="${esc(_w.responsiblePerson)}" oninput="fireSet('responsiblePerson',this.value)" placeholder="Name of person responsible for premises"></div>`;
    html += `<div class="wiz-field"><label>Responsible Person Title <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.responsiblePersonTitle||'')}" oninput="fireSet('responsiblePersonTitle',this.value)" placeholder="e.g. Facilities Manager, Building Owner" style="max-width:280px"></div>`;
    html += `<div class="wiz-field"><label>Responsible Person Contact Number <span class="lbl-opt">(optional)</span></label><input type="tel" value="${esc(_w.responsiblePersonTel||'')}" oninput="fireSet('responsiblePersonTel',this.value)" placeholder="e.g. 07700 900123" style="max-width:200px"></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 3: System details ────────────────────────────────────────────────
  } else if (s === 3) {
    html += `<h2 class="wiz-title">System Details</h2>`;
    if (!_isComm()) {
      // Domestic grades A–F
      var _isDomPnl = /^[ABC]/.test(_w.sysGrade||'');
      html += `<div class="wiz-field"><label>System Grade</label><div class="chip-row">`;
      DOM_GRADES.forEach(g => { html += `<button class="chip${_w.sysGrade===g?' on':''}" onclick="firePickGrade('${esc(g)}')">${esc(g)}</button>`; });
      html += `</div></div>`;
      if (_isDomPnl) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#fdf5f0;border:1px solid #fca5a5;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#dc2626;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#991b1b;line-height:1.5"><strong>Panel grade (${_w.sysGrade.charAt(0)})</strong> — this installation includes a control panel. Enter panel details below. Interlink is handled through the panel.</span></div>`;
      } else if (_w.sysGrade && _w.sysGrade.startsWith('D1')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade D1</strong> — mains-powered with a sealed, tamper-proof lithium battery. Battery replacement records as <em>N/A</em> on all devices.</span></div>`;
      } else if (_w.sysGrade && _w.sysGrade.startsWith('D2')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade D2</strong> — mains-powered with a user-replaceable standby battery (typically 9V PP3). Record whether battery was replaced during this visit.</span></div>`;
      } else if (_w.sysGrade && _w.sysGrade.startsWith('E')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade E</strong> — mains-powered only, no standby battery. Not recommended for new installations per BS 5839-6:2019.</span></div>`;
      } else if (_w.sysGrade && _w.sysGrade.startsWith('F')) {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 11px;margin-top:-4px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:2px;flex-shrink:0"></i><span style="font-size:12px;color:#1e40af;line-height:1.5"><strong>Grade F</strong> — battery-powered only. F1 uses a primary (non-rechargeable) cell; F2 uses a rechargeable cell. Suitable for temporary or supplementary protection only.</span></div>`;
      }
      html += `<div class="wiz-field"><label>System Category</label><div class="chip-row">`;
      DOM_CATS.forEach(c => { html += `<button class="chip${_w.sysCategory===c?' on':''}" onclick="firePick('sysCategory','${esc(c)}')">${esc(c)}</button>`; });
      html += `</div></div>`;
      if (_isDomPnl) {
        html += `<div class="wiz-field"><label>Control Panel Make</label><input value="${esc(_w.sysDomPanelMake||'')}" oninput="fireSet('sysDomPanelMake',this.value)" placeholder="e.g. Advanced, EMS, Morley"></div>`;
        html += `<div class="wiz-field"><label>Control Panel Model</label><input value="${esc(_w.sysDomPanelModel||'')}" oninput="fireSet('sysDomPanelModel',this.value)" placeholder="e.g. MX-4100"></div>`;
        html += `<div class="wiz-field"><label>Panel Serial No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysDomPanelSerial||'')}" oninput="fireSet('sysDomPanelSerial',this.value)" placeholder="e.g. AB12345678"></div>`;
        html += `<div class="wiz-field"><label>Firmware Version <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysDomPanelFirmware||'')}" oninput="fireSet('sysDomPanelFirmware',this.value)" placeholder="e.g. v2.3.1"></div>`;
        html += `<div class="wiz-field"><label>Number of Zones</label><input type="number" min="1" value="${esc(_w.sysDomZones||'')}" oninput="fireSet('sysDomZones',this.value)" style="max-width:100px" placeholder="e.g. 2"></div>`;
      } else {
        var _autoPs = _gradeDefaultPower(_w.sysGrade||'');
        html += `<div class="wiz-field"><label>Power Supply</label><div class="chip-row">`;
        ['230V AC mains only','230V AC mains + battery backup','Battery only'].forEach(p => {
          html += `<button class="chip${_w.sysPowerSupply===p?' on':''}" onclick="firePickPowerSupply('${esc(p)}')">${esc(p)}</button>`;
        });
        html += `</div>`;
        if (_autoPs && _w.sysPowerSupply === _autoPs) {
          html += `<div style="font-size:11px;color:var(--muted);margin-top:3px"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:3px"></i>Auto-set from grade — override above if needed</div>`;
        }
        html += `</div>`;
        html += `<div class="wiz-field"><label>Manufacturer / Make</label><input value="${esc(_w.sysMfr)}" oninput="fireSet('sysMfr',this.value)" placeholder="e.g. Aico, Kidde, FireAngel"></div>`;
        html += `<div class="wiz-field"><label>Model</label><input value="${esc(_w.sysModel)}" oninput="fireSet('sysModel',this.value)" placeholder="e.g. Ei650RF"></div>`;
      }
      html += `<div class="wiz-field"><label>Interlink Method</label><div class="chip-row">`;
      ['Wired','Radio (RF)','Not interlinked'].forEach(v => { html += `<button class="chip${_w.sysInterlinkMethod===v?' on':''}" onclick="firePick('sysInterlinkMethod','${esc(v)}')">${esc(v)}</button>`; });
      html += `</div></div>`;
      if (_w.sysGrade && !_w.sysGrade.startsWith('E')) {
        html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Battery Details <span style="font-weight:400;text-transform:none">(optional)</span></div></div>`;
        html += `<div class="wiz-field"><label>Battery Type</label><input value="${esc(_w.batType||'')}" oninput="fireSet('batType',this.value)" placeholder="e.g. 9V PP3, 12V Sealed Lead Acid, Lithium cell"></div>`;
        html += `<div class="wiz-field"><label>Battery Installation Date</label><input value="${esc(_w.batInstallDate||'')}" oninput="fireSet('batInstallDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
        html += `<div class="wiz-field"><label>Next Replacement Due</label><input value="${esc(_w.batNextReplacement||'')}" oninput="fireSet('batNextReplacement',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      }
      if (_w.certType === 'FA.1') {
        html += `<div class="wiz-field"><label>Installation Date <span class="lbl-opt">(date system first fitted)</span></label><input value="${esc(_w.installDate||_w.testDate||todayStr())}" oninput="fireSet('installDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
        html += `<div class="wiz-field"><label>Design / scheme reference <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.designRef||'')}" oninput="fireSet('designRef',this.value)" placeholder="e.g. drawing ref, specification no." style="max-width:280px"></div>`;
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
      html += `<div class="wiz-field"><label>Panel Serial No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysPanelSerial||'')}" oninput="fireSet('sysPanelSerial',this.value)" placeholder="e.g. SN-2024-00001"></div>`;
      html += `<div class="wiz-field"><label>Firmware Version <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysPanelFirmware||'')}" oninput="fireSet('sysPanelFirmware',this.value)" placeholder="e.g. v4.5.2"></div>`;
      html += `<div class="wiz-field"><label>Number of Zones</label><input type="number" min="1" value="${esc(_w.sysZones)}" oninput="fireSet('sysZones',this.value)" style="max-width:100px" placeholder="e.g. 4"></div>`;
      html += `<div class="wiz-field"><label>Number of Loops (addressable)</label><input type="number" min="0" value="${esc(_w.sysLoops)}" oninput="fireSet('sysLoops',this.value)" style="max-width:100px" placeholder="0"></div>`;
      html += `<div class="wiz-field"><label>BAFE Scheme No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysBafe)}" oninput="fireSet('sysBafe',this.value)" placeholder="e.g. SP203"></div>`;
      html += `<div class="wiz-field"><label>FIA Member No. <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysFia)}" oninput="fireSet('sysFia',this.value)" placeholder="e.g. 12345"></div>`;
      html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Battery Details <span style="font-weight:400;text-transform:none">(optional)</span></div></div>`;
      html += `<div class="wiz-field"><label>Battery Type</label><input value="${esc(_w.batType||'')}" oninput="fireSet('batType',this.value)" placeholder="e.g. 24V Sealed Lead Acid, Lithium"></div>`;
      html += `<div class="wiz-field"><label>Battery Installation Date</label><input value="${esc(_w.batInstallDate||'')}" oninput="fireSet('batInstallDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      html += `<div class="wiz-field"><label>Next Replacement Due</label><input value="${esc(_w.batNextReplacement||'')}" oninput="fireSet('batNextReplacement',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      html += `<div class="wiz-field"><label>Agreed limitations &amp; with whom <span class="lbl-opt">(optional)</span></label><textarea rows="2" oninput="fireSet('agreedLimitations',this.value)" placeholder="e.g. Limited to zones 1–3 only, agreed with client on 01/11/2026" style="width:100%;font-size:13px;resize:vertical">${esc(_w.agreedLimitations||'')}</textarea></div>`;
      html += `<div class="wiz-field"><label>System commissioning date <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysCommissionDate||'')}" oninput="fireSet('sysCommissionDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
      html += `<div class="wiz-field"><label>As-fitted drawing / scheme reference <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.sysDrawingRef||'')}" oninput="fireSet('sysDrawingRef',this.value)" placeholder="e.g. DWG-2024-001, rev B"></div>`;
      html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Monitoring &amp; Site Records</div></div>`;
      html += `<div class="wiz-field"><label>System category confirmed matches risk assessment?</label><div class="chip-row">`;
      ['Yes — confirmed','Deviation noted','N/A'].forEach(function(v){ html += `<button class="chip${_w.sysCategoryRiskAssessment===v?' on':''}" onclick="firePick('sysCategoryRiskAssessment','${esc(v)}')">${esc(v)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Monitoring contract / ARC account reference <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.monitoringContractRef||'')}" oninput="fireSet('monitoringContractRef',this.value)" placeholder="e.g. ADT-00123456"></div>`;
      html += `<div class="wiz-field"><label>Keyholders confirmed with ARC?</label><div class="chip-row">`;
      ['Yes — confirmed','No — requires update','N/A — not monitored'].forEach(function(v){ html += `<button class="chip${_w.keyholdersConfirmed===v?' on':''}" onclick="firePick('keyholdersConfirmed','${esc(v)}')">${esc(v)}</button>`; });
      html += `</div></div>`;
      html += `<div class="wiz-field"><label>Log book location <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.logBookLocation||'')}" oninput="fireSet('logBookLocation',this.value)" placeholder="e.g. Main reception, plant room, manager's office"></div>`;
    }
    var _deptLabel = _isComm() ? 'Variations from BS 5839-1 Clause 43 <span class="lbl-opt">(optional)</span>' : 'Departures / variations <span class="lbl-opt">(optional)</span>';
    var _deptPlaceholder = _isComm() ? 'Any agreed variations or departures from BS 5839-1 Clause 43 requirements, with justification…' : 'Any agreed departures from BS 5839-6 standard requirements, with justification…';
    html += `<div class="wiz-field" style="margin-top:8px"><label>${_deptLabel}</label><textarea rows="2" oninput="fireSet('departuresNotes',this.value)" placeholder="${_deptPlaceholder}" style="width:100%;font-size:13px;resize:vertical">${esc(_w.departuresNotes||'')}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 4: Schedule of Items Inspected ──────────────────────────────────
  } else if (s === 4) {
    var _schedDefs = _isComm() ? COM_SCHEDULE_ITEMS : DOM_SCHEDULE_ITEMS;
    var _sItems = _w.scheduleItems || {};
    html += `<h2 class="wiz-title">Schedule of Items Inspected</h2>`;
    html += `<p style="font-size:12px;color:var(--muted);margin-bottom:12px">Record the inspection result for each item — P&nbsp;=&nbsp;Pass, F&nbsp;=&nbsp;Fail, N/A&nbsp;=&nbsp;Not applicable or not installed. This schedule is a legal requirement of BS ${_isComm()?'5839-1:2025 Clause 43':'5839-6:2019 Clause 15'}.</p>`;
    _schedDefs.forEach(function(section) {
      var sTitle = section[0], sItems = section[1];
      html += `<div style="margin-bottom:14px">`;
      html += `<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c01818;border-bottom:2px solid #e08830;padding-bottom:5px;margin-bottom:8px">${sTitle}</div>`;
      sItems.forEach(function(item) {
        var id = item[0], lbl = item[1], v = _sItems[id] || '';
        html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">`;
        html += `<span style="font-size:12.5px;flex:1;line-height:1.3">${esc(lbl)}</span>`;
        html += `<div style="display:flex;gap:3px;flex-shrink:0">`;
        [['PASS','P','chip-pass'],['FAIL','F','chip-fail'],['N/A','N/A','']].forEach(function(opt) {
          html += `<button class="chip chip-sm ${opt[2]}${v===opt[0]?' on':''}" onclick="fireSetScheduleItem('${id}','${opt[0]}')">${opt[1]}</button>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
    });
    var _schedTotal = 0, _schedFilled = 0;
    _schedDefs.forEach(function(sec) { sec[1].forEach(function(item) { _schedTotal++; if ((_sItems[item[0]]||'').length) _schedFilled++; }); });
    html += `<div style="font-size:11px;color:var(--muted);margin-top:4px;text-align:right">${_schedFilled} of ${_schedTotal} items recorded</div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 5: Detectors ─────────────────────────────────────────────────────
  } else if (s === 5) {
    var _dets4 = _w.detectors || [];
    var _hasDetList = _dets4.length > 0;
    var _autoTotal4 = _hasDetList ? String(_dets4.length) : '';
    var _autoPass4  = _hasDetList ? String(_dets4.filter(function(d){return d.result==='PASS';}).length) : '';
    var _autoFail4  = _hasDetList ? String(_dets4.filter(function(d){return d.result==='FAIL';}).length) : '';
    var _autoTest4  = _hasDetList ? String(_dets4.filter(function(d){return d.result==='PASS'||d.result==='FAIL';}).length) : '';
    var _sTotal  = _hasDetList ? _autoTotal4 : (_w.detTotal||'');
    var _sPass   = _hasDetList ? _autoPass4  : (_w.detPass||'');
    var _sFail   = _hasDetList ? _autoFail4  : (_w.detFail||'');
    var _sTested = _hasDetList ? _autoTest4  : (_w.detTested||'');
    var _rdonly  = _hasDetList ? ' readonly style="background:var(--surface2);color:var(--muted)"' : '';
    html += `<h2 class="wiz-title">Detectors &amp; Devices</h2>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;background:var(--surface2);border-radius:8px;padding:12px">`;
    html += `<div class="wiz-field" style="margin:0"><label style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Total</label><input type="number" min="0" value="${esc(_sTotal)}"${_rdonly} oninput="fireSet('detTotal',this.value);fireDetCalc()" placeholder="0" style="text-align:center;font-size:18px;font-weight:700;padding:6px;max-width:100%"></div>`;
    html += `<div class="wiz-field" style="margin:0"><label style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#15803d">Passed</label><input type="number" min="0" value="${esc(_sPass)}"${_rdonly} oninput="fireSet('detPass',this.value);fireDetCalc()" placeholder="0" style="text-align:center;font-size:18px;font-weight:700;padding:6px;color:#15803d;max-width:100%"></div>`;
    var _rdFailStyle = _hasDetList ? ';background:var(--surface2)' : '';
    html += `<div class="wiz-field" style="margin:0"><label style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#dc2626">Failed</label><input type="number" min="0" value="${esc(_sFail)}"${_hasDetList?' readonly':''} oninput="fireSet('detFail',this.value)" style="text-align:center;font-size:18px;font-weight:700;padding:6px;color:#dc2626${_rdFailStyle};max-width:100%"></div>`;
    html += `<div class="wiz-field" style="margin:0"><label style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Tested</label><input type="number" min="0" value="${esc(_sTested)}"${_rdonly} oninput="fireSet('detTested',this.value)" placeholder="0" style="text-align:center;font-size:18px;font-weight:700;padding:6px;max-width:100%"></div>`;
    html += `</div>`;
    if (_hasDetList) {
      html += `<div style="font-size:11px;color:var(--muted);margin:-4px 0 10px"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:3px"></i>Counts auto-calculated from device list below</div>`;
    } else {
      html += `<div style="font-size:11px;color:var(--muted);margin:-4px 0 10px">Enter summary counts above, or add individual device records below — both optional.</div>`;
    }
    html += `<div id="fire-det-cards">`;
    _dets4.forEach(function(det, i) { html += _detCard(det, i); });
    html += `</div>`;
    html += `<button onclick="fireAddDetector()" class="fire-det-add-btn"><i class="fa-solid fa-plus"></i> Add device</button>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 6: Testing results ───────────────────────────────────────────────
  } else if (s === 6) {
    if (!_w.annexFa2Checks) _w.annexFa2Checks = {};
    if (_w.sysInterlinkMethod === 'Not interlinked') { _w.tInterlinked = 'N/A'; _w.annexFa2Checks.s03 = 'N/A'; }
    if (_w.coAlarmsPresent === 'No' || _w.coAlarmsPresent === 'N/A') _w.tCO = 'N/A';
    if (_w.sysPowerSupply === 'Mains') { _w.tBattery = 'N/A'; _w.annexFa2Checks.s04 = 'N/A'; }
    html += `<h2 class="wiz-title">Testing Results</h2>`;
    if (!_isComm()) {
      // Domestic tests
      var _isDomPnlTest = /^[ABC]/.test(_w.sysGrade||'');
      if (_isDomPnlTest) {
        html += _testRow('Mains supply test', 'tMains', ['PASS','FAIL','N/A']);
        html += _testRow('Battery / PSU standby test', 'tBattery', ['PASS','FAIL','N/A']);
        html += _testRow('Fault simulation test', 'tFaultSim', ['PASS','FAIL','N/A']);
      }
      html += _testRow('Functional test (each device activates alarm)', 'tFunctional', ['PASS','FAIL','N/A']);
      html += _testRow('Interlinked test (all sound when one activates)', 'tInterlinked', ['PASS','FAIL','N/A']);
      if (!_isDomPnlTest) {
        html += _testRow('Battery backup / standby test', 'tBattery', ['PASS','FAIL','N/A']);
      }
      html += `<div class="wiz-field"><label>CO alarms fitted?</label><div class="chip-row">`;
      ['Yes','No','N/A'].forEach(function(v) { html += `<button class="chip${_w.coAlarmsPresent===v?' on':''}" onclick="firePick('coAlarmsPresent','${v}');fireRenderStep()">${v}</button>`; });
      html += `</div></div>`;
      if (_w.coAlarmsPresent === 'N/A') {
        html += `<div style="display:flex;gap:7px;align-items:flex-start;margin:-4px 0 8px 0"><i class="fa-solid fa-circle-info" style="color:#2563eb;font-size:12px;margin-top:3px;flex-shrink:0"></i><div style="flex:1"><div style="font-size:12px;color:var(--muted);margin-bottom:5px">Why N/A? <span style="font-size:11px">(optional)</span></div><div class="chip-row">`;
        ['No combustion appliance present'].forEach(function(v) { html += `<button class="chip${_w.coAlarmNaReason===v?' on':''}" onclick="firePick('coAlarmNaReason','${esc(v)}')">${esc(v)}</button>`; });
        html += `</div><div style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.4">If a combustion appliance is present and no CO alarm is fitted, record as a defect in the Defects step.</div></div></div></div>`;
      } else if (_w.coAlarmsPresent) { _w.coAlarmNaReason = ''; }
      html += _testRow('CO alarm test (if applicable)', 'tCO', ['PASS','FAIL','N/A']);
      // BS 5839-6 inspection / commissioning checklist
      var _faChecks = _w.certType === 'FA.2' ? FA2_CHECKS : (_w.certType === 'FA.1' ? FA1_CHECKS : null);
      if (_faChecks) {
        var _checkTitle = _w.certType === 'FA.2' ? 'Inspection Checks (BS 5839-6 Clause 15)' : 'Commissioning Checks (BS 5839-6 Clause 14)';
        html += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">${_checkTitle}</div>`;
        _faChecks.forEach(function(c) {
          var v = (_w.annexFa2Checks||{})[c.id] || '';
          html += `<div class="wiz-field" style="margin-bottom:8px"><label style="font-size:12.5px">${esc(c.label)}</label><div class="chip-row">`;
          ['PASS','FAIL','N/A'].forEach(function(opt) {
            var cls2 = opt==='PASS'?'chip-pass':opt==='FAIL'?'chip-fail':'chip-na';
            var ico = opt==='PASS'?'<i class="fa-solid fa-check" style="font-size:10px;margin-right:2px"></i>':opt==='FAIL'?'<i class="fa-solid fa-xmark" style="font-size:10px;margin-right:2px"></i>':'';
            html += `<button class="chip ${cls2}${v===opt?' on':''}" onclick="fireSetFaCheck('${c.id}','${opt}')">${ico}${opt}</button>`;
          });
          html += `</div></div>`;
        });
        html += `</div>`;
      }
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
      var _annexG = _w.annexGChecks || {};
      var _AG = [['Control Equipment',[['ctrl_panel','Control panel — all indicators operational'],['fault_log','Fault log reviewed and entries noted'],['weekly_log','Weekly test log reviewed and up to date']]],['Power Supply',[['mains_supply','Mains supply confirmed operational'],['bat_inspect','Battery terminals and connections inspected'],['bat_voltage','Battery voltage measured and recorded'],['standby_dur','Standby battery duration test satisfactory']]],['Detection',[['call_pts','Manual call points tested (all or rotation)'],['det_rotation','Detectors tested on rotation basis per schedule'],['beam_det','Beam detectors aligned and tested (if installed)'],['aspirating','Aspirating detection system tested (if installed)']]],['Warning Devices',[['sounders','All sounders tested — dB levels adequate'],['visual_alarms','Visual alarm devices tested and operational']]],['Ancillary Functions',[['zone_iso','Zone isolation tested and restored'],['fault_sim','Fault simulation tested and cleared'],['remote_mon','Remote monitoring / receiving centre checked']]],['Documentation',[['drawings','As-installed drawings present and up to date'],['cause_effect','Cause and effect documentation available'],['log_book','Log book available with entries up to date'],['repair_arr','24-hour emergency callout arrangements confirmed']]]];
      html += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)"><p style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Annex G Inspection Checklist</p></div>`;
      _AG.forEach(function(g) {
        html += `<p style="font-size:11px;font-weight:600;color:var(--fg);margin:8px 0 2px;letter-spacing:.02em">${g[0]}</p>`;
        g[1].forEach(function(item) {
          var id=item[0],lbl=item[1],v=_annexG[id]||'';
          html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="font-size:12px;flex:1;line-height:1.3">${lbl}</span><div style="display:flex;gap:3px;flex-shrink:0"><button class="chip chip-sm${v==='PASS'?' on chip-sat':''}" onclick="fireSetAnnexG('${id}','PASS')">P</button><button class="chip chip-sm${v==='FAIL'?' on chip-unsat':''}" onclick="fireSetAnnexG('${id}','FAIL')">F</button><button class="chip chip-sm${v==='N/A'?' on':''}" onclick="fireSetAnnexG('${id}','N/A')">N/A</button></div></div>`;
        });
      });
    }
    html += `<div class="wiz-field" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><label>Limitations of inspection <span class="lbl-opt">(optional)</span></label><div style="position:relative"><textarea rows="2" oninput="fireInspLimInput(this.value)" onblur="fireLimBlur(this.value)" placeholder="e.g. Concealed cables not accessible for inspection. Loft hatch locked — detectors in loft space not tested." style="width:100%;font-size:13px;resize:vertical">${esc(_w.inspLimitations||'')}</textarea><div id="fire-lim-sugg" style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;z-index:100;display:none;max-height:160px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.18)"></div></div></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 7: Interfaces (commercial only) ─────────────────────────────────
  } else if (s === 7) {
    html += `<h2 class="wiz-title">Interfaces &amp; Ancillary Functions</h2>`;
    html += `<p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.5">Record the status of each connected system. Mark as <em>Not Installed</em> if the building has no such interface.</p>`;
    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">`;
    html += `<thead><tr style="background:var(--surface2,#f9fafb)">`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);min-width:160px">Interface</th>`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">Status</th>`;
    html += `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);min-width:120px">Notes <span style="font-weight:400;font-size:11px">(optional)</span></th>`;
    html += `</tr></thead><tbody>`;
    var _ifaces = _w.interfaces || {};
    var _ifaceStCls = {'Tested OK':'chip-pass','Fault Found':'chip-fail','Not Installed':'','Not Tested':''};
    COM_INTERFACES.forEach(function(iface) {
      var st = _ifaces[iface.key] || '';
      var nt = _ifaces[iface.key+'_notes'] || '';
      html += `<tr><td style="padding:5px 8px;border-bottom:1px solid var(--border);font-size:12.5px;line-height:1.3">${esc(iface.label)}</td>`;
      html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><div style="display:flex;gap:3px;flex-wrap:wrap">`;
      ['Tested OK','Fault Found','Not Installed','Not Tested'].forEach(function(opt) {
        html += `<button class="chip chip-sm ${_ifaceStCls[opt]||''}${st===opt?' on':''}" onclick="fireIfaceSet('${iface.key}','${opt}')">${opt}</button>`;
      });
      html += `</div></td>`;
      html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(nt)}" oninput="fireIfaceSet('${iface.key}_notes',this.value)" placeholder="e.g. Zone 1 only" style="width:100%;min-width:80px;font-size:12px"></td>`;
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<div class="wiz-field" style="margin-top:12px"><label>Other interfaces / notes <span class="lbl-opt">(optional)</span></label><textarea rows="2" oninput="fireSet('interfacesNotes',this.value)" placeholder="Any other connected systems or further observations…" style="width:100%;font-size:13px">${esc(_w.interfacesNotes||'')}</textarea></div>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 8: Defects ───────────────────────────────────────────────────────
  } else if (s === 8) {
    var _isCommDef = _isComm();
    var _defTitle = _isCommDef ? 'Details of Deviations from the Standards' : 'Defects & Recommendations';
    html += `<h2 class="wiz-title">${_defTitle}</h2>`;
    // Carry-forward defects section (FA.4 only)
    if (_w.certType === 'FA.4' && (_w.carriedDefects||[]).length) {
      var _cdSevStyle = {C1:'color:#9b1c1c;font-weight:700',C2:'color:#dc2626',C3:'color:#d97706',FI:'color:#1d4ed8'};
      html += `<div style="margin-bottom:14px;padding:10px 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:8px">`;
      html += `<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px"><i class="fa-solid fa-clock-rotate-left" style="margin-right:5px"></i>Carried forward from ${esc(_w._prevCertRef||'previous visit')}${_w._prevCertDate?' ('+esc(_w._prevCertDate)+')':''} — set resolution for each</div>`;
      html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">`;
      html += `<thead><tr style="background:var(--surface2,#f9fafb)"><th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border)">Previous defect</th><th style="padding:5px 8px;border-bottom:1px solid var(--border);white-space:nowrap">Prev. severity</th><th style="padding:5px 8px;border-bottom:1px solid var(--border)">Resolution this visit</th></tr></thead><tbody>`;
      (_w.carriedDefects||[]).forEach(function(cd, ci) {
        html += `<tr><td style="padding:4px 8px;border-bottom:1px solid var(--border);font-size:12.5px;line-height:1.3">${esc(cd.description)}</td>`;
        html += `<td style="padding:4px 8px;border-bottom:1px solid var(--border);font-size:12.5px;${_cdSevStyle[cd.severity||'C3']||''}">${esc(cd.severity||'C3')}</td>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><div style="display:flex;gap:3px;flex-wrap:wrap">`;
        [['Resolved','chip-pass'],['Still Present',''],['Escalated','chip-fail']].forEach(function(o) {
          html += `<button class="chip chip-sm ${o[1]}${cd.resolution===o[0]?' on':''}" onclick="fireCarriedDefectSet(${ci},'${o[0]}')">${o[0]}</button>`;
        });
        html += `</div></td></tr>`;
      });
      html += `</tbody></table></div></div>`;
    }
    html += `<div class="wiz-field"><label>Overall system condition</label><div class="chip-row">`;
    var _defOverallOpts = _isCommDef
      ? ['No deviations identified','Deviations — no immediate action','Deviations requiring urgent action']
      : ['No defects found','Minor defects (no immediate action)','Defects requiring attention'];
    var _defCls = _isCommDef
      ? {'No deviations identified':'chip-sat','Deviations — no immediate action':'chip-attn','Deviations requiring urgent action':'chip-unsat'}
      : {'No defects found':'chip-sat','Minor defects (no immediate action)':'chip-attn','Defects requiring attention':'chip-unsat'};
    _defOverallOpts.forEach(v => {
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
      var SEV_COLORS = _isCommDef
        ? {C1:'color:#9b1c1c;font-weight:700',C2:'color:#dc2626',C3:'color:#d97706',FI:'color:#1d4ed8'}
        : {C1:'color:#9b1c1c;font-weight:700',C2:'color:#dc2626',C3:'color:#d97706'};
      var _sevOptions = _isCommDef ? ['C1','C2','C3','FI'] : ['C1','C2','C3'];
      var _sevDefault = 'C3';
      (_w.defects||[]).forEach((d, i) => {
        html += `<tr>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input value="${esc(d.description||'')}" oninput="fireDefectSet(${i},'description',this.value)" placeholder="Describe the defect" style="width:100%;min-width:120px"></td>`;
        html += `<td style="padding:4px 6px;border-bottom:1px solid var(--border)"><select onchange="fireDefectSet(${i},'severity',this.value)" style="min-width:90px">`;
        _sevOptions.forEach(sv => { html += `<option${(d.severity||_sevDefault)===sv?' selected':''} style="${SEV_COLORS[sv]||''}">${sv}</option>`; });
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

  // ── Step 9: Outcome ───────────────────────────────────────────────────────
  } else if (s === 9) {
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
      var label = (!_isComm() && v === 'REQUIRES ATTENTION') ? 'UNSATISFACTORY — Remedial works' : v;
      var warn = (_hasFail && v === 'SATISFACTORY') ? `<i class="fa-solid fa-triangle-exclamation" style="font-size:10px;margin-left:3px;opacity:.7"></i>` : '';
      var attnIco = v==='REQUIRES ATTENTION' ? `<i class="fa-solid fa-triangle-exclamation" style="font-size:10px;margin-left:3px"></i>` : '';
      html += `<button class="chip ${_outCls[v]}${_w.outcome===v?' on':''}" onclick="firePick('outcome','${v}')">${label}${warn}${attnIco}</button>`;
    });
    html += `</div></div>`;
    if (_hasFail && _w.outcome === 'SATISFACTORY') {
      html += `<div style="margin-top:10px;padding:10px 12px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:6px">`;
      html += `<div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:5px"><i class="fa-solid fa-circle-exclamation" style="margin-right:5px"></i>Justification required</div>`;
      html += `<div style="font-size:11.5px;color:#7f1d1d;margin-bottom:8px;line-height:1.5">Failure results recorded — enter a written justification (minimum 20 characters) to override with Satisfactory. This will be printed on the certificate.</div>`;
      html += `<textarea rows="3" oninput="fireSet('satJustification',this.value);fireRenderStep()" placeholder="e.g. Failed device at landing replaced during this visit and re-tested — all devices now operational" style="width:100%;font-size:12.5px;resize:vertical;box-sizing:border-box">${esc(_w.satJustification||'')}</textarea>`;
      var _satJLen = (_w.satJustification||'').trim().length;
      html += _satJLen < 20
        ? `<div style="font-size:11px;color:#dc2626;margin-top:4px"><i class="fa-solid fa-xmark" style="margin-right:3px"></i>${_satJLen}/20 characters minimum</div>`
        : `<div style="font-size:11px;color:#1a6b40;margin-top:4px"><i class="fa-solid fa-check" style="margin-right:3px"></i>Justification accepted</div>`;
      html += `</div>`;
    }
    html += `<div class="wiz-field"><label>System operational at time of leaving</label><div class="chip-row">`;
    ['Yes','No'].forEach(v => { html += `<button class="chip${_w.sysOperational===v?' on':''}" onclick="firePick('sysOperational','${v}')">${v}</button>`; });
    html += `</div></div>`;
    html += `<div class="wiz-field"><label>Works carried out <span class="lbl-opt">(optional)</span></label><textarea rows="3" oninput="fireSet('worksCarried',this.value)" placeholder="Brief description of work carried out during this visit…" style="width:100%">${esc(_w.worksCarried)}</textarea></div>`;
    html += `<div class="wiz-field"><label>Works recommended <span class="lbl-opt">(optional)</span></label><textarea rows="2" oninput="fireSet('worksRecommended',this.value)" placeholder="e.g. Replace call point in Zone 2, upgrade panel firmware, additional detector required in converted loft…" style="width:100%">${esc(_w.worksRecommended||'')}</textarea></div>`;
    if (_isComm()) {
      html += `<div class="wiz-field"><label>Previous defects resolved? <span class="lbl-opt">(optional)</span></label><div class="chip-row">`;
      ['Yes — all resolved','Partially resolved','No — still outstanding','N/A — first visit'].forEach(v => {
        html += `<button class="chip${_w.prevDefectsResolved===v?' on':''}" onclick="firePick('prevDefectsResolved','${esc(v)}')">${esc(v)}</button>`;
      });
      html += `</div></div>`;
    }
    if (_w.certType === 'FA.2') {
      html += `<div class="wiz-field"><label>Previous report reference <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.prevReportRef||'')}" oninput="fireSet('prevReportRef',this.value)" placeholder="e.g. FA2-2024-00123" style="max-width:220px"></div>`;
    }
    if (_isComm()) {
      html += `<div class="wiz-field"><label>Inspection interval <span class="lbl-opt">(optional)</span></label><div class="chip-row"><button class="chip${_w.nextInspInterval==='6 months'?' on':''}" onclick="firePick('nextInspInterval','6 months')">6 months</button><button class="chip${_w.nextInspInterval==='12 months'?' on':''}" onclick="firePick('nextInspInterval','12 months')">12 months</button><input value="${esc(_w.nextInspInterval||'')}" oninput="fireSet('nextInspInterval',this.value)" placeholder="e.g. 6 months" style="max-width:120px"></div></div>`;
      html += `<div class="wiz-field"><label>Previous report reference <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.prevReportRef||'')}" oninput="fireSet('prevReportRef',this.value)" placeholder="e.g. FA4-2024-00123" style="max-width:220px"></div>`;
      html += `<div class="wiz-field"><label>Other reference documents <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.otherRefDocs||'')}" oninput="fireSet('otherRefDocs',this.value)" placeholder="e.g. Fire risk assessment dated 15/06/2026"></div>`;
      html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><p style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">False Alarm Statistics</p></div>`;
      html += `<div class="wiz-field"><label>False alarms in past 12 months <span class="lbl-opt">(optional)</span></label><input type="number" min="0" max="999" value="${esc(_w.falseAlarms12m||'')}" oninput="fireSet('falseAlarms12m',this.value)" placeholder="0" style="max-width:100px"></div>`;
      html += `<div class="wiz-field"><label>Action taken to reduce false alarms <span class="lbl-opt">(optional)</span></label><div class="chip-row"><button class="chip${_w.falseAlarmAction==='None required'?' on':''}" onclick="firePick('falseAlarmAction','None required')">None required</button><button class="chip${_w.falseAlarmAction==='Under investigation'?' on':''}" onclick="firePick('falseAlarmAction','Under investigation')">Under investigation</button><button class="chip${_w.falseAlarmAction==='Devices adjusted'?' on':''}" onclick="firePick('falseAlarmAction','Devices adjusted')">Devices adjusted</button><button class="chip${_w.falseAlarmAction==='Settings changed'?' on':''}" onclick="firePick('falseAlarmAction','Settings changed')">Settings changed</button><button class="chip${_w.falseAlarmAction==='Complete'?' on':''}" onclick="firePick('falseAlarmAction','Complete')">Complete</button></div></div>`;
      html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><p style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Change of Servicing Organisation</p></div>`;
      html += `<div class="wiz-field"><label>Has the servicing organisation changed? <span class="lbl-opt">(optional)</span></label><div class="chip-row"><button class="chip${_w.changeOfOrg==='yes'?' on chip-sat':''}" onclick="firePick('changeOfOrg','yes')">Yes</button><button class="chip${_w.changeOfOrg==='no'?' on':''}" onclick="firePick('changeOfOrg','no')">No</button></div></div>`;
      if (_w.changeOfOrg === 'yes') {
        html += `<div class="wiz-field"><label>Previous organisation name</label><input value="${esc(_w.prevOrgName||'')}" oninput="fireSet('prevOrgName',this.value)" placeholder="e.g. ABC Fire &amp; Security Ltd"></div>`;
        html += `<div class="wiz-field"><label>Previous organisation contact <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.prevOrgContact||'')}" oninput="fireSet('prevOrgContact',this.value)" placeholder="Name or phone number"></div>`;
        html += `<div class="wiz-field"><label>Date of transfer <span class="lbl-opt">(optional)</span></label><input value="${esc(_w.prevOrgDate||'')}" oninput="fireSet('prevOrgDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
        html += `<div class="wiz-field"><label>System condition at handover <span class="lbl-opt">(optional)</span></label><div class="chip-row"><button class="chip${_w.handoverCondition==='Satisfactory'?' on chip-sat':''}" onclick="firePick('handoverCondition','Satisfactory')">Satisfactory</button><button class="chip${_w.handoverCondition==='Unsatisfactory'?' on chip-unsat':''}" onclick="firePick('handoverCondition','Unsatisfactory')">Unsatisfactory</button><button class="chip${_w.handoverCondition==='Unknown'?' on':''}" onclick="firePick('handoverCondition','Unknown')">Unknown</button></div></div>`;
        html += `<div class="wiz-field"><label>Outstanding defects / notes at handover <span class="lbl-opt">(optional)</span></label><textarea rows="2" oninput="fireSet('handoverNotes',this.value)" placeholder="e.g. Zone 3 detector requires replacement">${esc(_w.handoverNotes||'')}</textarea></div>`;
      }
    }
    if (!_w.outcome) html += `<p style="color:#dc2626;font-size:12px;margin-top:8px;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-circle-exclamation"></i> Select an outcome above to continue</p>`;
    html += `<div class="wiz-nav"><button onclick="fireBack()" class="btn-sm"><i class="fa-solid fa-arrow-left"></i> Back</button><button onclick="fireNext()" class="btn-primary" ${!_w.outcome?'disabled':''}>Continue <i class="fa-solid fa-arrow-right"></i></button></div>`;

  // ── Step 10: Review ───────────────────────────────────────────────────────
  } else if (s === 10) {
    var addr = [_w.premAddr1, _w.premAddr2, _w.premAddr3, _w.premPostcode].filter(Boolean).join(', ');
    var typeLabel = (CERT_TYPES.find(t => t.id === _w.certType)||{}).label || _w.certType;
    html += `<h2 class="wiz-title">Review & Issue</h2>`;
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px">`;
    html += `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--muted);margin-bottom:10px">TENANT / OCCUPIER ACKNOWLEDGMENT <span style="font-weight:400;color:var(--muted)">(optional)</span></div>`;
    html += `<div class="wiz-field" style="margin-bottom:8px"><label>Tenant / Occupier Name</label><input value="${esc(_w.tenantName)}" oninput="fireSet('tenantName',this.value)" placeholder="Leave blank if not applicable"></div>`;
    html += `<div class="wiz-field" style="margin-bottom:0"><label>Acknowledgment Date</label><input value="${esc(_w.tenantAckDate)}" oninput="fireSet('tenantAckDate',this.value)" placeholder="DD/MM/YYYY" style="max-width:140px"></div>`;
    html += `</div>`;
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
    if (!_dir.properties) {
      window.dirLoad?.('properties').then(data => { if (data) _dir.properties = data; });
    }
    var _a1 = document.getElementById('fa-addr1');
    if (_a1) attachAddressAutocomplete(_a1, {
      onSelect(a) {
        _w.premAddr1   = a.line1;
        _w.premAddr2   = [a.line2, a.line3].filter(Boolean).join(', ');
        _w.premAddr3   = a.town;
        _w.premPostcode = a.postcode;
        _fireDirty = true; fireRenderStep();
      },
      localSuggest(q) {
        var props = _dir.properties;
        if (!props || !props.length) return [];
        var lq = q.toLowerCase();
        return props
          .filter(function(p) { return (p.addr1||'').toLowerCase().includes(lq) || (p.name||'').toLowerCase().includes(lq); })
          .slice(0, 6)
          .map(function(p) { return {
            label: '<strong>'+esc(p.addr1||'')+'</strong>'+(p.name?' &mdash; <span style="color:var(--muted,#6b7280)">'+esc(p.name)+'</span>':'')+(p.postcode?' <span style="color:var(--muted,#6b7280)">('+esc(p.postcode)+')</span>':''),
            onPick: function() {
              _w.premisesName  = p.name    || _w.premisesName;
              _w.premAddr1     = p.addr1   || p.address || '';
              _w.premAddr2     = p.addr2   || '';
              _w.premAddr3     = p.addr3   || p.town    || '';
              _w.premPostcode  = p.postcode || '';
              if (p.type) _w.premisesType = p.type;
              _fireDirty = true;
              fireRenderStep();
              fireUpdateSubtitle();
            }
          }; });
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
    var _cn2 = document.getElementById('fa-client-name');
    if (_cn2) window.attachDirACLandlordAgent?.(_cn2, function(rec) {
      var name = rec._dirType === 'agents' ? (rec.agency_name || rec.contact_name || '') : (rec.landlord_name || rec.company_name || '');
      _w.clientName     = name;
      _w.clientAddr1    = rec.addr1 || '';
      _w.clientAddr2    = rec.addr2 || '';
      _w.clientAddr3    = [rec.town, rec.county].filter(Boolean).join(', ');
      _w.clientPostcode = rec.postcode || '';
      _fireDirty = true;
      fireRenderStep();
    });
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
    var scrollY = 0;
    try { scrollY = iframe.contentWindow.scrollY || 0; } catch(e) {}
    var html = fireBuildCertHTML(Object.assign({}, _w));
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    if (scrollY > 0) {
      try {
        iframe.contentWindow.requestAnimationFrame(function() {
          iframe.contentWindow.scrollTo(0, scrollY);
        });
      } catch(e) {}
    }
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
  if (key === 'certType' && !_w.nextInspDate && _w.testDate) {
    _w.nextInspDate = _addMonths(_w.testDate, (val === 'FA.3' || val === 'FA.4') ? 6 : 12);
  }
  if (key === 'defectsOverall' && !(_w.defectsNotes||'').trim()) _w.defectsNotes = val;
  if (key === 'sysInterlinkMethod') {
    if (!_w.annexFa2Checks) _w.annexFa2Checks = {};
    if (val === 'Not interlinked') { _w.tInterlinked = 'N/A'; _w.annexFa2Checks.s03 = 'N/A'; }
    else { if (_w.tInterlinked === 'N/A') _w.tInterlinked = 'PASS'; if (_w.annexFa2Checks.s03 === 'N/A') _w.annexFa2Checks.s03 = 'PASS'; }
  }
  if (key === 'coAlarmsPresent') {
    if (val === 'No' || val === 'N/A') { _w.tCO = 'N/A'; }
    else if (val === 'Yes') { if (_w.tCO === 'N/A') _w.tCO = 'PASS'; }
  }
  if (key === 'sysPowerSupply') {
    if (!_w.annexFa2Checks) _w.annexFa2Checks = {};
    if (val === 'Mains') { _w.tBattery = 'N/A'; _w.annexFa2Checks.s04 = 'N/A'; }
    else { if (_w.tBattery === 'N/A') _w.tBattery = 'PASS'; if (_w.annexFa2Checks.s04 === 'N/A') _w.annexFa2Checks.s04 = 'PASS'; }
  }
  fireRenderStep();
}
export function fireSet(key, val)  { _w[key] = val; _schedulePreview(); }

var _limSugg = [];
export function fireInspLimInput(val) {
  _w.inspLimitations = val;
  _fireDirty = true;
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem('fire_lim_history') || '[]'); } catch {}
  _limSugg = val.length >= 2
    ? hist.filter(function(h) { return h.toLowerCase().includes(val.toLowerCase()); }).slice(0, 8)
    : [];
  var ddEl = document.getElementById('fire-lim-sugg');
  if (ddEl) {
    if (_limSugg.length > 0) {
      ddEl.innerHTML = _limSugg.map(function(s, i) {
        return '<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);color:var(--text)" onmousedown="firePickLimitation(' + i + ')">' + esc(s) + '</div>';
      }).join('');
      ddEl.style.display = 'block';
    } else {
      ddEl.style.display = 'none';
    }
  }
}
export function firePickLimitation(idx) {
  if (_limSugg[idx] !== undefined) { _w.inspLimitations = _limSugg[idx]; _fireDirty = true; fireRenderStep(); }
}
export function fireLimBlur(val) {
  if (!val || !val.trim()) return;
  try {
    var hist = JSON.parse(localStorage.getItem('fire_lim_history') || '[]');
    var trimmed = val.trim();
    if (!hist.includes(trimmed)) { hist.unshift(trimmed); hist = hist.slice(0, 20); localStorage.setItem('fire_lim_history', JSON.stringify(hist)); }
  } catch {}
}
export function fireSetAnnexG(id, val) {
  if (!_w.annexGChecks) _w.annexGChecks = {};
  _w.annexGChecks[id] = (_w.annexGChecks[id] === val) ? '' : val;
  fireRenderStep();
}
export function fireLoadSig(evt) {
  var f = evt.target.files[0]; if (!f) return;
  var reader = new FileReader();
  reader.onload = function(e) { _w.enggSigData = e.target.result; fireRenderStep(); _schedulePreview(); };
  reader.readAsDataURL(f);
}
export function fireJumpStep(i) {
  if (i >= 0 && i < STEPS.length) { _w.step = i; fireRenderStep(); }
}

export function fireSetScheduleItem(id, val) {
  if (!_w.scheduleItems) _w.scheduleItems = {};
  _w.scheduleItems[id] = (_w.scheduleItems[id] === val) ? '' : val;
  fireRenderStep();
}

export function fireDetCalc() {
  if ((_w.detectors||[]).length) return; // list takes priority
  var t = parseInt(_w.detTotal)||0;
  var p = parseInt(_w.detPass)||0;
  var f = parseInt(_w.detFail)||0;
  var changed = false;
  if (t && p && !f)      { _w.detFail = String(Math.max(0,t-p)); changed = true; }
  else if (t && !p && f) { _w.detPass = String(Math.max(0,t-f)); changed = true; }
  if (t && !_w.detTested){ _w.detTested = String(t); changed = true; }
  if (changed) { _fireDirty = true; fireRenderStep(); }
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
export function fireSetFaCheck(id, val) {
  if (!_w.annexFa2Checks) _w.annexFa2Checks = {};
  _w.annexFa2Checks[id] = (_w.annexFa2Checks[id] === val) ? '' : val;
  fireRenderStep();
}

export function fireAddDefect() {
  if (!_w.defects) _w.defects = [];
  _w.defects.push({ description:'', recommendation:'', severity:'C3', targetDate:'' });
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
    var _isCommType = _w.certType === 'FA.3' || _w.certType === 'FA.4';
    if (!_isCommType && _w.premisesType === 'HMO') {
      if (!await confirm2('HMOs may require a Grade A system under BS 5839-1 depending on size and local authority licence conditions — confirm the correct standard applies with the client before continuing with this domestic certificate type. Continue?')) return;
    }
  }
  if (s === 2) {
    if (!(_w.clientAddr1||'').trim()) { toast('Client address line 1 is required','error'); return; }
    if (!(_w.clientPostcode||'').trim()) { toast('Client postcode is required','error'); return; }
  }
  if (s === 5 && (_w.detectors||[]).some(function(d){ return !(d.location||'').trim(); })) {
    if (!await confirm2('Some devices have no location recorded — location helps identify where each device is fitted. Continue without locations?')) return;
  }
  if (s === 5 && (_w.detectors||[]).some(function(d){ return !d.result; })) {
    if (!await confirm2('Some devices have no test result selected (showing "— select —"). Continue without recording a result for them?')) return;
  }
  if (s === 6) {
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
  if (s === 6) {
    // Auto-populate defects from any FAIL results (only if list is currently empty)
    if (!(_w.defects||[]).length) {
      var _autoD = [];
      var _failTestLbls = {tFunctional:'Functional test',tInterlinked:'Interlinked test (alarm interconnection)',tBattery:'Battery backup / standby test',tCO:'CO alarm test',tMains:'Mains supply test',tBatResult:'Battery standby test',tSounder:'Sounder / beacon test',tVisual:'Visual indicators test',tZoneIso:'Zone isolation test',tFaultSim:'Fault simulation test',tKeySwitch:'Engineer key switch test'};
      var _isCommNow3 = _w.certType==='FA.3'||_w.certType==='FA.4';
      var _autoSev = _isCommNow3 ? 'C2' : 'Action Required';
      (_w.detectors||[]).forEach(function(d){ if(d.result==='FAIL'){ _autoD.push({description:(d.type||'Device')+' at '+(d.location||'unknown location')+' — failed test',severity:_autoSev,recommendation:'Inspect, repair or replace the device and re-test to confirm rectification.',targetDate:''}); } });
      Object.keys(_failTestLbls).forEach(function(k){ if(_w[k]==='FAIL'){ _autoD.push({description:_failTestLbls[k]+' — failed',severity:_autoSev,recommendation:'Investigate cause of failure, rectify fault and re-test.',targetDate:''}); } });
      if (_autoD.length) { _w.defects = _autoD; if (!_w.defectsOverall||_w.defectsOverall==='No defects found'||_w.defectsOverall==='No deviations identified') { _w.defectsOverall = _isCommNow3 ? 'Deviations requiring urgent action' : 'Defects requiring attention'; } }
    }
  }
  // Carry-forward lookup for FA.4 when leaving Premises
  if (s === 1 && _w.certType === 'FA.4' && (_w.premAddr1||'').trim() && !_w._prevCertLoaded) {
    _w._prevCertLoaded = true;
    try {
      var { data: _pdData } = await sb.from('fire_certs')
        .select('ref_number, test_date, data')
        .ilike('premises_address', '%' + (_w.premAddr1||'').trim() + '%')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (_pdData && _pdData.length) {
        var _fa4s = _pdData.filter(function(r) {
          var d = r.data || {};
          return (d.premPostcode||'').toLowerCase() === (_w.premPostcode||'').toLowerCase() && d.certType === 'FA.4';
        });
        if (_fa4s.length) {
          var _pc = _fa4s[0]; var _pd = _pc.data || {};
          var _pDefs = (_pd.defects||[]).filter(function(d){ return (d.description||'').trim(); });
          if (_pDefs.length) {
            _w._prevCertRef = _pc.ref_number || _pd.baseRef || '';
            _w._prevCertDate = _pc.test_date || _pd.testDate || '';
            _w.carriedDefects = _pDefs.map(function(d){ return { description:d.description, severity:d.severity||'C3', recommendation:d.recommendation||'', targetDate:d.targetDate||'', resolution:'' }; });
          }
        }
      }
    } catch(e) {}
  }
  if (s === 8 && (_w.defects||[]).some(function(d){ return !(d.description||'').trim(); })) {
    toast('Some defect rows have no description — please fill them in or remove the blank rows', 'error'); return;
  }
  if (s === 9 && !_w.outcome) { toast('Please select an outcome','error'); return; }
  if (s === 9) {
    var _hasFails7 = (_w.detectors||[]).some(function(d){return d.result==='FAIL';}) || ['tFunctional','tInterlinked','tBattery','tMains','tBatResult','tSounder','tVisual'].some(function(k){return _w[k]==='FAIL';});
    if (_hasFails7 && (_w.outcome||'').toUpperCase() === 'SATISFACTORY' && (!_w.satJustification || _w.satJustification.trim().length < 20)) {
      toast('Enter a justification (minimum 20 characters) to override with a Satisfactory outcome', 'error'); return;
    }
  }
  _w.step = s + 1;
  // Skip Interfaces step for domestic certs
  if (_w.step === 7 && !_isComm()) _w.step = 8;
  if (_w.step >= STEPS.length) { fireSave(); return; }
  fireRenderStep();
}

export function fireIfaceSet(key, val) {
  if (!_w.interfaces) _w.interfaces = {};
  if (!key.endsWith('_notes') && _w.interfaces[key] === val) {
    _w.interfaces[key] = '';
  } else {
    _w.interfaces[key] = val;
  }
  _fireDirty = true;
  if (!key.endsWith('_notes')) fireRenderStep();
}

export function fireCarriedDefectSet(idx, val) {
  if (!_w.carriedDefects || !_w.carriedDefects[idx]) return;
  _w.carriedDefects[idx].resolution = (_w.carriedDefects[idx].resolution === val) ? '' : val;
  _fireDirty = true;
  fireRenderStep();
}

export function fireBack() {
  if (_w.step <= 0) { navigate('fire-history'); return; }
  _w.step -= 1;
  // Skip Interfaces step for domestic certs
  if (_w.step === 7 && !_isComm()) _w.step = 6;
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
    _w.step = 10; fireRenderStep(); return;
  }
  var _hasFails = (_w.detectors||[]).some(function(d){ return d.result==='FAIL'; }) ||
    ['tFunctional','tInterlinked','tBattery','tMains','tBatResult','tSounder','tVisual'].some(function(k){ return _w[k]==='FAIL'; });
  if (_hasFails && (_w.outcome||'').toUpperCase() === 'SATISFACTORY') {
    if (!_w.satJustification || _w.satJustification.trim().length < 20) {
      toast('A justification (minimum 20 characters) is required to issue a Satisfactory certificate when failure results are recorded — go back to the Outcome step', 'error');
      _w.step = 9; fireRenderStep(); return;
    }
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

async function _fetchSiteHistory(rec) {
  try {
    var matchTerm = (rec.premPostcode || '').trim() || (rec.premAddr1 || rec.premisesName || '').trim();
    if (!matchTerm) return [];
    var { data } = await sb.from('fire_certs')
      .select('ref_number,test_date,outcome,cert_type')
      .ilike('premises_address', '%' + matchTerm + '%')
      .neq('ref_number', rec.ref || '')
      .is('deleted_at', null)
      .order('test_date', { ascending: false })
      .limit(10);
    return data || [];
  } catch(e) { return []; }
}

export async function fireOpenCert(rec) {
  var siteHistory = await _fetchSiteHistory(rec);
  var certHtml = fireBuildCertHTML(rec, siteHistory);
  var blob = new Blob([certHtml], { type:'text/html' });
  var url = URL.createObjectURL(blob);
  window._fireCertRec = rec;
  var prevBtn = (rec.certType === 'FA.2' && rec.prevReportRef)
    ? '<button onclick="fireOpenByRef(\'' + esc(rec.prevReportRef) + '\')" title="Open previous report" style="background:#78350f;color:#fff;border:none;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;min-height:36px"><i class="fa-solid fa-clock-rotate-left"></i> ' + esc(rec.prevReportRef) + '</button>'
    : '';
  var modal = `<div id="fire-cert-modal" style="position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 14px;background:#1c1917;flex-shrink:0;gap:8px">
    <span style="color:#fff;font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" id="fire-cert-modal-title">Fire Alarm Certificate — ${esc(rec.ref||'PREVIEW')}</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0">
      ${prevBtn}
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

export async function fireOpenByRef(refNum) {
  if (!refNum) return;
  var found = _fireAllCerts.find(function(r) { return (r.ref_number||'').toLowerCase() === refNum.toLowerCase(); });
  if (found) { fireOpenCert(found.data || found); return; }
  toast('Looking up ' + refNum + '…', 'info', 2000);
  var { data } = await sb.from('fire_certs').select('*').eq('ref_number', refNum).is('deleted_at', null).limit(1);
  if (data && data[0]) { fireOpenCert(data[0].data || data[0]); return; }
  toast('Certificate ' + refNum + ' not found', 'error');
}

export async function fireDownloadPDF(rec) {
  if (!rec) return;
  toast('Preparing PDF…', 'info', 2000);
  var siteHistory = await _fetchSiteHistory(rec);
  var certHtml = fireBuildCertHTML(rec, siteHistory);
  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(certHtml);
  iframe.contentDocument.close();
  (iframe.contentDocument.fonts ? iframe.contentDocument.fonts.ready : Promise.resolve()).then(() => {
    iframe.contentWindow.print();
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
  });
}

// ── History preview panel ─────────────────────────────────────────────────────
function _fireApplyIfrScale(scale) {
  var ifr = document.getElementById('fire-hist-iframe');
  if (!ifr) return;
  var certW = 794;
  var s = Math.max(0.2, Math.min(2.0, scale));
  if (s >= 0.99) {
    ifr.style.cssText = 'border:0;width:100%;height:calc(100vh - 140px);min-height:500px;display:block';
  } else {
    var desiredH = Math.max(400, window.innerHeight - 140);
    var cssH = Math.round(desiredH / s);
    ifr.style.width = certW + 'px';
    ifr.style.height = cssH + 'px';
    ifr.style.transformOrigin = '0 0';
    ifr.style.transform = 'scale(' + s + ')';
    ifr.style.marginRight = '-' + Math.round(certW * (1 - s)) + 'px';
    ifr.style.marginBottom = '-' + (cssH - desiredH) + 'px';
  }
  window._fireScale = s;
  var pct = document.getElementById('fire-hist-zoom-pct');
  if (pct) pct.textContent = Math.round(s * 100) + '%';
}

export function fireZoomIn() {
  _fireApplyIfrScale((window._fireScale || 0.7) + 0.05);
}

export function fireZoomOut() {
  _fireApplyIfrScale((window._fireScale || 0.7) - 0.05);
}

export async function fireShowPreview(idx) {
  var r = _fireFiltered[idx]; if (!r) return;
  var certData = r.data || r;
  window._fireCertRec = certData;
  window._fireHistRec = r;
  var empty = document.getElementById('fire-hist-empty');
  var active = document.getElementById('fire-hist-active');
  var toolbar = document.getElementById('fire-hist-toolbar');
  var ifr = document.getElementById('fire-hist-iframe');
  if (!ifr) { fireOpenCert(certData); return; }
  if (empty) empty.style.display = 'none';
  if (active) active.style.display = 'block';
  var addr = certData.premAddr1 || certData.premisesName || r.premises_address || '';
  toolbar.innerHTML = '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
    +esc(r.ref_number||certData.ref||'—')+(addr?' &mdash; '+esc(addr):'')+'</span>'
    +_ibtn('Download PDF','fa-download','fireDownloadPDF(window._fireCertRec)')
    +_ibtn('Email','fa-envelope','fireCertEmailBtn()')
    +(certData.certType==='FA.2'&&certData.prevReportRef ? _ibtn('Previous: '+certData.prevReportRef,'fa-clock-rotate-left',"fireOpenByRef('"+certData.prevReportRef+"')") : '')
    +(isAdmin()?_ibtn('Edit','fa-pen','fireEditCert(window._fireHistRec)'):'')
    +_ibtn('Delete','fa-trash',"fireDeleteCert('"+r.id+"')",true);
  var siteHistory = await _fetchSiteHistory(certData);
  var html = fireBuildCertHTML(certData, siteHistory);
  var blob = new Blob([html], {type:'text/html'});
  if (ifr._blobUrl) URL.revokeObjectURL(ifr._blobUrl);
  var blobUrl = URL.createObjectURL(blob);
  ifr._blobUrl = blobUrl;
  ifr.onload = function() {
    try {
      var certW = 794;
      var panel = document.getElementById('fire-hist-panel');
      var panelW = panel ? Math.max(300, panel.clientWidth - 2) : certW;
      var base = Math.min(1, panelW / certW) * 0.9;
      _fireApplyIfrScale(base);
    } catch(e) {}
  };
  ifr.src = blobUrl;
  document.querySelectorAll('[data-fire-idx]').forEach(function(c){ c.style.outline='none'; c.style.background=''; });
  var card = document.querySelector('[data-fire-idx="'+idx+'"]');
  if (card) { card.style.outline='2px solid var(--primary,#0e4d33)'; card.style.background='rgba(14,77,51,.06)'; }
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
  var { data, error } = await sb.from('fire_certs').select('*').is('deleted_at', null).order('created_at', { ascending:false });
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
    return '<div class="pat-card" data-fire-idx="'+idx+'" onclick="fireShowPreview('+idx+')" style="cursor:pointer">'
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
          +'<span class="pat-card-sub">&middot; '+esc(r.cert_type||'—')+'</span>'
        +'</div>'
        +'<div class="pat-card-btns" style="margin-top:5px;margin-left:0;justify-content:flex-end">'
          +_ibtn('View','fa-eye','event.stopPropagation();fireShowPreview('+idx+')')
          +(isAdmin()?_ibtn('Edit','fa-pen','event.stopPropagation();fireEditCertIdx('+idx+')'):'')
          +_ibtn('Download PDF','fa-download','event.stopPropagation();fireDownloadPDFIdx('+idx+')')
          +_ibtn('Email','fa-envelope','event.stopPropagation();fireEmailCertIdx('+idx+')')
          +_ibtn('Delete','fa-trash','event.stopPropagation();fireDeleteCert(\''+r.id+'\')',true)
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

export function fireDeleteCert(id) {
  _deleteCert('fire_certs', id, loadFireHistory);
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

function _gradeDefaultPower(grade) {
  if (!grade) return '';
  if (grade.startsWith('D1')) return '230V AC mains + battery backup';
  if (grade.startsWith('D2') || grade.startsWith('F')) return 'Battery only';
  if (grade.startsWith('E')) return '230V AC mains only';
  return '';
}

export function firePickGrade(grade) {
  _w.sysGrade = grade;
  var suggested = _gradeDefaultPower(grade);
  if (suggested) _w.sysPowerSupply = suggested;
  _fireDirty = true;
  fireRenderStep();
}

export function firePickPowerSupply(val) {
  var implied = _gradeDefaultPower(_w.sysGrade || '');
  if (implied && val !== implied) {
    var gradeCode = (_w.sysGrade || '').split(' ')[0];
    confirm2('Power supply mismatch',
      'Grade ' + gradeCode + ' implies “' + implied + '”. Are you sure you want to set “' + val + '” instead?',
      function() { _w.sysPowerSupply = val; _fireDirty = true; fireRenderStep(); }
    );
    return;
  }
  _w.sysPowerSupply = val; _fireDirty = true; fireRenderStep();
}

export function firePickFromDirectory() {
  if (!_dir.properties) {
    window.dirLoad?.('properties').then(function(data) {
      if (data) { _dir.properties = data; firePickFromDirectory(); }
      else toast('Property directory is empty. Add properties in Settings → Directory.', 'info');
    });
    return;
  }
  var props = _dir.properties;
  if (!props.length) { toast('Property directory is empty. Add properties in Settings → Directory.', 'info'); return; }
  var items = props.map(function(p,i) {
    return '<div class="dir-item" onclick="window._fireDirPick('+i+')" style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border)">'+esc(p.addr1||p.address||p.name||'')+(p.postcode?' <span style="color:var(--muted,#6b7280)">('+esc(p.postcode)+')</span>':'')+'</div>';
  }).join('');
  var modal = '<div id="fire-dir-modal" style="position:fixed;inset:0;background:#0009;z-index:9999;display:flex;align-items:center;justify-content:center"><div style="background:var(--surface);border-radius:12px;max-width:440px;width:90%;max-height:70vh;display:flex;flex-direction:column"><div style="padding:16px;border-bottom:1px solid var(--border);font-weight:600">Pick Property</div><div style="overflow-y:auto;flex:1">'+items+'</div><div style="padding:12px;border-top:1px solid var(--border)"><button onclick="document.getElementById(\'fire-dir-modal\').remove()" class="btn-sm">Cancel</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', modal);
  window._fireDirPick = function(i) {
    var p = props[i];
    if (p) {
      _w.premisesName = p.name || '';
      _w.premAddr1 = p.addr1 || p.address || '';
      _w.premAddr2 = p.addr2 || '';
      _w.premAddr3 = p.addr3 || p.town || '';
      _w.premPostcode = p.postcode || '';
      if (p.type) _w.premisesType = p.type;
      _fireDirty = true;
    }
    document.getElementById('fire-dir-modal').remove();
    fireRenderStep();
    fireUpdateSubtitle();
  };
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

export function fireFromDateInput(key, isoVal) {
  if (!isoVal) return;
  var p = isoVal.split('-');
  if (p.length !== 3) return;
  _w[key] = p[2]+'/'+p[1]+'/'+p[0];
  _fireDirty = true;
  fireRenderStep();
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
