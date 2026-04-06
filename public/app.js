const ALL_TAB_ID = 'all';

const STEPPER_CONFIG = {
  holdDelay: 300,
  holdInterval: 100,
};

function getStep(elapsed) {
  if (elapsed >= 2500) return 100;
  if (elapsed >= 1000) return 10;
  return 1;
}

let holdTimer = null;
let holdInterval = null;
let holdButton = null;
let holdWasActive = false;

function clearHoldTimers() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  if (holdInterval) { clearTimeout(holdInterval); holdInterval = null; }
  if (holdButton) { holdButton.classList.remove('pressed'); holdButton = null; }
}

function startHold(btn, direction, inputEl) {
  clearHoldTimers();
  holdButton = btn;
  holdWasActive = false;
  btn.classList.add('pressed');

  const startTime = Date.now();

  function tick() {
    const step = getStep(Date.now() - startTime);
    const val = parseInt(inputEl.value, 10) || 0;
    inputEl.value = Math.max(0, val + direction * step);
    holdInterval = setTimeout(tick, STEPPER_CONFIG.holdInterval);
  }

  holdTimer = setTimeout(() => {
    holdWasActive = true;
    tick();
  }, STEPPER_CONFIG.holdDelay);
}

function stopHold() {
  clearHoldTimers();
}

const state = {
  constructions: [],
  cargo: { ship: [], fc: [] },
  ship: null,
  activeConstructionId: localStorage.getItem('ed-tracker-active-tab') || null,
  pendingDeleteId: null,
  sessionErrors: [],
  editingCell: null,
  collectionPhase: localStorage.getItem('ed-tracker-collection-phase') || 'collecting',
};

const elements = {
  tabsContainer: document.getElementById('tabs-container'),
  constructionCard: document.getElementById('construction-card'),
  deleteModal: document.getElementById('delete-modal'),
  deleteModalText: document.getElementById('delete-modal-text'),
  deleteCancel: document.getElementById('delete-cancel'),
  deleteConfirm: document.getElementById('delete-confirm'),
  archivedModal: document.getElementById('archived-modal'),
  archivedList: document.getElementById('archived-list'),
  archivedBtn: document.getElementById('archived-btn'),
  archivedCloseBtn: document.getElementById('archived-close-btn'),
  copyToast: document.getElementById('copy-toast'),
  zoomOut: document.getElementById('zoom-out'),
  zoomIn: document.getElementById('zoom-in'),
  zoomDisplay: document.getElementById('zoom-display'),
  statusWidget: document.getElementById('status-widget'),
  statusCount: document.getElementById('status-count'),
  statusDropdown: document.getElementById('status-dropdown'),
  statusList: document.getElementById('status-list'),
};

function init() {
  loadZoom();
  fetchState();
  connectSSE();
  setupEventListeners();
  setupStepperListeners();
}

function loadZoom() {
  const saved = localStorage.getItem('ed-tracker-zoom');
  if (saved) {
    setZoom(parseFloat(saved));
  }
}

function setZoom(value) {
  const clamped = Math.max(0.5, Math.min(2.0, value));
  document.documentElement.style.setProperty('--zoom', clamped.toFixed(2));
  elements.zoomDisplay.textContent = Math.round(clamped * 100) + '%';
  elements.zoomOut.disabled = clamped <= 0.5;
  elements.zoomIn.disabled = clamped >= 2.0;
  localStorage.setItem('ed-tracker-zoom', clamped.toFixed(2));
}

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    state.constructions = data.constructions || [];
    state.cargo = data.cargo || { ship: [], fc: [] };
    state.ship = data.ship || null;
    if (state.constructions.length > 0 && !state.activeConstructionId) {
      state.activeConstructionId = state.constructions[0].id;
      localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
    }
    render();
  } catch (err) {
    console.error('Failed to fetch state:', err);
  }
}

