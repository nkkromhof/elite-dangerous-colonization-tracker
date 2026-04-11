import { setCargo } from './cargo.svelte.js';
import { setShip } from './ship.svelte.js';
import { setStation, clearStation } from './station.svelte.js';
import { addError } from './errors.svelte.js';
import {
  setConstructions,
  addConstruction,
  removeConstruction,
  restoreConstruction,
  updateDelivery,
  updateCommodity,
  navigateTab,
} from './constructions.svelte.js';
import { fetchState } from '../utils/api.js';

let connected = $state(false);
let reconnectAttempts = $state(0);
let source = null;
let reconnectTimer = null;

const MAX_RECONNECT_DELAY = 30000;

export function getConnected() { return connected; }

export function connect() {
  if (source) {
    source.close();
    source = null;
  }

  source = new EventSource('/api/events');

  source.addEventListener('open', () => {
    connected = true;
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  source.addEventListener('error', () => {
    connected = false;
    if (source) {
      source.close();
      source = null;
    }
    scheduleReconnect();
  });

  // Cargo
  source.addEventListener('cargo_updated', (e) => {
    setCargo(JSON.parse(e.data));
  });

  // Deliveries
  source.addEventListener('delivery_recorded', (e) => {
    const data = JSON.parse(e.data);
    updateDelivery(data.construction_id, data.slot, data.commodity_name);
  });

  // Constructions
  source.addEventListener('construction_added', (e) => {
    addConstruction(JSON.parse(e.data));
  });

  source.addEventListener('construction_archived', (e) => {
    const data = JSON.parse(e.data);
    removeConstruction(data.id);
  });

  source.addEventListener('construction_unarchived', (e) => {
    const data = JSON.parse(e.data);
    restoreConstruction(data.construction);
  });

  // Commodity updates
  source.addEventListener('commodity_updated', (e) => {
    const data = JSON.parse(e.data);
    updateCommodity(data.constructionId, data.slot);
  });

  // Tab navigation (from hotkey)
  source.addEventListener('tab_change', (e) => {
    const data = JSON.parse(e.data);
    navigateTab(data.direction);
  });

  // Ship
  source.addEventListener('ship_updated', (e) => {
    setShip(JSON.parse(e.data));
  });

  // Station
  source.addEventListener('station_commodities_available', (e) => {
    const data = JSON.parse(e.data);
    setStation({
      name: data.stationName,
      system: data.systemName,
      availableCommodities: data.availableCommodities,
    });
  });

  source.addEventListener('station_left', () => {
    clearStation();
  });

  // Errors
  source.addEventListener('app_error', (e) => {
    addError(JSON.parse(e.data));
  });
}

export function disconnect() {
  if (source) {
    source.close();
    source = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connected = false;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    // Full state resync on reconnect to catch missed events
    try {
      const data = await fetchState();
      setConstructions(data.constructions);
      setCargo(data.cargo);
      setShip(data.ship);
      if (data.currentStation) {
        setStation(data.currentStation);
      } else {
        clearStation();
      }
    } catch {
      // State fetch failed, connect will retry via SSE error handler
    }
    connect();
  }, delay);
}

/**
 * Perform a one-time full state load. Called on app mount.
 */
export async function loadInitialState() {
  try {
    const data = await fetchState();
    setConstructions(data.constructions);
    setCargo(data.cargo);
    setShip(data.ship);
    if (data.currentStation) {
      setStation(data.currentStation);
    } else {
      clearStation();
    }
  } catch (err) {
    addError({ timestamp: new Date().toISOString(), source: 'App', message: 'Failed to load initial state', details: err.message });
  }
}
