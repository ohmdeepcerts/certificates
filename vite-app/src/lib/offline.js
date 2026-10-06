import { sb } from './supabase.js';
import { state } from './state.js';
import { toast } from './utils.js';

let _idbDb = null;

function _getIDB() {
  if (_idbDb) return Promise.resolve(_idbDb);
  return new Promise((res, rej) => {
    const req = indexedDB.open('ohm_offline_queue', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue'))
        db.createObjectStore('queue', { keyPath: 'localId', autoIncrement: true });
    };
    req.onsuccess = e => { _idbDb = e.target.result; res(_idbDb); };
    req.onerror   = e => rej(e.target.error);
  });
}

export async function idbEnqueue(item) {
  const db = await _getIDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('queue', 'readwrite');
    const req = tx.objectStore('queue').add(item);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function idbRemove(localId) {
  const db = await _getIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(localId);
    tx.oncomplete = res;
    tx.onerror    = e => rej(e.target.error);
  });
}

export async function idbGetAll() {
  const db = await _getIDB();
  return new Promise((res, rej) => {
    const req = db.transaction('queue', 'readonly').objectStore('queue').getAll();
    req.onsuccess = () => res(req.result ?? []);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function idbPatchById(localId, fields) {
  const db = await _getIDB();
  return new Promise((res, rej) => {
    const tx    = db.transaction('queue', 'readwrite');
    const store = tx.objectStore('queue');
    const req   = store.get(localId);
    req.onsuccess = e => {
      const v = e.target.result;
      if (v) { const u = store.put({ ...v, ...fields }); u.onsuccess = res; u.onerror = e => rej(e.target.error); }
      else res();
    };
    req.onerror = e => rej(e.target.error);
  });
}

// ── Sync badge ─────────────────────────────────────────────────────────────
let _lastSyncTime = null;
let _syncBadgeTimer = null;

function _relTime(ts) {
  if (!ts) return '';
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

export function setOfflinePills(offline) {
  const desk = document.getElementById('offline-pill-desktop');
  if (desk) desk.style.display = offline ? 'inline-flex' : 'none';
  const pill = document.getElementById('mobile-net-pill');
  if (!pill) return;
  if (offline) {
    pill.className = 'mobile-net-pill net-offline';
    const ago = _lastSyncTime ? ' · Synced ' + _relTime(_lastSyncTime) : '';
    pill.textContent = '⚡ Offline' + ago;
  } else {
    pill.className = 'mobile-net-pill net-online';
    pill.textContent = '● Live';
  }
}

export function setSyncBadge(pending, total, syncing) {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  clearTimeout(_syncBadgeTimer);
  if (syncing) {
    el.className = 'sync-badge syncing';
    el.innerHTML = `<span class="sync-spin">↑</span> ${total - pending}/${total} synced`;
    el.style.display = 'flex';
  } else if (pending > 0) {
    el.className = 'sync-badge pending';
    el.innerHTML = `↑ ${pending} pending`;
    el.style.display = 'flex';
  } else if (total > 0) {
    el.className = 'sync-badge done';
    el.innerHTML = '✓ All synced';
    el.style.display = 'flex';
    _syncBadgeTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
  } else {
    el.style.display = 'none';
  }
}

export async function refreshSyncBadge() {
  try {
    const items = await idbGetAll();
    setSyncBadge(items.length, items.length, false);
  } catch {}
}

// ── Sync queue processor ───────────────────────────────────────────────────
let _syncing = false;

export async function syncQueue() {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;
  try {
    const items = await idbGetAll();
    if (!items.length) { setSyncBadge(0, 0, false); _syncing = false; return; }
    const total = items.length;
    let done = 0;
    setSyncBadge(total - done, total, true);

    for (const item of items) {
      try {
        if (item.type === 'pat_upsert') {
          const d = { ...item.form };
          const completed = d.status === 'completed';
          const completedAt = d.completed_at;
          const refNum = d.ref_number;
          const baseRef = d.base_ref;
          delete d.status; delete d.completed_at; delete d.ref_number; delete d.base_ref;
          if (item.supabaseId) {
            await sb.from('pat_reports').update({ ...d, updated_at: new Date().toISOString() }).eq('id', item.supabaseId);
            if (completed) await sb.from('pat_reports').update({ status: 'completed', ref_number: refNum, base_ref: baseRef, completed_at: completedAt }).eq('id', item.supabaseId);
          } else {
            const { data: created } = await sb.from('pat_reports').insert({ ...d, created_by: item.userId }).select().single();
            if (created && completed) await sb.from('pat_reports').update({ status: 'completed', ref_number: refNum, base_ref: baseRef, completed_at: completedAt }).eq('id', created.id);
          }
        } else if (item.type === 'el_upsert') {
          const d = { ...item.form };
          if (item.supabaseId) {
            await sb.from('el_certs').update({ ...d, updated_at: new Date().toISOString() }).eq('id', item.supabaseId);
          } else {
            await sb.from('el_certs').insert({ ...d, created_by: item.userId }).select().single();
          }
        } else if (item.type === 'gas_upsert') {
          const d = { ...item.form };
          if (item.supabaseId) {
            await sb.from('gas_certs').update({ ...d, updated_at: new Date().toISOString() }).eq('id', item.supabaseId);
          } else {
            await sb.from('gas_certs').insert({ ...d, created_by: item.userId }).select().single();
          }
        }
        await idbRemove(item.localId);
        done++;
        setSyncBadge(total - done, total, done < total);
      } catch { break; }
    }

    const remaining = await idbGetAll();
    setSyncBadge(remaining.length, total, false);
    if (!remaining.length) _lastSyncTime = Date.now();
  } catch {}
  _syncing = false;
}