function connectSSE() {
  const es = new EventSource('/api/events');
  es.addEventListener('cargo_updated', (e) => {
    state.cargo = JSON.parse(e.data);
    render();
  });
  es.addEventListener('delivery_recorded', (e) => {
    const data = JSON.parse(e.data);
    const construction = state.constructions.find(c => c.id === data.construction_id);
    if (construction) {
      const slot = construction.commodities.find(s => s.name === data.commodity_name);
      if (slot) {
        slot.amount_delivered += data.amount;
      }
    }
    render();
  });
  es.addEventListener('construction_added', (e) => {
    const construction = JSON.parse(e.data);
    state.constructions.push(construction);
    state.activeConstructionId = construction.id;
    localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
    render();
  });
  es.addEventListener('commodity_updated', (e) => {
    const data = JSON.parse(e.data);
    const construction = state.constructions.find(c => c.id === data.constructionId);
    if (construction) {
      const idx = construction.commodities.findIndex(s => s.name === data.slot.name);
      if (idx >= 0) {
        construction.commodities[idx] = data.slot;
      } else {
        construction.commodities.push(data.slot);
      }
    }
    render();
  });
  es.addEventListener('tab_change', (e) => {
    const data = JSON.parse(e.data);
    const tabIds = getTabIds();
    if (tabIds.length === 0) return;
    const currentIdx = tabIds.indexOf(state.activeConstructionId);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    let newIdx;
    if (data.direction === 'next') {
      newIdx = safeIdx >= tabIds.length - 1 ? 0 : safeIdx + 1;
    } else {
      newIdx = safeIdx <= 0 ? tabIds.length - 1 : safeIdx - 1;
    }
    state.activeConstructionId = tabIds[newIdx];
    localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
    render();
  });
  es.addEventListener('ship_updated', (e) => {
    state.ship = JSON.parse(e.data);
    renderShipBar();
  });
  es.addEventListener('construction_archived', (e) => {
    const data = JSON.parse(e.data);
    const idx = state.constructions.findIndex(c => c.id === data.id);
    if (idx >= 0) {
      state.constructions.splice(idx, 1);
      if (state.activeConstructionId === data.id) {
        state.activeConstructionId = state.constructions[0]?.id || null;
        localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
      }
      render();
    }
  });
  es.addEventListener('construction_unarchived', (e) => {
    const data = JSON.parse(e.data);
    state.constructions.push(data.construction);
    state.constructions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    render();
  });
  es.addEventListener('app_error', (e) => {
    const error = JSON.parse(e.data);
    state.sessionErrors.unshift(error);
    if (state.sessionErrors.length > 50) {
      state.sessionErrors.pop();
    }
    renderStatusWidget();
  });
}

function setupEventListeners() {
  elements.zoomOut.addEventListener('click', () => {
    const current = parseFloat(localStorage.getItem('ed-tracker-zoom') || '1');
    setZoom(current - 0.1);
  });
  elements.zoomIn.addEventListener('click', () => {
    const current = parseFloat(localStorage.getItem('ed-tracker-zoom') || '1');
    setZoom(current + 0.1);
  });
  elements.deleteCancel.addEventListener('click', closeDeleteModal);
  elements.deleteConfirm.addEventListener('click', confirmDelete);
  elements.deleteModal.addEventListener('click', (e) => {
    if (e.target === elements.deleteModal) closeDeleteModal();
  });
  elements.archivedBtn.addEventListener('click', openArchivedModal);
  elements.archivedCloseBtn.addEventListener('click', closeArchivedModal);
  elements.archivedModal.addEventListener('click', (e) => {
    if (e.target === elements.archivedModal) closeArchivedModal();
  });
  elements.statusWidget.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.statusDropdown.classList.toggle('visible');
  });
  document.addEventListener('click', () => {
    elements.statusDropdown.classList.remove('visible');
  });
}

function closeDeleteModal() {
  elements.deleteModal.classList.remove('visible');
  state.pendingDeleteId = null;
}

