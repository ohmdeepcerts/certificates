// ========== PAT - SCAN MODAL MODULE ==========
// Extracted from index.html (lines 4549-4655)

import { getSetting } from '../../lib/settings.js';
import { toast } from '../../lib/utils.js';
import { patApps, patCalcNext, renderPATRows, doPatPreview } from './form.js';

// ─── Module-level state ───────────────────────────────
let _scanImgData = null;

// ─── Modal open / close ──────────────────────────────
export function openScanModal() {
  _scanImgData = null;
  const modal = document.getElementById('scan-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('scan-preview').innerHTML = '';
    document.getElementById('scan-status').textContent = '';
    document.getElementById('scan-go-btn').disabled = true;
    document.getElementById('scan-results-wrap').style.display = 'none';
  }
}
export function closeScanModal() {
  const modal = document.getElementById('scan-modal'); if (modal) modal.style.display = 'none';
}

// ─── File input handler ──────────────────────────────
export function handleScanFile(input) {
  const file = input.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _scanImgData = e.target.result;
    document.getElementById('scan-preview').innerHTML = `<img src="${_scanImgData}" style="max-width:100%;max-height:160px;border-radius:6px;margin-top:6px">`;
    document.getElementById('scan-go-btn').disabled = false;
    document.getElementById('scan-status').textContent = 'Image ready — click Scan Handwriting';
  };
  reader.readAsDataURL(file);
}

// ─── Run scan ────────────────────────────────────────
export async function runScan() {
  if (!_scanImgData) { toast('Choose a photo first', 'warn'); return; }
  const btn = document.getElementById('scan-go-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading…';
  const b64 = _scanImgData.split(',')[1];
  let items = null;
  const geminiKey = getSetting('gemini_key', '');
  if (geminiKey) {
    try { items = await scanWithGemini(b64, geminiKey); } catch (e) { console.warn('Gemini scan failed', e); }
  }
  if (!items || !items.length) {
    document.getElementById('scan-status').textContent = 'Trying OCR fallback…';
    try { items = await scanWithOCRSpace(b64); } catch (e) { toast('Scan failed: ' + e.message, 'error'); }
  }
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Scan Handwriting';
  renderScanResults(items || []);
}

// ─── Gemini vision API ───────────────────────────────
async function scanWithGemini(b64, apiKey) {
  const prompt = 'You are reading a handwritten PAT (Portable Appliance Test) log sheet. Extract every row and return ONLY a raw JSON array like: [{"assetId":"A001","description":"Kettle"},{"assetId":"A002","description":"Toaster"}]. No markdown, no explanation, just the JSON array.';
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  for (const model of models) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: b64 } }] }] })
      });
      if (!resp.ok) continue;
      const j = await resp.json();
      const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) { const arr = JSON.parse(match[0]); if (Array.isArray(arr) && arr.length) return arr; }
    } catch (e) { console.warn(model, e); }
  }
  return null;
}

// ─── OCR.Space fallback ──────────────────────────────
async function scanWithOCRSpace(b64) {
  const fd = new FormData();
  fd.append('base64Image', 'data:image/jpeg;base64,' + b64);
  fd.append('apikey', 'helloworld'); fd.append('OCREngine', '3'); fd.append('language', 'eng');
  const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd });
  const j = await resp.json();
  const text = (j.ParsedResults?.[0]?.ParsedText || '').trim();
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map((l, i) => {
    const parts = l.trim().split(/\s+/);
    const assetId = parts[0] || `S${i + 1}`;
    const description = spellCorrectAppliance(parts.slice(1).join(' ')) || l.trim();
    return { assetId, description };
  });
}

// ─── Spell correction ────────────────────────────────
const APPLIANCE_DICT = ['Kettle', 'Toaster', 'Microwave', 'Fridge', 'Freezer', 'Washing Machine', 'Tumble Dryer', 'Dishwasher', 'Television', 'TV', 'Monitor', 'Computer', 'Laptop', 'Printer', 'Scanner', 'Iron', 'Hair Dryer', 'Vacuum Cleaner', 'Hoover', 'Coffee Machine', 'Kettle', 'Extension Lead', 'Power Strip', 'Lamp', 'Desk Lamp', 'Fan', 'Heater', 'Electric Blanket', 'Drill', 'Saw', 'Grinder', 'Electric Screwdriver'];
function levenshtein(a, b) { const m = a.length, n = b.length; const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)); for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]); return dp[m][n]; }
function spellCorrectAppliance(desc) {
  if (!desc) return desc;
  const words = desc.split(' ');
  return words.map(w => { if (w.length < 3) return w; let best = w, bestScore = 2; APPLIANCE_DICT.forEach(d => { const score = levenshtein(w.toLowerCase(), d.toLowerCase()); if (score < bestScore) { bestScore = score; best = d; } }); return best; }).join(' ');
}

// ─── Render scan results ──────────────────────────────
export function renderScanResults(items) {
  const wrap = document.getElementById('scan-results-wrap');
  const list = document.getElementById('scan-results-list');
  const count = document.getElementById('scan-count');
  if (!items.length) { toast('No appliances detected', 'warn'); wrap.style.display = 'none'; return; }
  count.textContent = items.length + ' found';
  const _sesc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  list.innerHTML = items.map((it, i) => `<div class="scan-results-item"><input type="checkbox" id="sck${i}" checked style="margin-right:8px"><label for="sck${i}" style="flex:1;cursor:pointer"><strong>${_sesc(it.assetId || '')}</strong> — ${_sesc(it.description || '')}</label></div>`).join('');
  wrap.style.display = 'block';
  document.getElementById('scan-status').textContent = 'Review and add to form';
  wrap._items = items;
}

// ─── Add scanned results to form ─────────────────────
export function addPatScanResults() {
  const wrap = document.getElementById('scan-results-wrap');
  const items = wrap._items || [];
  const defaultInstrument = getSetting('pat_default_instrument', '');
  const defaultResult = getSetting('pat_default_result', 'Pass');
  const defaultPeriod = getSetting('pat_period', '12');
  const today = new Date().toISOString().split('T')[0];
  items.forEach((it, i) => {
    const cb = document.getElementById(`sck${i}`);
    if (!cb || !cb.checked) return;
    patApps.push({ assetId: it.assetId || '', description: it.description || '', testInstrument: defaultInstrument, date: today, retestPeriod: defaultPeriod + ' Months', nextTest: patCalcNext(today, parseInt(defaultPeriod)), result: defaultResult, notes: '' });
  });
  renderPATRows(); doPatPreview(); closeScanModal();
  toast(items.filter((_, i) => { const cb = document.getElementById(`sck${i}`); return cb && cb.checked; }).length + ' appliances added', 'success');
}
