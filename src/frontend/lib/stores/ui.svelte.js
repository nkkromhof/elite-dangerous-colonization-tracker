let zoom = $state(parseFloat(localStorage.getItem('ed-tracker-zoom') || '1'));
let theme = $state(localStorage.getItem('ed-tracker-theme') || 'dark');
let collectionPhase = $state(localStorage.getItem('ed-tracker-collection-phase') || 'collecting');
let vrMode = $state(sessionStorage.getItem('ed-tracker-vr') === 'true');

export function getZoom() { return zoom; }
export function getTheme() { return theme; }
export function getCollectionPhase() { return collectionPhase; }
export function getVrMode() { return vrMode; }

export function setVrMode(value) {
  vrMode = value;
  sessionStorage.setItem('ed-tracker-vr', value ? 'true' : 'false');
}

export function toggleVrMode() {
  setVrMode(!vrMode);
}

export function setZoom(value) {
  zoom = Math.max(0.5, Math.min(2.0, value));
  localStorage.setItem('ed-tracker-zoom', zoom.toFixed(2));
}

export function setTheme(value) {
  theme = value;
  localStorage.setItem('ed-tracker-theme', value);
}

export function toggleTheme() {
  setTheme(theme === 'dark' ? 'light' : 'dark');
}

export function setCollectionPhase(phase) {
  collectionPhase = phase;
  localStorage.setItem('ed-tracker-collection-phase', phase);
}