async function confirmDelete() {
  if (!state.pendingDeleteId) return;
  try {
    await fetch(`/api/constructions/${state.pendingDeleteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    state.constructions = state.constructions.filter(c => c.id !== state.pendingDeleteId);
    if (state.activeConstructionId === state.pendingDeleteId) {
      state.activeConstructionId = state.constructions[0]?.id || null;
      localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
    }
    closeDeleteModal();
    render();
  } catch (err) {
    console.error('Failed to archive:', err);
  }
}

function showDeleteModal(constructionId) {
  const construction = state.constructions.find(c => c.id === constructionId);
  if (!construction) return;
  state.pendingDeleteId = constructionId;
  elements.deleteModalText.textContent = `This will archive "${construction.station_name}". It will be removed from the primary view but can be restored later.`;
  elements.deleteModal.classList.add('visible');
}

async function openArchivedModal() {
  try {
    const res = await fetch('/api/constructions?include_archived=true');
    const allConstructions = await res.json();
    const archived = allConstructions.filter(c => c.is_archived);
    if (archived.length === 0) {
      elements.archivedList.innerHTML = '<p style="color:var(--color-text-muted);">No archived constructions</p>';
    } else {
      elements.archivedList.innerHTML = archived.map(c => `
        <div class="archived-item">
          <div class="archived-item-info">
            <strong>${c.station_name}</strong>
            <span>${c.system_name}</span>
          </div>
          <button class="unarchive-btn" data-id="${c.id}">Restore</button>
        </div>
      `).join('');
      elements.archivedList.querySelectorAll('.unarchive-btn').forEach(btn => {
        btn.addEventListener('click', () => unarchiveConstruction(btn.dataset.id));
      });
    }
    elements.archivedModal.classList.add('visible');
  } catch (err) {
    console.error('Failed to load archived constructions:', err);
  }
}

function closeArchivedModal() {
  elements.archivedModal.classList.remove('visible');
}

async function unarchiveConstruction(id) {
  try {
    await fetch(`/api/constructions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    const res = await fetch(`/api/constructions/${id}`);
    const construction = await res.json();
    state.constructions.push(construction);
    state.constructions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    closeArchivedModal();
    render();
  } catch (err) {
    console.error('Failed to unarchive:', err);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    elements.copyToast.classList.add('visible');
    setTimeout(() => elements.copyToast.classList.remove('visible'), 1500);
  });
}

function getActiveConstructions() {
  return state.constructions.filter(c =>
    c.phase !== 'done' && (c.commodities.length === 0 || c.commodities.some(cm => !isCommodityComplete(cm)))
  );
}

function getTabIds() {
  const active = getActiveConstructions();
  const ids = [ALL_TAB_ID];
  return ids.concat(state.constructions.map(c => c.id));
}

function getCargoForCommodity(name) {
  const shipCargo = state.cargo.ship.find(c => c.name === name)?.count || 0;
  const fcCargo = state.cargo.fc.find(c => c.name === name)?.count || 0;
  return { ship: shipCargo, fc: fcCargo };
}

function isCommodityComplete(commodity) {
  return commodity.amount_delivered >= commodity.amount_required;
}

function render() {
  renderTabs();
  renderConstructionCard();
  renderStatusWidget();
  renderShipBar();
}

function renderShipBar() {
  const ship = state.ship;

  const nameEl = document.getElementById('ship-name');
  const hullEl = document.getElementById('ship-hull');
  const jumpEl = document.getElementById('ship-jump');
  const cargoEl = document.getElementById('ship-cargo');

  nameEl.textContent = ship?.name ?? '—';

  if (ship?.hullHealth != null) {
    const pct = Math.round(ship.hullHealth * 100);
    hullEl.textContent = pct + '%';
    hullEl.className = 'ship-bar-value' +
      (pct < 50 ? ' hull-danger' : pct < 75 ? ' hull-warning' : '');
  } else {
    hullEl.textContent = '—';
    hullEl.className = 'ship-bar-value';
  }

  jumpEl.textContent = ship?.maxJumpRange != null
    ? ship.maxJumpRange.toFixed(2) + ' ly'
    : '—';

  cargoEl.textContent = ship?.cargoCapacity != null
    ? ship.cargoCapacity.toLocaleString() + ' t'
    : '—';
}

function renderStatusWidget() {
  const count = state.sessionErrors.length;
  const hasErrors = count > 0;

  elements.statusWidget.className = 'header-btn' + (hasErrors ? ' has-errors' : '');
  elements.statusCount.textContent = hasErrors ? count : '';
  elements.statusCount.className = 'status-count' + (hasErrors ? ' has-errors' : '');

  if (count === 0) {
    elements.statusList.innerHTML = '<div class="status-item" style="color:var(--color-text-muted);">No errors this session</div>';
    return;
  }

  elements.statusList.innerHTML = state.sessionErrors.map(err => {
    const time = new Date(err.timestamp).toLocaleTimeString();
    return `
      <div class="status-item">
        <div class="status-item-time">${time}</div>
        <div class="status-item-source">${err.source}</div>
        <div class="status-item-message">${err.message}</div>
        ${err.details ? `<div class="status-item-details">${err.details}</div>` : ''}
      </div>
    `;
  }).join('');
}

