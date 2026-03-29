const state = {
  constructions: [],
  cargo: { ship: [], fc: [] },
  routing: {},
  activeConstructionId: null,
  sortColumn: 'remaining',
  sortAsc: false,
  pendingDeleteId: null,
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
    setZoom(parseInt(saved));
  }
}

function setZoom(value) {
  const clamped = Math.max(50, Math.min(200, value));
  document.documentElement.style.setProperty('--zoom', clamped / 100);
  elements.zoomDisplay.textContent = clamped + '%';
  elements.zoomOut.disabled = clamped <= 50;
  elements.zoomIn.disabled = clamped >= 200;
  localStorage.setItem('ed-tracker-zoom', clamped);
}

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    state.constructions = data.constructions || [];
    state.cargo = data.cargo || { ship: [], fc: [] };
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
  es.addEventListener('construction:added', (e) => {
    const construction = JSON.parse(e.data);
    state.constructions.push(construction);
    state.activeConstructionId = construction.id;
    render();
  });
  es.addEventListener('commodity:updated', (e) => {
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
  es.addEventListener('routing_results', (e) => {
    const data = JSON.parse(e.data);
    if (!state.routing[data.constructionId]) {
      state.routing[data.constructionId] = {};
    }
    Object.assign(state.routing[data.constructionId], data.results);
    render();
  });
}

function setupEventListeners() {
  elements.zoomOut.addEventListener('click', () => {
    const current = parseInt(localStorage.getItem('ed-tracker-zoom') || '100');
    setZoom(current - 10);
  });
  elements.zoomIn.addEventListener('click', () => {
    const current = parseInt(localStorage.getItem('ed-tracker-zoom') || '100');
    setZoom(current + 10);
  });
  elements.deleteCancel.addEventListener('click', closeDeleteModal);
  elements.deleteConfirm.addEventListener('click', confirmDelete);
  elements.deleteModal.addEventListener('click', (e) => {
    if (e.target === elements.deleteModal) closeDeleteModal();
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

  const sortedCommodities = [...construction.commodities];
  const activeCommodities = sortedCommodities.filter(c => !isCommodityComplete(c));
  const doneCommodities = sortedCommodities.filter(c => isCommodityComplete(c));
  
  activeCommodities.sort((a, b) => {
    const col = state.sortColumn;
    let aVal, bVal;
    switch (col) {
      case 'name': aVal = a.name; bVal = b.name; break;
      case 'total': aVal = a.amount_required; bVal = b.amount_required; break;
      case 'remaining': aVal = a.amount_required - a.amount_delivered; bVal = b.amount_required - b.amount_delivered; break;
      case 'carrier': aVal = state.cargo.fc.find(c => c.name === a.name)?.count || 0; bVal = state.cargo.fc.find(c => c.name === b.name)?.count || 0; break;
      case 'ship': aVal = state.cargo.ship.find(c => c.name === a.name)?.count || 0; bVal = state.cargo.ship.find(c => c.name === b.name)?.count || 0; break;
      default: return 0;
    }
    if (typeof aVal === 'string') {
      return state.sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return state.sortAsc ? aVal - bVal : bVal - aVal;
  });

  const sorted = [...activeCommodities, ...doneCommodities];

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

  const getSortIndicator = (col) => {
    if (state.sortColumn !== col) return '↕';
    return state.sortAsc ? '↑' : '↓';
  };

  elements.constructionCard.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">${construction.station_name}</div>
        <div class="card-subtitle">System: <span class="system-name" data-copy="${construction.system_name}">${construction.system_name}</span> | ${construction.station_type || 'Unknown'}</div>
      </div>
    </div>
    <table class="commodity-table">
      <thead>
        <tr>
          <th data-sort="name">NAME <span class="sort-indicator">${getSortIndicator('name')}</span></th>
          <th data-sort="total">TOTAL <span class="sort-indicator">${getSortIndicator('total')}</span></th>
          <th data-sort="remaining">REMAINING <span class="sort-indicator">${getSortIndicator('remaining')}</span></th>
          <th data-sort="carrier">CARRIER <span class="sort-indicator">${getSortIndicator('carrier')}</span></th>
          <th data-sort="ship">SHIP <span class="sort-indicator">${getSortIndicator('ship')}</span></th>
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
        ${sorted.map(c => {
          const cargo = getCargoForCommodity(c.name);
          const remaining = c.amount_required - c.amount_delivered;
          const done = isCommodityComplete(c);
          return `
            <tr class="${done ? 'row-done' : ''}">
              <td class="commodity-name">${c.name}</td>
              <td class="col-total">${c.amount_required}</td>
              <td class="${remaining > 0 ? 'col-remaining' : 'col-zero'}">${remaining}</td>
              <td class="${cargo.fc > 0 ? 'col-carrier' : 'col-zero'}">${cargo.fc > 0 ? cargo.fc : '—'}</td>
              <td class="${cargo.ship > 0 ? 'col-ship' : 'col-zero'}">${cargo.ship > 0 ? cargo.ship : '—'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  elements.constructionCard.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortAsc = !state.sortAsc;
      } else {
        state.sortColumn = col;
        state.sortAsc = false;
      }
      render();
    });
  });

  elements.constructionCard.querySelectorAll('.system-name').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.dataset.copy));
  });
}

init();
