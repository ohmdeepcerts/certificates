// ========== GAS CERT DATE HELPERS ==========
// Extracted from index.html lines 7361-7367

export function parseGasDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return new Date(`${y}-${m}-${d}`); }
  return new Date(s);
}

export function _fmtGasDate(s) {
  if (!s) return '';
  const p = parseGasDate(s);
  if (!p || isNaN(p)) return s;
  return p.toLocaleDateString('en-GB');
}
