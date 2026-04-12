<script>
  import CopyButton from '../controls/CopyButton.svelte';

  let { stationGroups } = $props();

  let topStations = $derived(
    [...stationGroups.values()]
      .sort((a, b) => b.count - a.count || (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .slice(0, 3)
  );

  function formatDistance(ly) {
    if (ly == null) return '';
    const rounded = Math.round(ly);
    return `${rounded} ly`;
  }
</script>

{#if topStations.length > 0}
  <div class="station-bar">
    {#each topStations as st}
      <CopyButton text={st.system}>
        <div class="station-pill">
          <span class="station-name">{st.station}</span>
          <span class="station-system">{st.system}{st.distance != null ? ` (${formatDistance(st.distance)})` : ''}</span>
        </div>
      </CopyButton>
    {/each}
  </div>
{/if}

<style>
  .station-bar {
    display: flex;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-xl) var(--space-lg);
    flex-wrap: wrap;
  }

  .station-pill {
    display: flex;
    flex-direction: column;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-standard);
    cursor: pointer;
    min-width: 140px;
    transition: border-color 0.15s;
  }

  .station-pill:hover {
    border-color: var(--color-primary);
  }

  .station-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.33;
  }

  .station-system {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--color-text-muted);
    line-height: 1.33;
    letter-spacing: 0.125px;
  }
</style>
