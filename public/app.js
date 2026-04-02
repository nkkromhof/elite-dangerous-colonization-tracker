const state = {
  constructions: [],
  cargo: { ship: [], fc: [] },
  ship: null,
  activeConstructionId: null,
  pendingDeleteId: null,
  sessionErrors: [],
};

const elements = {
  tabsContainer: document.getElementById('tabs-container'),
  constructionCard: document.getElementById('construction-card'),
  deleteModal: document.getElementById('delete-modal'),
  deleteModalText: document.getElementById('delete-modal-text'),
  deleteCancel: document.getElementById('delete-cancel'),
  deleteConfirm: document.getElementById('delete-confirm'),
  copyToast: document.getElementById('copy-toast'),
  zoomOut: document.getElementById('zoom-out'),
  zoomIn: document.getElementById('zoom-in'),
  zoomDisplay: document.getElementById('zoom-display'),
  statusWidget: document.getElementById('status-widget'),
  statusIcon: document.getElementById('status-icon'),
  statusCount: document.getElementById('status-count'),
  statusDropdown: document.getElementById('status-dropdown'),
  statusList: document.getElementById('status-list'),
};

function init() {
  loadZoom();
  fetchState();
  connectSSE();
  setupEventListeners();
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
    if (state.constructions.length === 0) return;
    const currentIdx = state.constructions.findIndex(c => c.id === state.activeConstructionId);
    let newIdx;
    if (data.direction === 'next') {
      newIdx = currentIdx >= state.constructions.length - 1 ? 0 : currentIdx + 1;
    } else {
      newIdx = currentIdx <= 0 ? state.constructions.length - 1 : currentIdx - 1;
    }
    state.activeConstructionId = state.constructions[newIdx].id;
    render();
  });
  es.addEventListener('ship_updated', (e) => {
    state.ship = JSON.parse(e.data);
    renderShipBar();
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
    await fetch(`/api/constructions/${state.pendingDeleteId}`, { method: 'DELETE' });
    state.constructions = state.constructions.filter(c => c.id !== state.pendingDeleteId);
    if (state.activeConstructionId === state.pendingDeleteId) {
      state.activeConstructionId = state.constructions[0]?.id || null;
    }
    closeDeleteModal();
    render();
  } catch (err) {
    console.error('Failed to delete:', err);
  }
}

function showDeleteModal(constructionId) {
  const construction = state.constructions.find(c => c.id === constructionId);
  if (!construction) return;
  state.pendingDeleteId = constructionId;
  elements.deleteModalText.textContent = `This will remove "${construction.station_name}" and all its data.`;
  elements.deleteModal.classList.add('visible');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    elements.copyToast.classList.add('visible');
    setTimeout(() => elements.copyToast.classList.remove('visible'), 1500);
  });
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
  
  elements.statusIcon.textContent = hasErrors ? '!' : '✓';
  elements.statusIcon.className = 'status-icon' + (hasErrors ? ' has-errors' : '');
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

function renderTabs() {
  elements.tabsContainer.innerHTML = state.constructions.map(c => {
    const isActive = c.id === state.activeConstructionId;
    const isComplete = c.phase === 'done' || c.commodities.every(isCommodityComplete);
    return `
      <div class="tab ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''}" data-id="${c.id}">
        <span>${c.station_name}</span>
        ${isComplete ? '<span class="badge" style="font-size:12px; padding:4px 10px; background:var(--color-success); border-radius:4px;">✓</span>' : ''}
        <button class="tab-delete" data-delete="${c.id}">×</button>
      </div>
    `;
  }).join('');

  elements.tabsContainer.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-delete')) return;
      state.activeConstructionId = tab.dataset.id;
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

function renderConstructionCard() {
  const construction = state.constructions.find(c => c.id === state.activeConstructionId);
  if (!construction) {
    elements.constructionCard.innerHTML = '<p style="color:var(--color-text-muted);">No construction selected</p>';
    return;
  }

  const isComplete = construction.phase === 'done' || construction.commodities.every(isCommodityComplete);
  elements.constructionCard.className = `construction-card ${isComplete ? 'completed' : ''}`;

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
    <div class="card-header">
      <div>
        <div class="card-title">${construction.station_name}</div>
        <div class="card-subtitle">System: <span class="system-name" data-copy="${construction.system_name}">${construction.system_name}</span> | ${construction.station_type || 'Unknown'}</div>
      </div>
    </div>
    <table class="commodity-table">
      <thead>
        <tr>
          <th>NAME</th>
          <th>TOTAL</th>
          <th>REMAINING</th>
          <th>CARRIER</th>
          <th>SHIP</th>
        </tr>
      </thead>
      <tbody>
        <tr class="totals-row">
          <td>Totals</td>
          <td class="col-total">${totals.total}</td>
          <td class="col-remaining">${totals.remaining}</td>
          <td class="col-carrier">${totals.carrier}</td>
          <td class="col-ship">${totals.ship}</td>
        </tr>
  `;

  construction.commodities.forEach(c => {
    const cargo = getCargoForCommodity(c.name);
    const remaining = c.amount_required - c.amount_delivered;
    const done = isCommodityComplete(c);
    html += `
      <tr class="commodity-row ${done ? 'row-done' : ''}">
        <td class="commodity-name">${c.name}</td>
        <td class="col-total">${c.amount_required}</td>
        <td class="${remaining > 0 ? 'col-remaining' : 'col-zero'}">${remaining}</td>
        <td class="${cargo.fc > 0 ? 'col-carrier' : 'col-zero'}">${cargo.fc > 0 ? cargo.fc : '—'}</td>
        <td class="${cargo.ship > 0 ? 'col-ship' : 'col-zero'}">${cargo.ship > 0 ? cargo.ship : '—'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  elements.constructionCard.innerHTML = html;

  elements.constructionCard.querySelectorAll('.system-name').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.dataset.copy));
  });
}

init();
