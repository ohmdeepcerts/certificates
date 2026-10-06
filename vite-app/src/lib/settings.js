import { sb } from './supabase.js';
import { state } from './state.js';

export async function loadAppSettings() {
  const { data } = await sb.from('app_config').select('key,value');
  state.appSettings = {};
  if (data) data.forEach(r => (state.appSettings[r.key] = r.value));
}

export function getSetting(key, def = '') {
  return state.appSettings[key] ?? def;
}

export async function upsertSetting(key, value) {
  await sb.from('app_config').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  state.appSettings[key] = value;
}
