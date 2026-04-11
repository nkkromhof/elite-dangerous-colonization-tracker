<script>
  import { onDestroy } from 'svelte';

  let { value = 0, min = 0, onSave } = $props();
  let editValue = $state(value);
  let holdTimer = null;
  let holdInterval = null;
  let holdWasActive = false;

  const HOLD_DELAY = 300;
  const HOLD_INTERVAL = 100;

  function getStep(elapsed) {
    if (elapsed >= 2500) return 100;
    if (elapsed >= 1000) return 10;
    return 1;
  }

  function startHold(direction) {
    clearTimers();
    holdWasActive = false;
    const startTime = Date.now();

    function tick() {
      const step = getStep(Date.now() - startTime);
      editValue = Math.max(min, editValue + direction * step);
      holdInterval = setTimeout(tick, HOLD_INTERVAL);
    }

    holdTimer = setTimeout(() => {
      holdWasActive = true;
      tick();
    }, HOLD_DELAY);
  }

  function clearTimers() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdInterval) { clearTimeout(holdInterval); holdInterval = null; }
  }

  function handleClick(direction) {
    if (!holdWasActive) {
      editValue = Math.max(min, editValue + direction);
    }
  }

  function handleSave() {
    clearTimers();
    onSave?.(editValue);
  }

  function handleCancel() {
    clearTimers();
    onSave?.(null);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  }

  onDestroy(clearTimers);
</script>

<svelte:window onmouseup={clearTimers} ontouchend={clearTimers} />

<div class="stepper-cell">
  <div class="stepper-control">
    <button
      class="stepper-btn"
      onmousedown={(e) => { e.preventDefault(); startHold(-1); }}
      ontouchstart={(e) => { e.preventDefault(); startHold(-1); }}
      onclick={() => handleClick(-1)}
    >−</button>
    <input
      type="number"
      class="stepper-input"
      bind:value={editValue}
      {min}
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
    />
    <button
      class="stepper-btn"
      onmousedown={(e) => { e.preventDefault(); startHold(1); }}
      ontouchstart={(e) => { e.preventDefault(); startHold(1); }}
      onclick={() => handleClick(1)}
    >+</button>
  </div>
  <div class="stepper-actions">
    <button class="stepper-save" onclick={handleSave}>Save</button>
    <button class="stepper-cancel" onclick={handleCancel}>Cancel</button>
  </div>
</div>

<style>
  .stepper-cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .stepper-control {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .stepper-btn {
    width: 2rem;
    height: 2rem;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    transition: background 0.15s;
  }

  .stepper-btn:hover {
    background: var(--color-bg);
    border-color: var(--color-primary);
  }

  .stepper-input {
    width: 5rem;
    height: 2rem;
    text-align: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    font-weight: 600;
    background: var(--color-bg);
    color: var(--color-text-primary);
  }

  .stepper-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(0, 117, 222, 0.15);
  }

  /* Hide number input spinners */
  .stepper-input::-webkit-inner-spin-button,
  .stepper-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .stepper-input[type=number] {
    -moz-appearance: textfield;
  }

  .stepper-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .stepper-save, .stepper-cancel {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-micro);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
    transition: all 0.15s;
  }

  .stepper-save {
    background: var(--color-teal);
    color: white;
    border-color: var(--color-teal);
  }

  .stepper-save:hover {
    opacity: 0.9;
  }

  .stepper-cancel {
    background: var(--color-bg-subtle);
    color: var(--color-text-secondary);
  }

  .stepper-cancel:hover {
    background: var(--color-border);
  }
</style>
