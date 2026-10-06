// ============================================================
//  preview.js — CP12 live preview + preview zoom
// ============================================================
import { state } from '../../lib/state.js';

// ── Live preview ──────────────────────────────────────────

/**
 * Clone a CP12 page element, bake in current field values and
 * freeze all interactive controls so the clone can be displayed
 * as a static print preview.
 */
export function freezeGasPage(srcId) {
  const src = document.getElementById(srcId);
  if (!src) return null;
  const clone = src.cloneNode(true);

  // Copy .value into cloned inputs/textareas (cloneNode doesn't transfer .value).
  clone.querySelectorAll('[data-field]').forEach(el => {
    const field = el.dataset.field;
    const orig = src.querySelector(`[data-field="${field}"]`);
    if (orig && el.tagName === 'INPUT') {
      el.value = orig.value;
      el.setAttribute('value', orig.value);
    } else if (orig && el.tagName === 'TEXTAREA') {
      el.value = orig.value;
      el.textContent = orig.value;
    }
  });

  // Fix logo
  const origLogo = document.getElementById('logoImg');
  const cloneLogo = clone.querySelector('#logoImg');
  if (origLogo && cloneLogo && origLogo.src && origLogo.src.length > 10 && !origLogo.src.endsWith('#')) {
    cloneLogo.src = origLogo.src;
    const lz = clone.querySelector('.logo-zone');
    if (lz) lz.classList.add('has-logo');
    const ph = clone.querySelector('.logo-placeholder');
    if (ph) ph.style.display = 'none';
  }

  // Signature canvases → static images (or empty box)
  clone.querySelectorAll('canvas.sig-canvas').forEach(c => {
    const field = c.dataset.sigField;
    const origC = document.querySelector(`canvas.sig-canvas[data-sig-field="${field}"]`);
    let rep;
    if (origC) {
      const id = origC.getContext('2d').getImageData(0, 0, origC.width, origC.height);
      if (Array.from(id.data).some((v, i) => i % 4 !== 3 && v !== 0)) {
        rep = document.createElement('img');
        rep.src = origC.toDataURL('image/png');
        rep.className = c.className;
        rep.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;display:block;';
      }
    }
    if (!rep) { rep = document.createElement('span'); rep.className = c.className; rep.style.cssText = c.style.cssText; }
    c.parentNode.replaceChild(rep, c);
  });

  // Remove screen-only / interactive elements
  clone.querySelectorAll('.no-print,.co-hanger,.copy-address-btn,.sig-clear-btn,.inline-history-section,.fast-date-drum').forEach(el => el.remove());
  clone.querySelectorAll('input[type="file"]').forEach(el => el.remove());
  clone.querySelectorAll('button:not(.choice-cycle)').forEach(el => el.remove());
  clone.querySelectorAll('[onclick]').forEach(el => el.removeAttribute('onclick'));

  // Freeze remaining interactives + clear placeholders
  clone.querySelectorAll('input,textarea').forEach(el => {
    el.readOnly = true; el.style.pointerEvents = 'none'; el.style.cursor = 'default';
    el.removeAttribute('placeholder');
  });
  clone.querySelectorAll('.choice-cycle').forEach(btn => { btn.style.pointerEvents = 'none'; btn.style.cursor = 'default'; });
  clone.id = 'preview_' + srcId;
  return clone;
}

export function doGasPreview() {
  state.gasDirty = true;
  const wrap = document.getElementById('gas-cert-pages');
  if (!wrap) return;
  wrap.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'cp12-form-wrap';
  container.style.pointerEvents = 'none';
  ['page1', 'page2'].forEach(id => { const p = freezeGasPage(id); if (p) container.appendChild(p); });
  wrap.appendChild(container);
}

// ── Preview zoom ──────────────────────────────────────────

let _z = parseInt(localStorage.getItem('cp12_preview_zoom') || '100', 10);

function _applyZoomInternal() {
  const wrap = document.getElementById('cp12Wrap');
  if (wrap) wrap.style.zoom = (_z / 100);
}

export function adjustCP12Zoom(delta) {
  _z = Math.min(200, Math.max(60, _z + delta));
  try { localStorage.setItem('cp12_preview_zoom', _z); } catch (e) {}
  _applyZoomInternal();
}

export function _applyCP12Zoom() {
  _applyZoomInternal();
}

// Register globals (called from HTML onclick attributes)
window.adjustCP12Zoom = adjustCP12Zoom;
window._applyCP12Zoom = _applyCP12Zoom;

document.addEventListener('DOMContentLoaded', _applyZoomInternal);

// Ctrl + scroll wheel zoom on CP12 preview
document.addEventListener('wheel', function (e) {
  if (!e.ctrlKey) return;
  const wrap = document.getElementById('cp12Wrap');
  if (!wrap || wrap.style.display === 'none') return;
  e.preventDefault();
  adjustCP12Zoom(e.deltaY < 0 ? 10 : -10);
}, { passive: false });

// Pinch-to-zoom
let _pd = null;
document.addEventListener('touchstart', function (e) {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _pd = Math.hypot(dx, dy);
  }
}, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (e.touches.length === 2 && _pd != null) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy), delta = dist - _pd;
    if (Math.abs(delta) > 5) { adjustCP12Zoom(delta > 0 ? 5 : -5); _pd = dist; }
  }
}, { passive: true });
document.addEventListener('touchend', function () { _pd = null; });
