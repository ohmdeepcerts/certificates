import { sb } from '../lib/supabase.js';
import { getSetting } from '../lib/settings.js';

let _engineerCache = null;

export async function loadEngineers() {
  if (_engineerCache) return _engineerCache;
  try {
    const { data } = await sb
      .from('engineers')
      .select('id,name,cert_types,gas_safe_number,gas_licence,niceic_number')
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('name');
    _engineerCache = data ?? [];
  } catch {
    _engineerCache = [];
  }
  return _engineerCache;
}

export function clearEngineerCache() {
  _engineerCache = null;
}

// ── Floating picker ────────────────────────────────────────────────────────
export function showEngineerPicker(anchorEl, certType, onSelect) {
  const old = document.getElementById('_eng-picker');
  if (old) {
    const wasSame = old._anchor === anchorEl;
    old.remove();
    if (wasSame) return;
  }

  const picker = document.createElement('div');
  picker.id = '_eng-picker';
  picker._anchor = anchorEl;
  picker.style.cssText =
    'position:fixed;z-index:9999;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18);min-width:240px;max-width:320px;overflow:hidden';
  picker.innerHTML =
    '<div style="padding:9px 12px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)">Select engineer</div>' +
    '<div id="_eng-picker-list" style="max-height:260px;overflow-y:auto"><div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Loading…</div></div>';
  document.body.appendChild(picker);

  // Position below anchor
  const r = anchorEl.getBoundingClientRect();
  let top = r.bottom + 4;
  if (top + 280 > window.innerHeight) top = Math.max(8, r.top - 280);
  picker.style.top  = top + 'px';
  picker.style.left = Math.min(r.left, window.innerWidth - 330) + 'px';

  const defaultName =
    certType === 'gas' ? getSetting('gas_default_engineer', '') :
    certType === 'pat' ? getSetting('pat_default_engineer', '') :
    getSetting('el_engineer', getSetting('default_engineer', ''));

  loadEngineers().then(engineers => {
    const list = document.getElementById('_eng-picker-list');
    if (!list) return;
    const filtered = engineers.filter(e =>
      !certType || !(e.cert_types?.length) || e.cert_types.includes(certType)
    );
    let html = '';
    if (defaultName) {
      html +=
        `<div data-eng-default style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);font-size:13px">` +
        `<span style="font-size:15px">⚙️</span><div><div style="font-weight:600">${defaultName}</div>` +
        `<div style="font-size:11px;color:var(--muted)">Saved default (from Settings)</div></div></div>`;
    }
    filtered.forEach(eng => {
      const sub =
        certType === 'gas' ? (eng.gas_safe_number ? 'Gas Safe: ' + eng.gas_safe_number : '') :
        (eng.niceic_number ? 'NICEIC: ' + eng.niceic_number : '');
      html +=
        `<div data-eng-id="${eng.id}" style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;border-bottom:1px solid var(--border)">` +
        `<span style="font-size:16px">👤</span><div><div style="font-weight:600">${eng.name}</div>` +
        `${sub ? `<div style="font-size:11px;color:var(--muted)">${sub}</div>` : ''}</div></div>`;
    });
    if (!html) html = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">No engineers found.<br>Add them in Settings → Engineers.</div>';
    list.innerHTML = html;

    list.querySelectorAll('[data-eng-default],[data-eng-id]').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--surface2)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('click', () => {
        picker.remove();
        if (row.dataset.engDefault !== undefined) {
          onSelect({ name: defaultName, isDefault: true });
        } else {
          const eng = engineers.find(e => e.id === row.dataset.engId);
          if (eng) onSelect({ ...eng, isDefault: false });
        }
      });
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function _cp(e) {
      if (!picker.contains(e.target) && e.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', _cp);
      }
    });
  }, 10);
}
