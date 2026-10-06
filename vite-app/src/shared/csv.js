import { state } from '../lib/state.js';
import { toast } from '../lib/utils.js';

// ── CSV helpers ────────────────────────────────────────────────────────────
export function _csvEsc(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

export function _csvDownload(filename, rows) {
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ── Export functions ───────────────────────────────────────────────────────
export function exportPATCSV() {
  if (!state.patReports || !state.patReports.length) {
    toast('No PAT records to export', 'warn'); return;
  }
  const rows = [['Ref', 'Status', 'Test Date', 'Engineer', 'Property Address', 'Appliances', 'Next Due'].map(_csvEsc).join(',')];
  state.patReports.forEach(r => {
    const due = (r.appliances || []).map(a => a.nextTest || a.next_test || '').filter(Boolean).sort()[0] || '';
    rows.push([
      r.ref_number || '', r.status || '', r.test_date || '', r.engineer || '',
      r.property_address || '', (r.appliances || []).length, due,
    ].map(_csvEsc).join(','));
  });
  _csvDownload('pat-history-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
}

export function exportGasCSV() {
  if (!state.gasReports || !state.gasReports.length) {
    toast('No Gas records to export', 'warn'); return;
  }
  const rows = [['Ref', 'Status', 'Cert Date', 'Engineer', 'Install Address', 'Next Check Date'].map(_csvEsc).join(',')];
  state.gasReports.forEach(r => {
    rows.push([
      r.ref_number || '', r.status || '', r.cert_date || '', r.engineer || '',
      r.install_address || '', r.next_check_date || '',
    ].map(_csvEsc).join(','));
  });
  _csvDownload('gas-history-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
}

export function exportELCSV() {
  const allCerts = window._elAllCerts;
  if (!allCerts || !allCerts.length) { toast('No EL records to export', 'warn'); return; }
  const rows = [['Ref', 'Type', 'Test Date', 'Outcome', 'Premises', 'Engineer'].map(_csvEsc).join(',')];
  allCerts.forEach(r => {
    rows.push([
      (r.data && r.data.ref) || r.ref_number || '',
      (r.data && r.data.certType) || r.cert_type || '',
      (r.data && r.data.testDate) || r.test_date || '',
      (r.data && r.data.outcome) || r.outcome || '',
      (r.data && r.data.premAddr1) || r.premises_name || '',
      (r.data && r.data.engineerName) || '',
    ].map(_csvEsc).join(','));
  });
  _csvDownload('el-history-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
}

// Backward-compat globals for HTML onclick= handlers
window.exportPATCSV = exportPATCSV;
window.exportGasCSV = exportGasCSV;
window.exportELCSV  = exportELCSV;
