// PAT Test wizard — 4-step form
// _pw is module-scoped and never on window.
// Only EXPORTED functions reach window via Object.assign(window, patWiz) in main.js.
// NEVER use onclick="_pw.step=N;pwRender()" — _pw is not global.
// Always use onclick="pwJump(N)" which closes over _pw.

const _pw = { step: 0 };

const _PW_STEPS = ['Job Details', 'Property', 'Appliances', 'Review'];
const _PW_IDS   = ['pw-step-details', 'pw-step-property', 'pw-step-appliances', 'pw-step-review'];

export function pwRender() {
  var tabsEl = document.getElementById('pat-wiz-tabs');
  if (!tabsEl) return;

  // Build tab row using existing .wiz-step-tab CSS classes from gas.css
  var html = '<div class="wiz-step-tabs">';
  _PW_STEPS.forEach(function(name, i) {
    var done   = i < _pw.step;
    var active = i === _pw.step;
    var cls    = 'wiz-step-tab' + (done ? ' done' : (active ? ' active' : ''));
    var num    = done ? '&#10003;' : (i + 1);
    // Only completed (done) steps are clickable — onclick must call pwJump(i), not _pw.step=i
    var click  = done ? ' onclick="pwJump(' + i + ')"' : '';
    var cursor = done ? 'pointer' : 'default';
    html += '<div class="' + cls + '" style="cursor:' + cursor + '"' + click + '>';
    html += '<span class="tab-num">' + num + '</span>';
    html += '<span class="tab-lbl">&nbsp;' + name + '</span>';
    html += '</div>';
  });
  html += '</div>';
  tabsEl.innerHTML = html;

  // Show/hide step divs
  _PW_IDS.forEach(function(id, i) {
    var el = document.getElementById(id);
    if (el) el.hidden = (i !== _pw.step);
  });

  // Show/hide Back / Next buttons
  var backBtn = document.getElementById('pat-wiz-back');
  var nextBtn = document.getElementById('pat-wiz-next');
  if (backBtn) backBtn.hidden = (_pw.step === 0);
  if (nextBtn) nextBtn.hidden = (_pw.step === _PW_STEPS.length - 1);

  // Step counter text
  var info = document.getElementById('pat-wiz-step-info');
  if (info) info.textContent = 'Step ' + (_pw.step + 1) + ' of ' + _PW_STEPS.length;

  // Auto-trigger preview when entering Review step
  if (_pw.step === 3 && window.doPatPreview) window.doPatPreview();
}

export function pwNext() {
  if (_pw.step < _PW_STEPS.length - 1) {
    _pw.step++;
    pwRender();
    var wiz = document.getElementById('pat-wizard');
    if (wiz) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function pwBack() {
  if (_pw.step > 0) {
    _pw.step--;
    pwRender();
    var wiz = document.getElementById('pat-wizard');
    if (wiz) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// MUST be an export — this closes over module-scoped _pw.
// Without this, onclick="pwJump(1)" would fail because _pw is never on window.
export function pwJump(i) {
  if (i >= 0 && i < _PW_STEPS.length) {
    _pw.step = i;
    pwRender();
  }
}

// Called at the end of newPAT() and loadPATForm() so the wizard resets to step 1
export function pwInit() {
  _pw.step = 0;
  pwRender();
}
