import { sb } from '../lib/supabase.js';

// ── Audit log event writer ─────────────────────────────────────────────────
export async function logAppEvent(eventType, certType, certId, certRef, extra = {}) {
  try {
    const { error } = await sb.rpc('log_app_event', {
      p_event_type: eventType,
      p_cert_type:  certType  || null,
      p_cert_id:    certId    || null,
      p_cert_ref:   certRef   || null,
      p_metadata: {
        user_agent: navigator.userAgent.slice(0, 200),
        request_id: (crypto.randomUUID?.()) || Math.random().toString(36).slice(2),
        ...extra,
      },
    });
    if (error) console.warn('[audit]', eventType, error.message);
  } catch (e) {
    console.warn('[audit]', eventType, e);
  }
}

// ── Audit log page state ───────────────────────────────────────────────────
let _auditAll  = [];
let _auditPage = 0;
const _AUDIT_PER_PAGE = 50;

// ── Load & render ──────────────────────────────────────────────────────────
export async function loadAuditLog() {
  const el = document.getElementById('audit-list');
  if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>Loading…</p></div>';
  const { data, error } = await sb
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    if (el) el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${error.message}</p></div>`;
    return;
  }
  if (!data || !data.length) {
    if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No audit entries yet</p></div>';
    return;
  }
  _auditAll  = data;
  _auditPage = 0;
  renderAuditPage();
}

export function renderAuditPage() {
  const el = document.getElementById('audit-list');
  if (!el) return;
  const total = _auditAll.length;
  const pages = Math.ceil(total / _AUDIT_PER_PAGE);
  const start = _auditPage * _AUDIT_PER_PAGE;
  const data  = _auditAll.slice(start, start + _AUDIT_PER_PAGE);
  const colors = {
    CREATED:           '#10b981',
    UPDATED_DRAFT:     '#6366f1',
    ISSUED:            '#f59e0b',
    SUPERSEDED:        '#8b5cf6',
    DELETED:           '#ef4444',
    PDF_DOWNLOADED:    '#3b82f6',
    EMAILED:           '#06b6d4',
    SERIAL_GAP_NOTED:  '#f97316',
  };
  el.innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Showing ${start + 1}–${Math.min(start + data.length, total)} of ${total} events</div>`
    + `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:2px solid var(--border)">
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Time</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Event</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Type</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Ref</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">User</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Role</th>
      <th style="text-align:left;padding:8px;color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Source</th>
    </tr></thead>
    <tbody>${data.map(e => {
      const c   = colors[e.event_type] || '#94a3b8';
      const src = e.metadata?.source === 'trigger'
        ? '<span title="Database trigger — cannot be bypassed" style="font-size:10px;color:#10b981">⚙ trigger</span>'
        : '<span style="font-size:10px;color:#6b7280">app</span>';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px;color:var(--muted);white-space:nowrap;font-size:12px">${new Date(e.created_at).toLocaleString('en-GB')}</td>
        <td style="padding:8px"><span style="background:${c}22;color:${c};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.3px">${e.event_type || '—'}</span></td>
        <td style="padding:8px"><span class="badge badge-${e.cert_type === 'gas' ? 'due' : 'done'}">${e.cert_type || '—'}</span></td>
        <td style="padding:8px;font-weight:600;font-size:12px">${e.cert_ref || '—'}</td>
        <td style="padding:8px;font-size:12px;color:var(--muted)">${e.user_email || '—'}</td>
        <td style="padding:8px;font-size:11px;color:var(--muted)">${e.user_role || '—'}</td>
        <td style="padding:8px">${src}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  const pg   = document.getElementById('audit-pagination');
  const lbl  = document.getElementById('audit-page-label');
  const prev = document.getElementById('audit-prev-btn');
  const next = document.getElementById('audit-next-btn');
  if (pg)   { pg.hidden = pages <= 1; pg.style.display = pages > 1 ? 'flex' : ''; }
  if (lbl)  lbl.textContent = `Page ${_auditPage + 1} of ${pages}`;
  if (prev) prev.disabled   = _auditPage === 0;
  if (next) next.disabled   = _auditPage >= pages - 1;
}

export function prevAuditPage() {
  if (_auditPage > 0) {
    _auditPage--;
    renderAuditPage();
    document.getElementById('audit-list')?.scrollIntoView({ behavior: 'smooth' });
  }
}

export function nextAuditPage() {
  if (_auditPage < Math.ceil(_auditAll.length / _AUDIT_PER_PAGE) - 1) {
    _auditPage++;
    renderAuditPage();
    document.getElementById('audit-list')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// Backward-compat globals for HTML onclick= handlers
window.prevAuditPage = prevAuditPage;
window.nextAuditPage = nextAuditPage;
