<script>
  import CopyButton from '../controls/CopyButton.svelte';
  import { isLowSupply } from '../../utils/format.js';

  let { commodity } = $props();

  let low = $derived(isLowSupply(commodity));
</script>

{#if commodity.nearest_station}
  <CopyButton text={commodity.nearest_system}>
    <span class="nearest-station" class:low-supply={low}>
      {commodity.nearest_station} · {commodity.nearest_system}{commodity.nearest_supply != null ? ` · ${commodity.nearest_supply.toLocaleString()} supply` : ''}
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
</style>
