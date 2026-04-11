<script>
  import CopyButton from '../controls/CopyButton.svelte';
  import { isLowSupply } from '../../utils/format.js';

  let { commodity, stationGroups } = $props();

  let groupKey = $derived(
    commodity.nearest_station ? `${commodity.nearest_station}|${commodity.nearest_system}` : null
  );
  let group = $derived(groupKey ? stationGroups.get(groupKey) : null);
  let badgeCount = $derived(group && group.count > 1 ? group.count - 1 : 0);
  let low = $derived(isLowSupply(commodity));
</script>

{#if commodity.nearest_station}
  <CopyButton text={commodity.nearest_system}>
    <span class="nearest-station" class:low-supply={low}>
      {commodity.nearest_station} · {commodity.nearest_system}{commodity.nearest_supply != null ? ` · ${commodity.nearest_supply.toLocaleString()} supply` : ''}
      {#if badgeCount > 0}
        <span class="onestop-badge">+{badgeCount} other item{badgeCount > 1 ? 's' : ''}</span>
      {/if}
    </span>
  </CopyButton>
{/if}

<style>
  .nearest-station {
    display: inline-block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: var(--space-xs);
  }

  .nearest-station.low-supply {
    color: var(--color-warning);
  }

  .onestop-badge {
    display: inline-block;
    background: var(--color-badge-bg);
    color: var(--color-badge-text);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    margin-left: var(--space-sm);
  }
</style>
