<script>
  import { getConstructions, getActiveId, setActiveId, ALL_TAB_ID, addConstruction } from '../../stores/constructions.svelte.js';
  import { getCollectionPhase } from '../../stores/ui.svelte.js';
  import { isCommodityComplete, parseStationName, formatStationType } from '../../utils/format.js';
  import { createConstruction } from '../../utils/api.js';

  let { onDelete } = $props();

  let phaseLabel = $derived(getCollectionPhase() === 'delivering' ? 'Delivering' : 'Collecting');
  let creating = $state(false);
  let newName = $state('');

  function isComplete(c) {
    return c.phase === 'done' || (c.commodities.length > 0 && c.commodities.every(isCommodityComplete));
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const construction = await createConstruction({ station_name: name });
    construction.commodities = construction.commodities || [];
    addConstruction(construction);
    creating = false;
    newName = '';
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') { creating = false; newName = ''; }
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
        <span class="tab-name">
          {parseStationName(c.station_name)}
        </span>
        {#if c.type === 'manual'}
          <span class="tab-type">custom list</span>
        {:else if formatStationType(c.station_type)}
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

  {#if creating}
    <div class="tab-create-form">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="tab-create-input"
        bind:value={newName}
        onkeydown={handleKeydown}
        placeholder="Site name…"
        autofocus
      />
      <button class="tab-create-confirm" onclick={handleCreate} disabled={!newName.trim()}>✓</button>
      <button class="tab-create-cancel" onclick={() => { creating = false; newName = ''; }}>×</button>
    </div>
  {:else}
    <button class="tab tab-add" onclick={() => { creating = true; }} title="Add manual site">+</button>
  {/if}
</div>

<style>
  .tabs-container {
    display: flex;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-2xl);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    flex-shrink: 0;
    align-items: center;
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

  .tab-add {
    align-self: stretch;
    aspect-ratio: 1;
    padding: 0;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 300;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .tab-add:hover {
    opacity: 1;
    border-color: var(--color-primary);
    color: var(--color-primary);
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

  .tab-create-form {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .tab-create-input {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    font-family: inherit;
    color: var(--color-text-primary);
    width: 160px;
    outline: none;
  }

  .tab-create-confirm,
  .tab-create-cancel {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    cursor: pointer;
    font-size: 0.875rem;
    padding: var(--space-sm) var(--space-md);
    color: var(--color-text-secondary);
    font-family: inherit;
  }

  .tab-create-confirm:hover:not(:disabled) {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  .tab-create-confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tab-create-cancel:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
</style>
