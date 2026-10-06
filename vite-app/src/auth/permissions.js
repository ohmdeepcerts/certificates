import { state } from '../lib/state.js';

export function _rolePerms(role) {
  const perm = state.currentProfile?.permissions ?? '';
  const isAdmin = role === 'admin';
  const isFull  = isAdmin || (role === 'engineer' && !perm);
  return {
    isAdmin,
    hasFull:  isFull,
    hasPAT:   isFull || perm.includes('pat'),
    hasGas:   isFull || perm.includes('gas'),
    hasEL:    isFull || perm.includes('el'),
    hasFire:  isFull || perm.includes('fire'),
  };
}

export function applySidebarPermissions(role) {
  const { isAdmin, hasFull, hasPAT, hasGas, hasEL, hasFire } = _rolePerms(role);
  function secVis(label, show) {
    document.querySelectorAll('.nav-section-label').forEach(lbl => {
      if (lbl.textContent.trim() === label)
        lbl.closest('.nav-section').style.display = show ? '' : 'none';
    });
  }
  secVis('Overview', hasFull);
  secVis('PAT Testing', hasPAT);
  secVis('Gas Safety', hasGas);
  secVis('Emergency Lighting', hasEL);
  secVis('Fire Safety', hasFire);
  secVis('Library', hasFull);
  secVis('Compliance', hasFull);
  secVis('Upcoming', hasFull);
  secVis('System', hasFull);
  document.getElementById('audit-nav').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('staff-nav').style.display = isAdmin ? 'flex' : 'none';
  const rnEl = document.getElementById('recycle-nav');
  if (rnEl) rnEl.style.display = isAdmin ? 'flex' : 'none';
}

export function canNavigate(view) {
  if (!state.currentProfile) return true;
  const { hasFull, hasPAT, hasGas, hasEL, hasFire } = _rolePerms(state.currentProfile.role ?? 'engineer');
  if (view === 'settings') return hasFull;
  if (['pat-new', 'pat-history'].includes(view)) return hasPAT;
  if (['gas-new', 'gas-history'].includes(view)) return hasGas;
  if (['el-new', 'el-history'].includes(view)) return hasEL;
  if (['fire-new', 'fire-history'].includes(view)) return hasFire;
  return hasFull;
}
