<script>
  import CommodityTable from '../commodities/CommodityTable.svelte';
  import CommodityRow from '../commodities/CommodityRow.svelte';
  import { getActive, computeStationGroups } from '../../stores/constructions.svelte.js';
  import { getFcCargo, getShipCargo } from '../../stores/cargo.svelte.js';
  import { isCommodityComplete } from '../../utils/format.js';
  import { refreshStations } from '../../utils/api.js';

  let construction = $derived(getActive());

  let isComplete = $derived(
    construction
      ? construction.phase === 'done' || construction.commodities.every(isCommodityComplete)
      : false
  );

  let hasIncomplete = $derived(
    construction ? construction.commodities.some(c => !isCommodityComplete(c)) : false
  );

  let sortedCommodities = $derived.by(() => {
    if (!construction) return [];
    return [...construction.commodities].sort((a, b) => {
      const aDone = a.amount_delivered >= a.amount_required;
      const bDone = b.amount_delivered >= b.amount_required;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.amount_required - a.amount_required;
    });
  });

  let stationGroups = $derived(computeStationGroups(sortedCommodities));

  let totals = $derived.by(() => {
    if (!construction) return { total: 0, remaining: 0, carrier: 0, ship: 0 };
    const fc = getFcCargo();
    const ship = getShipCargo();
    return {
      total: construction.commodities.reduce((s, c) => s + c.amount_required, 0),
      remaining: construction.commodities.reduce((s, c) => s + Math.max(0, c.amount_required - c.amount_delivered), 0),
      carrier: fc.reduce((s, c) => {
        const needed = construction.commodities.find(nc => nc.name === c.name);
        return s + (needed ? Math.min(c.count, needed.amount_required - needed.amount_delivered) : 0);
      }, 0),
      ship: ship.reduce((s, c) => {
        const needed = construction.commodities.find(nc => nc.name === c.name);
        return s + (needed ? Math.min(c.count, needed.amount_required - needed.amount_delivered) : 0);
      }, 0),
    };
  });

  let refreshMessage = $state('');

  async function handleRefresh() {
    if (!construction) return;
    const data = await refreshStations(construction.id);
    refreshMessage = data.queued > 0
      ? `Queued ${data.queued} station lookup${data.queued !== 1 ? 's' : ''}`
      : 'No pending lookups to queue';
    setTimeout(() => { refreshMessage = ''; }, 2500);
  }
</script>

{#if !construction}
  <p class="empty-state">No construction selected</p>
{:else}
  <div class="construction-card" class:completed={isComplete}>
    <CommodityTable
      headers={['NAME', 'REMAINING', 'TOTAL', 'CARRIER', 'SHIP']}
      totals={[
        'Totals',
        `<span class="col-remaining">${totals.remaining}</span>`,
        `<span class="col-total">${totals.total}</span>`,
        `<span class="col-carrier">${totals.carrier}</span>`,
        `<span class="col-ship">${totals.ship}</span>`,
      ]}
    >
      {#each sortedCommodities as commodity (commodity.name)}
        <CommodityRow {commodity} mode="single-site" {stationGroups} allowStepper={true} />
      {/each}
    </CommodityTable>

    {#if hasIncomplete}
      <div class="refresh-bar">
        <button class="refresh-btn" onclick={handleRefresh}>Refresh station lookups</button>
        {#if refreshMessage}
          <span class="refresh-message">{refreshMessage}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .empty-state {
    color: var(--color-text-muted);
    padding: var(--space-2xl);
  }

  .construction-card.completed {
    opacity: 0.6;
  }

  :global(.col-total) { color: var(--color-text-primary); font-weight: 600; }
  :global(.col-carrier) { color: var(--color-teal); font-weight: 600; }
  :global(.col-remaining) { color: var(--color-warning); font-weight: 600; }
  :global(.col-ship) { color: var(--color-primary); font-weight: 600; }
  :global(.col-zero) { color: var(--color-text-muted); }

  .refresh-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
  }

  .refresh-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .refresh-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-text-primary);
  }

  .refresh-message {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
