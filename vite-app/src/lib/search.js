// Shared search, highlight and pagination utilities used by all cert list views

export const PAGE_SIZE = 12;

function _escRaw(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * HTML-escape `text` and wrap every occurrence of `q` in a <mark> highlight.
 * Safe to insert as innerHTML.
 */
export function hlText(text, q) {
  if (!q || !text) return _escRaw(text || '');
  var s = String(text);
  var lq = q.toLowerCase();
  var ls = s.toLowerCase();
  var out = ''; var i = 0;
  while (i < s.length) {
    var idx = ls.indexOf(lq, i);
    if (idx === -1) { out += _escRaw(s.slice(i)); break; }
    out += _escRaw(s.slice(i, idx));
    out += '<mark style="background:#fef08a;color:#1a1a1a;border-radius:2px;padding:0 1px">' + _escRaw(s.slice(idx, idx + q.length)) + '</mark>';
    i = idx + q.length;
  }
  return out;
}

/**
 * Sort `list` so that word-boundary matches come before mid-word matches.
 * `getTextFn(item)` should return all searchable text for an item joined as one string.
 */
export function sortByWordStart(list, getTextFn, q) {
  if (!q) return list;
  var escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match at start-of-string or after a non-alphanumeric character
  var wRx = new RegExp('(?:^|[^a-zA-Z0-9])' + escaped, 'i');
  return list.slice().sort(function(a, b) {
    var aWord = wRx.test(getTextFn(a)) ? 0 : 1;
    var bWord = wRx.test(getTextFn(b)) ? 0 : 1;
    return aWord - bWord;
  });
}

/**
 * Render pagination bar HTML.
 * Returns empty string when there is only one page.
 */
export function paginationHtml(page, total, prevFn, nextFn) {
  var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return '';
  var start = (page - 1) * PAGE_SIZE + 1;
  var end = Math.min(page * PAGE_SIZE, total);
  var base = 'padding:6px 16px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;cursor:pointer;transition:background .15s;font-weight:500';
  var dis  = base + ';opacity:.35;cursor:default;pointer-events:none';
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0 4px;gap:8px;flex-wrap:wrap">'
    + '<button ' + (page <= 1 ? 'disabled style="' + dis + '"' : 'onclick="' + prevFn + '" style="' + base + '"') + '>← Prev</button>'
    + '<span style="font-size:12px;color:var(--muted)">Page ' + page + ' of ' + totalPages + ' &nbsp;·&nbsp; ' + start + '–' + end + ' of ' + total + '</span>'
    + '<button ' + (page >= totalPages ? 'disabled style="' + dis + '"' : 'onclick="' + nextFn + '" style="' + base + '"') + '>Next →</button>'
    + '</div>';
}