function formatStationType(type) {
  if (!type) return '';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function parseStationName(name) {
  if (!name) return '';
  const idx = name.indexOf(':');
  return idx !== -1 ? name.substring(idx + 1).trimStart() : name;
}

function renderTabs() {
  const activeConstructions = getActiveConstructions();
  const isAllTabActive = state.activeConstructionId === ALL_TAB_ID;
  const allTabHtml = `<div class="tab ${isAllTabActive ? 'active' : ''}" data-id="${ALL_TAB_ID}"><span>Fleet Carrier</span></div>`;

  const constructionTabsHtml = state.constructions.map(c => {
    const isActive = c.id === state.activeConstructionId;
    const isComplete = c.phase === 'done' || (c.commodities.length > 0 && c.commodities.every(isCommodityComplete));
    const displayName = parseStationName(c.station_name);
    const typeLabel = formatStationType(c.station_type);
    return `
      <div class="tab ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}" data-id="${c.id}">
        <div class="tab-content">
          <span class="tab-name">${displayName}</span>
          ${typeLabel ? `<span class="tab-type">${typeLabel}</span>` : ''}
        </div>
        ${isComplete ? '<span class="badge" style="font-size:12px; padding:4px 10px; background:var(--color-success); border-radius:4px;">✓</span>' : ''}
        <button class="tab-delete" data-delete="${c.id}">×</button>
      </div>
    `;
  }).join('');

  elements.tabsContainer.innerHTML = allTabHtml + constructionTabsHtml;

  elements.tabsContainer.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-delete')) return;
      state.activeConstructionId = tab.dataset.id;
      localStorage.setItem('ed-tracker-active-tab', state.activeConstructionId);
      render();
    });
  });

  elements.tabsContainer.querySelectorAll('.tab-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteModal(btn.dataset.delete);
    });
  });
}

