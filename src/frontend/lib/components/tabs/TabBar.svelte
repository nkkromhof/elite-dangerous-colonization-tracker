<script>
  import { getConstructions, getActiveId, setActiveId, ALL_TAB_ID } from '../../stores/constructions.svelte.js';
  import { getCollectionPhase } from '../../stores/ui.svelte.js';
  import { isCommodityComplete, parseStationName, formatStationType } from '../../utils/format.js';

  let { onDelete } = $props();

  let phaseLabel = $derived(getCollectionPhase() === 'delivering' ? 'Delivering' : 'Collecting');

  function isComplete(c) {
    return c.phase === 'done' || (c.commodities.length > 0 && c.commodities.every(isCommodityComplete));
  }
</script>

<div class="tabs-container">
  <button
    class="tab"
    class:active={getActiveId() === ALL_TAB_ID}
    onclick={() => setActiveId(ALL_TAB_ID)}
  >
    <div class="tab-content">
      <span class="tab-name">Fleet Carrier</span>
      <span class="tab-type">{phaseLabel}</span>
    </div>
  </button>

  {#each getConstructions() as c}
    {@const complete = isComplete(c)}
    <button
      class="tab"
      class:active={c.id === getActiveId()}
      class:completed={complete}
      onclick={() => setActiveId(c.id)}
    >
      <div class="tab-content">
        <span class="tab-name">{parseStationName(c.station_name)}</span>
        {#if formatStationType(c.station_type)}
          <span class="tab-type">{formatStationType(c.station_type)}</span>
        {/if}
      </div>
      {#if complete}
        <span class="badge">✓</span>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span class="tab-delete" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); onDelete?.(c.id); }}>×</span>
    </button>
  {/each}
</div>

<style>
  .tabs-container {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-2xl);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-xl);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    font-family: inherit;
    font-size: inherit;
    color: var(--color-text-secondary);
  }

  .tab:hover {
    border-color: var(--color-primary);
  }

  .tab.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .tab.completed {
    opacity: 0.6;
  }

  .tab-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .tab-name {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .tab-type {
    font-size: 0.6875rem;
    font-weight: 500;
    opacity: 0.7;
  }

  .badge {
    font-size: 0.75rem;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-success);
    color: white;
    border-radius: var(--radius-micro);
  }

  .tab-delete {
    font-size: 1rem;
    opacity: 0.4;
    padding: 0 var(--space-sm);
    cursor: pointer;
  }

  .tab-delete:hover {
    opacity: 1;
    color: var(--color-danger);
  }
</style>
