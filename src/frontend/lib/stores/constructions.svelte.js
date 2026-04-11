import { getCargoForCommodity, getFcCargo, getShipCargo } from './cargo.svelte.js';
import { isCommodityComplete, isLowSupply } from '../utils/format.js';

const ALL_TAB_ID = 'all';

let constructions = $state([]);
let activeId = $state(localStorage.getItem('ed-tracker-active-tab') || null);

// --- Derived values ---

let activeConstructions = $derived(
  constructions.filter(c =>
    c.phase !== 'done' &&
    (c.commodities.length === 0 || c.commodities.some(cm => !isCommodityComplete(cm)))
  )
);

let active = $derived(
  activeId === ALL_TAB_ID ? null : constructions.find(c => c.id === activeId)
);

let tabIds = $derived(
  [ALL_TAB_ID, ...constructions.map(c => c.id)]
);

// --- Exports ---

export { ALL_TAB_ID };

export function getConstructions() { return constructions; }
export function getActiveConstructions() { return activeConstructions; }
export function getActive() { return active; }
export function getActiveId() { return activeId; }
export function getTabIds() { return tabIds; }

export function setConstructions(data) {
  constructions = data || [];
  if (constructions.length > 0 && !activeId) {
    setActiveId(constructions[0].id);
  }
}

export function setActiveId(id) {
  activeId = id;
  localStorage.setItem('ed-tracker-active-tab', id);
}

export function addConstruction(construction) {
  if (constructions.some(c => c.id === construction.id)) {
    setActiveId(construction.id);
    return;
  }
  constructions.push(construction);
  setActiveId(construction.id);
}

export function removeConstruction(id) {
  constructions = constructions.filter(c => c.id !== id);
  if (activeId === id) {
    setActiveId(constructions[0]?.id || null);
  }
}

export function restoreConstruction(construction) {
  constructions.push(construction);
  constructions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function updateDelivery(constructionId, slot, commodityName) {
  const construction = constructions.find(c => c.id === constructionId);
  if (!construction || !slot) return;
  const idx = construction.commodities.findIndex(
    s => s.name.toLowerCase() === commodityName.toLowerCase()
  );
  if (idx >= 0) {
    construction.commodities[idx] = slot;
  }
}

export function updateCommodity(constructionId, slot) {
  const construction = constructions.find(c => c.id === constructionId);
  if (!construction || !slot) return;
  const idx = construction.commodities.findIndex(
    s => s.name.toLowerCase() === slot.name.toLowerCase()
  );
  if (idx >= 0) {
    construction.commodities[idx] = slot;
  } else {
    construction.commodities.push(slot);
  }
}

export function removeCommodity(constructionId, name) {
  const construction = constructions.find(c => c.id === constructionId);
  if (!construction) return;
  construction.commodities = construction.commodities.filter(c => c.name !== name);
}

/**
 * Navigate tabs by direction, wrapping around.
 * @param {'next'|'prev'} direction
 */
export function navigateTab(direction) {
  const ids = tabIds;
  if (ids.length === 0) return;
  const currentIdx = ids.indexOf(activeId);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  let newIdx;
  if (direction === 'next') {
    newIdx = safeIdx >= ids.length - 1 ? 0 : safeIdx + 1;
  } else {
    newIdx = safeIdx <= 0 ? ids.length - 1 : safeIdx - 1;
  }
  setActiveId(ids[newIdx]);
}

/**
 * Aggregate commodities across all active constructions for the All tab.
 * Returns array of aggregated commodity objects with per-site breakdown.
 */
export function getAggregatedCommodities() {
  const commodityMap = new Map();
  for (const construction of activeConstructions) {
    for (const cm of construction.commodities) {
      if (!commodityMap.has(cm.name)) {
        commodityMap.set(cm.name, {
          name: cm.name,
          amount_required: 0,
          amount_delivered: 0,
          nearest_station: cm.nearest_station,
          nearest_system: cm.nearest_system,
          nearest_supply: cm.nearest_supply,
          sites: new Map(),
        });
      }
      const agg = commodityMap.get(cm.name);
      agg.amount_required += cm.amount_required;
      agg.amount_delivered += cm.amount_delivered;
      const remaining = cm.amount_required - cm.amount_delivered;
      agg.sites.set(construction.id, {
        remaining,
        station_name: construction.station_name,
        system_name: construction.system_name,
      });
      if (cm.nearest_supply != null &&
          (agg.nearest_supply == null || cm.nearest_supply > agg.nearest_supply)) {
        agg.nearest_station = cm.nearest_station;
        agg.nearest_system = cm.nearest_system;
        agg.nearest_supply = cm.nearest_supply;
      }
    }
  }
  return [...commodityMap.values()];
}

/**
 * Group commodities by their nearest station for badge display.
 * @param {Array} commodities
 * @returns {Map<string, { station: string, system: string, count: number }>}
 */
export function computeStationGroups(commodities) {
  const groups = new Map();
  for (const c of commodities) {
    if (!c.nearest_station) continue;
    const remaining = c.amount_required - c.amount_delivered;
    if (remaining <= 0) continue;
    const key = `${c.nearest_station}|${c.nearest_system}`;
    if (!groups.has(key)) {
      groups.set(key, { station: c.nearest_station, system: c.nearest_system, count: 0 });
    }
    groups.get(key).count++;
  }
  return groups;
}