function renderAllTab() {
  const activeConstructions = getActiveConstructions();
  elements.constructionCard.className = 'construction-card';

  // Aggregate commodities by name across all active constructions
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
        });
      }
      const agg = commodityMap.get(cm.name);
      agg.amount_required += cm.amount_required;
      agg.amount_delivered += cm.amount_delivered;
      // Keep the entry with the highest known supply
      if (cm.nearest_supply != null &&
          (agg.nearest_supply == null || cm.nearest_supply > agg.nearest_supply)) {
        agg.nearest_station = cm.nearest_station;
        agg.nearest_system = cm.nearest_system;
        agg.nearest_supply = cm.nearest_supply;
      }
    }
  }

  const commodities = [...commodityMap.values()];
  const delivering = state.collectionPhase === 'delivering';

  if (delivering) {
    commodities.sort((a, b) => {
      const aDone = a.amount_delivered >= a.amount_required;
      const bDone = b.amount_delivered >= b.amount_required;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.amount_required - a.amount_required;
    });
  } else {
    commodities.sort((a, b) => {
      const aFc = state.cargo.fc.find(c => c.name === a.name)?.count ?? 0;
      const bFc = state.cargo.fc.find(c => c.name === b.name)?.count ?? 0;
      const aShip = state.cargo.ship.find(c => c.name === a.name)?.count ?? 0;
      const bShip = state.cargo.ship.find(c => c.name === b.name)?.count ?? 0;
      const aNeedsDelivered = Math.max(0, a.amount_required - a.amount_delivered);
      const bNeedsDelivered = Math.max(0, b.amount_required - b.amount_delivered);
      const aDone = aNeedsDelivered === 0 || (aFc + aShip) >= aNeedsDelivered;
      const bDone = bNeedsDelivered === 0 || (bFc + bShip) >= bNeedsDelivered;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.amount_required - a.amount_required;
    });
  }

  const phaseToggle = `
    <div class="phase-toggle">
      <button class="phase-btn ${!delivering ? 'active' : ''}" data-phase="collecting">Collecting</button>
      <button class="phase-btn ${delivering ? 'active' : ''}" data-phase="delivering">Delivering</button>
    </div>
  `;

  let html;

  if (delivering) {
    commodities.sort((a, b) => {
      const aFc = state.cargo.fc.find(c => c.name === a.name)?.count ?? 0;
      const bFc = state.cargo.fc.find(c => c.name === b.name)?.count ?? 0;
      const aDone = aFc === 0;
      const bDone = bFc === 0;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.amount_required - a.amount_required;
    });

    const totalFc = state.cargo.fc.reduce((s, c) => s + (commodityMap.has(c.name) ? c.count : 0), 0);

    html = `
      ${phaseToggle}
      <table class="commodity-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>NAME</th>
            <th>CARRIER</th>
          </tr>
        </thead>
        <tbody>
          <tr class="totals-row">
            <td></td>
            <td>Totals</td>
            <td class="${totalFc > 0 ? 'col-carrier' : 'col-zero'}">${totalFc > 0 ? totalFc : '—'}</td>
          </tr>
    `;

    commodities.forEach(c => {
      const cargo = getCargoForCommodity(c.name);
      const done = cargo.fc === 0;
      html += `
        <tr class="commodity-row ${done ? 'row-done' : ''}">
          <td class="col-check">${done ? '✓' : ''}</td>
          <td class="commodity-name">${c.name}</td>
          <td>${done ? '' : cargo.fc > 0 ? `<span class="col-carrier">${cargo.fc}</span>` : '—'}</td>
        </tr>
      `;
    });
  } else {
    const totals = {
      total: commodities.reduce((s, c) => s + c.amount_required, 0),
      carrier: state.cargo.fc.reduce((s, c) => {
        const needed = commodityMap.get(c.name);
        return s + (needed ? Math.min(c.count, Math.max(0, needed.amount_required - needed.amount_delivered)) : 0);
      }, 0),
      ship: state.cargo.ship.reduce((s, c) => {
        const needed = commodityMap.get(c.name);
        return s + (needed ? Math.min(c.count, Math.max(0, needed.amount_required - needed.amount_delivered)) : 0);
      }, 0),
    };

    const totalGap = commodities.reduce((s, c) => {
      const fc = state.cargo.fc.find(i => i.name === c.name)?.count ?? 0;
      const ship = state.cargo.ship.find(i => i.name === c.name)?.count ?? 0;
      return s + Math.max(0, c.amount_required - fc - ship);
    }, 0);

    html = `
      ${phaseToggle}
      <table class="commodity-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>NAME</th>
            <th>TOTAL</th>
            <th>CARRIER</th>
            <th>REMAINING</th>
            <th>SHIP</th>
          </tr>
        </thead>
        <tbody>
          <tr class="totals-row">
            <td></td>
            <td>Totals</td>
            <td class="col-total">${totals.total}</td>
            <td class="col-carrier">${totals.carrier}</td>
            <td class="${totalGap > 0 ? 'col-remaining' : 'col-zero'}">${totalGap}</td>
            <td class="col-ship">${totals.ship}</td>
          </tr>
    `;

    commodities.forEach(c => {
      const cargo = getCargoForCommodity(c.name);
      const needsDelivered = Math.max(0, c.amount_required - c.amount_delivered);
      const gap = c.amount_required - cargo.fc - cargo.ship;
      const done = needsDelivered === 0 || (cargo.fc + cargo.ship) >= needsDelivered;
      const gapDisplay = gap <= 0 ? (gap === 0 ? '✓' : `+${Math.abs(gap)}`) : gap;
      const gapClass = gap <= 0 ? 'col-zero' : 'col-remaining';
      html += `
        <tr class="commodity-row ${done ? 'row-done' : ''}">
          <td class="col-check">${done ? '✓' : ''}</td>
          <td class="commodity-name">
            ${c.name}
            ${!done && c.nearest_station ? `<span class="nearest-station copyable" data-copy="${c.nearest_system}">${c.nearest_station} · ${c.nearest_system}${c.nearest_supply != null ? ` · ${c.nearest_supply.toLocaleString()} supply` : ''}</span>` : ''}
          </td>
          <td>${done ? '' : `<span class="col-total">${c.amount_required}</span>`}</td>
          <td>${done ? '' : cargo.fc > 0 ? `<span class="col-carrier">${cargo.fc}</span>` : '—'}</td>
          <td>${done ? '' : `<span class="${gapClass}">${gapDisplay}</span>`}</td>
          <td>${done ? '' : cargo.ship > 0 ? `<span class="col-ship">${cargo.ship}</span>` : '—'}</td>
        </tr>
      `;
    });
  }

  html += '</tbody></table>';
  elements.constructionCard.innerHTML = html;

  elements.constructionCard.querySelectorAll('.nearest-station.copyable').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.dataset.copy));
  });

  elements.constructionCard.querySelectorAll('.phase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.collectionPhase = btn.dataset.phase;
      localStorage.setItem('ed-tracker-collection-phase', state.collectionPhase);
      renderAllTab();
    });
  });
}

