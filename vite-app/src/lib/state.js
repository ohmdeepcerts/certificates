// Shared mutable application state.
// All modules import from here; mutate the exported objects directly.

export const state = {
  currentUser:    null,
  currentProfile: null,
  currentView:    'dashboard',

  // dirty / loading flags
  settingsDirty:     false,
  pendingNav:        null,
  inPasswordRecovery: false,
  patDirty:          false,
  gasDirty:          false,
  elDirty:           false,

  // editing IDs
  editingPATId:   null,
  editingGasId:   null,
  gasCertLoading: false,

  // serial caches
  cachedNextGasSerial: null,
  cachedNextPATSerial: null,

  // data lists
  patReports:  [],
  gasReports:  [],
  appSettings: {},
};

// Convenience accessors
export const isAdmin = () => (state.currentProfile?.role ?? 'engineer') === 'admin';
