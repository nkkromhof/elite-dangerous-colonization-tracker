<script>
  let { phase = 'collecting', onChange } = $props();
</script>

<div class="phase-toggle">
  <button
    class="phase-btn"
    class:active={phase === 'collecting'}
    onclick={() => onChange?.('collecting')}
  >
    Collecting
  </button>
  <button
    class="phase-btn"
    class:active={phase === 'delivering'}
    onclick={() => onChange?.('delivering')}
  >
    Delivering
  </button>
</div>

<style>
  .phase-toggle {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-xl);
  }

  .phase-btn {
    padding: var(--space-md) var(--space-xl);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .phase-btn:hover {
    background: var(--color-bg);
    border-color: var(--color-primary);
  }

  .phase-btn.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
</style>
