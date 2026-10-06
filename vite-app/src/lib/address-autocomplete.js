// ========== ADDRESS AUTOCOMPLETE ==========
// Uses Ideal Postcodes API (idealpostcodes.co.uk)
// API key stored in settings as 'ideal_postcodes_key'

import { getSetting } from './settings.js';

const BASE = 'https://api.ideal-postcodes.co.uk/v1';
let _cssInjected = false;

function _injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.id = 'aac-styles';
  s.textContent = `
.aac-wrap{position:relative;display:block}
.aac-drop{position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:9999;
  background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);
  border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.14);
  max-height:220px;overflow-y:auto;font-size:13px;line-height:1.4}
.aac-item{padding:8px 12px;cursor:pointer;color:var(--fg,#111);
  border-bottom:1px solid var(--border,#f3f4f6)}
.aac-item:last-child{border-bottom:none}
.aac-item:hover,.aac-item.aac-hi{background:var(--surface2,#f3f4f6)}
.aac-msg{padding:8px 12px;color:var(--muted,#6b7280);font-style:italic}
`;
  document.head.appendChild(s);
}

async function _suggest(q, key) {
  try {
    const r = await fetch(`${BASE}/autocomplete/addresses?q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`);
    if (!r.ok) return [];
    return (await r.json())?.result?.hits || [];
  } catch { return []; }
}

async function _resolve(id, key) {
  try {
    let url;
    if (id.startsWith('paf_'))      url = `${BASE}/udprn/${id.slice(4)}?api_key=${encodeURIComponent(key)}`;
    else if (id.startsWith('mpr_')) url = `${BASE}/umprn/${id.slice(4)}?api_key=${encodeURIComponent(key)}`;
    else return null;
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json())?.result || null;
  } catch { return null; }
}

// Attach address autocomplete to an input or textarea.
//
// opts.onSelect(addr)  — called with { line1, line2, line3, town, county, postcode }
//                        when user picks an address; if omitted, fills inputEl as multi-line text
// opts.minChars        — minimum characters before searching (default 3)
// opts.debounce        — milliseconds to debounce keystrokes (default 350)
//
// Safe to call multiple times on the same element — guards against double-attach.
export function attachAddressAutocomplete(inputEl, opts = {}) {
  if (!inputEl || inputEl._aacAttached) return;
  inputEl._aacAttached = true;
  _injectCSS();

  const { onSelect, minChars = 3, debounce = 350 } = opts;

  // Wrap the input in a relative container for dropdown positioning
  const parent = inputEl.parentNode;
  const wrap = document.createElement('div');
  wrap.className = 'aac-wrap';
  parent.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  const drop = document.createElement('div');
  drop.className = 'aac-drop';
  drop.style.display = 'none';
  wrap.appendChild(drop);

  let _timer, _hits = [], _hi = -1;

  const _close = () => { drop.style.display = 'none'; _hits = []; _hi = -1; };

  const _highlight = i => {
    _hi = i;
    drop.querySelectorAll('.aac-item').forEach((el, j) => el.classList.toggle('aac-hi', j === i));
    if (i >= 0) drop.querySelectorAll('.aac-item')[i]?.scrollIntoView({ block: 'nearest' });
  };

  const _pick = async hit => {
    _close();
    const key = getSetting('ideal_postcodes_key', '');
    const addr = await _resolve(hit.id, key);
    if (!addr) { inputEl.value = hit.suggestion; return; }
    const out = {
      line1:    addr.line_1     || '',
      line2:    addr.line_2     || '',
      line3:    addr.line_3     || '',
      town:     addr.post_town  || '',
      county:   addr.county     || '',
      postcode: addr.postcode   || '',
    };
    if (onSelect) {
      onSelect(out);
    } else {
      // Default: fill textarea with address lines joined by newline
      inputEl.value = [out.line1, out.line2, out.line3, out.town].filter(Boolean).join('\n');
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  inputEl.addEventListener('input', () => {
    clearTimeout(_timer);
    const q = inputEl.value.trim();
    if (q.length < minChars) { _close(); return; }

    const key = getSetting('ideal_postcodes_key', '');
    if (!key) {
      drop.innerHTML = '<div class="aac-msg">Add Ideal Postcodes key in Settings → Integrations</div>';
      drop.style.display = 'block';
      return;
    }

    drop.innerHTML = '<div class="aac-msg">Searching…</div>';
    drop.style.display = 'block';

    _timer = setTimeout(async () => {
      const hits = await _suggest(q, key);
      if (!hits.length) { drop.innerHTML = '<div class="aac-msg">No addresses found</div>'; return; }
      _hits = hits; _hi = -1;
      drop.innerHTML = hits.map((h, i) => `<div class="aac-item" data-i="${i}">${h.suggestion}</div>`).join('');
      drop.style.display = 'block';
      drop.querySelectorAll('.aac-item').forEach(el =>
        el.addEventListener('mousedown', e => { e.preventDefault(); _pick(hits[+el.dataset.i]); })
      );
    }, debounce);
  });

  inputEl.addEventListener('keydown', e => {
    if (drop.style.display === 'none') return;
    if      (e.key === 'ArrowDown')              { e.preventDefault(); _highlight(Math.min(_hi + 1, _hits.length - 1)); }
    else if (e.key === 'ArrowUp')                { e.preventDefault(); _highlight(Math.max(_hi - 1, 0)); }
    else if (e.key === 'Enter' && _hi >= 0)      { e.preventDefault(); _pick(_hits[_hi]); }
    else if (e.key === 'Escape')                 { _close(); }
  });

  inputEl.addEventListener('blur', () => setTimeout(_close, 200));
}
