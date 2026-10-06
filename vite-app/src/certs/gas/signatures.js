// ============================================================
//  signatures.js — CP12 signature pad helpers + shared canvas
// ============================================================

// ── CP12-specific signature modal ──────────────────────────

export function initCP12SigPad(canvas) {
  if (!canvas || canvas._cp12Init) return;
  canvas._cp12Init = true;
  canvas._sigHistory = [];
  const ctx = canvas.getContext('2d');
  let drawing = false, lx = 0, ly = 0;
  ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const cl = e.touches ? e.touches[0] : e;
    return { x: (cl.clientX - r.left) * (canvas.width / r.width), y: (cl.clientY - r.top) * (canvas.height / r.height) };
  };
  const _snap = () => {
    if (canvas._sigHistory.length >= 20) canvas._sigHistory.shift();
    canvas._sigHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };
  canvas.addEventListener('mousedown', e => { _snap(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); _snap(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchend', () => drawing = false);
}

export function undoCP12SigModal() {
  const mc = document.getElementById('sigModalCanvas');
  if (!mc || !mc._sigHistory || !mc._sigHistory.length) return;
  mc.getContext('2d').putImageData(mc._sigHistory.pop(), 0, 0);
}

export let cp12SigModalField = null;

export function openCP12SigModal(fieldKey, titleText) {
  cp12SigModalField = fieldKey;
  document.getElementById('sigModalTitle').textContent = titleText || 'Sign Here';
  document.getElementById('sigModal').classList.add('open');
  const mc = document.getElementById('sigModalCanvas');
  mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
  mc._cp12Init = false;
  initCP12SigPad(mc);
}

export function clearCP12SigModal() {
  const mc = document.getElementById('sigModalCanvas');
  mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
}

export function closeCP12SigModal() {
  document.getElementById('sigModal').classList.remove('open');
  cp12SigModalField = null;
}

export function confirmCP12SigModal() {
  if (!cp12SigModalField) return;
  const mc = document.getElementById('sigModalCanvas');
  const dataUrl = mc.toDataURL('image/png');
  const targetCanvas = document.querySelector(`[data-sig-field="${cp12SigModalField}"]`);
  if (targetCanvas) {
    const ctx = targetCanvas.getContext('2d');
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, targetCanvas.width, targetCanvas.height);
    img.src = dataUrl;
  }
  closeCP12SigModal();
}

export function clearCP12Sig(fieldKey) {
  const c = document.querySelector(`[data-sig-field="${fieldKey}"]`);
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

// ── CP12 logo ─────────────────────────────────────────────

export function handleCP12LogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => applyCP12Logo(e.target.result);
  reader.readAsDataURL(file);
}

export function applyCP12Logo(dataUrl) {
  const img = document.getElementById('logoImg');
  const zone = document.getElementById('logoZone');
  if (!img || !zone) return;
  img.src = dataUrl;
  zone.classList.add('has-logo');
  const hd = document.getElementById('cp12LogoData');
  if (hd) hd.value = dataUrl;
  try { localStorage.setItem('cp12_logo_v1', dataUrl); } catch (e) {}
}

export function loadCP12Logo() {
  try {
    const s = localStorage.getItem('cp12_logo_v1');
    if (s) applyCP12Logo(s);
  } catch (e) {}
}

// ── Shared canvas helpers (used across cert types) ────────

export function initSigCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false; let lx = 0, ly = 0;
  ctx.strokeStyle = '#1a3a6b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const cl = e.touches ? e.touches[0] : e;
    return { x: (cl.clientX - r.left) * (canvas.width / r.width), y: (cl.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener('mousedown', e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke(); lx = p.x; ly = p.y; }, { passive: false });
  canvas.addEventListener('touchend', () => drawing = false);
}

export function clearSig(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

export function getCanvasDataURL(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const imageData = ctx.getImageData(0, 0, c.width, c.height);
  const hasContent = imageData.data.some((v, i) => i % 4 !== 3 && v !== 0);
  return hasContent ? c.toDataURL('image/png') : null;
}

export function restoreSig(canvasId, dataUrl) {
  if (!dataUrl) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const img = new Image();
  img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
  img.src = dataUrl;
}
