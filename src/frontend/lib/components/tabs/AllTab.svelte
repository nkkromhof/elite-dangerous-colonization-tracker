<script>
  import CommodityTable from '../commodities/CommodityTable.svelte';
  import CommodityRow from '../commodities/CommodityRow.svelte';
  import PhaseToggle from '../controls/PhaseToggle.svelte';
  import StationBar from '../commodities/StationBar.svelte';
  import {
    getAggregatedCommodities,
    getActiveConstructions,
    computeStationGroups,
  } from '../../stores/constructions.svelte.js';
  import { getFcCargo, getShipCargo } from '../../stores/cargo.svelte.js';
  import { getCollectionPhase, setCollectionPhase } from '../../stores/ui.svelte.js';
  import { isCommodityComplete } from '../../utils/format.js';
  import { parseStationName } from '../../utils/format.js';
  import { isAvailableAtStation } from '../../stores/station.svelte.js';

  let delivering = $derived(getCollectionPhase() === 'delivering');
  let activeConstructions = $derived(getActiveConstructions());
  let rawCommodities = $derived(getAggregatedCommodities());

  let sortedCommodities = $derived.by(() => {
    const commodities = [...rawCommodities];
    const fc = getFcCargo();
    const ship = getShipCargo();

    if (delivering) {
      commodities.sort((a, b) => {
        const aFc = fc.find(c => c.name === a.name)?.count ?? 0;
        const bFc = fc.find(c => c.name === b.name)?.count ?? 0;
        const aDone = aFc === 0;
        const bDone = bFc === 0;
        if (aDone !== bDone) return aDone ? 1 : -1;
        const aAvail = !aDone && isAvailableAtStation(a.name);
        const bAvail = !bDone && isAvailableAtStation(b.name);
        if (aAvail !== bAvail) return aAvail ? -1 : 1;
        if (aAvail && bAvail) {
          const aRem = a.amount_required - a.amount_delivered;
          const bRem = b.amount_required - b.amount_delivered;
          return bRem - aRem;
        }
        return b.amount_required - a.amount_required;
      });
    } else {
      commodities.sort((a, b) => {
        const aFc = fc.find(c => c.name === a.name)?.count ?? 0;
        const bFc = fc.find(c => c.name === b.name)?.count ?? 0;
        const aShip = ship.find(c => c.name === a.name)?.count ?? 0;
        const bShip = ship.find(c => c.name === b.name)?.count ?? 0;
        const aNeedsDelivered = Math.max(0, a.amount_required - a.amount_delivered);
        const bNeedsDelivered = Math.max(0, b.amount_required - b.amount_delivered);
        const aDone = aNeedsDelivered === 0 || (aFc + aShip) >= aNeedsDelivered;
        const bDone = bNeedsDelivered === 0 || (bFc + bShip) >= bNeedsDelivered;
        if (aDone !== bDone) return aDone ? 1 : -1;
        const aAvail = !aDone && isAvailableAtStation(a.name);
        const bAvail = !bDone && isAvailableAtStation(b.name);
        if (aAvail !== bAvail) return aAvail ? -1 : 1;
        if (aAvail && bAvail) return bNeedsDelivered - aNeedsDelivered;
        return b.amount_required - a.amount_required;
      });
    }
    return commodities;
  });

  let stationGroups = $derived(computeStationGroups(sortedCommodities));

  // Totals for collecting mode
  let commodityMap = $derived(new Map(rawCommodities.map(c => [c.name, c])));
  let collectingTotals = $derived.by(() => {
    const fc = getFcCargo();
    const ship = getShipCargo();
    const total = rawCommodities.reduce((s, c) => s + c.amount_required, 0);
    const carrier = fc.reduce((s, c) => {
      const needed = commodityMap.get(c.name);
      return s + (needed ? Math.min(c.count, Math.max(0, needed.amount_required - needed.amount_delivered)) : 0);
    }, 0);
    const shipTotal = ship.reduce((s, c) => {
      const needed = commodityMap.get(c.name);
      return s + (needed ? Math.min(c.count, Math.max(0, needed.amount_required - needed.amount_delivered)) : 0);
    }, 0);
    const gap = rawCommodities.reduce((s, c) => {
      const f = fc.find(i => i.name === c.name)?.count ?? 0;
      const sh = ship.find(i => i.name === c.name)?.count ?? 0;
      return s + Math.max(0, c.amount_required - f - sh);
    }, 0);
    return { total, carrier, ship: shipTotal, gap };
  });

  // Totals for delivering mode
  let deliveringTotals = $derived.by(() => {
    const fc = getFcCargo();
    return fc.reduce((s, c) => s + (commodityMap.has(c.name) ? c.count : 0), 0);
  });
</script>

<PhaseToggle phase={getCollectionPhase()} onChange={setCollectionPhase} />

{#if delivering}
  <CommodityTable
    headers={['NAME', 'CARRIER', ...activeConstructions.map(c => parseStationName(c.station_name).split(/\s+/)[0])]}
    totals={[
      'Totals',
      deliveringTotals > 0 ? `<span class="col-carrier">${deliveringTotals}</span>` : '—',
      ...activeConstructions.map(con => {
        const total = sortedCommodities.reduce((sum, c) => {
          const siteData = c.sites.get(con.id);
          return sum + (siteData ? siteData.remaining : 0);
        }, 0);
        return total > 0 ? `<span class="col-remaining">${total}</span>` : '—';
      })
    ]}
  >
    {#each sortedCommodities as commodity (commodity.name)}
      <CommodityRow {commodity} mode="delivering" {activeConstructions} allowStepper={true} />
    {/each}
  </CommodityTable>
{:else}
  <StationBar {stationGroups} />
  <CommodityTable
    headers={['NAME', 'TOTAL', 'CARRIER', 'REMAINING', 'SHIP']}
    totals={[
      'Totals',
      `<span class="col-total">${collectingTotals.total}</span>`,
      `<span class="col-carrier">${collectingTotals.carrier}</span>`,
      `<span class="${collectingTotals.gap > 0 ? 'col-remaining' : 'col-zero'}">${collectingTotals.gap}</span>`,
      `<span class="col-ship">${collectingTotals.ship}</span>`,
    ]}
  >
    {#each sortedCommodities as commodity (commodity.name)}
      <CommodityRow {commodity} mode="collecting" allowStepper={true} />
    {/each}
  </CommodityTable>
{/if}

<style>
  :global(.col-total) { color: var(--color-text-muted); }
  :global(.col-carrier) { color: var(--color-teal); font-weight: 600; }
  :global(.col-remaining) { color: var(--color-warning); font-weight: 600; }
  :global(.col-ship) { color: var(--color-primary); font-weight: 600; }
  :global(.col-zero) { color: var(--color-text-muted); }
</style>
