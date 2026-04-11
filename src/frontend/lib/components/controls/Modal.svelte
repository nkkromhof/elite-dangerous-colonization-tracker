<script>
  let { open = false, title = '', onConfirm, onCancel, children } = $props();

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onCancel?.();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') onCancel?.();
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <div
    class="modal-overlay"
    role="button"
    tabindex="-1"
    aria-label="Close dialog"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
  >
    <div class="modal-panel">
      <h3>{title}</h3>
      {@render children()}
      <div class="modal-buttons">
        <button class="modal-btn cancel" onclick={onCancel}>Cancel</button>
        <button class="modal-btn confirm" onclick={onConfirm}>Confirm</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-panel {
    background: var(--color-bg);
    border-radius: var(--radius-card);
    padding: var(--space-2xl);
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-deep);
  }

  .modal-panel h3 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: var(--space-lg);
    color: var(--color-text-primary);
  }

  .modal-buttons {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-2xl);
  }

  .modal-btn {
    flex: 1;
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-micro);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
    transition: all 0.2s ease;
  }

  .modal-btn.cancel {
    background: var(--color-bg-subtle);
    color: var(--color-text-primary);
  }

  .modal-btn.cancel:hover {
    background: var(--color-border);
  }

  .modal-btn.confirm {
    background: var(--color-danger);
    color: white;
    border-color: var(--color-danger);
  }

  .modal-btn.confirm:hover {
    opacity: 0.9;
  }

  @media (max-width: 600px) {
    .modal-buttons {
      flex-direction: column;
    }
  }
</style>
