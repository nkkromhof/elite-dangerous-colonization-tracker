<script>
  import { getShip } from '../../stores/ship.svelte.js';

  let hullPct = $derived(getShip()?.hullHealth != null ? Math.round(getShip().hullHealth * 100) : null);
  let hullClass = $derived(
    hullPct == null ? '' :
    hullPct < 50 ? 'hull-danger' :
    hullPct < 75 ? 'hull-warning' : ''
  );
</script>

<div class="ship-bar">
  <div class="ship-bar-item">
    <span class="ship-bar-label">SHIP</span>
    <span class="ship-bar-value">{getShip()?.name ?? '—'}</span>
  </div>
  <div class="ship-bar-sep"></div>
  <div class="ship-bar-item">
    <span class="ship-bar-label">HULL</span>
    <span class="ship-bar-value {hullClass}">{hullPct != null ? hullPct + '%' : '—'}</span>
  </div>
  <div class="ship-bar-sep"></div>
  <div class="ship-bar-item">
    <span class="ship-bar-label">JUMP RANGE</span>
    <span class="ship-bar-value">{getShip()?.maxJumpRange != null ? getShip().maxJumpRange.toFixed(2) + ' ly' : '—'}</span>
  </div>
  <div class="ship-bar-sep"></div>
  <div class="ship-bar-item">
    <span class="ship-bar-label">CARGO CAPACITY</span>
    <span class="ship-bar-value">{getShip()?.cargoCapacity != null ? getShip().cargoCapacity.toLocaleString() + ' t' : '—'}</span>
  </div>
</div>

<style>
  .ship-bar {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-2xl);
    background: var(--color-bg-subtle);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.8125rem;
    flex-shrink: 0;
  }

  .ship-bar-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .ship-bar-label {
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .ship-bar-value {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .ship-bar-sep {
    width: 1px;
    height: 1rem;
    background: var(--color-border);
  }

  .hull-danger { color: var(--color-danger); }
  .hull-warning { color: var(--color-warning); }

  @media (max-width: 768px) {
    .ship-bar {
      flex-wrap: wrap;
      gap: var(--space-md);
    }
  }
</style>