async function refreshStations(constructionId) {
  try {
    const res = await fetch(`/api/constructions/${constructionId}/refresh-stations`, { method: 'POST' });
    const data = await res.json();
    const msg = data.queued > 0
      ? `Queued ${data.queued} station lookup${data.queued !== 1 ? 's' : ''}`
      : 'No pending lookups to queue';
    elements.copyToast.textContent = msg;
    elements.copyToast.classList.add('visible');
    setTimeout(() => {
      elements.copyToast.classList.remove('visible');
      elements.copyToast.textContent = 'Copied!';
    }, 2500);
  } catch (err) {
    console.error('Failed to refresh stations:', err);
  }
}

function renderConstructionCard() {
  if (state.activeConstructionId === ALL_TAB_ID) {
    renderAllTab();
    return;
  }

  const construction = state.constructions.find(c => c.id === state.activeConstructionId);
  if (!construction) {
    elements.constructionCard.innerHTML = '<p style="color:var(--color-text-muted);">No construction selected</p>';
    return;
  }

  const isComplete = construction.phase === 'done' || construction.commodities.every(isCommodityComplete);
  elements.constructionCard.className = `construction-card ${isComplete ? 'completed' : ''}`;

  const hasIncompleteCommodities = construction.commodities.some(c => !isCommodityComplete(c));

  const totals = {
    total: construction.commodities.reduce((s, c) => s + c.amount_required, 0),
    remaining: construction.commodities.reduce((s, c) => s + Math.max(0, c.amount_required - c.amount_delivered), 0),
    carrier: state.cargo.fc.reduce((s, c) => {
      const needed = construction.commodities.find(nc => nc.name === c.name);
      return s + (needed ? Math.min(c.count, needed.amount_required - needed.amount_delivered) : 0);
    }, 0),
    ship: state.cargo.ship.reduce((s, c) => {
      const needed = construction.commodities.find(nc => nc.name === c.name);
      return s + (needed ? Math.min(c.count, needed.amount_required - needed.amount_delivered) : 0);
    }, 0),
  };

  let html = `
    <table class="commodity-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th>NAME</th>
          <th>REMAINING</th>
          <th>TOTAL</th>
          <th>CARRIER</th>
          <th>SHIP</th>
        </tr>
      </thead>
      <tbody>
        <tr class="totals-row">
          <td></td>
          <td>Totals${hasIncompleteCommodities ? ' <button class="refresh-stations-btn" title="Re-search all station lookups">Refresh stations</button>' : ''}</td>
          <td class="col-remaining">${totals.remaining}</td>
          <td class="col-total">${totals.total}</td>
          <td class="col-carrier">${totals.carrier}</td>
          <td class="col-ship">${totals.ship}</td>
        </tr>
  `;

  construction.commodities.sort((a, b) => {
    const aDone = a.amount_delivered >= a.amount_required;
    const bDone = b.amount_delivered >= b.amount_required;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.amount_required - a.amount_required;
  });

  construction.commodities.forEach(c => {
    const cargo = getCargoForCommodity(c.name);
    const remaining = c.amount_required - c.amount_delivered;
    const done = isCommodityComplete(c);
    html += `
      <tr class="commodity-row ${done ? 'row-done' : ''}">
        <td class="col-check">${done ? '✓' : ''}</td>
        <td class="commodity-name">
          ${c.name}
          ${!done && remaining > 0 && (cargo.fc + cargo.ship) < remaining && c.nearest_station ? `<span class="nearest-station copyable" data-copy="${c.nearest_system}">${c.nearest_station} · ${c.nearest_system}${c.nearest_supply != null ? ` · ${c.nearest_supply.toLocaleString()} supply` : ''}</span>` : ''}
        </td>
        <td>${done ? '' : `<span class="${remaining > 0 ? 'col-remaining' : 'col-zero'}">${remaining}</span>`}</td>
        <td>${done ? '' : `<span class="col-total">${c.amount_required}</span>`}</td>
        <td>${done ? '' : cargo.fc > 0 ? `<span class="col-carrier">${cargo.fc}</span>` : '—'}</td>
        <td>${done ? '' : cargo.ship > 0 ? `<span class="col-ship">${cargo.ship}</span>` : '—'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  elements.constructionCard.innerHTML = html;

  elements.constructionCard.querySelectorAll('.nearest-station.copyable').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.dataset.copy));
  });

  const refreshBtn = elements.constructionCard.querySelector('.refresh-stations-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshStations(construction.id));
  }
}

function openStepper(td, commodityName, currentValue) {
  if (state.editingCell) closeStepper(false);

  state.editingCell = { td, commodityName, originalValue: currentValue };
  td.classList.add('stepper-cell');
  td.innerHTML = `
    <div class="stepper-control">
      <button class="stepper-btn stepper-minus">−</button>
      <input type="number" class="stepper-input" value="${currentValue}" min="0" name="stepper-value" />
      <button class="stepper-btn stepper-plus">+</button>
    </div>
    <div class="stepper-actions">
      <button class="stepper-save">Save</button>
      <button class="stepper-cancel">Cancel</button>
    </div>
  `;

  const input = td.querySelector('.stepper-input');
  const minusBtn = td.querySelector('.stepper-minus');
  const plusBtn = td.querySelector('.stepper-plus');
  const saveBtn = td.querySelector('.stepper-save');
  const cancelBtn = td.querySelector('.stepper-cancel');

  function pointerDown(btn, dir) {
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); startHold(btn, dir, input); });
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(btn, dir, input); }, { passive: false });
  }
  pointerDown(minusBtn, -1);
  pointerDown(plusBtn, 1);

  const pointerUp = () => stopHold();
  document.addEventListener('mouseup', pointerUp);
  document.addEventListener('touchend', pointerUp);

  minusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!holdWasActive) input.value = Math.max(0, (parseInt(input.value, 10) || 0) - 1);
  });
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!holdWasActive) input.value = Math.max(0, (parseInt(input.value, 10) || 0) + 1);
  });
  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); saveStepper(); });
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); closeStepper(false); });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.stopPropagation(); saveStepper(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeStepper(false); }
  });
}

function closeStepper(shouldSave) {
  if (!state.editingCell) return;
  clearHoldTimers();
  if (shouldSave) {
    saveStepper();
  } else {
    const { td, originalValue } = state.editingCell;
    td.classList.remove('stepper-cell');
    td.innerHTML = originalValue > 0 ? originalValue : '—';
    td.className = originalValue > 0 ? 'col-carrier' : 'col-zero';
    state.editingCell = null;
  }
}

async function saveStepper() {
  if (!state.editingCell) return;
  const { td, commodityName } = state.editingCell;
  const input = td.querySelector('.stepper-input');
  const newValue = Math.max(0, parseInt(input.value, 10) || 0);

  try {
    const res = await fetch('/api/cargo/fc', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commodityName, count: newValue }),
    });
    if (res.ok) {
      state.editingCell = null;
      render();
    } else {
      console.error('Failed to save carrier cargo');
    }
  } catch (err) {
    console.error('Failed to save carrier cargo:', err);
  }
}

function setupStepperListeners() {
  elements.constructionCard.addEventListener('click', (e) => {
    if (state.editingCell) return;
    if (state.activeConstructionId !== ALL_TAB_ID) return;
    const td = e.target.closest('.col-carrier');
    if (!td) return;

    const row = td.closest('.commodity-row, .totals-row');
    if (!row) return;

    if (row.classList.contains('totals-row')) {
      return;
    }

    const nameEl = row.querySelector('.commodity-name');
    if (!nameEl) return;
    const commodityName = nameEl.textContent.trim().split('\n')[0].trim();
    const currentValue = state.cargo.fc.find(c => c.name === commodityName)?.count || 0;

    openStepper(td, commodityName, currentValue);
  });
}

init();
