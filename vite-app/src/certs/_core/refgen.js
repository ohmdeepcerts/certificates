import { sb } from '../../lib/supabase.js';
import { getSetting } from '../../lib/settings.js';

export function _pcScore(pc) {
  let s = 0;
  for (const ch of (pc ?? '').replace(/\s/g, '').toUpperCase()) {
    if (ch >= 'A' && ch <= 'Z') s += ch.charCodeAt(0) - 64;
    else if (ch >= '0' && ch <= '9') s += parseInt(ch);
  }
  return s;
}

export function _extractPC(addr) {
  const m = (addr ?? '').match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  return m ? m[1].replace(/\s/g, '').toUpperCase() : '';
}

export function _refAddrPart(addr) {
  let a = (addr ?? '')
    .replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi, '')
    .replace(/,?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const tokens = a.split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return '';
  if (/^\d/.test(tokens[0])) return tokens.slice(0, 3).join(' ');
  const doorIdx = tokens.findIndex(t => /^\d/.test(t));
  if (doorIdx === -1) return tokens.slice(0, 3).join(' ');
  return tokens.slice(0, doorIdx + 3).join(' ');
}

export function _refSettings(type) {
  if (type === 'pat') {
    return {
      prefix: (getSetting('pat_ref_prefix', 'PAT') || 'PAT').toUpperCase(),
      startN: parseInt(getSetting('pat_ref_start', '1')) || 1,
    };
  }
  if (type === 'el') {
    return {
      prefix: (getSetting('el_ref_prefix', 'EL') || 'EL').toUpperCase(),
      startN: parseInt(getSetting('el_ref_start', '1001')) || 1001,
    };
  }
  if (type === 'fire') {
    return {
      prefix: (getSetting('fa_ref_prefix', 'FA') || 'FA').toUpperCase(),
      startN: parseInt(getSetting('fa_ref_start', '1001')) || 1001,
    };
  }
  return {
    prefix: (getSetting('gas_ref_prefix', getSetting('ref_prefix', 'OHM')) || 'OHM').toUpperCase(),
    startN: parseInt(getSetting('gas_ref_start', getSetting('ref_start', '210'))) || 210,
  };
}

export function buildCertRef(fullAddress, postcode, type = 'gas') {
  const { prefix, startN } = _refSettings(type);
  const yy = String(new Date().getFullYear()).slice(-2);
  const pc = postcode || _extractPC(fullAddress);
  const score = _pcScore(pc);
  const addrPart = _refAddrPart(fullAddress);
  return `${prefix}${startN}${yy}${score} / ${addrPart}`;
}

export async function buildCertRefSeq(addr, postcode, type = 'gas') {
  const { prefix, startN } = _refSettings(type);
  const yy = String(new Date().getFullYear()).slice(-2);
  const pc = postcode || _extractPC(addr);
  const score = _pcScore(pc);
  const addrPart = _refAddrPart(addr ?? '');
  const table = type === 'pat' ? 'pat_reports' : type === 'el' ? 'el_certs' : type === 'fire' ? 'fire_certs' : 'gas_certs';

  try {
    let allNums;
    if (type === 'el') {
      const { data } = await sb.from(table).select('data');
      allNums = (data ?? []).map(r => {
        const br = ((r.data?.baseRef) ?? '').trim();
        const m = br.match(/^[A-Za-z]+(\d+)$/);
        if (!m) return 0;
        const n = parseInt(m[1]);
        return n <= 99999 ? n : 0;
      });
    } else {
      const { data } = await sb.from(table).select('base_ref').not('base_ref', 'is', null);
      allNums = (data ?? []).map(r => {
        const m = (r.base_ref ?? '').trim().match(/^[A-Za-z]+(\d+)$/);
        if (!m) return 0;
        const n = parseInt(m[1]);
        return n <= 9999 ? n : 0;
      });
    }
    const maxN = Math.max(startN - 1, ...allNums);
    const nextN = maxN + 1;
    return { ref: `${prefix}${nextN}${yy}${score} / ${addrPart}`, baseRef: `${prefix}${nextN}` };
  } catch {
    return { ref: `${prefix}${startN}${yy}${score} / ${addrPart}`, baseRef: `${prefix}${startN}` };
  }
}
